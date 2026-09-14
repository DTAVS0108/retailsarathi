import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../l10n/app_strings.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_loader.dart';
import '../theme/app_ui.dart';
import 'barcode_scanner_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// Complete incomplete SKUs from stock-in (barcode, sale price, serials).
class ProductsNeedingDetailsScreen extends StatefulWidget {
  const ProductsNeedingDetailsScreen({super.key});

  @override
  State<ProductsNeedingDetailsScreen> createState() => _ProductsNeedingDetailsScreenState();
}

class _ProductsNeedingDetailsScreenState extends State<ProductsNeedingDetailsScreen> {
  List<Map<String, dynamic>> rows = [];
  bool loading = true;
  String? error;
  String? success;
  String? expandedId;
  String? savingId;
  final forms = <String, _EnrichForm>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final f in forms.values) {
      f.dispose();
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
      final raw = await api.get('/scan/enrichments', query: {'status': 'PENDING'});
      final list = raw is List ? raw : <dynamic>[];
      for (final f in forms.values) {
        f.dispose();
      }
      forms.clear();
      final next = <Map<String, dynamic>>[];
      for (final item in list.whereType<Map>()) {
        final m = asStringKeyedMap(item);
        final id = m['id']?.toString() ?? '';
        final product = m['product'] is Map ? asStringKeyedMap(m['product']) : <String, dynamic>{};
        next.add(m);
        forms[id] = _EnrichForm(
          barcode: product['barcode']?.toString() ?? '',
          salePrice: product['salePrice'] != null && asDouble(product['salePrice']) > 0
              ? asDouble(product['salePrice']).toStringAsFixed(0)
              : '',
          model: product['model']?.toString() ?? '',
          brand: product['brand']?.toString() ?? '',
          category: product['category']?.toString() ?? '',
          gstRate: asDouble(product['gstRate'], 18),
          trackSerial: product['trackSerial'] == true,
        );
      }
      setState(() {
        rows = next;
        expandedId = next.isEmpty
            ? null
            : (expandedId != null && forms.containsKey(expandedId) ? expandedId : next.first['id']?.toString());
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _complete(String id, {bool skip = false}) async {
    setState(() {
      error = null;
      success = null;
      savingId = id;
    });
    try {
      final api = context.read<AuthState>().api;
      final form = forms[id];
      await api.post(
        '/scan/enrichments/$id/complete',
        body: skip
            ? {'skip': true}
            : {
                if (form != null && form.barcodeCtrl.text.trim().isNotEmpty)
                  'barcode': form.barcodeCtrl.text.trim(),
                if (form != null && form.salePriceCtrl.text.trim().isNotEmpty)
                  'salePrice': double.tryParse(form.salePriceCtrl.text) ?? 0,
                if (form != null && form.modelCtrl.text.trim().isNotEmpty)
                  'model': form.modelCtrl.text.trim(),
                if (form != null && form.brandCtrl.text.trim().isNotEmpty)
                  'brand': form.brandCtrl.text.trim(),
                if (form != null && form.categoryCtrl.text.trim().isNotEmpty)
                  'category': form.categoryCtrl.text.trim(),
                if (form != null) 'gstRate': form.gstRate,
                if (form != null) 'trackSerial': form.trackSerial,
                if (form != null && form.addStockCtrl.text.trim().isNotEmpty)
                  'addStockQty': double.tryParse(form.addStockCtrl.text) ?? 0,
                if (form != null && form.serialsCtrl.text.trim().isNotEmpty)
                  'serialNumbers': form.serialsCtrl.text
                      .split(RegExp(r'[\n,]'))
                      .map((s) => s.trim())
                      .where((s) => s.isNotEmpty)
                      .toList(),
              },
      );
      if (!mounted) return;
      setState(() {
        success = skip ? 'Skipped for now.' : 'Product details saved.';
        savingId = null;
      });
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = e.toString();
        savingId = null;
      });
    }
  }

  Future<void> _scanBarcode(String id) async {
    final code = await BarcodeScannerScreen.open(
      context,
      title: 'Scan barcode',
      subtitle: 'Point at the product barcode',
    );
    if (code == null || !mounted) return;
    forms[id]?.barcodeCtrl.text = code;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(context.watch<AppStrings>().t('products_needing')),
        actions: [
          IconButton(
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: loading
          ? const AppLoader()
          : RefreshIndicator(
              color: AppColors.teal,
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, AppSpace.xxl),
                children: [
                  AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${rows.length} item${rows.length == 1 ? '' : 's'} in queue',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Fill barcode and sale price so POS can sell these SKUs. Tap a card to edit.',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            color: AppColors.muted,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: AppSpace.sm),
                    AppPanel(
                      child: Text(error!, style: const TextStyle(color: AppColors.danger)),
                    ),
                  ],
                  if (success != null) ...[
                    const SizedBox(height: AppSpace.sm),
                    AppPanel(
                      child: Text(success!, style: TextStyle(color: AppColors.tealDark)),
                    ),
                  ],
                  const SizedBox(height: AppSpace.md),
                  if (rows.isEmpty)
                    AppEmptyState(
                      icon: Icons.playlist_add_check_rounded,
                      message: 'Queue empty. New stock-in items missing barcode appear here.',
                    )
                  else
                    ...rows.map((row) {
                      final id = row['id']?.toString() ?? '';
                      final product = row['product'] is Map
                          ? asStringKeyedMap(row['product'])
                          : <String, dynamic>{};
                      final missing = row['missingFields'] is List
                          ? (row['missingFields'] as List).map((e) => e.toString()).toList()
                          : <String>[];
                      final form = forms[id];
                      if (form == null) return const SizedBox.shrink();
                      final open = expandedId == id;
                      final busy = savingId == id;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: AppSpace.sm),
                        child: _EnrichCard(
                          product: product,
                          draftName: row['draftName']?.toString(),
                          notes: row['notes']?.toString(),
                          missing: missing,
                          form: form,
                          expanded: open,
                          busy: busy,
                          onToggle: () => setState(() => expandedId = open ? null : id),
                          onScanBarcode: () => _scanBarcode(id),
                          onTrackSerial: (v) => setState(() => form.trackSerial = v),
                          onSave: busy ? null : () => _complete(id),
                          onSkip: busy ? null : () => _complete(id, skip: true),
                        ),
                      );
                    }),
                ],
              ),
            ),
    );
  }
}

