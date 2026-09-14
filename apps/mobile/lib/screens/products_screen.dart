import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../l10n/app_strings.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../services/local_db.dart';
import '../theme/app_theme.dart';
import '../theme/appearance_prefs.dart';
import '../widgets/app_loader.dart';
import '../theme/app_ui.dart';
import '../theme/theme_controller.dart';
import '../widgets/app_toast.dart';
import '../widgets/floating_calculator.dart';
import 'barcode_scanner_screen.dart';
import 'product_detail_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
const _gstFilterSlabs = [0, 5, 12, 18, 28, 40];

class _StockBucket {
  const _StockBucket({
    required this.label,
    required this.skuCount,
    required this.stockQty,
    required this.stockValue,
    required this.lowStockCount,
    this.gstRate,
    this.category,
  });

  final String label;
  final int skuCount;
  final double stockQty;
  final double stockValue;
  final int lowStockCount;
  final double? gstRate;
  final String? category;
}

class ProductsScreen extends StatefulWidget {
  const ProductsScreen({
    super.key,
    this.active = false,
    this.stockFilter = 'all',
    this.onStockFilterChanged,
  });

  /// When false (other shell tabs visible via IndexedStack), do not steal keyboard focus.
  final bool active;

  /// `'all'` | `'low'` | `'out'`
  final String stockFilter;
  final ValueChanged<String>? onStockFilterChanged;

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  List<Product> products = [];
  List<_StockBucket> byGstSlab = [];
  List<_StockBucket> byCategory = [];
  List<String> masterCategories = [];
  List<String> facetBrands = [];
  List<({String id, String name})> suppliers = [];
  String query = '';
  String categoryFilter = '';
  String brandFilter = '';
  String supplierFilter = '';
  String gstRateFilter = 'all';
  int total = 0;
  int page = 1;
  static const int pageSize = 25;
  bool loading = true;
  bool loadingMore = false;
  bool showArchived = false;
  String? error;
  final scrollCtrl = ScrollController();
  final hardwareScanCtrl = TextEditingController();
  final hardwareScanFocus = FocusNode();

  bool get hasMore => !showArchived && products.length < total;

  Future<void> _setShowArchived(bool value) async {
    if (showArchived == value) return;
    setState(() => showArchived = value);
    await _load(reset: true);
  }

