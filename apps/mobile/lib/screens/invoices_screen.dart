import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../l10n/app_strings.dart';
import 'package:share_plus/share_plus.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../services/api_client.dart';
import '../services/invoice_pdf.dart';
import '../services/invoice_print_loader.dart';
import '../theme/app_theme.dart';
import '../theme/appearance_prefs.dart';
import '../theme/theme_controller.dart';
import '../widgets/app_loader.dart';
import '../widgets/app_toast.dart';
import '../widgets/floating_calculator.dart';
import '../theme/app_ui.dart';
import '../services/bluetooth_thermal_printer.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
final _date = DateFormat('dd MMM yyyy, hh:mm a');
final _day = DateFormat('dd MMM yyyy');

String _compactInr(double n) {
  if (n >= 1e7) return '₹${(n / 1e7).toStringAsFixed(1)}Cr';
  if (n >= 1e5) return '₹${(n / 1e5).toStringAsFixed(1)}L';
  if (n >= 1e3) return '₹${(n / 1e3).toStringAsFixed(1)}k';
  return _inr.format(n);
}

String _statusLabel(String status) {
  return switch (status) {
    'FINALIZED' => 'Finalized',
    'DRAFT' => 'Draft',
    'CANCELLED' => 'Cancelled',
    _ => status,
  };
}

class InvoicesScreen extends StatefulWidget {
  const InvoicesScreen({
    super.key,
    this.statusFilter = 'ALL',
    this.onStatusFilterChanged,
    this.onNewBill,
  });

  final String statusFilter;
  final ValueChanged<String>? onStatusFilterChanged;
  final VoidCallback? onNewBill;

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  final _searchCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  List<InvoiceSummary> invoices = [];
  int total = 0;
  bool loading = true;
  bool loadingMore = false;
  String? error;

  String search = '';
  String dateFrom = '';
  String dateTo = '';
  String type = '';
  String paymentMethod = '';
  String sortBy = 'createdAt';
  String sortDir = 'desc';
  int page = 1;
  static const int pageSize = 25;

  bool get hasMore => invoices.length < total;

  static const _types = [
    ('', 'All types'),
    ('TAX_INVOICE', 'Tax invoice'),
    ('CREDIT_NOTE', 'Credit note'),
    ('BILL_OF_SUPPLY', 'Bill of supply'),
    ('DELIVERY_CHALLAN', 'Delivery challan'),
  ];

  static const _payments = [
    ('', 'All modes'),
    ('CASH', 'Cash'),
    ('UPI', 'UPI'),
    ('CARD', 'Card'),
    ('CREDIT', 'Credit'),
    ('BANK_TRANSFER', 'Bank'),
  ];

