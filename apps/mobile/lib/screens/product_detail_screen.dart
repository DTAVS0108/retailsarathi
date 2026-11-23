import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../l10n/app_strings.dart';
import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/app_ui.dart';
import '../widgets/app_loader.dart';
import '../widgets/app_toast.dart';
import 'invoices_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
final _when = DateFormat('dd MMM yyyy, HH:mm');
final _dateOnly = DateFormat('dd MMM yyyy');

/// Desktop-parity product detail: KPIs, identity, sold-to, serials, stock movements.
class ProductDetailScreen extends StatefulWidget {
  const ProductDetailScreen({
    super.key,
    required this.productId,
    this.initialName,
    this.onEdit,
  });

  final String productId;
  final String? initialName;

  /// Opens edit form; return true if product was saved.
  final Future<bool> Function(Product product)? onEdit;

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  Map<String, dynamic>? detail;
  List<Map<String, dynamic>> batches = [];
  List<Map<String, dynamic>> variants = [];
  bool loading = true;
  String? error;
  bool changed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final results = await Future.wait([
        api.get('/products/${widget.productId}'),
        api.get('/products/${widget.productId}/batches').catchError((_) => <dynamic>[]),
        api.get('/products/${widget.productId}/variants').catchError((_) => <dynamic>[]),
      ]);
      if (!mounted) return;
      final batchesRaw = results[1];
      final variantsRaw = results[2];
      setState(() {
        detail = asStringKeyedMap(results[0]);
        batches = (batchesRaw is List ? batchesRaw : <dynamic>[]).whereType<Map>().map(asStringKeyedMap).toList();
        variants = (variantsRaw is List ? variantsRaw : <dynamic>[]).whereType<Map>().map(asStringKeyedMap).toList();
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  double _n(dynamic v) => asDouble(v);

  Product _asProduct(Map<String, dynamic> d) {
    return Product.fromJson(d);
  }

  Future<void> _edit() async {
    final d = detail;
    final onEdit = widget.onEdit;
    if (d == null || d['isActive'] == false || onEdit == null) return;
    final updated = await onEdit(_asProduct(d));
    if (updated && mounted) {
      changed = true;
      await _load();
    }
  }

  Future<void> _restore() async {
    try {
      final api = context.read<AuthState>().api;
      await api.post('/products/${widget.productId}/restore', body: {});
      if (!mounted) return;
      showSuccessToast(context, 'Restored to catalog');
      changed = true;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      showErrorToast(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = detail;
    final name = d?['name']?.toString() ?? widget.initialName ?? 'Product';
    final sku = d?['sku']?.toString();
    final sale = _n(d?['salePrice']);
    final purchase = _n(d?['purchasePrice']);
    final stock = _n(d?['stockQty']);
    final thr = _n(d?['lowStockThreshold'] ?? 5);
    final gst = _n(d?['gstRate']);
    final archived = d?['isActive'] == false;
    final out = stock <= 0;
    final low = !out && stock <= thr;
    final margin = sale > 0 && purchase > 0 ? (((sale - purchase) / sale) * 1000).round() / 10 : null;
    final marginHint = margin != null && purchase > 0
        ? '₹${(sale - purchase).toStringAsFixed(0)} / unit'
        : null;

    final buyers = (d?['buyers'] as List? ?? []).whereType<Map>().map(asStringKeyedMap).toList();
    final sales = (d?['salesHistory'] as List? ?? []).whereType<Map>().map(asStringKeyedMap).toList();
    final ledger = (d?['stockLedger'] as List? ?? []).whereType<Map>().map(asStringKeyedMap).toList();
    final serials = (d?['serials'] as List? ?? []).whereType<Map>().map(asStringKeyedMap).toList();
    final inStockSerials = serials.where((s) => s['status']?.toString() == 'IN_STOCK').length;
    final trackSerial = d?['trackSerial'] == true;
    final trackBatch = d?['trackBatch'] == true;
    final needsEnrichment = d?['needsEnrichment'] == true;

    final subtitle = [
      if ((sku ?? '').isNotEmpty) sku,
      if ((d?['brand']?.toString() ?? '').isNotEmpty) d!['brand'],
      if ((d?['category']?.toString() ?? '').isNotEmpty) d!['category'],
      if (archived) 'Archived',
    ].join(' · ');

    return Scaffold(
        backgroundColor: AppColors.canvas,
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Back',
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () => Navigator.of(context).pop(changed),
          ),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
              if (subtitle.isNotEmpty)
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w500),
                ),
            ],
          ),
          actions: [
            if (!archived && d != null && widget.onEdit != null)
              TextButton(
                onPressed: loading ? null : _edit,
                child: Text(context.watch<AppStrings>().t('edit_product')),
              ),
            if (archived)
              TextButton(onPressed: loading ? null : _restore, child: const Text('Restore')),
            IconButton(onPressed: loading ? null : _load, icon: const Icon(Icons.refresh_rounded)),
          ],
        ),
        body: loading
            ? const AppLoader()
            : error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpace.lg),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(error!, textAlign: TextAlign.center, style: TextStyle(color: AppColors.danger)),
                          const SizedBox(height: 12),
                          FilledButton(onPressed: _load, child: const Text('Retry')),
                        ],
                      ),
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, AppSpace.xl),
                    children: [
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _chip(archived ? 'Archived' : 'Active', archived ? AppColors.danger : AppColors.teal),
                          if (out) _chip('Out of stock', AppColors.danger),
                          if (low) _chip('Low stock', AppColors.warn),
                          _chip('${gst.toStringAsFixed(gst.truncateToDouble() == gst ? 0 : 1)}% GST', AppColors.muted),
                          if ((d?['category']?.toString() ?? '').isNotEmpty) _chip(d!['category'].toString(), AppColors.muted),
                          if (trackSerial) _chip('IMEI tracked', AppColors.warn),
                          if (trackBatch) _chip('Batch tracked', AppColors.warn),
                          if (needsEnrichment) _chip('Needs details', AppColors.warn),
                        ],
                      ),
                      const SizedBox(height: AppSpace.md),
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 1.45,
                        children: [
                          _metric(
                            'Stock',
                            stock == stock.roundToDouble() ? stock.toStringAsFixed(0) : stock.toStringAsFixed(2),
                            'Low at ≤ ${thr.toStringAsFixed(0)}',
                            out ? AppColors.danger : low ? AppColors.warn : AppColors.teal,
                          ),
                          _metric('Sale', _inr.format(sale), '${gst.toStringAsFixed(0)}% GST', AppColors.ink),
                          _metric('Cost', purchase > 0 ? _inr.format(purchase) : '—', null, AppColors.ink),
                          _metric(
                            'Margin',
                            margin == null ? '—' : '$margin%',
                            marginHint,
                            margin == null
                                ? AppColors.ink
                                : margin < 0
                                    ? AppColors.danger
                                    : margin < 10
                                        ? AppColors.warn
                                        : AppColors.teal,
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpace.md),
                      AppPanel(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _sectionTitle('Identity'),
                            _row('SKU', d?['sku']?.toString(), mono: true),
                            _row('Barcode', d?['barcode']?.toString(), mono: true),
                            _row('HSN', d?['hsnCode']?.toString()),
                            _row(
                              'Brand / model',
                              [d?['brand'], d?['model']]
                                  .where((e) => (e?.toString() ?? '').trim().isNotEmpty)
                                  .join(' · '),
                            ),
                            _row('Variant', d?['variantLabel']?.toString()),
                            _row('Unit', (d?['unit']?.toString().trim().isNotEmpty == true) ? d!['unit'].toString() : 'pcs'),
                            _row('ABC grade', d?['abcGrade']?.toString()),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpace.sm),
                      AppPanel(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _sectionTitle('Tracking'),
                            _row(
                              'Serial / IMEI',
                              trackSerial ? 'Yes · $inStockSerials in stock' : 'Not tracked',
                            ),
                            _row('Batch', trackBatch ? 'Tracked' : 'Not tracked'),
                          ],
                        ),
                      ),
                      if (trackSerial) ...[
                        const SizedBox(height: AppSpace.sm),
                        AppPanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _sectionTitle('Serials · $inStockSerials in stock · ${serials.length} total'),
                              if (serials.isEmpty)
                                Text('No serial numbers on file.', style: TextStyle(color: AppColors.muted, fontSize: 13))
                              else
                                ...serials.take(40).map((s) {
                                  return Container(
                                    margin: const EdgeInsets.only(bottom: 6),
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                    decoration: BoxDecoration(
                                      color: AppColors.canvas,
                                      borderRadius: BorderRadius.circular(AppRadius.sm),
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            '${s['serialNumber'] ?? ''}${s['imei'] != null ? ' · ${s['imei']}' : ''}',
                                            style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                                          ),
                                        ),
                                        Text(
                                          (s['status']?.toString() ?? '').replaceAll('_', ' '),
                                          style: TextStyle(fontSize: 11, color: AppColors.muted),
                                        ),
                                      ],
                                    ),
                                  );
                                }),
                              if (serials.length > 40)
                                Text('…and ${serials.length - 40} more', style: TextStyle(color: AppColors.muted, fontSize: 12)),
                            ],
                          ),
                        ),
                      ],
                      if (trackBatch) ...[
                        const SizedBox(height: AppSpace.sm),
                        AppPanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _sectionTitle(
                                'Batches · ${batches.fold<double>(0, (s, b) => s + _n(b['quantity'])).toStringAsFixed(0)} units across ${batches.length} batch${batches.length == 1 ? '' : 'es'}',
                              ),
                              if (batches.isEmpty)
                                Text('No batches on file yet.', style: TextStyle(color: AppColors.muted, fontSize: 13))
                              else
                                ...batches.map((b) {
                                  final expiry = DateTime.tryParse(b['expiryDate']?.toString() ?? '');
                                  final daysLeft = expiry?.difference(DateTime.now()).inDays;
                                  return Container(
                                    margin: const EdgeInsets.only(bottom: 6),
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                    decoration: BoxDecoration(
                                      color: AppColors.canvas,
                                      borderRadius: BorderRadius.circular(AppRadius.sm),
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                b['batchNumber']?.toString() ?? '',
                                                style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, fontSize: 12),
                                              ),
                                              if (expiry != null)
                                                Text(
                                                  'Expires ${_dateOnly.format(expiry.toLocal())}${daysLeft != null ? ' · ${daysLeft}d left' : ''}',
                                                  style: TextStyle(
                                                    fontSize: 11,
                                                    color: daysLeft != null && daysLeft <= 7 ? AppColors.danger : AppColors.muted,
                                                  ),
                                                ),
                                            ],
                                          ),
                                        ),
                                        Text(
                                          '${_n(b['quantity']).toStringAsFixed(0)} units',
                                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
                                        ),
                                      ],
                                    ),
                                  );
                                }),
                            ],
                          ),
                        ),
                      ],
                      if (variants.isNotEmpty) ...[
                        const SizedBox(height: AppSpace.sm),
                        AppPanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _sectionTitle('Variants · ${variants.length}'),
                              ...variants.map((v) {
                                final vId = v['id']?.toString();
                                return InkWell(
                                  onTap: vId == null || vId.isEmpty
                                      ? null
                                      : () {
                                          Navigator.of(context).push(
                                            MaterialPageRoute(
                                              builder: (_) => ProductDetailScreen(
                                                productId: vId,
                                                initialName: v['name']?.toString(),
                                                onEdit: widget.onEdit,
                                              ),
                                            ),
                                          );
                                        },
                                  borderRadius: BorderRadius.circular(AppRadius.sm),
                                  child: Container(
                                    margin: const EdgeInsets.only(bottom: 6),
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                    decoration: BoxDecoration(
                                      color: AppColors.canvas,
                                      borderRadius: BorderRadius.circular(AppRadius.sm),
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                [v['name']?.toString(), v['variantLabel']?.toString()]
                                                    .where((e) => (e ?? '').trim().isNotEmpty)
                                                    .join(' · '),
                                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                                              ),
                                              Text(
                                                v['sku']?.toString() ?? '',
                                                style: TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppColors.muted),
                                              ),
                                            ],
                                          ),
                                        ),
                                        Text(
                                          'Qty ${_n(v['stockQty']).toStringAsFixed(0)}',
                                          style: TextStyle(color: AppColors.muted, fontSize: 12),
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              }),
                            ],
                          ),
                        ),
                      ],
                      if (buyers.isNotEmpty || sales.isNotEmpty || archived) ...[
                        const SizedBox(height: AppSpace.sm),
                        AppPanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _sectionTitle('Sold to · ${buyers.length} customer${buyers.length == 1 ? '' : 's'}'),
                              if (buyers.isEmpty)
                                Text(
                                  'No finalized sales found for this SKU.',
                                  style: TextStyle(color: AppColors.muted, fontSize: 13),
                                )
                              else
                                ...buyers.take(12).map((b) {
                                  final contact = [b['phone'], b['email']]
                                      .where((e) => (e?.toString() ?? '').trim().isNotEmpty)
                                      .join(' · ');
                                  return Container(
                                    margin: const EdgeInsets.only(bottom: 8),
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                    decoration: BoxDecoration(
                                      color: AppColors.canvas,
                                      borderRadius: BorderRadius.circular(AppRadius.sm),
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                b['name']?.toString() ?? 'Walk-in',
                                                style: const TextStyle(fontWeight: FontWeight.w700),
                                              ),
                                              Text(
                                                contact.isEmpty ? 'No contact' : contact,
                                                style: TextStyle(color: AppColors.muted, fontSize: 12),
                                              ),
                                            ],
                                          ),
                                        ),
                                        Text(
                                          '${b['times']}× · qty ${_n(b['qty']).toStringAsFixed(0)}',
                                          style: TextStyle(color: AppColors.muted, fontSize: 12),
                                        ),
                                      ],
                                    ),
                                  );
                                }),
                              if (sales.isNotEmpty) ...[
                                const SizedBox(height: 8),
                                Text(
                                  'RECENT BILLS',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.6,
                                    color: AppColors.muted,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                ...sales.take(20).map((s) {
                                  final invId = s['invoiceId']?.toString();
                                  final dateRaw = s['date']?.toString();
                                  final dt = dateRaw != null ? DateTime.tryParse(dateRaw) : null;
                                  return InkWell(
                                    onTap: invId == null || invId.isEmpty
                                        ? null
                                        : () {
                                            Navigator.of(context).push(
                                              MaterialPageRoute(
                                                builder: (_) => InvoiceDetailScreen(invoiceId: invId),
                                              ),
                                            );
                                          },
                                    borderRadius: BorderRadius.circular(AppRadius.sm),
                                    child: Container(
                                      margin: const EdgeInsets.only(bottom: 8),
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                      decoration: BoxDecoration(
                                        border: Border.all(color: AppColors.border),
                                        borderRadius: BorderRadius.circular(AppRadius.sm),
                                      ),
                                      child: Row(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  '${s['invoiceNumber'] ?? ''}${s['documentType'] == 'CREDIT_NOTE' ? ' · return' : ''}',
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.w800,
                                                    color: AppColors.teal,
                                                    decoration: TextDecoration.underline,
                                                    decorationColor: AppColors.teal.withValues(alpha: 0.35),
                                                  ),
                                                ),
                                                Text(s['customerName']?.toString() ?? 'Walk-in'),
                                                Text(
                                                  [
                                                    if (dt != null) _when.format(dt.toLocal()),
                                                    if ((s['customerPhone']?.toString() ?? '').isNotEmpty)
                                                      s['customerPhone'],
                                                  ].join(' · '),
                                                  style: TextStyle(color: AppColors.muted, fontSize: 12),
                                                ),
                                              ],
                                            ),
                                          ),
                                          Column(
                                            crossAxisAlignment: CrossAxisAlignment.end,
                                            children: [
                                              Text(
                                                'qty ${_n(s['quantity']).toStringAsFixed(0)}',
                                                style: const TextStyle(fontWeight: FontWeight.w600),
                                              ),
                                              Text(
                                                _inr.format(_n(s['lineTotal'])),
                                                style: TextStyle(color: AppColors.muted, fontSize: 12),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                }),
                              ],
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: AppSpace.sm),
                      AppPanel(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _sectionTitle('Recent stock movements'),
                            if (ledger.isEmpty)
                              Text('No ledger entries yet.', style: TextStyle(color: AppColors.muted, fontSize: 13))
                            else
                              ...ledger.take(12).map((m) {
                                final qty = _n(m['quantity']);
                                final created = DateTime.tryParse(m['createdAt']?.toString() ?? '');
                                return Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                  decoration: BoxDecoration(
                                    color: AppColors.canvas,
                                    borderRadius: BorderRadius.circular(AppRadius.sm),
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              (m['type']?.toString() ?? '').replaceAll('_', ' '),
                                              style: const TextStyle(fontWeight: FontWeight.w700),
                                            ),
                                            if (created != null)
                                              Text(
                                                _when.format(created.toLocal()),
                                                style: TextStyle(color: AppColors.muted, fontSize: 12),
                                              ),
                                            if ((m['notes']?.toString() ?? '').isNotEmpty)
                                              Text(
                                                m['notes'].toString(),
                                                style: TextStyle(color: AppColors.muted, fontSize: 12),
                                              ),
                                          ],
                                        ),
                                      ),
                                      Text(
                                        '${qty > 0 ? '+' : ''}${qty.toStringAsFixed(qty == qty.roundToDouble() ? 0 : 2)}',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w800,
                                          color: qty < 0 ? AppColors.danger : AppColors.teal,
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              }),
                          ],
                        ),
                      ),
                      if (d?['createdAt'] != null || d?['updatedAt'] != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          [
                            if (d?['createdAt'] != null)
                              'Created ${_fmtStamp(d!['createdAt'])}',
                            if (d?['updatedAt'] != null)
                              'Updated ${_fmtStamp(d!['updatedAt'])}',
                          ].join(' · '),
                          style: TextStyle(fontSize: 10, color: AppColors.muted),
                        ),
                      ],
                    ],
                  ),
    );
  }

  String _fmtStamp(dynamic raw) {
    final dt = DateTime.tryParse(raw?.toString() ?? '');
    return dt == null ? '—' : _when.format(dt.toLocal());
  }

  Widget _chip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
    );
  }

  Widget _metric(String label, String value, String? hint, Color color) {
    return AppPanel(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w800, color: color),
          ),
          if (hint != null) Text(hint, style: TextStyle(fontSize: 10, color: AppColors.muted)),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
          color: AppColors.muted,
        ),
      ),
    );
  }

  Widget _row(String label, String? value, {bool mono = false}) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(child: Text(label, style: TextStyle(color: AppColors.muted))),
          Flexible(
            child: Text(
              v,
              textAlign: TextAlign.right,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontFamily: mono ? 'monospace' : null,
                fontSize: mono ? 12 : 14,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