class _EnrichCard extends StatelessWidget {
  const _EnrichCard({
    required this.product,
    required this.missing,
    required this.form,
    required this.expanded,
    required this.busy,
    required this.onToggle,
    required this.onScanBarcode,
    required this.onTrackSerial,
    required this.onSave,
    required this.onSkip,
    this.draftName,
    this.notes,
  });

  final Map<String, dynamic> product;
  final String? draftName;
  final String? notes;
  final List<String> missing;
  final _EnrichForm form;
  final bool expanded;
  final bool busy;
  final VoidCallback onToggle;
  final VoidCallback onScanBarcode;
  final ValueChanged<bool> onTrackSerial;
  final VoidCallback? onSave;
  final VoidCallback? onSkip;

  @override
  Widget build(BuildContext context) {
    final name = product['name']?.toString() ?? draftName ?? 'Product';
    final sku = product['sku']?.toString() ?? '';
    final stock = product['stockQty'];
    final purchase = asDouble(product['purchasePrice']);

    return AppPanel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onToggle,
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.md, AppSpace.sm, AppSpace.md),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppColors.tealSoft.withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.inventory_2_outlined, color: AppColors.tealDark, size: 22),
                  ),
                  const SizedBox(width: AppSpace.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                            height: 1.25,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          [
                            if (sku.isNotEmpty) sku,
                            'stock $stock',
                            if (purchase > 0) 'cost ${_inr.format(purchase)}',
                          ].join(' · '),
                          style: TextStyle(fontSize: 12, color: AppColors.muted),
                        ),
                        if (notes != null && notes!.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(notes!, style: TextStyle(fontSize: 12, color: AppColors.muted)),
                        ],
                        if (missing.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              for (final m in missing)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFFF7ED),
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(color: const Color(0xFFFDBA74)),
                                  ),
                                  child: Text(
                                    m,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.warn,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  Icon(
                    expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                    color: AppColors.muted,
                  ),
                ],
              ),
            ),
          ),
          if (expanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(AppSpace.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: form.barcodeCtrl,
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      labelText: 'Barcode',
                      hintText: 'Scan or type',
                      suffixIcon: IconButton(
                        tooltip: 'Scan',
                        onPressed: onScanBarcode,
                        icon: const Icon(Icons.qr_code_scanner_rounded),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: form.salePriceCtrl,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            labelText: 'Sale price',
                            prefixText: '₹ ',
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(
                        child: TextField(
                          controller: form.addStockCtrl,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            labelText: 'Add stock',
                            hintText: 'Optional',
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: form.brandCtrl,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Brand'),
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(
                        child: TextField(
                          controller: form.categoryCtrl,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            labelText: 'Category',
                            hintText: 'e.g. Battery',
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: form.modelCtrl,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Model'),
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'GST slab',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<double>(
                              value: const [0.0, 5.0, 12.0, 18.0, 28.0, 40.0].contains(form.gstRate)
                                  ? form.gstRate
                                  : 18,
                              isExpanded: true,
                              items: const [
                                DropdownMenuItem(value: 0.0, child: Text('0%')),
                                DropdownMenuItem(value: 5.0, child: Text('5%')),
                                DropdownMenuItem(value: 12.0, child: Text('12%')),
                                DropdownMenuItem(value: 18.0, child: Text('18%')),
                                DropdownMenuItem(value: 28.0, child: Text('28%')),
                                DropdownMenuItem(value: 40.0, child: Text('40%')),
                              ],
                              onChanged: (v) {
                                if (v == null) return;
                                form.gstRate = v;
                                onTrackSerial(form.trackSerial);
                              },
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.xs),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      'Track serial / IMEI',
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    subtitle: const Text(
                      'Require serials when selling or receiving',
                      style: TextStyle(fontSize: 12),
                    ),
                    value: form.trackSerial,
                    onChanged: onTrackSerial,
                  ),
                  if (form.trackSerial) ...[
                    TextField(
                      controller: form.serialsCtrl,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Serial numbers',
                        hintText: 'One per line or comma-separated',
                        alignLabelWithHint: true,
                      ),
                    ),
                    const SizedBox(height: AppSpace.sm),
                  ],
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: FilledButton(
                          onPressed: onSave,
                          child: busy
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Text('Save details'),
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: onSkip,
                          child: const Text('Skip'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _EnrichForm {
  _EnrichForm({
    String barcode = '',
    String salePrice = '',
    String model = '',
    String brand = '',
    String category = '',
    this.gstRate = 18,
    this.trackSerial = false,
  })  : barcodeCtrl = TextEditingController(text: barcode),
        salePriceCtrl = TextEditingController(text: salePrice),
        modelCtrl = TextEditingController(text: model),
        brandCtrl = TextEditingController(text: brand),
        categoryCtrl = TextEditingController(text: category),
        addStockCtrl = TextEditingController(),
        serialsCtrl = TextEditingController();

  final TextEditingController barcodeCtrl;
  final TextEditingController salePriceCtrl;
  final TextEditingController modelCtrl;
  final TextEditingController brandCtrl;
  final TextEditingController categoryCtrl;
  final TextEditingController addStockCtrl;
  final TextEditingController serialsCtrl;
  double gstRate;
  bool trackSerial;

  void dispose() {
    barcodeCtrl.dispose();
    salePriceCtrl.dispose();
    modelCtrl.dispose();
    brandCtrl.dispose();
    categoryCtrl.dispose();
    addStockCtrl.dispose();
    serialsCtrl.dispose();
  }
}
