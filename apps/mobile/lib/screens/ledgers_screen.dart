import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../l10n/app_strings.dart';
import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/app_ui.dart';
import '../theme/theme_controller.dart';
import '../utils/report_export.dart';
import '../utils/report_period.dart';
import '../widgets/app_loader.dart';
import '../widgets/app_toast.dart';
import '../widgets/floating_calculator.dart';
import 'customer_detail_screen.dart';
import 'khata_screen.dart';
import 'invoices_screen.dart';
import 'purchase_bills_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
final _inrCompact = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹');
final _day = DateFormat('dd MMM');

enum _LedgerTab { customers, sell, buy }

/// Desktop-parity ledgers: customer udhaar · sell register · buy register.
class LedgersScreen extends StatefulWidget {
  const LedgersScreen({super.key, this.initialTab});

  /// `customers` | `sell` | `buy`
  final String? initialTab;

  @override
  State<LedgersScreen> createState() => _LedgersScreenState();
}

class _LedgersScreenState extends State<LedgersScreen> {
  late _LedgerTab tab = switch (widget.initialTab) {
    'sell' => _LedgerTab.sell,
    'buy' => _LedgerTab.buy,
    _ => _LedgerTab.customers,
  };
  PeriodPreset periodPreset = PeriodPreset.thisMonth;
  late ReportPeriod period = resolvePeriodPreset(periodPreset);
  String gstRate = 'all';
  bool loading = true;
  bool exporting = false;
  String? error;

  List<_CustomerAgingRow> customers = [];
  _RegisterLedger? sell;
  _RegisterLedger? buy;

  Map<String, String> get _ledgerQuery {
    final q = period.toQuery();
    if (gstRate != 'all') q['gstRate'] = gstRate;
    return q;
  }

  Set<int> get _gstSlabs {
    final rates = <int>{...kDefaultGstSlabs};
    for (final slab in [...?sell?.byGstSlab, ...?buy?.byGstSlab]) {
      rates.add(slab.round());
    }
    return rates;
  }

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
      dynamic custRaw = const <dynamic>[];
      try {
        custRaw = await api.get('/customers/aging/report');
      } catch (_) {
        custRaw = const <dynamic>[];
      }
      final saleRaw = await api.get('/analytics/sale-ledger', query: _ledgerQuery);
      final buyRaw = await api.get('/analytics/buy-ledger', query: _ledgerQuery);

      final custList = (custRaw is List ? custRaw : <dynamic>[])
          .whereType<Map>()
          .map((e) => _CustomerAgingRow.fromJson(asStringKeyedMap(e)))
          .where((c) => c.outstanding > 0.009)
          .toList()
        ..sort((a, b) => b.outstanding.compareTo(a.outstanding));

