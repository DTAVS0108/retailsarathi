import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_sqlcipher/sqflite.dart';
import 'package:uuid/uuid.dart';

import '../models/models.dart';

enum MigrationState { notNeeded, migrated, blocked }

/// Mirrors the desktop app's MigrationStatus shape — see electron/database.ts for the full
/// rationale (an unsynced offline bill must never be silently discarded by a plaintext→encrypted
/// swap).
class MigrationStatus {
  final MigrationState state;
  final bool justSwapped;
  final int pendingCount;
  final int failedCount;

  const MigrationStatus._(this.state, this.justSwapped, this.pendingCount, this.failedCount);

  const MigrationStatus.notNeeded() : this._(MigrationState.notNeeded, false, 0, 0);
  const MigrationStatus.migrated({required bool justSwapped}) : this._(MigrationState.migrated, justSwapped, 0, 0);
  const MigrationStatus.blocked({required int pendingCount, required int failedCount})
      : this._(MigrationState.blocked, false, pendingCount, failedCount);
}

/// Local SQLite store for offline POS + sync outbox (mirrors desktop pattern).
class LocalDb {
  LocalDb._();
  static final LocalDb instance = LocalDb._();
  static const _uuid = Uuid();

  // Keychain (iOS) / Keystore-backed EncryptedSharedPreferences (Android) — same pattern as the
  // JWT in auth_state.dart. This key protects the whole cached catalog/invoice DB, not one
  // revocable token, so there's no plaintext fallback if secure storage read/write fails.
  static const _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  static const _passphraseKey = 'db_passphrase';

  Database? _db;
  Database? _legacyDb;

  Future<String> _getOrCreatePassphrase() async {
    final existing = await _secureStorage.read(key: _passphraseKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final rand = Random.secure();
    final bytes = List<int>.generate(32, (_) => rand.nextInt(256));
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    await _secureStorage.write(key: _passphraseKey, value: hex);
    return hex;
  }

  Future<String> _dbPath() async {
    final dir = await getDatabasesPath();
    return p.join(dir, 'retailsarathi_offline.db');
  }

  /// SQLCipher-encrypted files don't start with the standard SQLite header magic string.
  Future<bool> _isPlaintextSqliteFile(String path) async {
    final raf = await File(path).open();
    try {
      final header = await raf.read(16);
      return String.fromCharCodes(header.take(15)) == 'SQLite format 3';
    } finally {
      await raf.close();
    }
  }

  Future<int> _countOutbox(Database handle, List<String> statuses) async {
    final placeholders = List.filled(statuses.length, '?').join(',');
    final rows = await handle.rawQuery(
      'SELECT COUNT(*) as c FROM sync_outbox WHERE status IN ($placeholders)',
      statuses,
    );
    return asInt(rows.first['c']);
  }

  /// Called once at app startup, before the normal `db` getter is ever used. If a legacy
  /// plaintext DB exists with unsynced sync_outbox rows, this can't safely wipe/recreate it as
  /// encrypted — that would permanently and silently lose offline invoices the server has never
  /// seen. Instead it points `_db` at the legacy plaintext file (fully usable) and reports
  /// 'blocked' so the UI can show a clear message and retry once online.
  Future<MigrationStatus> checkMigration() async {
    // Idempotent: main() calls this once before runApp() so no other code path can touch `db`
    // on a still-plaintext file first; MigrationGate then calls it again on the already-resolved
    // state, which must be cheap and must not reopen anything.
    if (_legacyDb != null) {
      return MigrationStatus.blocked(
        pendingCount: await _countOutbox(_legacyDb!, ['PENDING']),
        failedCount: await _countOutbox(_legacyDb!, ['FAILED', 'CONFLICT']),
      );
    }
    if (_db != null) {
      return const MigrationStatus.migrated(justSwapped: false);
    }

    final path = await _dbPath();
    final file = File(path);
    if (!await file.exists()) return const MigrationStatus.notNeeded();
    if (!await _isPlaintextSqliteFile(path)) return const MigrationStatus.migrated(justSwapped: false);

    final legacy = await openDatabase(path);
    final blocking = await _countOutbox(legacy, ['PENDING', 'FAILED', 'CONFLICT']);
    if (blocking == 0) {
      await legacy.close();
      await file.rename('$path.pre-encryption.bak');
      return const MigrationStatus.migrated(justSwapped: true);
    }

    _legacyDb = legacy;
    _db = legacy;
    return MigrationStatus.blocked(
      pendingCount: await _countOutbox(legacy, ['PENDING']),
      failedCount: await _countOutbox(legacy, ['FAILED', 'CONFLICT']),
    );
  }

  /// Retries the migration: runs [syncNow] (the app's normal OfflineSyncService.syncNow, passed
  /// in rather than imported directly, to avoid a circular dependency) against the still-open
  /// legacy plaintext DB, then re-checks. FAILED/CONFLICT rows need manual resolution first — same
  /// as everywhere else this app surfaces them, they're never auto-retried. Only swaps to the
  /// fresh encrypted DB once the outbox is fully clean.
  Future<MigrationStatus> retryMigration(Future<void> Function() syncNow) async {
    if (_legacyDb == null) return checkMigration();
    await syncNow();

    final blocking = await _countOutbox(_legacyDb!, ['PENDING', 'FAILED', 'CONFLICT']);
    if (blocking > 0) {
      return MigrationStatus.blocked(
        pendingCount: await _countOutbox(_legacyDb!, ['PENDING']),
        failedCount: await _countOutbox(_legacyDb!, ['FAILED', 'CONFLICT']),
      );
    }

    final deviceRows = await _legacyDb!.query('settings', where: 'key = ?', whereArgs: ['device_id']);
    final deviceId = deviceRows.isNotEmpty ? deviceRows.first['value'] as String? : null;

    final path = await _dbPath();
    await _legacyDb!.close();
    _legacyDb = null;
    _db = null;
    await File(path).rename('$path.pre-encryption.bak');

    final fresh = await db; // opens a brand-new encrypted DB via the normal getter below
    if (deviceId != null) {
      await fresh.insert(
        'settings',
        {'key': 'device_id', 'value': deviceId},
        conflictAlgorithm: ConflictAlgorithm.replace,
      ); // carry the device identity forward instead of registering as a "new" device
    }
    return const MigrationStatus.migrated(justSwapped: true);
  }

  Future<Database> get db async {
    if (_db != null) return _db!;
    final passphrase = await _getOrCreatePassphrase();
    final dir = await getDatabasesPath();
    _db = await openDatabase(
      p.join(dir, 'retailsarathi_offline.db'),
      password: passphrase,
      version: 2,
      onCreate: (database, version) async {
        await database.execute('''
          CREATE TABLE products (
            id TEXT PRIMARY KEY,
            sku TEXT,
            barcode TEXT,
            name TEXT,
            hsn_code TEXT,
            sale_price REAL,
            gst_rate REAL,
            stock_qty REAL,
            category TEXT,
            brand TEXT,
            model TEXT,
            payload TEXT
          )
        ''');
        await database.execute('''
          CREATE TABLE invoices (
            id TEXT PRIMARY KEY,
            invoice_number TEXT,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            synced INTEGER DEFAULT 0
          )
        ''');
        await database.execute('''
          CREATE TABLE sync_outbox (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
          )
        ''');
        await database.execute('''
          CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        ''');
      },
      onUpgrade: (database, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await database.execute('ALTER TABLE products ADD COLUMN category TEXT');
        }
      },
    );
    return _db!;
  }