  Future<void> _openDetail(Product p) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ProductDetailScreen(
          productId: p.id,
          initialName: p.name,
          onEdit: (product) async {
            final ok = await Navigator.of(context).push<bool>(
              MaterialPageRoute(
                builder: (_) => ProductFormScreen(
                  product: product,
                  categories: masterCategories,
                ),
              ),
            );
            return ok == true;
          },
        ),
      ),
    );
    if (changed == true && mounted) await _load(reset: true);
  }

  Future<void> _restoreProduct(Product p) async {
    try {
      final api = context.read<AuthState>().api;
      await api.post('/products/${p.id}/restore', body: {});
      if (!mounted) return;
      showSuccessToast(context, 'Restored to catalog');
      await _load(reset: true);
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    }
  }

  @override
  void initState() {
    super.initState();
    scrollCtrl.addListener(_onScroll);
    _load(reset: true);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncScanFocus());
  }

  @override
  void dispose() {
    scrollCtrl.removeListener(_onScroll);
    scrollCtrl.dispose();
    hardwareScanCtrl.dispose();
    hardwareScanFocus.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant ProductsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.stockFilter != widget.stockFilter) {
      _load(reset: true);
    }
    if (oldWidget.active != widget.active) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncScanFocus());
    }
  }

  void _syncScanFocus() {
    if (!mounted) return;
    final wantFocus = widget.active && AppearancePrefsController.instance.hardwareScannerFocus;
    if (wantFocus) {
      hardwareScanFocus.requestFocus();
    } else {
      hardwareScanFocus.unfocus();
    }
  }

  void _onScroll() {
    if (!scrollCtrl.hasClients || loading || loadingMore || !hasMore) return;
    final pos = scrollCtrl.position;
    if (pos.pixels >= pos.maxScrollExtent - 320) {
      _load(reset: false);
    }
  }

  Future<void> _load({bool reset = true}) async {
    if (reset) {
      if (loadingMore) return;
      setState(() {
        loading = true;
        error = null;
        page = 1;
      });
    } else {
      if (loading || loadingMore || !hasMore) return;
      setState(() => loadingMore = true);
    }

    final requestPage = reset ? 1 : page + 1;
    try {
      final api = context.read<AuthState>().api;

      if (showArchived) {
        final raw = await api.get('/products/inactive');
        final items = raw is List
            ? raw
            : (raw is Map && raw['items'] is List)
                ? raw['items'] as List
                : <dynamic>[];
        var batch = items
            .whereType<Map>()
            .map((e) => Product.fromJson(asStringKeyedMap(e)))
            .toList();
        final q = query.trim().toLowerCase();
        if (q.isNotEmpty) {
          batch = batch
              .where((p) =>
                  p.name.toLowerCase().contains(q) ||
                  p.sku.toLowerCase().contains(q) ||
                  (p.barcode ?? '').toLowerCase().contains(q) ||
                  (p.brand ?? '').toLowerCase().contains(q) ||
                  (p.category ?? '').toLowerCase().contains(q))
              .toList();
        }
        if (!mounted) return;
        setState(() {
          products = batch;
          total = batch.length;
          page = 1;
          loading = false;
          loadingMore = false;
          error = null;
        });
        return;
      }

      final raw = await api.get(
        '/products',
        query: {
          'page': '$requestPage',
          'pageSize': '$pageSize',
          if (query.trim().isNotEmpty) 'search': query.trim(),
          if (categoryFilter.isNotEmpty) 'category': categoryFilter,
          if (brandFilter.isNotEmpty) 'brand': brandFilter,
          if (supplierFilter.isNotEmpty) 'supplierId': supplierFilter,
          if (gstRateFilter != 'all') 'gstRate': gstRateFilter,
          if (widget.stockFilter == 'low') 'lowStock': 'true',
          if (widget.stockFilter == 'out') 'outOfStock': 'true',
        },
      );
      final map = raw is Map ? asStringKeyedMap(raw) : <String, dynamic>{};
      final items = raw is List
          ? raw
          : (map['items'] is List)
              ? map['items'] as List
              : <dynamic>[];
      final batch = items
          .whereType<Map>()
          .map((e) => Product.fromJson(asStringKeyedMap(e)))
          .toList();
      final matched = asInt(map['total'], batch.length);

      List<_StockBucket> gstBuckets = byGstSlab;
      List<_StockBucket> catBuckets = byCategory;
      List<({String id, String name})> supplierList = suppliers;
      List<String> categoryMaster = masterCategories;
      List<String> brands = facetBrands;

      if (reset) {
        try {
          final summaryRaw = await api.get('/products/stock-summary');
          final summary = asStringKeyedMap(summaryRaw);
          gstBuckets = (summary['byGstSlab'] as List? ?? [])
              .whereType<Map>()
              .map((e) {
                final m = asStringKeyedMap(e);
                final rate = asDouble(m['gstRate']);
                return _StockBucket(
                  label: '${rate.toStringAsFixed(rate.truncateToDouble() == rate ? 0 : 1)}%',
                  gstRate: rate,
                  skuCount: asDouble(m['skuCount']).toInt(),
                  stockQty: asDouble(m['stockQty']),
                  stockValue: asDouble(m['stockValue']),
                  lowStockCount: asDouble(m['lowStockCount']).toInt(),
                );
              })
              .toList();
          catBuckets = (summary['byCategory'] as List? ?? [])
              .whereType<Map>()
              .map((e) {
                final m = asStringKeyedMap(e);
                final cat = m['category']?.toString() ?? 'Uncategorized';
                return _StockBucket(
                  label: cat,
                  category: cat,
                  skuCount: asDouble(m['skuCount']).toInt(),
                  stockQty: asDouble(m['stockQty']),
                  stockValue: asDouble(m['stockValue']),
                  lowStockCount: asDouble(m['lowStockCount']).toInt(),
                );
              })
              .toList();
        } catch (_) {
          /* summary optional */
        }

        try {
          final facetsRaw = await api.get('/products/facets');
          final facets = asStringKeyedMap(facetsRaw);
          brands = (facets['brands'] as List? ?? [])
              .map((e) => e.toString().trim())
              .where((n) => n.isNotEmpty)
              .toList()
            ..sort();
          final facetCats = (facets['categories'] as List? ?? [])
              .map((e) => e.toString().trim())
              .where((n) => n.isNotEmpty);
          categoryMaster = {...categoryMaster, ...facetCats}.toList()..sort();
        } catch (_) {
          /* facets optional */
        }

        try {
          final sRaw = await api.get('/suppliers');
          final sItems = sRaw is List ? sRaw : asItemList(sRaw);
          supplierList = sItems
              .whereType<Map>()
              .map((e) {
                final m = asStringKeyedMap(e);
                return (id: m['id']?.toString() ?? '', name: m['name']?.toString() ?? '');
              })
              .where((s) => s.id.isNotEmpty)
              .toList()
            ..sort((a, b) => a.name.compareTo(b.name));
        } catch (_) {
          /* supplier filter optional */
        }

        try {
          await api.post('/categories/sync-from-products', body: {});
          final cRaw = await api.get('/categories');
          final cItems = cRaw is List ? cRaw : asItemList(cRaw);
          categoryMaster = cItems
              .whereType<Map>()
              .map((e) => asStringKeyedMap(e)['name']?.toString().trim() ?? '')
              .where((n) => n.isNotEmpty)
              .toList()
            ..sort();
        } catch (_) {
          /* category master optional */
        }
      }

      if (!mounted) return;
      setState(() {
        total = matched;
        page = requestPage;
        byGstSlab = gstBuckets;
        byCategory = catBuckets;
        suppliers = supplierList;
        masterCategories = categoryMaster;
        facetBrands = brands;
        if (reset) {
          products = batch;
        } else {
          final seen = products.map((e) => e.id).toSet();
          products = [...products, ...batch.where((e) => !seen.contains(e.id))];
        }
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (!scrollCtrl.hasClients) return;
        if (products.length < total && scrollCtrl.position.maxScrollExtent <= 48) {
          _load(reset: false);
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (reset) error = e.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
          loadingMore = false;
        });
      }
    }
  }

  void _setStockFilter(String filter) {
    if (filter == widget.stockFilter) return;
    widget.onStockFilterChanged?.call(filter);
  }

  void _clearFilters() {
    setState(() {
      query = '';
      categoryFilter = '';
      brandFilter = '';
      supplierFilter = '';
      gstRateFilter = 'all';
    });
    if (widget.stockFilter != 'all') {
      _setStockFilter('all');
    } else {
      _load(reset: true);
    }
  }

  Future<void> _openFilterSheet({
    required List<String> categories,
    required List<String> brands,
    required List<int> gstRates,
  }) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        var draftStock = widget.stockFilter;
        var draftGst = gstRateFilter;
        var draftCategory = categoryFilter;
        var draftBrand = brandFilter;
        var draftSupplier = supplierFilter;
        var draftArchived = showArchived;

        return StatefulBuilder(
          builder: (ctx, setModal) {
            InputDecoration deco(String label) => InputDecoration(
                  labelText: label,
                  filled: true,
                  fillColor: AppColors.canvas,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                );

            return SafeArea(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  20,
                  8,
                  20,
                  16 + MediaQuery.viewInsetsOf(ctx).bottom,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          margin: const EdgeInsets.only(bottom: 14),
                          decoration: BoxDecoration(
                            color: AppColors.muted.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(99),
                          ),
                        ),
                      ),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Filters',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          TextButton(
                            onPressed: () {
                              setModal(() {
                                draftStock = 'all';
                                draftGst = 'all';
                                draftCategory = '';
                                draftBrand = '';
                                draftSupplier = '';
                                draftArchived = false;
                              });
                            },
                            child: const Text('Reset'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<bool>(
                        value: draftArchived,
                        isExpanded: true,
                        decoration: deco('Catalog'),
                        items: const [
                          DropdownMenuItem(value: false, child: Text('Active products')),
                          DropdownMenuItem(value: true, child: Text('Archived products')),
                        ],
                        onChanged: (v) => setModal(() => draftArchived = v ?? false),
                      ),
                      const SizedBox(height: 12),
                      if (!draftArchived) ...[
                        DropdownButtonFormField<String>(
                          value: draftStock,
                          isExpanded: true,
                          decoration: deco('Stock status'),
                          items: const [
                            DropdownMenuItem(value: 'all', child: Text('All stock')),
                            DropdownMenuItem(value: 'low', child: Text('Low stock')),
                            DropdownMenuItem(value: 'out', child: Text('Out of stock')),
                          ],
                          onChanged: (v) => setModal(() => draftStock = v ?? 'all'),
                        ),
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          value: draftGst,
                          isExpanded: true,
                          decoration: deco('GST rate'),
                          items: [
                            const DropdownMenuItem(value: 'all', child: Text('All GST')),
                            ...gstRates.map(
                              (r) => DropdownMenuItem(value: r.toString(), child: Text('$r%')),
                            ),
                          ],
                          onChanged: (v) => setModal(() => draftGst = v ?? 'all'),
                        ),
                        if (categories.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            value: categories.contains(draftCategory) ? draftCategory : '',
                            isExpanded: true,
                            decoration: deco('Category'),
                            items: [
                              const DropdownMenuItem(value: '', child: Text('All categories')),
                              ...categories.map(
                                (c) => DropdownMenuItem(
                                  value: c,
                                  child: Text(c, overflow: TextOverflow.ellipsis),
                                ),
                              ),
                            ],
                            onChanged: (v) => setModal(() => draftCategory = v ?? ''),
                          ),
                        ],
                        if (brands.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            value: brands.contains(draftBrand) ? draftBrand : '',
                            isExpanded: true,
                            decoration: deco('Brand'),
                            items: [
                              const DropdownMenuItem(value: '', child: Text('All brands')),
                              ...brands.map(
                                (b) => DropdownMenuItem(
                                  value: b,
                                  child: Text(b, overflow: TextOverflow.ellipsis),
                                ),
                              ),
                            ],
                            onChanged: (v) => setModal(() => draftBrand = v ?? ''),
                          ),
                        ],
                        if (suppliers.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            value: suppliers.any((s) => s.id == draftSupplier) ? draftSupplier : '',
                            isExpanded: true,
                            decoration: deco('Supplier'),
                            items: [
                              const DropdownMenuItem(value: '', child: Text('All suppliers')),
                              ...suppliers.map(
                                (s) => DropdownMenuItem(
                                  value: s.id,
                                  child: Text(s.name, overflow: TextOverflow.ellipsis),
                                ),
                              ),
                            ],
                            onChanged: (v) => setModal(() => draftSupplier = v ?? ''),
                          ),
                        ],
                      ],
                      const SizedBox(height: 18),
                      FilledButton(
                        onPressed: () {
                          Navigator.pop(ctx);
                          final stockChanged = !draftArchived && draftStock != widget.stockFilter;
                          setState(() {
                            showArchived = draftArchived;
                            categoryFilter = draftCategory;
                            brandFilter = draftBrand;
                            supplierFilter = draftSupplier;
                            gstRateFilter = draftGst;
                          });
                          if (stockChanged) {
                            _setStockFilter(draftStock);
                          } else {
                            _load(reset: true);
                          }
                        },
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('Apply filters'),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Set<String> get _categories {
    final set = <String>{...masterCategories};
    for (final p in products) {
      final c = p.category?.trim();
      if (c != null && c.isNotEmpty) set.add(c);
    }
    for (final b in byCategory) {
      final c = b.category?.trim();
      if (c != null && c.isNotEmpty && c != 'Uncategorized') set.add(c);
    }
    return set;
  }

  Set<String> get _brands {
    final set = <String>{...facetBrands};
    for (final p in products) {
      final b = p.brand?.trim();
      if (b != null && b.isNotEmpty) set.add(b);
    }
    return set;
  }

  Future<void> _adjustStock(Product product) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _StockAdjustSheet(product: product),
    );
    if (changed == true && mounted) await _load(reset: true);
  }

  Future<void> _scanForStock() async {
    final code = await BarcodeScannerScreen.open(
      context,
      title: 'Scan for stock',
      subtitle: 'Scan product barcode to add or update stock',
    );
    if (code == null || !mounted) return;
    await _handleScannedCode(code);
  }

  /// USB / Bluetooth scanner guns type into a focused field then send Enter.
  Future<void> _onHardwareScanSubmit() async {
    final code = hardwareScanCtrl.text.trim();
    if (code.isEmpty) return;
    hardwareScanCtrl.clear();
    await _handleScannedCode(code);
    if (mounted && widget.active) hardwareScanFocus.requestFocus();
  }

  Future<void> _handleScannedCode(String code) async {
    try {
      final api = context.read<AuthState>().api;
      Product? product;
      try {
        final raw = await api.get('/products/barcode/${Uri.encodeComponent(code)}');
        product = Product.fromJson(asStringKeyedMap(raw));
      } catch (_) {
        product = products.where((p) => p.barcode == code || p.sku == code).firstOrNull;
      }

      if (product != null) {
        if (!mounted) return;
        showAppToast(
          context,
          'Found ${product.name} · Qty ${product.stockQty.toStringAsFixed(0)}',
        );
        await _adjustStock(product);
        return;
      }

      if (!mounted) return;
      final create = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(context.read<AppStrings>().t('product_not_found')),
          content: Text('No product for barcode "$code". Create it now?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
          ],
        ),
      );
      if (create == true && mounted) {
        await _openForm(initialBarcode: code);
      }
    } catch (e) {
      if (mounted) {
        showErrorToast(context, e.toString());
      }
    }
  }

  Future<void> _openForm({Product? product, String? initialBarcode}) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ProductFormScreen(
          product: product,
          initialBarcode: initialBarcode,
          categories: masterCategories,
        ),
      ),
    );
    if (changed == true && mounted) await _load(reset: true);
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    final title = showArchived
        ? 'Archived products'
        : switch (widget.stockFilter) {
            'low' => strings.t('low_stock'),
            'out' => 'Out of stock',
            _ => strings.t('stock_products'),
          };
    final categories = _categories.toList()..sort();
    final brands = _brands.toList()..sort();
    final gstRates = {
      ..._gstFilterSlabs,
      ...byGstSlab.map((b) => b.gstRate?.round() ?? 0),
    }.toList()
      ..sort();

    final hasActiveFilters = categoryFilter.isNotEmpty ||
        brandFilter.isNotEmpty ||
        supplierFilter.isNotEmpty ||
        gstRateFilter != 'all' ||
        widget.stockFilter != 'all';
    final filterCount = [
      if (categoryFilter.isNotEmpty) 1,
      if (brandFilter.isNotEmpty) 1,
      if (supplierFilter.isNotEmpty) 1,
      if (gstRateFilter != 'all') 1,
      if (widget.stockFilter != 'all') 1,
    ].length;
    final compact = Breakpoints.isCompactHeight(context);
    final landscape = Breakpoints.isLandscape(context);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      resizeToAvoidBottomInset: false,
      appBar: AppBar(
        title: Text(title),
        actions: [
          const CalculatorAppBarButton(),
          IconButton(
            tooltip: strings.t('scan_barcode'),
            onPressed: _scanForStock,
            icon: const Icon(Icons.qr_code_scanner_rounded),
          ),
          IconButton(onPressed: () => _load(reset: true), icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      floatingActionButton: showArchived
          ? null
          : compact || landscape
              ? Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    FloatingActionButton.small(
                      heroTag: 'scan_stock',
                      onPressed: _scanForStock,
                      backgroundColor: AppColors.amber,
                      foregroundColor: AppColors.ink,
                      child: const Icon(Icons.qr_code_scanner_rounded),
                    ),
                    const SizedBox(height: 8),
                    FloatingActionButton(
                      heroTag: 'add_product',
                      onPressed: () => _openForm(),
                      child: const Icon(Icons.add_rounded),
                    ),
                  ],
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    FloatingActionButton.extended(
                      heroTag: 'scan_stock',
                      onPressed: _scanForStock,
                      backgroundColor: AppColors.amber,
                      foregroundColor: AppColors.ink,
                      icon: const Icon(Icons.qr_code_scanner_rounded),
                      label: Text(strings.t('scan_stock')),
                    ),
                    const SizedBox(height: 10),
                    FloatingActionButton.extended(
                      heroTag: 'add_product',
                      onPressed: () => _openForm(),
                      icon: const Icon(Icons.add_rounded),
                      label: Text(strings.t('add_product')),
                    ),
                  ],
                ),
      body: Column(
        children: [
          if (AppearancePrefsController.instance.hardwareScannerFocus)
            Opacity(
              opacity: 0,
              child: SizedBox(
                height: 1,
                child: TextField(
                  controller: hardwareScanCtrl,
                  focusNode: hardwareScanFocus,
                  autofocus: false,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _onHardwareScanSubmit(),
                ),
              ),
            ),
          _StockToolbar(
            showArchived: showArchived,
            stockFilter: widget.stockFilter,
            loading: loading,
            filterCount: filterCount,
            hasActiveFilters: hasActiveFilters,
            categoryFilter: categoryFilter,
            brandFilter: brandFilter,
            supplierLabel: () {
              for (final s in suppliers) {
                if (s.id == supplierFilter) return s.name;
              }
              return null;
            }(),
            gstRateFilter: gstRateFilter,
            onSearchChanged: (v) => query = v,
            onSearch: () => _load(reset: true),
            onCatalogChanged: _setShowArchived,
            onStockFilterChanged: _setStockFilter,
            onClearFilters: _clearFilters,
            onOpenFilters: () => _openFilterSheet(
              categories: categories,
              brands: brands,
              gstRates: gstRates,
            ),
          ),
          if (loading) const AppLinearLoader(),
          if (error != null)
            Padding(
              padding: AppSpace.page,
              child: Text(error!, style: const TextStyle(color: AppColors.danger)),
            ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.teal,
              onRefresh: () => _load(reset: true),
              child: loading && products.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 120),
                        Center(child: AppLoader()),
                      ],
                    )
                  : products.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            const SizedBox(height: 100),
                            AppEmptyState(
                              message: showArchived
                                  ? 'No archived products'
                                  : widget.stockFilter == 'low'
                                      ? 'No low-stock products'
                                      : widget.stockFilter == 'out'
                                          ? 'No out-of-stock products'
                                          : 'No products found',
                              icon: Icons.inventory_2_outlined,
                            ),
                          ],
                        )
                      : ListView.separated(
                          controller: scrollCtrl,
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: AppSpace.listWithFab(stacked: true),
                          itemCount: products.length + (loadingMore ? 1 : 0),
                          separatorBuilder: (_, __) => const SizedBox(height: AppSpace.sm),
                          itemBuilder: (_, i) {
                            if (i >= products.length) {
                              return const Padding(
                                padding: EdgeInsets.symmetric(vertical: 16),
                                child: Center(
                                  child: SizedBox(
                                    width: 28,
                                    height: 28,
                                    child: CircularProgressIndicator(strokeWidth: 2.5),
                                  ),
                                ),
                              );
                            }
                            final p = products[i];
                            final low = p.stockQty <= p.lowStockThreshold;
                            final meta = showArchived
                                ? [
                                    p.sku,
                                    if (p.lastCustomerName != null && p.lastCustomerName!.isNotEmpty)
                                      'Sold to ${p.lastCustomerName}',
                                    if ((p.customerCount ?? 0) > 1) '+${(p.customerCount! - 1)} more',
                                    if (p.invoiceCount != null) '${p.invoiceCount} bill(s)',
                                    if (p.buyerNames.isNotEmpty) 'Buyers: ${p.buyerNames.take(3).join(', ')}',
                                  ].where((e) => e.toString().trim().isNotEmpty).join(' · ')
                                : [
                                    p.sku,
                                    'GST ${p.gstRate}%',
                                    if (p.category != null && p.category!.trim().isNotEmpty) p.category,
                                    if (p.brand != null && p.brand!.trim().isNotEmpty) p.brand,
                                    'HSN ${p.hsnCode}',
                                    if (p.barcode != null && p.barcode!.isNotEmpty) p.barcode,
                                  ].join(' · ');
                            return AppPanel(
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                              onTap: () => _openDetail(p),
                              child: ListTile(
                                contentPadding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
                                title: Text(
                                  p.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                                ),
                                subtitle: Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        meta.isEmpty
                                            ? (showArchived ? 'No finalized sales on this SKU' : p.sku)
                                            : meta,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        '${_inr.format(p.salePrice)} · ${showArchived ? 'Archived' : 'Qty ${p.stockQty.toStringAsFixed(0)}'}',
                                        style: GoogleFonts.plusJakartaSans(
                                          color: showArchived
                                              ? AppColors.muted
                                              : low
                                                  ? AppColors.warn
                                                  : AppColors.tealDark,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                isThreeLine: true,
                                trailing: IconButton(
                                  tooltip: 'Actions',
                                  icon: Icon(Icons.more_vert_rounded, color: AppColors.muted),
                                  onPressed: () => _showActions(p),
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }

  void _showActions(Product p) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('Stock ${p.stockQty.toStringAsFixed(0)} · ${_inr.format(p.salePrice)}'),
            ),
            ListTile(
              leading: const Icon(Icons.info_outline_rounded),
              title: const Text('View details'),
              onTap: () {
                Navigator.pop(ctx);
                _openDetail(p);
              },
            ),
            if (showArchived)
              ListTile(
                leading: const Icon(Icons.restore_rounded),
                title: const Text('Restore to catalog'),
                onTap: () {
                  Navigator.pop(ctx);
                  _restoreProduct(p);
                },
              )
            else ...[
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: Text(context.read<AppStrings>().t('edit_product')),
                onTap: () {
                  Navigator.pop(ctx);
                  _openForm(product: p);
                },
              ),
              ListTile(
                leading: const Icon(Icons.inventory_2_outlined),
                title: Text(context.read<AppStrings>().t('adjust_stock')),
                onTap: () {
                  Navigator.pop(ctx);
                  _adjustStock(p);
                },
              ),
              if (p.stockQty <= 0)
                ListTile(
                  leading: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
                  title: Text(
                    context.read<AppStrings>().t('remove_product'),
                    style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(context.read<AppStrings>().t('remove_product_hint')),
                  onTap: () {
                    Navigator.pop(ctx);
                    _removeProduct(p);
                  },
                ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Future<void> _removeProduct(Product p) async {
    final strings = context.read<AppStrings>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(strings.t('remove_product')),
        content: Text('${strings.t('remove_product_confirm')}\n\n${p.name}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(strings.t('close'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(strings.t('remove_product')),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final api = context.read<AuthState>().api;
      await api.delete('/products/${p.id}');
      await LocalDb.instance.deleteProduct(p.id);
      if (!mounted) return;
      showSuccessToast(context, strings.t('product_removed'));
      await _load(reset: true);
    } catch (e) {
      if (!mounted) return;
      showErrorToast(context, e.toString());
    }
  }
}

class _StockToolbar extends StatelessWidget {
  const _StockToolbar({
    required this.showArchived,
    required this.stockFilter,
    required this.loading,
    required this.filterCount,
    required this.hasActiveFilters,
    required this.categoryFilter,
    required this.brandFilter,
    required this.supplierLabel,
    required this.gstRateFilter,
    required this.onSearchChanged,
    required this.onSearch,
    required this.onCatalogChanged,
    required this.onStockFilterChanged,
    required this.onClearFilters,
    required this.onOpenFilters,
  });

  final bool showArchived;
  final String stockFilter;
  final bool loading;
  final int filterCount;
  final bool hasActiveFilters;
  final String categoryFilter;
  final String brandFilter;
  final String? supplierLabel;
  final String gstRateFilter;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onSearch;
  final ValueChanged<bool> onCatalogChanged;
  final ValueChanged<String> onStockFilterChanged;
  final VoidCallback onClearFilters;
  final VoidCallback onOpenFilters;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      elevation: 0.5,
      shadowColor: Colors.black12,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, AppSpace.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: AppSearchField(
                    hint: 'Search name, SKU, barcode…',
                    onChanged: onSearchChanged,
                    onSubmitted: (_) => onSearch(),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: loading ? null : onSearch,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(46, 46),
                    padding: EdgeInsets.zero,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Icon(Icons.search_rounded, size: 20),
                ),
                const SizedBox(width: 8),
                Badge(
                  isLabelVisible: filterCount > 0,
                  label: Text('$filterCount'),
                  child: OutlinedButton(
                    onPressed: onOpenFilters,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(46, 46),
                      padding: EdgeInsets.zero,
                      side: BorderSide(
                        color: filterCount > 0
                            ? AppColors.teal
                            : AppColors.muted.withValues(alpha: 0.35),
                      ),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Icon(
                      Icons.tune_rounded,
                      color: filterCount > 0 ? AppColors.teal : AppColors.ink,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  AppSegChip(
                    label: 'Active',
                    selected: !showArchived,
                    onTap: () => onCatalogChanged(false),
                  ),
                  const SizedBox(width: 8),
                  AppSegChip(
                    label: 'Archived',
                    selected: showArchived,
                    onTap: () => onCatalogChanged(true),
                  ),
                  if (!showArchived) ...[
                    const SizedBox(width: 12),
                    Container(width: 1, height: 22, color: AppColors.muted.withValues(alpha: 0.25)),
                    const SizedBox(width: 12),
                    for (final f in const [
                      ('all', 'All'),
                      ('low', 'Low'),
                      ('out', 'Out'),
                    ]) ...[
                      AppSegChip(
                        label: f.$2,
                        selected: stockFilter == f.$1,
                        onTap: () => onStockFilterChanged(f.$1),
                      ),
                      const SizedBox(width: 8),
                    ],
                  ],
                  if (hasActiveFilters) ...[
                    const SizedBox(width: 4),
                    TextButton(
                      onPressed: onClearFilters,
                      style: TextButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        foregroundColor: AppColors.teal,
                      ),
                      child: const Text('Clear'),
                    ),
                  ],
                ],
              ),
            ),
            if (hasActiveFilters && !Breakpoints.isCompactHeight(context)) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (categoryFilter.isNotEmpty) _ActiveFilterPill(label: categoryFilter),
                  if (brandFilter.isNotEmpty) _ActiveFilterPill(label: brandFilter),
                  if (supplierLabel != null && supplierLabel!.isNotEmpty)
                    _ActiveFilterPill(label: supplierLabel!),
                  if (gstRateFilter != 'all') _ActiveFilterPill(label: 'GST $gstRateFilter%'),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ActiveFilterPill extends StatelessWidget {
  const _ActiveFilterPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.teal.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: AppColors.teal.withValues(alpha: 0.2)),
      ),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.tealDark,
        ),
      ),
    );
  }
}