      if (!mounted) return;
      setState(() {
        customers = custList;
        sell = _RegisterLedger.fromJson(asStringKeyedMap(saleRaw));
        buy = _RegisterLedger.fromJson(asStringKeyedMap(buyRaw));
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _applyPreset(PeriodPreset p) {
    setState(() {
      periodPreset = p;
      period = resolvePeriodPreset(p);
    });
    _load();
  }

  Future<void> _export(String format) async {
    setState(() => exporting = true);
    try {
      final api = context.read<AuthState>().api;
      late final String path;
      late final Map<String, String> query;
      if (tab == _LedgerTab.customers) {
        path = '/reports/receivables';
        query = {};
      } else if (tab == _LedgerTab.sell) {
        path = '/reports/sell';
        query = Map<String, String>.from(_ledgerQuery);
      } else {
        path = '/reports/buy';
        query = Map<String, String>.from(_ledgerQuery);
      }
      final msg = await exportAndShareReport(api, path: path, query: query, format: format);
      if (mounted) showSuccessToast(context, msg);
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    } finally {
      if (mounted) setState(() => exporting = false);
    }
  }

  void _showExportSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.table_chart_outlined),
                title: const Text('Export CSV'),
                onTap: () {
                  Navigator.pop(ctx);
                  _export('csv');
                },
              ),
              ListTile(
                leading: const Icon(Icons.grid_on_outlined),
                title: const Text('Export Excel'),
                onTap: () {
                  Navigator.pop(ctx);
                  _export('xlsx');
                },
              ),
              ListTile(
                leading: const Icon(Icons.picture_as_pdf_outlined),
                title: const Text('Export print / PDF'),
                onTap: () {
                  Navigator.pop(ctx);
                  _export('pdf');
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  double get _customerTotal => customers.fold(0.0, (s, c) => s + c.outstanding);

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(strings.t('ledgers'), style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
            Text(
              strings.t('ledgers_sub'),
              style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w500),
            ),
          ],
        ),
        actions: [
          const CalculatorAppBarButton(),
          IconButton(
            tooltip: 'Export',
            onPressed: exporting ? null : _showExportSheet,
            icon: exporting
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.ios_share_rounded),
          ),
          IconButton(onPressed: loading ? null : _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, AppSpace.xs),
            child: Row(
              children: [
                for (final t in _LedgerTab.values) ...[
                  if (t != _LedgerTab.customers) const SizedBox(width: 6),
                  Expanded(
                    child: ChoiceChip(
                      label: Center(
                        child: Text(
                          switch (t) {
                            _LedgerTab.customers => strings.t('ledger_customers'),
                            _LedgerTab.sell => strings.t('ledger_sell'),
                            _LedgerTab.buy => strings.t('ledger_buy'),
                          },
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      selected: tab == t,
                      onSelected: (_) => setState(() => tab = t),
                      selectedColor: AppColors.tealSoft,
                      visualDensity: VisualDensity.compact,
                      labelStyle: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: tab == t ? AppColors.tealDark : AppColors.ink,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if ((tab == _LedgerTab.sell || tab == _LedgerTab.buy) && !Breakpoints.isCompactHeight(context))
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.md, 0, AppSpace.md, AppSpace.xs),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: DropdownButtonFormField<PeriodPreset>(
                      value: periodPreset,
                      isExpanded: true,
                      isDense: true,
                      decoration: InputDecoration(
                        labelText: 'Period',
                        isDense: true,
                        filled: true,
                        fillColor: AppColors.surface,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      items: [
                        for (final p in PeriodPreset.values)
                          DropdownMenuItem(
                            value: p,
                            child: Text(p.label, overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (v) {
                        if (v == null) return;
                        _applyPreset(v);
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: DropdownButtonFormField<String>(
                      value: gstRate,
                      isExpanded: true,
                      isDense: true,
                      decoration: InputDecoration(
                        labelText: 'GST',
                        isDense: true,
                        filled: true,
                        fillColor: AppColors.surface,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      items: [
                        const DropdownMenuItem(value: 'all', child: Text('All GST')),
                        for (final r in (_gstSlabs.toList()..sort()))
                          DropdownMenuItem(value: '$r', child: Text('$r%')),
                      ],
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => gstRate = v);
                        _load();
                      },
                    ),
                  ),
                ],
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
              onRefresh: _load,
              child: tab == _LedgerTab.customers
                  ? _CustomersLedgerView(
                      customers: customers,
                      total: _customerTotal,
                      onOpenKhata: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const KhataScreen()),
                        );
                      },
                      onOpenCustomer: (id) {
                        if (id == null || id.isEmpty) return;
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => CustomerDetailScreen(customerId: id)),
                        );
                      },
                    )
                  : tab == _LedgerTab.sell
                      ? _SellBuyLedgerView(
                          title: 'Sell ledger',
                          ledger: sell,
                          emptyLabel: 'No sales in this period.',
                          onOpen: (id) => Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoiceId: id)),
                          ),
                        )
                      : _SellBuyLedgerView(
                          title: 'Buy / supplier ledger',
                          ledger: buy,
                          emptyLabel: 'No purchase bills in this period.',
                          onOpen: (id) => Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => PurchaseBillDetailScreen(billId: id)),
                          ),
                        ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Models ───────────────────────────────────────────────────────

class _CustomerAgingRow {
  _CustomerAgingRow({
    required this.customerId,
    required this.name,
    required this.outstanding,
    this.phone,
    this.email,
    this.gstin,
    this.address,
    this.segment,
    this.creditLimit,
    this.advanceBalance,
    this.loyaltyPoints,
    this.whatsappOptIn = false,
  });

  final String? customerId;
  final String name;
  final String? phone;
  final String? email;
  final String? gstin;
  final String? address;
  final String? segment;
  final double outstanding;
  final double? creditLimit;
  final double? advanceBalance;
  final int? loyaltyPoints;
  final bool whatsappOptIn;

  factory _CustomerAgingRow.fromJson(Map<String, dynamic> json) {
    final addr = [
      json['address'],
      json['addressLine2'],
      json['city'],
      json['stateCode'],
      json['pincode'],
    ].where((e) => (e?.toString() ?? '').trim().isNotEmpty).join(', ');
    return _CustomerAgingRow(
      customerId: json['customerId']?.toString() ?? json['id']?.toString(),
      name: json['name']?.toString() ?? '—',
      phone: json['phone']?.toString(),
      email: json['email']?.toString(),
      gstin: json['gstin']?.toString(),
      address: addr.isEmpty ? null : addr,
      segment: json['segment']?.toString(),
      outstanding: asDouble(json['outstanding']),
      creditLimit: json['creditLimit'] == null ? null : asDouble(json['creditLimit']),
      advanceBalance: json['advanceBalance'] == null ? null : asDouble(json['advanceBalance']),
      loyaltyPoints: json['loyaltyPoints'] == null ? null : asInt(json['loyaltyPoints']),
      whatsappOptIn: json['whatsappOptIn'] == true,
    );
  }
}

class _RegisterLedger {
  _RegisterLedger({
    required this.summary,
    required this.entries,
    required this.byGstSlab,
  });