  Future<String> deviceId() async {
    final database = await db;
    final rows = await database.query('settings', where: 'key = ?', whereArgs: ['device_id']);
    if (rows.isNotEmpty) return rows.first['value'] as String;
    final id = _uuid.v4();
    await database.insert('settings', {'key': 'device_id', 'value': id});
    return id;
  }

  Future<void> upsertProducts(List<Map<String, dynamic>> products) async {
    final database = await db;
    final batch = database.batch();
    for (final raw in products) {
      batch.insert(
        'products',
        {
          'id': raw['id']?.toString() ?? '',
          'sku': raw['sku']?.toString(),
          'barcode': raw['barcode']?.toString(),
          'name': raw['name']?.toString() ?? '',
          'hsn_code': raw['hsnCode']?.toString() ?? '8517',
          'sale_price': asDouble(raw['salePrice']),
          'gst_rate': asDouble(raw['gstRate'], 18),
          'stock_qty': asDouble(raw['stockQty']),
          'category': raw['category']?.toString(),
          'brand': raw['brand']?.toString(),
          'model': raw['model']?.toString(),
          'payload': jsonEncode(raw),
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<void> deleteProduct(String id) async {
    final database = await db;
    await database.delete('products', where: 'id = ?', whereArgs: [id]);
  }

  Future<List<Map<String, dynamic>>> listProducts() async {
    final database = await db;
    final rows = await database.query('products', orderBy: 'name COLLATE NOCASE');
    return rows.map((r) {
      final payload = r['payload'] as String?;
      if (payload != null && payload.isNotEmpty) {
        return Map<String, dynamic>.from(jsonDecode(payload) as Map);
      }
      return {
        'id': r['id'],
        'sku': r['sku'],
        'barcode': r['barcode'],
        'name': r['name'],
        'hsnCode': r['hsn_code'],
        'salePrice': r['sale_price'],
        'gstRate': r['gst_rate'],
        'stockQty': r['stock_qty'],
        'category': r['category'],
        'brand': r['brand'],
        'model': r['model'],
      };
    }).toList();
  }

  Future<Map<String, dynamic>> saveOfflineInvoice({
    required Map<String, dynamic> invoicePayload,
    String? idempotencyKey,
  }) async {
    final database = await db;
    final id = _uuid.v4();
    final n = Random().nextInt(90000) + 10000;
    final invoiceNumber = 'LOCAL-${DateTime.now().millisecondsSinceEpoch}-$n';
    final createdAt = DateTime.now().toIso8601String();
    final full = {
      ...invoicePayload,
      'id': id,
      'invoiceNumber': invoiceNumber,
      'createdAt': createdAt,
      'status': 'FINALIZED',
      'offline': true,
      if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
    };

    await database.insert('invoices', {
      'id': id,
      'invoice_number': invoiceNumber,
      'payload': jsonEncode(full),
      'created_at': createdAt,
      'synced': 0,
    });

    await database.insert('sync_outbox', {
      'id': _uuid.v4(),
      'entity_type': 'invoice',
      'entity_id': id,
      'operation': 'CREATE',
      'payload': jsonEncode(full),
      'status': 'PENDING',
      'created_at': createdAt,
    });

    // Optimistic local stock decrement
    final lines = (invoicePayload['lines'] as List?) ?? [];
    for (final line in lines) {
      if (line is! Map) continue;
      final productId = line['productId']?.toString();
      final qty = asDouble(line['quantity']);
      if (productId == null || qty <= 0) continue;
      await database.rawUpdate(
        'UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?',
        [qty, productId],
      );
    }

    return full;
  }

  Future<List<Map<String, dynamic>>> pendingOutbox() async {
    final database = await db;
    final rows = await database.query(
      'sync_outbox',
      where: "status = 'PENDING'",
      orderBy: 'created_at ASC',
    );
    return rows
        .map(
          (r) => {
            'id': r['id'],
            'entityType': r['entity_type'],
            'entityId': r['entity_id'],
            'operation': r['operation'],
            'payload': jsonDecode(r['payload'] as String),
          },
        )
        .toList();
  }

  Future<int> pendingCount() async {
    final database = await db;
    final result = await database.rawQuery(
      "SELECT COUNT(*) AS c FROM sync_outbox WHERE status = 'PENDING'",
    );
    return asInt(result.first['c']);
  }

  /// [realInvoiceNumber] (and optional [realInvoiceId]) — when the server hands back the
  /// invoice it actually created, replace the local "LOCAL-..." placeholder so the Invoices
  /// screen shows the real number after a successful sync instead of forever showing the
  /// placeholder.
  Future<void> markOutboxSynced(
    String outboxId, {
    String? realInvoiceNumber,
    String? realInvoiceId,
  }) async {
    final database = await db;
    final rows = await database.query('sync_outbox', where: 'id = ?', whereArgs: [outboxId]);
    if (rows.isEmpty) return;
    final entityId = rows.first['entity_id'] as String;
    await database.update(
      'sync_outbox',
      {'status': 'SYNCED'},
      where: 'id = ?',
      whereArgs: [outboxId],
    );

    final invoiceUpdate = <String, Object?>{'synced': 1};
    if (realInvoiceNumber != null && realInvoiceNumber.isNotEmpty) {
      invoiceUpdate['invoice_number'] = realInvoiceNumber;
      final localRows = await database.query('invoices', where: 'id = ?', whereArgs: [entityId]);
      if (localRows.isNotEmpty) {
        final payload = jsonDecode(localRows.first['payload'] as String) as Map;
        final updatedPayload = {
          ...payload,
          'invoiceNumber': realInvoiceNumber,
          if (realInvoiceId != null) 'serverInvoiceId': realInvoiceId,
        };
        invoiceUpdate['payload'] = jsonEncode(updatedPayload);
      }
    }
    await database.update(
      'invoices',
      invoiceUpdate,
      where: 'id = ?',
      whereArgs: [entityId],
    );
  }

  /// Marks a permanently-stuck outbox entry (won't be retried) so it can be surfaced in the UI
  /// instead of silently retried forever.
  Future<void> markOutboxStatus(String outboxId, String status) async {
    final database = await db;
    await database.update(
      'sync_outbox',
      {'status': status},
      where: 'id = ?',
      whereArgs: [outboxId],
    );
  }

  /// Permanently-stuck entries (FAILED/CONFLICT) — PENDING rows are still mid-flight, not failed.
  Future<int> failedOutboxCount() async {
    final database = await db;
    final result = await database.rawQuery(
      "SELECT COUNT(*) AS c FROM sync_outbox WHERE status IN ('FAILED', 'CONFLICT')",
    );
    return asInt(result.first['c']);
  }

  /// Clears cached catalog products. Does not delete pending offline invoices.
  Future<int> clearProductCache() async {
    final database = await db;
    return database.delete('products');
  }
}