  @override
  void initState() {
    super.initState();
    _scrollCtrl.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    _scrollCtrl.removeListener(_onScroll);
    _scrollCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant InvoicesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.statusFilter != widget.statusFilter) {
      _load(reset: true);
    }
  }

  void _onScroll() {
    if (!_scrollCtrl.hasClients || loading || loadingMore || !hasMore) return;
    final pos = _scrollCtrl.position;
    if (pos.pixels >= pos.maxScrollExtent - 320) {
      _load(reset: false);
    }
  }

  bool get hasExtraFilters =>
      search.trim().isNotEmpty ||
      dateFrom.isNotEmpty ||
      dateTo.isNotEmpty ||
      type.isNotEmpty ||
      paymentMethod.isNotEmpty ||
      sortBy != 'createdAt' ||
      sortDir != 'desc';

  String get filterSummary {
    final bits = <String>[];
    if (search.trim().isNotEmpty) bits.add('"${search.trim()}"');
    if (dateFrom.isNotEmpty || dateTo.isNotEmpty) {
      bits.add(
        'Dates: ${dateFrom.isEmpty ? '…' : _prettyDate(dateFrom)} – ${dateTo.isEmpty ? '…' : _prettyDate(dateTo)}',
      );
    }
    if (paymentMethod.isNotEmpty) {
      bits.add(_payments.firstWhere((p) => p.$1 == paymentMethod, orElse: () => (paymentMethod, paymentMethod)).$2);
    }
    if (type.isNotEmpty) {
      bits.add(_types.firstWhere((t) => t.$1 == type, orElse: () => (type, type)).$2);
    }
    if (sortBy != 'createdAt' || sortDir != 'desc') bits.add('Sorted');
    return bits.join(' · ');
  }

  String _prettyDate(String ymd) {
    final d = DateTime.tryParse(ymd);
    return d == null ? ymd : _day.format(d);
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
      final status = widget.statusFilter;
      final raw = await api.get(
        '/invoices',
        query: {
          'page': '$requestPage',
          'pageSize': '$pageSize',
          'sortBy': sortBy,
          'sortDir': sortDir,
          if (status != 'ALL') 'status': status,
          if (search.trim().isNotEmpty) 'search': search.trim(),
          if (dateFrom.isNotEmpty) 'dateFrom': dateFrom,
          if (dateTo.isNotEmpty) 'dateTo': dateTo,
          if (type.isNotEmpty) 'type': type,
          if (paymentMethod.isNotEmpty) 'paymentMethod': paymentMethod,
        },
      );
      final map = asStringKeyedMap(raw);
      final items = asItemList(raw);
      final matched = asInt(map['total'], items.length);
      final batch = items
          .whereType<Map>()
          .map((e) => InvoiceSummary.fromJson(asStringKeyedMap(e)))
          .toList();
      if (!mounted) return;
      setState(() {
        total = matched;
        page = requestPage;
        if (reset) {
          invoices = batch;
        } else {
          final seen = invoices.map((e) => e.id).toSet();
          invoices = [
            ...invoices,
            ...batch.where((e) => !seen.contains(e.id)),
          ];
        }
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (!_scrollCtrl.hasClients) return;
        if (invoices.length < total && _scrollCtrl.position.maxScrollExtent <= 48) {
          _load(reset: false);
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (reset) error = e.toString();
      });
      if (!reset && mounted) showErrorToast(context, e.toString());
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
          loadingMore = false;
        });
      }
    }
  }

  void _applySearch() {
    setState(() => search = _searchCtrl.text.trim());
    _load(reset: true);
  }

  void _clearFilters({bool resetStatus = true}) {
    _searchCtrl.clear();
    setState(() {
      search = '';
      dateFrom = '';
      dateTo = '';
      type = '';
      paymentMethod = '';
      sortBy = 'createdAt';
      sortDir = 'desc';
    });
    if (resetStatus) widget.onStatusFilterChanged?.call('ALL');
    _load(reset: true);
  }

  String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _openFilters() async {
    var draftFrom = dateFrom;
    var draftTo = dateTo;
    var draftType = type;
    var draftPay = paymentMethod;
    var draftSort = '$sortBy:$sortDir';

    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: AppSpace.md,
            right: AppSpace.md,
            top: AppSpace.xs,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + AppSpace.md,
          ),
          child: StatefulBuilder(
            builder: (context, setModal) {
              Future<void> pick({required bool from}) async {
                final now = DateTime.now();
                final initial = DateTime.tryParse(from ? draftFrom : draftTo) ?? now;
                final picked = await showDatePicker(
                  context: context,
                  initialDate: initial,
                  firstDate: DateTime(now.year - 5),
                  lastDate: DateTime(now.year + 1),
                );
                if (picked == null) return;
                setModal(() {
                  if (from) {
                    draftFrom = _ymd(picked);
                  } else {
                    draftTo = _ymd(picked);
                  }
                });
              }

              void preset(String kind) {
                final now = DateTime.now();
                final to = _ymd(now);
                late final String from;
                if (kind == 'today') {
                  from = to;
                } else if (kind == '7d') {
                  from = _ymd(now.subtract(const Duration(days: 6)));
                } else {
                  from = _ymd(DateTime(now.year, now.month, 1));
                }
                setModal(() {
                  draftFrom = from;
                  draftTo = to;
                });
              }

              return SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Filter bills',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                        color: AppColors.of(context).ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Same as web — date, type, payment, sort',
                      style: TextStyle(fontSize: 12, color: AppColors.of(context).muted),
                    ),
                    const SizedBox(height: AppSpace.md),
                    Text(
                      'Payment mode',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: AppColors.of(context).ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final p in _payments)
                          AppSegChip(
                            label: p.$2,
                            selected: draftPay == p.$1,
                            onTap: () => setModal(() => draftPay = p.$1),
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpace.md),
                    Text(
                      'Date range',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: AppColors.of(context).ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton(onPressed: () => preset('today'), child: const Text('Today')),
                        OutlinedButton(onPressed: () => preset('7d'), child: const Text('Last 7 days')),
                        OutlinedButton(onPressed: () => preset('month'), child: const Text('This month')),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => pick(from: true),
                            icon: const Icon(Icons.calendar_today_outlined, size: 16),
                            label: Text(
                              draftFrom.isEmpty ? 'From' : _prettyDate(draftFrom),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => pick(from: false),
                            icon: const Icon(Icons.event_outlined, size: 16),
                            label: Text(
                              draftTo.isEmpty ? 'To' : _prettyDate(draftTo),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpace.md),
                    DropdownButtonFormField<String>(
                      value: draftType,
                      decoration: const InputDecoration(labelText: 'Invoice type'),
                      items: [for (final t in _types) DropdownMenuItem(value: t.$1, child: Text(t.$2))],
                      onChanged: (v) => setModal(() => draftType = v ?? ''),
                    ),
                    const SizedBox(height: AppSpace.sm),
                    DropdownButtonFormField<String>(
                      value: draftSort,
                      decoration: const InputDecoration(labelText: 'Sort'),
                      items: const [
                        DropdownMenuItem(value: 'createdAt:desc', child: Text('Generated (newest)')),
                        DropdownMenuItem(value: 'createdAt:asc', child: Text('Generated (oldest)')),
                        DropdownMenuItem(value: 'updatedAt:desc', child: Text('Updated (newest)')),
                        DropdownMenuItem(value: 'updatedAt:asc', child: Text('Updated (oldest)')),
                        DropdownMenuItem(value: 'grandTotal:desc', child: Text('Amount (high)')),
                        DropdownMenuItem(value: 'grandTotal:asc', child: Text('Amount (low)')),
                        DropdownMenuItem(value: 'invoiceNumber:asc', child: Text('Invoice # A–Z')),
                        DropdownMenuItem(value: 'customer:asc', child: Text('Customer A–Z')),
                      ],
                      onChanged: (v) => setModal(() => draftSort = v ?? 'createdAt:desc'),
                    ),
                    const SizedBox(height: AppSpace.lg),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Apply filters'),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () {
                        setModal(() {
                          draftFrom = '';
                          draftTo = '';
                          draftType = '';
                          draftPay = '';
                          draftSort = 'createdAt:desc';
                        });
                      },
                      child: const Text('Reset in sheet'),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );

    if (applied != true || !mounted) return;
    final parts = draftSort.split(':');
    setState(() {
      dateFrom = draftFrom;
      dateTo = draftTo;
      type = draftType;
      paymentMethod = draftPay;
      sortBy = parts[0];
      sortDir = parts.length > 1 ? parts[1] : 'desc';
    });
    await _load(reset: true);
  }

  Future<void> _openDetail(InvoiceSummary inv) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoiceId: inv.id)),
    );
    if (changed == true && mounted) await _load(reset: true);
  }

  Future<void> _quickPrint(InvoiceSummary inv) async {
    try {
      final api = context.read<AuthState>().api;
      final printData = await loadMobilePrintData(api, inv.id);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => InvoicePrintScreen(data: printData, invoiceId: inv.id, api: api),
        ),
      );
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    }
  }

  int get finalizedInView => invoices.where((i) => i.status == 'FINALIZED').length;
  double get grossInView => invoices
      .where((i) => i.status == 'FINALIZED' && !i.isCreditNote)
      .fold<double>(0, (s, i) => s + i.grandTotal);

  String _typeLabel(String? t) {
    if (t == null || t == 'TAX_INVOICE') return 'Tax invoice';
    for (final e in _types) {
      if (e.$1 == t) return e.$2;
    }
    return t;
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    final colors = AppColors.of(context);
    final tablet = Breakpoints.isTablet(context);
    final pad = Breakpoints.pagePadding(context);
    final narrow = MediaQuery.sizeOf(context).width < 360;
    final compact = Breakpoints.isCompactHeight(context);

    return Scaffold(
      backgroundColor: colors.canvas,
      resizeToAvoidBottomInset: false,
      appBar: AppBar(
        title: Text(strings.t('invoices')),
        actions: [
          const CalculatorAppBarButton(),
          IconButton(
            tooltip: strings.t('filters'),
            onPressed: _openFilters,
            icon: Badge(
              isLabelVisible: hasExtraFilters,
              smallSize: 8,
              child: const Icon(Icons.filter_list_rounded),
            ),
          ),
          IconButton(tooltip: strings.t('refresh'), onPressed: () => _load(reset: true), icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      floatingActionButton: widget.onNewBill == null
          ? null
          : FloatingActionButton.extended(
              heroTag: 'bills_new_bill',
              onPressed: widget.onNewBill,
              icon: const Icon(Icons.add_rounded),
              label: Text(strings.t('new_bill')),
            ),
      body: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(pad.left, AppSpace.sm, pad.right, AppSpace.xs),
            child: TextField(
              controller: _searchCtrl,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _applySearch(),
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: colors.ink,
              ),
              decoration: InputDecoration(
                hintText: strings.t('search_invoice_full'),
                prefixIcon: Icon(Icons.search_rounded, size: 20, color: colors.muted),
                isDense: compact,
                filled: true,
                fillColor: colors.surface,
                suffixIcon: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_searchCtrl.text.isNotEmpty || search.isNotEmpty)
                      IconButton(
                        tooltip: strings.t('clear'),
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() => search = '');
                          _load(reset: true);
                        },
                        icon: Icon(Icons.close_rounded, size: 18, color: colors.muted),
                      ),
                    TextButton(onPressed: _applySearch, child: Text(strings.t('search'))),
                  ],
                ),
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
          if (hasExtraFilters && !compact)
            Padding(
              padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, AppSpace.xs),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      filterSummary,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: colors.muted),
                    ),
                  ),
                  TextButton(
                    onPressed: () => _clearFilters(resetStatus: false),
                    child: Text(strings.t('clear')),
                  ),
                ],
              ),
            ),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, AppSpace.xs),
              children: [
                for (final f in const ['ALL', 'FINALIZED', 'DRAFT', 'CANCELLED'])
                  Padding(
                    padding: const EdgeInsets.only(right: AppSpace.xs),
                    child: AppSegChip(
                      dense: true,
                      label: f == 'ALL' ? strings.t('all') : _statusLabel(f),
                      selected: widget.statusFilter == f,
                      onTap: () {
                        if (f == widget.statusFilter) return;
                        widget.onStatusFilterChanged?.call(f);
                      },
                    ),
                  ),
              ],
            ),
          ),
          if (!compact)
            SizedBox(
              height: 76,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, AppSpace.xs),
                children: [
                  _KpiChip(label: strings.t('matching'), value: '$total'),
                  const SizedBox(width: 8),
                  _KpiChip(label: strings.t('finalized_in_view'), value: '$finalizedInView'),
                  const SizedBox(width: 8),
                  _KpiChip(
                    label: strings.t('gross_in_view'),
                    value: narrow ? _compactInr(grossInView) : _inr.format(grossInView),
                  ),
                ],
              ),
            ),
          if (loading) const AppLinearLoader(),
          if (error != null)
            Padding(
              padding: pad,
              child: Text(error!, style: const TextStyle(color: AppColors.danger)),
            ),
          Expanded(
            child: RefreshIndicator(
              color: colors.primary,
              onRefresh: () => _load(reset: true),
              child: invoices.isEmpty && !loading
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: pad,
                      children: [
                        const SizedBox(height: 48),
                        AppEmptyState(
                          message: hasExtraFilters || widget.statusFilter != 'ALL'
                              ? strings.t('no_invoices_filtered')
                              : strings.t('no_invoices_found'),
                          icon: Icons.receipt_long_outlined,
                        ),
                        const SizedBox(height: 16),
                        if (hasExtraFilters || widget.statusFilter != 'ALL')
                          Center(
                            child: OutlinedButton(
                              onPressed: _clearFilters,
                              child: Text(strings.t('clear_filters')),
                            ),
                          ),
                        if (widget.onNewBill != null) ...[
                          const SizedBox(height: 8),
                          Center(
                            child: FilledButton.icon(
                              onPressed: widget.onNewBill,
                              icon: const Icon(Icons.point_of_sale_rounded),
                              label: Text(strings.t('start_new_bill')),
                            ),
                          ),
                        ],
                      ],
                    )
                  : GridView.builder(
                      controller: _scrollCtrl,
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: EdgeInsets.fromLTRB(
                        pad.left,
                        AppSpace.xs,
                        pad.right,
                        widget.onNewBill != null ? AppSpace.fabClearance : AppSpace.md,
                      ),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: tablet ? 2 : 1,
                        mainAxisExtent: tablet ? 168 : 158,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                      ),
                      itemCount: invoices.length + (loadingMore ? 1 : 0),
                      itemBuilder: (_, i) {
                        if (i >= invoices.length) {
                          return const Center(
                            child: Padding(
                              padding: EdgeInsets.all(12),
                              child: SizedBox(
                                width: 28,
                                height: 28,
                                child: CircularProgressIndicator(strokeWidth: 2.5),
                              ),
                            ),
                          );
                        }
                        final inv = invoices[i];
                        final updated = inv.updatedAt ?? inv.createdAt;
                        final showUpdated = inv.updatedAt != null &&
                            inv.updatedAt!.difference(inv.createdAt).inMinutes.abs() >= 1;
                        final meta = [
                          if (inv.customerPhone != null && inv.customerPhone!.isNotEmpty) inv.customerPhone!,
                          if (inv.customerEmail != null && inv.customerEmail!.isNotEmpty) inv.customerEmail!,
                          if (inv.customerGstin != null && inv.customerGstin!.isNotEmpty) inv.customerGstin!,
                        ].join(' · ');
                        final cardInk = colors.inkOn(colors.surface);
                        final cardMuted = colors.mutedOn(colors.surface);
                        return AppPanel(
                          padding: const EdgeInsets.all(AppSpace.sm),
                          onTap: () => _openDetail(inv),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      inv.invoiceNumber,
                                      style: GoogleFonts.plusJakartaSans(
                                        fontWeight: FontWeight.w700,
                                        color: cardInk,
                                      ),
                                    ),
                                  ),
                                  _StatusPill(status: inv.status),
                                  if (inv.status == 'FINALIZED')
                                    IconButton(
                                      visualDensity: VisualDensity.compact,
                                      tooltip: strings.t('print_pdf'),
                                      onPressed: () => _quickPrint(inv),
                                      icon: Icon(Icons.print_outlined, size: 18, color: colors.primary),
                                    ),
                                ],
                              ),
                              Text(
                                '${_typeLabel(inv.type)} · ${inv.customerName ?? strings.t('walk_in')}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 13, color: cardInk),
                              ),
                              if (meta.isNotEmpty)
                                Text(
                                  meta,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 12, color: cardMuted),
                                ),
                              const Spacer(),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '${strings.t('generated_at')} ${_day.format(inv.createdAt.toLocal())}',
                                          style: TextStyle(fontSize: 11, color: cardMuted),
                                        ),
                                        if (showUpdated)
                                          Text(
                                            '${strings.t('updated_at')} ${_day.format(updated.toLocal())}',
                                            style: TextStyle(fontSize: 11, color: cardMuted),
                                          ),
                                        if (inv.paymentMethods.isNotEmpty)
                                          Padding(
                                            padding: const EdgeInsets.only(top: 4),
                                            child: Wrap(
                                              spacing: 4,
                                              runSpacing: 4,
                                              children: [
                                                for (final m in inv.paymentMethods.take(3))
                                                  Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                    decoration: BoxDecoration(
                                                      color: colors.softFill,
                                                      borderRadius: BorderRadius.circular(999),
                                                    ),
                                                    child: Text(
                                                      m.replaceAll('_', ' '),
                                                      style: TextStyle(
                                                        fontSize: 10,
                                                        fontWeight: FontWeight.w600,
                                                        color: cardInk,
                                                      ),
                                                    ),
                                                  ),
                                              ],
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    _inr.format(inv.grandTotal),
                                    style: GoogleFonts.plusJakartaSans(
                                      fontWeight: FontWeight.w800,
                                      decoration: inv.isCancelled ? TextDecoration.lineThrough : null,
                                      color: inv.isCancelled ? cardMuted : cardInk,
                                    ),
                                  ),
                                ],
                              ),
                            ],
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
}

