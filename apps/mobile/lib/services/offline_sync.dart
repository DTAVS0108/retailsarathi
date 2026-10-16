import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import 'api_client.dart';
import 'local_db.dart';

const _uuid = Uuid();

class OfflineSyncService extends ChangeNotifier {
  OfflineSyncService(this._api);

  ApiClient _api;
  bool online = true;
  bool syncing = false;
  int pending = 0;
  /// Permanently-stuck outbox entries (FAILED/CONFLICT) — won't resolve by retrying, surfaced
  /// distinctly from `pending` so the operator knows something needs manual attention.
  int failedCount = 0;
  String? lastError;

  void updateApi(ApiClient api) => _api = api;

  Future<void> bootstrap() async {
    await refreshConnectivity();
    await refreshPending();
    Connectivity().onConnectivityChanged.listen((_) => refreshConnectivity());
  }

  Future<void> refreshConnectivity() async {
    final result = await Connectivity().checkConnectivity();
    final next = !result.contains(ConnectivityResult.none);
    if (next != online) {
      online = next;
      notifyListeners();
      if (online) {
        await syncNow();
      }
    }
  }

  Future<void> refreshPending() async {
    pending = await LocalDb.instance.pendingCount();
    failedCount = await LocalDb.instance.failedOutboxCount();
    notifyListeners();
  }

  /// Cache catalog for offline POS.
  Future<void> cacheProductsFromServer() async {
    if (!online) return;
    try {
      final raw = await _api.get('/products');
      final items = raw is Map && raw['items'] is List
          ? (raw['items'] as List)
          : (raw is List ? raw : <dynamic>[]);
      await LocalDb.instance.upsertProducts(
        items.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
      );
    } catch (e) {
      lastError = e.toString();
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>> saveBillOnlineOrOffline({
    required Map<String, dynamic> body,
    required double subtotal,
    required double totalCgst,
    required double totalSgst,
    required double totalIgst,
    required double grandTotal,
  }) async {
    await refreshConnectivity();
    // One key for both attempts below — if the online POST actually succeeded server-side but
    // this device never saw the response (dropped connection), retrying/falling back with the
    // SAME key lets the server recognize it's already done instead of billing twice.
    final idempotencyKey = _uuid.v4();
    final bodyWithKey = {...body, 'idempotencyKey': idempotencyKey};

    if (online) {
      try {
        final raw = await _api.post('/invoices', body: bodyWithKey);
        return Map<String, dynamic>.from(raw as Map);
      } catch (_) {
        // Fall through to offline if network failed mid-request
      }
    }

    final lines = (body['lines'] as List?) ?? [];
    final payments = (body['payments'] as List?) ?? [];
    return LocalDb.instance.saveOfflineInvoice(
      idempotencyKey: idempotencyKey,
      invoicePayload: {
        'customerId': body['customerId'],
        'notes': body['notes'],
        'subtotal': subtotal,
        'totalCgst': totalCgst,
        'totalSgst': totalSgst,
        'totalIgst': totalIgst,
        'grandTotal': grandTotal,
        'lines': lines,
        'payments': payments,
      },
    );
  }

  Future<({int pushed, int failed})> syncNow() async {
    if (syncing) return (pushed: 0, failed: 0);
    syncing = true;
    lastError = null;
    notifyListeners();
    var pushed = 0;
    var failed = 0;
    try {
      await refreshConnectivity();
      if (!online) {
        return (pushed: 0, failed: 0);
      }

      final deviceId = await LocalDb.instance.deviceId();
      final outbox = await LocalDb.instance.pendingOutbox();
      if (outbox.isNotEmpty) {
        final entries = outbox
            .map(
              (o) => {
                'entityType': o['entityType'],
                'entityId': o['entityId'],
                'operation': o['operation'],
                'payload': o['payload'],
              },
            )
            .toList();

        final raw = await _api.post(
          '/sync/push',
          body: {'entries': entries},
          query: {'deviceId': deviceId},
        );
        final results = (raw is Map && raw['results'] is List) ? raw['results'] as List : [];
        // Match by entityId (the server always returns it per result) — never assume the
        // response array is in the same order as the request, which it isn't guaranteed to be.
        final outboxByEntityId = {for (final o in outbox) o['entityId'] as String: o};
        for (final result in results) {
          final r = Map<String, dynamic>.from(result as Map);
          final entry = outboxByEntityId[r['entityId']?.toString()];
          if (entry == null) continue;
          final status = r['status']?.toString();
          final outboxId = entry['id'] as String;
          if (status == 'SYNCED') {
            await LocalDb.instance.markOutboxSynced(
              outboxId,
              realInvoiceNumber: r['invoiceNumber']?.toString(),
              realInvoiceId: r['invoiceId']?.toString(),
            );
            pushed++;
          } else if (status == 'FAILED' || status == 'CONFLICT') {
            await LocalDb.instance.markOutboxStatus(outboxId, status!);
            failed++;
          }
          // 'DUPLICATE' is left PENDING — an earlier attempt is still in-flight server-side.
        }
      }

      // Pull products
      try {
        final pull = await _api.get('/sync/pull', query: {'deviceId': deviceId});
        final products = pull is Map && pull['changes'] is Map
            ? (pull['changes'] as Map)['products']
            : null;
        if (products is List && products.isNotEmpty) {
          await LocalDb.instance.upsertProducts(
            products.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
          );
        } else {
          await cacheProductsFromServer();
        }
      } catch (_) {
        await cacheProductsFromServer();
      }
    } catch (e) {
      lastError = e.toString();
      failed++;
    } finally {
      syncing = false;
      await refreshPending();
      notifyListeners();
    }
    return (pushed: pushed, failed: failed);
  }
}