class ProductFormScreen extends StatefulWidget {
  const ProductFormScreen({
    super.key,
    this.product,
    this.initialBarcode,
    this.categories = const [],
  });

  final Product? product;
  final String? initialBarcode;
  final List<String> categories;

  @override
  State<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends State<ProductFormScreen> {
  static const _defaults = ['Battery', 'Inverter', 'Stabilizer', 'Accessories', 'General'];
  static const _otherKey = '__other__';

  final _formKey = GlobalKey<FormState>();
  late final TextEditingController sku;
  late final TextEditingController name;
  late final TextEditingController hsn;
  late final TextEditingController barcode;
  late final TextEditingController category;
  late final TextEditingController brand;
  late final TextEditingController model;
  late final TextEditingController unit;
  late final TextEditingController salePrice;
  late final TextEditingController purchasePrice;
  late final TextEditingController stockQty;
  late final TextEditingController lowStock;
  double gstRate = 18;
  bool trackSerial = false;
  bool saving = false;
  String? error;
  String? categorySelect;
  bool categoryOther = false;

  bool get isEdit => widget.product != null;

  List<String> get _knownOptions {
    final set = <String>{..._defaults, ...widget.categories};
    final list = set.toList()..sort();
    return list;
  }

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    sku = TextEditingController(text: p?.sku ?? '');
    name = TextEditingController(text: p?.name ?? '');
    hsn = TextEditingController(text: p?.hsnCode ?? '8517');
    barcode = TextEditingController(
      text: p?.barcode ?? widget.initialBarcode ?? '',
    );
    category = TextEditingController(text: p?.category ?? '');
    brand = TextEditingController(text: p?.brand ?? '');
    model = TextEditingController(text: p?.model ?? '');
    unit = TextEditingController(text: 'pcs');
    salePrice = TextEditingController(text: p != null ? p.salePrice.toString() : '');
    purchasePrice = TextEditingController(
      text: p != null ? (p.purchasePrice ?? 0).toString() : '0',
    );
    gstRate = p?.gstRate ?? 18;
    trackSerial = p?.trackSerial ?? false;
    stockQty = TextEditingController(text: p != null ? p.stockQty.toStringAsFixed(0) : '0');
    lowStock = TextEditingController(
      text: p != null ? p.lowStockThreshold.toStringAsFixed(0) : '5',
    );
    final current = category.text.trim();
    if (current.isEmpty) {
      categorySelect = null;
      categoryOther = false;
    } else if (_knownOptions.any((c) => c.toLowerCase() == current.toLowerCase())) {
      categorySelect = _knownOptions.firstWhere((c) => c.toLowerCase() == current.toLowerCase());
      categoryOther = false;
    } else {
      categorySelect = _otherKey;
      categoryOther = true;
    }
  }

