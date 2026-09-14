import 'dart:convert';
import 'dart:math';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

import '../models/models.dart';

/// Local SQLite store for offline POS + sync outbox (mirrors desktop pattern).
class LocalDb {
  LocalDb._();
  static final LocalDb instance = LocalDb._();
  static const _uuid = Uuid();

  Database? _db;

  Future<Database> get db async {
    if (_db != null) return _db!;
    final dir = await getDatabasesPath();
    _db = await openDatabase(
      p.join(dir, 'retailsarathi_offline.db'),
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

  Future<void> markOutboxSynced(String outboxId) async {
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
    await database.update(
      'invoices',
      {'synced': 1},
      where: 'id = ?',
      whereArgs: [entityId],
    );
  }

  /// Clears cached catalog products. Does not delete pending offline invoices.
  Future<int> clearProductCache() async {
    final database = await db;
    return database.delete('products');
  }
}
