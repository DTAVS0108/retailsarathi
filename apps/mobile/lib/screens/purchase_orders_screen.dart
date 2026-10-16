import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../l10n/app_strings.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_loader.dart';
import '../theme/app_ui.dart';

class PurchaseOrdersScreen extends StatefulWidget {
  const PurchaseOrdersScreen({super.key});

  @override
  State<PurchaseOrdersScreen> createState() => _PurchaseOrdersScreenState();
}

class _PurchaseOrdersScreenState extends State<PurchaseOrdersScreen> {
  List<Map<String, dynamic>> orders = [];
  List<Product> products = [];
  List<Map<String, dynamic>> suppliers = [];
  String? supplierId;
  final notesCtrl = TextEditingController();
  final lines = <_PoDraftLine>[_PoDraftLine()];
  final receiveQty = <String, TextEditingController>{};
  final receiveSerials = <String, TextEditingController>{};
  final receiveBatchNumber = <String, TextEditingController>{};
  final receiveExpiry = <String, TextEditingController>{};
  bool loading = true;
  bool saving = false;
  String? error;
  String? success;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    notesCtrl.dispose();
    for (final c in receiveQty.values) {
      c.dispose();
    }
    for (final c in receiveSerials.values) {
      c.dispose();
    }
    for (final c in receiveBatchNumber.values) {
      c.dispose();
    }
    for (final c in receiveExpiry.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final results = await Future.wait([
        api.get('/purchase-orders'),
        api.get('/products', query: {'pageSize': '200'}),
        api.get('/suppliers'),
      ]);
      final poRaw = results[0];
      final poList = poRaw is List
          ? poRaw
          : (poRaw is Map && poRaw['items'] is List)
              ? poRaw['items'] as List
              : <dynamic>[];
      final prods = asItemList(results[1])
          .whereType<Map>()
          .map((e) => Product.fromJson(asStringKeyedMap(e)))
          .toList();
      final supRaw = results[2];
      final supList = supRaw is List
          ? supRaw
          : (supRaw is Map && supRaw['items'] is List)
              ? supRaw['items'] as List
              : <dynamic>[];
      setState(() {
        orders = poList.whereType<Map>().map((e) => asStringKeyedMap(e)).toList();
        products = prods;
        suppliers = supList.whereType<Map>().map((e) => asStringKeyedMap(e)).toList();
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _create() async {
    final payloadLines = lines
        .where((l) => l.productId != null && (double.tryParse(l.qty) ?? 0) > 0)
        .map((l) => {
              'productId': l.productId,
              'quantity': double.parse(l.qty),
              'unitCost': double.tryParse(l.cost) ?? 0,
            })
        .toList();
    if (payloadLines.isEmpty) {
      setState(() => error = 'Add at least one product line');
      return;
    }
    setState(() {
      saving = true;
      error = null;
      success = null;
    });
    try {
      final api = context.read<AuthState>().api;
      await api.post('/purchase-orders', body: {
        if (supplierId != null) 'supplierId': supplierId,
        if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
        'lines': payloadLines,
      });
      notesCtrl.clear();
      setState(() {
        lines
          ..clear()
          ..add(_PoDraftLine());
        success = 'Purchase order created';
      });
      await _load();
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _receive(Map<String, dynamic> po) async {
    final poLines = (po['lines'] is List) ? po['lines'] as List : const [];
    final receipts = <Map<String, dynamic>>[];
    for (final raw in poLines.whereType<Map>()) {
      final l = asStringKeyedMap(raw);
      final id = l['id']?.toString() ?? '';
      final qty = double.tryParse(receiveQty[id]?.text.trim() ?? '') ?? 0;
      if (qty <= 0) continue;
      final serials = (receiveSerials[id]?.text ?? '')
          .split(RegExp(r'[\n,;]+'))
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      final batchNumber = receiveBatchNumber[id]?.text.trim() ?? '';
      final expiryDate = receiveExpiry[id]?.text.trim() ?? '';
      receipts.add({
        'lineId': id,
        'quantity': qty,
        if (serials.isNotEmpty) 'serialNumbers': serials,
        if (batchNumber.isNotEmpty) 'batchNumber': batchNumber,
        if (expiryDate.isNotEmpty) 'expiryDate': expiryDate,
      });
    }
    if (receipts.isEmpty) {
      setState(() => error = 'Enter receive qty for at least one line');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      await api.post('/purchase-orders/${po['id']}/receive', body: {'receipts': receipts});
      setState(() => success = 'GRN recorded for ${po['poNumber']}');
      await _load();
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(context.watch<AppStrings>().t('purchase_orders')),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded))],
      ),
      body: loading
          ? const AppLoader()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: AppSpace.page,
                children: [
                  if (error != null)
                    AppPanel(child: Text(error!, style: const TextStyle(color: AppColors.danger))),
                  if (success != null)
                    AppPanel(child: Text(success!, style: TextStyle(color: AppColors.tealDark))),
                  AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('New PO', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<String?>(
                          value: supplierId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Supplier'),
                          items: [
                            const DropdownMenuItem(value: null, child: Text('Optional')),
                            ...suppliers.map(
                              (s) => DropdownMenuItem(
                                value: s['id']?.toString(),
                                child: Text(s['name']?.toString() ?? ''),
                              ),
                            ),
                          ],
                          onChanged: (v) => setState(() => supplierId = v),
                        ),
                        ...lines.asMap().entries.map((e) {
                          final i = e.key;
                          final line = e.value;
                          return Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Row(
                              children: [
                                Expanded(
                                  flex: 3,
                                  child: DropdownButtonFormField<String>(
                                    value: line.productId,
                                    isExpanded: true,
                                    decoration: const InputDecoration(labelText: 'Product'),
                                    items: products
                                        .map((p) => DropdownMenuItem(value: p.id, child: Text(p.name)))
                                        .toList(),
                                    onChanged: (v) => setState(() => line.productId = v),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: TextFormField(
                                    initialValue: line.qty,
                                    decoration: const InputDecoration(labelText: 'Qty'),
                                    keyboardType: TextInputType.number,
                                    onChanged: (v) => line.qty = v,
                                  ),
                                ),
                                if (lines.length > 1)
                                  IconButton(
                                    onPressed: () => setState(() => lines.removeAt(i)),
                                    icon: const Icon(Icons.close),
                                  ),
                              ],
                            ),
                          );
                        }),
                        TextButton(
                          onPressed: () => setState(() => lines.add(_PoDraftLine())),
                          child: const Text('+ Line'),
                        ),
                        TextField(controller: notesCtrl, decoration: const InputDecoration(labelText: 'Notes')),
                        const SizedBox(height: 8),
                        FilledButton(
                          onPressed: saving ? null : _create,
                          child: Text(saving ? 'Saving…' : 'Create PO'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text('Open orders', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  ...orders.map((po) {
                    final status = po['status']?.toString() ?? '';
                    final canReceive = status != 'RECEIVED' && status != 'CANCELLED';
                    final poLines = (po['lines'] is List) ? po['lines'] as List : const [];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: AppPanel(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${po['poNumber']} · $status',
                              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
                            ),
                            ...poLines.whereType<Map>().map((raw) {
                              final l = asStringKeyedMap(raw);
                              final id = l['id']?.toString() ?? '';
                              receiveQty.putIfAbsent(id, () => TextEditingController());
                              receiveSerials.putIfAbsent(id, () => TextEditingController());
                              receiveBatchNumber.putIfAbsent(id, () => TextEditingController());
                              receiveExpiry.putIfAbsent(id, () => TextEditingController());
                              final product = l['product'] is Map
                                  ? asStringKeyedMap(l['product'] as Map)
                                  : <String, dynamic>{};
                              final trackBatch = product['trackBatch'] == true;
                              final remaining =
                                  asDouble(l['quantity']) - asDouble(l['receivedQty']);
                              return Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${product['name'] ?? 'Item'} · rem ${remaining.toStringAsFixed(0)}',
                                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600),
                                    ),
                                    if (canReceive && remaining > 0) ...[
                                      TextField(
                                        controller: receiveQty[id],
                                        keyboardType: TextInputType.number,
                                        decoration: InputDecoration(
                                          labelText: 'Receive now (max ${remaining.toStringAsFixed(0)})',
                                        ),
                                      ),
                                      TextField(
                                        controller: receiveSerials[id],
                                        maxLines: 2,
                                        decoration: const InputDecoration(
                                          labelText: 'Serials / IMEI (optional)',
                                          hintText: 'One per line',
                                        ),
                                      ),
                                      if (trackBatch) ...[
                                        TextField(
                                          controller: receiveBatchNumber[id],
                                          decoration: const InputDecoration(
                                            labelText: 'Batch number',
                                          ),
                                        ),
                                        TextField(
                                          controller: receiveExpiry[id],
                                          decoration: const InputDecoration(
                                            labelText: 'Expiry date (optional)',
                                            hintText: 'YYYY-MM-DD',
                                          ),
                                        ),
                                      ],
                                    ],
                                  ],
                                ),
                              );
                            }),
                            if (canReceive) ...[
                              const SizedBox(height: 8),
                              FilledButton.tonal(
                                onPressed: saving ? null : () => _receive(po),
                                child: const Text('Receive GRN'),
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
    );
  }
}

class _PoDraftLine {
  String? productId;
  String qty = '1';
  String cost = '0';
}