  @override
  void dispose() {
    sku.dispose();
    name.dispose();
    hsn.dispose();
    barcode.dispose();
    category.dispose();
    brand.dispose();
    model.dispose();
    unit.dispose();
    salePrice.dispose();
    purchasePrice.dispose();
    stockQty.dispose();
    lowStock.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final shared = {
        'name': name.text.trim(),
        'barcode': barcode.text.trim().isEmpty ? null : barcode.text.trim(),
        'category': category.text.trim().isEmpty ? null : category.text.trim(),
        'brand': brand.text.trim().isEmpty ? null : brand.text.trim(),
        'model': model.text.trim().isEmpty ? null : model.text.trim(),
        'unit': unit.text.trim().isEmpty ? 'pcs' : unit.text.trim(),
        'salePrice': double.parse(salePrice.text.trim()),
        'purchasePrice': double.tryParse(purchasePrice.text.trim()) ?? 0,
        'gstRate': gstRate,
        'lowStockThreshold': double.parse(lowStock.text.trim()),
        'trackSerial': trackSerial,
      };
      if (isEdit) {
        await api.patch('/products/${widget.product!.id}', body: {
          ...shared,
          'hsnCode': hsn.text.trim(),
        });
      } else {
        await api.post('/products', body: {
          ...shared,
          'sku': sku.text.trim(),
          'hsnCode': hsn.text.trim(),
          'stockQty': double.parse(stockQty.text.trim()),
        });
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final slabs = {
      ..._gstFilterSlabs,
      if (!_gstFilterSlabs.contains(gstRate.round())) gstRate.round(),
    }.toList()
      ..sort();

    return Scaffold(
      appBar: AppBar(
        title: Text(isEdit ? context.watch<AppStrings>().t('edit_product') : context.watch<AppStrings>().t('add_product')),
        actions: [
          TextButton(
            onPressed: saving ? null : () => Navigator.of(context).pop(false),
            child: Text(context.watch<AppStrings>().t('close')),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.md, AppSpace.md, AppSpace.xxl),
          children: [
            if (!isEdit)
              TextFormField(
                controller: sku,
                decoration: const InputDecoration(labelText: 'SKU *', border: OutlineInputBorder()),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
            if (!isEdit) const SizedBox(height: 12),
            TextFormField(
              controller: name,
              decoration: const InputDecoration(labelText: 'Name *', border: OutlineInputBorder()),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            if (!isEdit)
              TextFormField(
                controller: hsn,
                decoration: const InputDecoration(labelText: 'HSN *', border: OutlineInputBorder()),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
            if (!isEdit) const SizedBox(height: 12),
            TextFormField(
              controller: barcode,
              decoration: InputDecoration(
                labelText: 'Barcode',
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                  tooltip: 'Scan barcode',
                  onPressed: () async {
                    final code = await BarcodeScannerScreen.open(
                      context,
                      title: 'Scan product barcode',
                    );
                    if (code != null && mounted) {
                      setState(() => barcode.text = code);
                    }
                  },
                  icon: const Icon(Icons.qr_code_scanner_rounded),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: categoryOther
                        ? _otherKey
                        : (categorySelect != null && _knownOptions.contains(categorySelect)
                            ? categorySelect
                            : null),
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Category',
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      ..._knownOptions.map(
                        (c) => DropdownMenuItem(value: c, child: Text(c, overflow: TextOverflow.ellipsis)),
                      ),
                      const DropdownMenuItem(
                        value: _otherKey,
                        child: Text('Other (add new)…'),
                      ),
                    ],
                    onChanged: (v) {
                      setState(() {
                        if (v == _otherKey) {
                          categoryOther = true;
                          categorySelect = _otherKey;
                          category.text = '';
                        } else {
                          categoryOther = false;
                          categorySelect = v;
                          category.text = v ?? '';
                        }
                      });
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: brand,
                    decoration: const InputDecoration(
                      labelText: 'Brand',
                      hintText: 'e.g. Exide',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
              ],
            ),
            if (categoryOther) ...[
              const SizedBox(height: 12),
              TextFormField(
                controller: category,
                decoration: const InputDecoration(
                  labelText: 'New category name',
                  hintText: 'Type category',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: model,
                    decoration: const InputDecoration(
                      labelText: 'Model',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: unit,
                    decoration: const InputDecoration(
                      labelText: 'Unit',
                      hintText: 'pcs',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: salePrice,
                    decoration: const InputDecoration(labelText: 'Sale price *', border: OutlineInputBorder()),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    validator: (v) {
                      final n = double.tryParse(v?.trim() ?? '');
                      if (n == null || n <= 0) return 'Enter a price > 0';
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: purchasePrice,
                    decoration: const InputDecoration(labelText: 'Purchase price', border: OutlineInputBorder()),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'GST slab *',
              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600, fontSize: 13),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final rate in slabs)
                  ChoiceChip(
                    label: Text('$rate%'),
                    selected: (gstRate - rate).abs() < 0.001,
                    onSelected: (_) => setState(() => gstRate = rate.toDouble()),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (!isEdit)
              TextFormField(
                controller: stockQty,
                decoration: const InputDecoration(
                  labelText: 'Opening stock',
                  border: OutlineInputBorder(),
                ),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                validator: (v) {
                  final n = double.tryParse(v?.trim() ?? '');
                  if (n == null || n < 0) return 'Enter stock qty';
                  return null;
                },
              ),
            if (!isEdit) const SizedBox(height: 12),
            TextFormField(
              controller: lowStock,
              decoration: const InputDecoration(
                labelText: 'Low stock threshold',
                border: OutlineInputBorder(),
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              validator: (v) {
                final n = double.tryParse(v?.trim() ?? '');
                if (n == null || n < 0) return 'Enter threshold';
                return null;
              },
            ),
            if (error != null) ...[
              const SizedBox(height: 12),
              Text(error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Track IMEI / serial'),
              value: trackSerial,
              onChanged: (v) => setState(() => trackSerial = v),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: saving ? null : _save,
              child: Text(saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create product')),
            ),
          ],
        ),
      ),
    );
  }
}

class _StockAdjustSheet extends StatefulWidget {
  const _StockAdjustSheet({required this.product});

  final Product product;

  @override
  State<_StockAdjustSheet> createState() => _StockAdjustSheetState();
}

class _StockAdjustSheetState extends State<_StockAdjustSheet> {
  final qty = TextEditingController();
  final notes = TextEditingController();
  bool saving = false;
  String? error;

  @override
  void dispose() {
    qty.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final n = double.tryParse(qty.text.trim());
    if (n == null || n == 0) {
      setState(() => error = 'Enter a non-zero quantity (+ in / − out)');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      await api.post('/products/${widget.product.id}/stock', body: {
        'quantity': n,
        if (notes.text.trim().isNotEmpty) 'notes': notes.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Adjust stock — ${widget.product.name}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            'Current: ${widget.product.stockQty.toStringAsFixed(0)}',
            style: const TextStyle(color: Colors.black54),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: qty,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Adjustment qty (+ add / − remove)',
              border: OutlineInputBorder(),
              helperText: 'Example: 10 or -3',
            ),
            keyboardType: const TextInputType.numberWithOptions(signed: true, decimal: true),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: notes,
            decoration: const InputDecoration(
              labelText: 'Notes (optional)',
              border: OutlineInputBorder(),
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 8),
            Text(error!, style: const TextStyle(color: Colors.red)),
          ],
          const SizedBox(height: 12),
          FilledButton(
            onPressed: saving ? null : _submit,
            child: Text(saving ? 'Saving…' : 'Apply adjustment'),
          ),
        ],
      ),
    );
  }
}
