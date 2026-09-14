import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'local_db.dart';

class OfflineSyncService extends ChangeNotifier {
  OfflineSyncService(this._api);

  ApiClient _api;
  bool online = true;
  bool syncing = false;
  int pending = 0;
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
    if (online) {
      try {
        final raw = await _api.post('/invoices', body: body);
        return Map<String, dynamic>.from(raw as Map);
      } catch (_) {
        // Fall through to offline if network failed mid-request
      }
    }

    final lines = (body['lines'] as List?) ?? [];
    final payments = (body['payments'] as List?) ?? [];
    return LocalDb.instance.saveOfflineInvoice(
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
        for (var i = 0; i < outbox.length; i++) {
          final status = i < results.length ? (results[i] as Map)['status']?.toString() : null;
          if (status == 'SYNCED') {
            await LocalDb.instance.markOutboxSynced(outbox[i]['id'] as String);
            pushed++;
          } else {
            failed++;
          }
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