  final _RegisterSummary summary;
  final List<_RegisterEntry> entries;
  final List<double> byGstSlab;

  factory _RegisterLedger.fromJson(Map<String, dynamic> json) {
    final summaryMap = json['summary'] is Map ? asStringKeyedMap(json['summary']) : <String, dynamic>{};
    final slabs = <double>[];
    final rawSlabs = json['byGstSlab'] ?? summaryMap['byGstSlab'];
    if (rawSlabs is List) {
      for (final s in rawSlabs) {
        if (s is Map) {
          slabs.add(asDouble(asStringKeyedMap(s)['gstRate'] ?? asStringKeyedMap(s)['rate']));
        } else if (s != null) {
          slabs.add(asDouble(s));
        }
      }
    }
    final list = json['entries'] ?? json['rows'] ?? json['items'];
    return _RegisterLedger(
      summary: _RegisterSummary.fromJson(summaryMap),
      entries: list is List
          ? list.whereType<Map>().map((e) => _RegisterEntry.fromJson(asStringKeyedMap(e))).toList()
          : const [],
      byGstSlab: slabs,
    );
  }
}

class _RegisterSummary {
  _RegisterSummary({
    required this.totalAmount,
    required this.totalTax,
    required this.count,
  });

  final double totalAmount;
  final double totalTax;
  final int count;

  factory _RegisterSummary.fromJson(Map<String, dynamic> json) {
    return _RegisterSummary(
      totalAmount: asDouble(json['totalAmount'] ?? json['amount'] ?? json['total']),
      totalTax: asDouble(json['totalTax'] ?? json['tax']),
      count: asInt(json['count'] ?? json['invoiceCount'] ?? json['billCount']),
    );
  }
}

class _RegisterEntry {
  _RegisterEntry({
    required this.id,
    required this.sn,
    required this.date,
    required this.name,
    required this.invoiceNumber,
    required this.qty,
    required this.taxAmount,
    required this.cgst,
    required this.sgst,
    required this.totalTax,
    required this.totalAmount,
    this.gstin,
    this.documentType,
  });

  final String id;
  final int sn;
  final DateTime date;
  final String name;
  final String? gstin;
  final String invoiceNumber;
  final double qty;
  final double taxAmount;
  final double cgst;
  final double sgst;
  final double totalTax;
  final double totalAmount;
  final String? documentType;

  factory _RegisterEntry.fromJson(Map<String, dynamic> json) {
    final dateRaw = json['dateIso']?.toString() ?? json['date']?.toString() ?? '';
    return _RegisterEntry(
      id: json['id']?.toString() ?? '',
      sn: asInt(json['sn']),
      date: DateTime.tryParse(dateRaw) ?? DateTime.now(),
      name: json['name']?.toString() ??
          json['customerName']?.toString() ??
          json['supplierName']?.toString() ??
          '—',
      gstin: json['gstin']?.toString() ??
          json['customerGstin']?.toString() ??
          json['supplierGstin']?.toString(),
      invoiceNumber: json['invoiceNumber']?.toString() ?? '—',
      qty: asDouble(json['qty'] ?? json['quantity']),
      taxAmount: asDouble(json['taxAmount'] ?? json['taxable']),
      cgst: asDouble(json['cgst']),
      sgst: asDouble(json['sgst']),
      totalTax: asDouble(json['totalTax'] ?? json['tax']),
      totalAmount: asDouble(json['totalAmount'] ?? json['amount'] ?? json['total']),
      documentType: json['documentType']?.toString(),
    );
  }
}

// ─── Views ────────────────────────────────────────────────────────

class _CustomersLedgerView extends StatelessWidget {
  const _CustomersLedgerView({
    required this.customers,
    required this.total,
    required this.onOpenKhata,
    required this.onOpenCustomer,
  });