class _KpiChip extends StatelessWidget {
  const _KpiChip({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final ink = colors.inkOn(colors.surface);
    final muted = colors.mutedOn(colors.surface);
    return Container(
      constraints: const BoxConstraints(minWidth: 108),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: TextStyle(fontSize: 11, color: muted)),
          const SizedBox(height: 2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontWeight: FontWeight.w700,
              fontSize: 15,
              color: ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final color = switch (status) {
      'CANCELLED' => AppColors.danger,
      'DRAFT' => AppColors.warn,
      _ => colors.primaryDark,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        _statusLabel(status),
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class InvoiceDetailScreen extends StatefulWidget {
  const InvoiceDetailScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  State<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  InvoiceDetail? invoice;
  bool loading = true;
  bool busy = false;
  String? error;

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
      final raw = await api.get('/invoices/${widget.invoiceId}');
      setState(() {
        invoice = InvoiceDetail.fromJson(asStringKeyedMap(raw));
      });
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _cancel() async {
    final inv = invoice;
    if (inv == null || !inv.canCancel) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.read<AppStrings>().t('cancel_invoice')),
        content: Text(
          'Cancel ${inv.invoiceNumber}? Stock will be restored for billed lines.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Cancel bill'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => busy = true);
    try {
      final api = context.read<AuthState>().api;
      await api.patch('/invoices/${widget.invoiceId}/cancel');
      await _load();
      if (mounted) {
        showSuccessToast(context, 'Invoice cancelled · stock restored');
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        showErrorToast(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _finalize() async {
    final inv = invoice;
    if (inv == null || inv.status != 'DRAFT') return;
    setState(() => busy = true);
    try {
      final api = context.read<AuthState>().api;
      await api.patch('/invoices/${widget.invoiceId}/finalize');
      await _load();
      if (mounted) {
        showSuccessToast(context, 'Draft finalized · stock deducted');
      }
    } catch (e) {
      if (mounted) {
        showErrorToast(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _shareThermal() async {
    setState(() => busy = true);
    try {
      final api = context.read<AuthState>().api;
      final job = await api.post('/hardware/print-thermal', body: {
        'invoiceId': widget.invoiceId,
      });
      final map = asStringKeyedMap(job);
      final text = map['text']?.toString() ?? '';
      final escpos = map['escposBase64']?.toString() ?? '';
      final mac = (map['bluetoothAddress']?.toString() ?? '').trim().isNotEmpty
          ? map['bluetoothAddress']!.toString()
          : AppearancePrefsController.instance.printerMac;
      var printed = false;
      if (escpos.isNotEmpty) {
        printed = await BluetoothThermalPrinter.printEscPosBase64(escpos, mac: mac);
        if (!printed) {
          await BluetoothThermalPrinter.copyBase64Fallback(escpos);
        }
      }
      if (!printed) {
        if (text.isEmpty) throw Exception('Empty thermal receipt');
        await SharePlus.instance.share(
          ShareParams(text: text, subject: 'Thermal receipt'),
        );
      }
      if (mounted) {
        showSuccessToast(
          context,
          printed ? 'Printed via Bluetooth' : 'Shared thermal text (BT unavailable)',
        );
      }
    } catch (e) {
      if (mounted) {
        showErrorToast(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _sendWhatsApp() async {
    setState(() => busy = true);
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.post('/invoices/${widget.invoiceId}/whatsapp');
      final map = asStringKeyedMap(raw);
      final shareUrl = map['shareUrl']?.toString();
      final sent = map['sent'] == true;
      final note = map['note']?.toString() ?? map['reason']?.toString() ?? map['error']?.toString();
      if (!mounted) return;
      if (sent) {
        showSuccessToast(context, 'WhatsApp bill sent via API');
      } else if (shareUrl != null && shareUrl.isNotEmpty) {
        await SharePlus.instance.share(
          ShareParams(text: shareUrl, subject: 'WhatsApp bill'),
        );
        if (note != null && mounted) {
          showAppToast(context, note);
        }
      } else {
        showAppToast(context, note ?? 'WhatsApp not available — enable customer opt-in', tone: AppToastTone.warn);
      }
    } catch (e) {
      if (mounted) {
        showErrorToast(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _print() async {
    setState(() => busy = true);
    try {
      final api = context.read<AuthState>().api;
      final printData = await loadMobilePrintData(api, widget.invoiceId);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => InvoicePrintScreen(
            data: printData,
            invoiceId: widget.invoiceId,
            api: api,
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        showErrorToast(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final inv = invoice;
    final strings = context.watch<AppStrings>();
    final colors = AppColors.of(context);
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: AppBar(
        title: Text(inv?.invoiceNumber ?? strings.t('invoices')),
        actions: [
          IconButton(
            tooltip: strings.t('refresh'),
            onPressed: busy ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
          if (inv != null)
            IconButton(
              tooltip: strings.t('print_pdf'),
              onPressed: busy ? null : _print,
              icon: const Icon(Icons.print_outlined),
            ),
        ],
      ),
      body: loading
          ? const AppLoader()
          : error != null
              ? Center(child: Text(error!, style: const TextStyle(color: AppColors.danger)))
              : inv == null
                  ? Center(child: Text('Invoice not found', style: TextStyle(color: colors.ink)))
                  : RefreshIndicator(
                      color: colors.primary,
                      onRefresh: _load,
                      child: DefaultTextStyle.merge(
                        style: TextStyle(color: colors.ink),
                        child: ListView(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 140),
                          children: [
                          Row(
                            children: [
                              _StatusPill(status: inv.status),
                              const Spacer(),
                              Text(
                                _date.format(inv.createdAt.toLocal()),
                                style: TextStyle(fontSize: 12, color: colors.muted),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Text(
                            inv.customerName ?? strings.t('walk_in'),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: colors.ink,
                            ),
                          ),
                          if (inv.customerPhone != null && inv.customerPhone!.isNotEmpty)
                            Text(inv.customerPhone!, style: TextStyle(color: colors.ink)),
                          if (inv.customerEmail != null && inv.customerEmail!.isNotEmpty)
                            Text(inv.customerEmail!, style: TextStyle(color: colors.ink)),
                          if (inv.customerGstin != null && inv.customerGstin!.isNotEmpty)
                            Text('GSTIN ${inv.customerGstin!}', style: TextStyle(color: colors.muted)),
                          if (inv.supplyType != null)
                            Text('Supply: ${inv.supplyType}', style: TextStyle(color: colors.muted)),
                          const SizedBox(height: 16),
                          Text(
                            'Lines',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, color: colors.ink),
                          ),
                          const SizedBox(height: 8),
                          ...inv.lines.map(
                            (l) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          l.productName,
                                          style: TextStyle(fontWeight: FontWeight.w600, color: colors.ink),
                                        ),
                                        Text(
                                          [
                                            'HSN ${l.hsnCode}',
                                            if (l.productSku != null && l.productSku!.isNotEmpty) 'SKU ${l.productSku}',
                                            if (l.productBarcode != null && l.productBarcode!.isNotEmpty) l.productBarcode!,
                                            '${l.quantity.toStringAsFixed(0)} × ${_inr.format(l.unitPrice)}',
                                            'GST ${l.gstRate}%',
                                          ].join(' · '),
                                          style: TextStyle(fontSize: 12, color: colors.muted),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    _inr.format(l.total),
                                    style: TextStyle(fontWeight: FontWeight.w700, color: colors.ink),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const Divider(),
                          _kv(context, 'Subtotal', _inr.format(inv.subtotal)),
                          if (inv.totalDiscount > 0) _kv(context, 'Discount', _inr.format(inv.totalDiscount)),
                          if (inv.totalCgst > 0) _kv(context, 'CGST', _inr.format(inv.totalCgst)),
                          if (inv.totalSgst > 0) _kv(context, 'SGST', _inr.format(inv.totalSgst)),
                          if (inv.totalIgst > 0) _kv(context, 'IGST', _inr.format(inv.totalIgst)),
                          _kv(context, 'Grand total', _inr.format(inv.grandTotal), bold: true),
                          const SizedBox(height: 12),
                          Text(
                            'Payments',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, color: colors.ink),
                          ),
                          ...inv.payments.map(
                            (p) => ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              title: Text(p.method, style: TextStyle(color: colors.ink)),
                              trailing: Text(_inr.format(p.amount), style: TextStyle(color: colors.ink)),
                              subtitle: p.reference != null
                                  ? Text(p.reference!, style: TextStyle(color: colors.muted))
                                  : null,
                            ),
                          ),
                          if (inv.notes != null && inv.notes!.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text('Notes: ${inv.notes}', style: TextStyle(color: colors.muted)),
                          ],
                        ],
                      ),
                      ),
                    ),
      bottomNavigationBar: inv == null || loading
          ? null
          : Material(
              elevation: 8,
              color: colors.surface,
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      FilledButton.icon(
                        onPressed: busy ? null : _print,
                        icon: const Icon(Icons.print_outlined),
                        label: Text(strings.t('print_pdf')),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: busy ? null : _shareThermal,
                              icon: const Icon(Icons.receipt_long_outlined, size: 18),
                              label: const Text('Thermal'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: busy ? null : _sendWhatsApp,
                              icon: const Icon(Icons.chat_outlined, size: 18),
                              label: const Text('WhatsApp'),
                            ),
                          ),
                        ],
                      ),
                      if (inv.status == 'DRAFT' || inv.canCancel) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            if (inv.status == 'DRAFT')
                              Expanded(
                                child: FilledButton.tonal(
                                  onPressed: busy ? null : _finalize,
                                  child: Text(busy ? '…' : 'Finalize'),
                                ),
                              ),
                            if (inv.status == 'DRAFT' && inv.canCancel) const SizedBox(width: 8),
                            if (inv.canCancel)
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: busy ? null : _cancel,
                                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                                  child: Text(busy ? '…' : 'Cancel'),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
    );
  }

  Widget _kv(BuildContext context, String label, String value, {bool bold = false}) {
    final colors = AppColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: TextStyle(color: colors.muted))),
          Text(
            value,
            style: TextStyle(
              fontWeight: bold ? FontWeight.bold : FontWeight.w500,
              color: colors.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class InvoicePrintScreen extends StatefulWidget {
  const InvoicePrintScreen({
    super.key,
    required this.data,
    required this.invoiceId,
    required this.api,
  });

  final PrintInvoiceData data;
  final String invoiceId;
  final ApiClient api;

  @override
  State<InvoicePrintScreen> createState() => _InvoicePrintScreenState();
}

class _InvoicePrintScreenState extends State<InvoicePrintScreen> {
  bool busy = false;
  late PrintInvoiceData data;
  String selectedCopy = 'original';

  static const _copyOptions = [
    ('original', 'Original', 'Customer'),
    ('duplicate', 'Duplicate', 'Transport'),
    ('triplicate', 'Triplicate', 'Shop file'),
  ];

  @override
  void initState() {
    super.initState();
    data = widget.data;
  }

  Future<void> _reloadCopy(String copy) async {
    if (busy || copy == selectedCopy) return;
    setState(() {
      busy = true;
      selectedCopy = copy;
    });
    try {
      final next = await loadMobilePrintData(widget.api, widget.invoiceId, copy: copy);
      if (mounted) setState(() => data = next);
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        showErrorToast(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  /// Opens the phone system print dialog (Wi‑Fi / Bluetooth / PDF printers).
  Future<void> _print() async {
    await _run(() async {
      final bytes = await InvoicePdfBuilder.build(data);
      await Printing.layoutPdf(
        onLayout: (_) async => bytes,
        name: 'Invoice_${data.invoiceNumber}',
      );
    });
  }

  /// Saves PDF to temp and opens share sheet so user can save to Files / Drive / WhatsApp.
  Future<void> _downloadPdf() async {
    await _run(() async {
      final bytes = await InvoicePdfBuilder.build(data);
      final dir = await getTemporaryDirectory();
      final safeName = data.invoiceNumber.replaceAll(RegExp(r'[^\w\-]+'), '_');
      final file = File('${dir.path}/Invoice_$safeName.pdf');
      await file.writeAsBytes(bytes, flush: true);

      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'application/pdf', name: 'Invoice_$safeName.pdf')],
          subject: 'Invoice ${data.invoiceNumber}',
          text: 'Invoice ${data.invoiceNumber} · ${_inr.format(data.grandTotal)}',
        ),
      );

      if (mounted) {
        showSuccessToast(context, 'PDF ready — choose Save / Drive / Files if no printer');
      }
    });
  }

  Future<void> _shareText() async {
    await _run(() async {
      await SharePlus.instance.share(
        ShareParams(text: data.toReceiptText(), subject: 'Invoice ${data.invoiceNumber}'),
      );
    });
  }

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: data.toReceiptText()));
    if (mounted) {
      showSuccessToast(context, 'Bill text copied');
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: AppBar(
        title: Text(context.watch<AppStrings>().t('print_pdf')),
        actions: [
          IconButton(
            tooltip: 'Copy text',
            onPressed: busy ? null : _copy,
            icon: const Icon(Icons.copy_outlined),
          ),
        ],
      ),
      body: DefaultTextStyle.merge(
        style: TextStyle(color: colors.ink),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, 120),
          children: [
            Text(
              'Invoice copy',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: colors.ink,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _copyOptions.map((option) {
                final active = selectedCopy == option.$1;
                return AppSegChip(
                  selected: active,
                  enabled: !busy,
                  onTap: () => _reloadCopy(option.$1),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        option.$2,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                      Text(
                        option.$3,
                        style: TextStyle(
                          fontSize: 11,
                          color: active ? colors.onPrimary.withValues(alpha: 0.85) : colors.muted,
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: AppSpace.md),
            AppPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    data.shopName,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: colors.inkOn(colors.surface),
                    ),
                  ),
                  if (data.templateId != null && data.templateId!.isNotEmpty)
                    Text(
                      'Template: ${data.templateId}',
                      style: TextStyle(fontSize: 12, color: colors.mutedOn(colors.surface)),
                    ),
                  if (data.shopAddress.isNotEmpty)
                    Text(
                      data.shopAddress,
                      style: TextStyle(color: colors.mutedOn(colors.surface)),
                    ),
                  if (data.gstin != null && data.gstin!.isNotEmpty)
                    Text('GSTIN: ${data.gstin}', style: TextStyle(color: colors.inkOn(colors.surface))),
                  if (data.shopPhone != null && data.shopPhone!.isNotEmpty)
                    Text('Phone: ${data.shopPhone}', style: TextStyle(color: colors.inkOn(colors.surface))),
                  const Divider(height: 24),
                  Text(
                    'Invoice: ${data.invoiceNumber}',
                    style: TextStyle(fontWeight: FontWeight.w700, color: colors.inkOn(colors.surface)),
                  ),
                  Text('Date: ${data.date}', style: TextStyle(color: colors.inkOn(colors.surface))),
                  if (data.customerName != null)
                    Text('Customer: ${data.customerName}', style: TextStyle(color: colors.inkOn(colors.surface))),
                  if (data.customerPhone != null)
                    Text('Phone: ${data.customerPhone}', style: TextStyle(color: colors.inkOn(colors.surface))),
                  if (data.customerEmail != null)
                    Text('Email: ${data.customerEmail}', style: TextStyle(color: colors.inkOn(colors.surface))),
                  const SizedBox(height: 14),
                  ...data.lines.map(
                    (l) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  l.name,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: colors.inkOn(colors.surface),
                                  ),
                                ),
                                Text(
                                  '${l.qty.toStringAsFixed(0)} × ${_inr.format(l.rate)} · GST ${l.gstRate}%'
                                  '${l.hsnCode != null && l.hsnCode!.isNotEmpty ? ' · HSN ${l.hsnCode}' : ''}',
                                  style: TextStyle(fontSize: 12, color: colors.mutedOn(colors.surface)),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            _inr.format(l.amount),
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: colors.inkOn(colors.surface),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const Divider(),
                  _row(context, 'Subtotal', _inr.format(data.subtotal)),
                  if (data.totalCgst > 0) _row(context, 'CGST', _inr.format(data.totalCgst)),
                  if (data.totalSgst > 0) _row(context, 'SGST', _inr.format(data.totalSgst)),
                  if (data.totalIgst > 0) _row(context, 'IGST', _inr.format(data.totalIgst)),
                  _row(context, 'TOTAL', _inr.format(data.grandTotal), bold: true),
                  const SizedBox(height: 8),
                  ...data.payments.map((p) => _row(context, p.method, _inr.format(p.amount))),
                  if (data.notes != null && data.notes!.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      'Notes: ${data.notes}',
                      style: TextStyle(color: colors.mutedOn(colors.surface)),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpace.md),
            Text(
              'No printer? Download PDF and save to Files / Drive / WhatsApp.',
              style: GoogleFonts.plusJakartaSans(fontSize: 12, color: colors.muted),
            ),
          ],
        ),
      ),
      bottomNavigationBar: Material(
        elevation: 10,
        color: colors.surface,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                FilledButton.icon(
                  onPressed: busy ? null : _print,
                  icon: const Icon(Icons.print_rounded),
                  label: Text(busy ? 'Preparing…' : 'Print (system printer)'),
                ),
                const SizedBox(height: 8),
                FilledButton.tonalIcon(
                  onPressed: busy ? null : _downloadPdf,
                  icon: const Icon(Icons.picture_as_pdf_outlined),
                  label: const Text('Download / share PDF'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.amber.withValues(alpha: 0.25),
                    foregroundColor: colors.inkOn(colors.surface),
                  ),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: busy ? null : _shareText,
                  icon: const Icon(Icons.share_outlined),
                  label: const Text('Share as text'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value, {bool bold = false}) {
    final colors = AppColors.of(context);
    final ink = colors.inkOn(colors.surface);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: bold ? FontWeight.bold : FontWeight.normal,
                color: ink,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontWeight: bold ? FontWeight.bold : FontWeight.w500,
              color: ink,
            ),
          ),
        ],
      ),
    );
  }
}