  final List<_CustomerAgingRow> customers;
  final double total;
  final VoidCallback onOpenKhata;
  final ValueChanged<String?> onOpenCustomer;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.xs, AppSpace.md, AppSpace.xxl),
      children: [
        AppPanel(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Customer udhaar', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 16)),
                    Text('Open balances — collect from Khata', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                  ],
                ),
              ),
              TextButton(onPressed: onOpenKhata, child: const Text('Open Khata')),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: _StatTile(label: 'Receivable', value: _inrCompact.format(total), tone: AppColors.danger)),
            const SizedBox(width: 8),
            Expanded(child: _StatTile(label: 'Parties', value: '${customers.length}')),
          ],
        ),
        const SizedBox(height: 12),
        if (customers.isEmpty)
          const AppEmptyState(icon: Icons.people_outline_rounded, message: 'No open customer dues.')
        else
          ...customers.map((c) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AppPanel(
                padding: EdgeInsets.zero,
                onTap: () => onOpenCustomer(c.customerId),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  title: Text(c.name, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          [
                            if ((c.phone ?? '').isNotEmpty) c.phone!,
                            if ((c.email ?? '').isNotEmpty) c.email!,
                            if ((c.gstin ?? '').isNotEmpty) c.gstin!,
                            if ((c.segment ?? '').isNotEmpty) c.segment!,
                            if (c.whatsappOptIn) 'WA',
                          ].join(' · '),
                          style: TextStyle(fontSize: 12, color: AppColors.muted),
                        ),
                        if ((c.address ?? '').isNotEmpty)
                          Text(c.address!, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: AppColors.muted)),
                        if ((c.creditLimit ?? 0) > 0 || (c.advanceBalance ?? 0) > 0.009)
                          Text(
                            [
                              if ((c.creditLimit ?? 0) > 0) 'Limit ${_inr.format(c.creditLimit)}',
                              if ((c.advanceBalance ?? 0) > 0.009) 'Adv ${_inr.format(c.advanceBalance)}',
                            ].join(' · '),
                            style: TextStyle(fontSize: 11, color: AppColors.tealDark),
                          ),
                      ],
                    ),
                  ),
                  trailing: Text(
                    _inr.format(c.outstanding),
                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: AppColors.danger),
                  ),
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _SellBuyLedgerView extends StatelessWidget {
  const _SellBuyLedgerView({
    required this.title,
    required this.ledger,
    required this.emptyLabel,
    required this.onOpen,
  });

  final String title;
  final _RegisterLedger? ledger;
  final String emptyLabel;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final entries = ledger?.entries ?? const [];
    final summary = ledger?.summary;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.xs, AppSpace.md, AppSpace.xxl),
      children: [
        Text(title, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 8),
        if (summary != null)
          Row(
            children: [
              Expanded(child: _StatTile(label: 'Total', value: _inrCompact.format(summary.totalAmount), tone: AppColors.tealDark)),
              const SizedBox(width: 8),
              Expanded(child: _StatTile(label: 'Tax', value: _inrCompact.format(summary.totalTax))),
              const SizedBox(width: 8),
              Expanded(child: _StatTile(label: 'Bills', value: '${summary.count}')),
            ],
          ),
        const SizedBox(height: 8),
        Text(
          'Tap invoice # to open full bill',
          style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
        ),
        const SizedBox(height: 10),
        if (entries.isEmpty)
          AppEmptyState(icon: Icons.receipt_long_outlined, message: emptyLabel)
        else
          ...entries.asMap().entries.map((pair) {
            final i = pair.key;
            final e = pair.value;
            final sn = e.sn > 0 ? e.sn : i + 1;
            final isReturn = e.documentType == 'CREDIT_NOTE' || e.totalAmount < 0;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AppPanel(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('#$sn', style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.muted)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            e.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                          ),
                        ),
                        Text(
                          _inr.format(e.totalAmount),
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: isReturn ? AppColors.warn : AppColors.tealDark,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_day.format(e.date.toLocal())}'
                      '${(e.gstin ?? '').isNotEmpty ? ' · ${e.gstin}' : ''}'
                      '${isReturn ? ' · return' : ''}',
                      style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                    ),
                    const SizedBox(height: 4),
                    InkWell(
                      onTap: e.id.isEmpty ? null : () => onOpen(e.id),
                      child: Text(
                        'Invoice ${e.invoiceNumber}',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: AppColors.teal,
                          decoration: TextDecoration.underline,
                          decorationColor: AppColors.teal.withValues(alpha: 0.4),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'QTY ${e.qty.toStringAsFixed(e.qty == e.qty.roundToDouble() ? 0 : 2)} · '
                      'Taxable ${_inr.format(e.taxAmount)} · '
                      'CGST ${_inr.format(e.cgst)} · SGST ${_inr.format(e.sgst)} · '
                      'Tax ${_inr.format(e.totalTax)}',
                      style: GoogleFonts.plusJakartaSans(fontSize: 11.5, color: AppColors.ink),
                    ),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value, this.tone});

  final String label;
  final String value;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted, letterSpacing: 0.5)),
          const SizedBox(height: 2),
          Text(value, style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w800, color: tone ?? AppColors.ink)),
        ],
      ),
    );
  }
}
