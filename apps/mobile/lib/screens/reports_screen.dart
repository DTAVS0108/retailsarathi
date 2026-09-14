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
import '../widgets/app_loader.dart';
import '../utils/report_export.dart';
import '../utils/report_period.dart';
import '../widgets/simple_charts.dart';
import 'invoices_screen.dart';
import 'purchase_bills_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
final _inrCompact = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹');
final _day = DateFormat('dd MMM');

enum _ReportTab { monthly, stockFlow, saleLedger, buyLedger }

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  _ReportTab tab = _ReportTab.saleLedger;
  PeriodPreset periodPreset = PeriodPreset.thisMonth;
  late ReportPeriod period = resolvePeriodPreset(periodPreset);
  String gstRate = 'all'; // all | 0 | 5 | …
  int months = 6;
  bool loading = true;
  bool exporting = false;
  String? error;
  String? okMsg;

  MonthlyReport? monthly;
  StockFlowReport? stockFlow;
  SaleLedgerReport? saleLedger;
  BuyLedgerReport? buyLedger;
  AnalyticsOverview? overview;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Map<String, String> get _ledgerQuery {
    final q = period.toQuery();
    if (gstRate != 'all') q['gstRate'] = gstRate;
    return q;
  }

  int get _spanDays {
    final from = DateTime.tryParse(period.from);
    final to = DateTime.tryParse(period.to);
    if (from == null || to == null) return 30;
    return to.difference(from).inDays.clamp(1, 366);
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
      okMsg = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final results = await Future.wait([
        api.get('/analytics/monthly', query: {'months': '$months'}),
        api.get('/analytics/stock-flow', query: {'days': '$_spanDays'}),
        api.get('/analytics/sale-ledger', query: _ledgerQuery),
        api.get('/analytics/buy-ledger', query: _ledgerQuery),
        api.get('/analytics/overview', query: {'from': period.from, 'to': period.to}),
      ]);

      setState(() {
        monthly = MonthlyReport.fromJson(asStringKeyedMap(results[0]));
        stockFlow = StockFlowReport.fromJson(asStringKeyedMap(results[1]));
        saleLedger = SaleLedgerReport.fromJson(asStringKeyedMap(results[2]));
        buyLedger = BuyLedgerReport.fromJson(asStringKeyedMap(results[3]));
        overview = AnalyticsOverview.fromJson(asStringKeyedMap(results[4]));
      });
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _export(String format) async {
    if (tab != _ReportTab.saleLedger && tab != _ReportTab.buyLedger) return;
    setState(() {
      exporting = true;
      error = null;
      okMsg = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final path = tab == _ReportTab.saleLedger ? '/reports/sell' : '/reports/buy';
      final q = period.toQuery();
      if (gstRate != 'all') q['gstRate'] = gstRate;
      final msg = await exportAndShareReport(api, path: path, query: q, format: format);
      if (mounted) setState(() => okMsg = msg);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => exporting = false);
    }
  }

  void _applyPreset(PeriodPreset p) {
    setState(() {
      periodPreset = p;
      period = resolvePeriodPreset(p);
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final slabRates = <int>{
      ...kDefaultGstSlabs,
      ...?saleLedger?.byGstSlab,
      ...?buyLedger?.byGstSlab,
    }.toList()
      ..sort();

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(context.watch<AppStrings>().t('reports')),
        actions: [
          if (tab == _ReportTab.saleLedger || tab == _ReportTab.buyLedger)
            PopupMenuButton<String>(
              tooltip: 'Export',
              enabled: !exporting && !loading,
              onSelected: (f) => _export(f),
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'csv', child: Text('Export CSV')),
                PopupMenuItem(value: 'xlsx', child: Text('Export Excel')),
                PopupMenuItem(value: 'pdf', child: Text('Export PDF')),
              ],
              icon: exporting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.ios_share_rounded),
            ),
          IconButton(onPressed: loading ? null : _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, AppSpace.xs),
            child: Row(
              children: [
                for (final t in _ReportTab.values)
                  Padding(
                    padding: const EdgeInsets.only(right: AppSpace.xs),
                    child: ChoiceChip(
                      label: Text(_tabLabel(t)),
                      selected: tab == t,
                      onSelected: (selected) {
                        if (!selected) return;
                        setState(() => tab = t);
                      },
                    ),
                  ),
              ],
            ),
          ),
          if (tab == _ReportTab.saleLedger || tab == _ReportTab.buyLedger)
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
                        for (final r in slabRates)
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
            )
          else
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.md, 0, AppSpace.md, AppSpace.xs),
              child: Row(
                children: [
                  Expanded(
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
                  if (tab == _ReportTab.monthly) ...[
                    const SizedBox(width: 10),
                    SizedBox(
                      width: 120,
                      child: DropdownButtonFormField<int>(
                        value: months,
                        isExpanded: true,
                        isDense: true,
                        decoration: InputDecoration(
                          labelText: 'Months',
                          isDense: true,
                          filled: true,
                          fillColor: AppColors.surface,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        items: const [
                          DropdownMenuItem(value: 3, child: Text('3 mo')),
                          DropdownMenuItem(value: 6, child: Text('6 mo')),
                          DropdownMenuItem(value: 12, child: Text('12 mo')),
                        ],
                        onChanged: (v) {
                          if (v == null) return;
                          setState(() => months = v);
                          _load();
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),
          if (!Breakpoints.isCompactHeight(context))
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.md, 0, AppSpace.md, AppSpace.xs),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  tab == _ReportTab.monthly
                      ? 'Last $months months'
                      : tab == _ReportTab.stockFlow
                          ? '${period.from} → ${period.to} · $_spanDays days'
                          : '${period.from} → ${period.to}'
                              '${gstRate != 'all' ? ' · GST $gstRate%' : ''}',
                  style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                ),
              ),
            ),
          if (loading) const AppLinearLoader(),
          if (error != null)
            Padding(
              padding: AppSpace.page,
              child: Text(error!, style: const TextStyle(color: AppColors.danger)),
            ),
          if (okMsg != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
              child: Text(okMsg!, style: TextStyle(color: AppColors.tealDark)),
            ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.teal,
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.xs, AppSpace.md, AppSpace.xxl),
                children: [
                  if (overview != null)
                    _OverviewStrip(overview: overview!, label: period.label),
                  const SizedBox(height: AppSpace.md),
                  if (tab == _ReportTab.monthly && monthly != null) _MonthlyView(report: monthly!),
                  if (tab == _ReportTab.stockFlow && stockFlow != null) _StockFlowView(report: stockFlow!),
                  if (tab == _ReportTab.saleLedger && saleLedger != null)
                    _RegisterLedgerView(
                      title: 'Sell ledger',
                      summary: saleLedger!.summary,
                      entries: saleLedger!.entries,
                      onOpen: (id) => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoiceId: id)),
                      ),
                    ),
                  if (tab == _ReportTab.buyLedger && buyLedger != null)
                    _RegisterLedgerView(
                      title: 'Buy / supplier ledger',
                      summary: buyLedger!.summary,
                      entries: buyLedger!.entries,
                      onOpen: (id) => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => PurchaseBillDetailScreen(billId: id)),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _tabLabel(_ReportTab t) => switch (t) {
        _ReportTab.monthly => 'Monthly',
        _ReportTab.stockFlow => 'In / Out',
        _ReportTab.saleLedger => 'Sell ledger',
        _ReportTab.buyLedger => 'Buy ledger',
      };
}

// ─── Models (report-specific) ─────────────────────────────────────

class AnalyticsOverview {
  AnalyticsOverview({
    required this.retailRevenue,
    required this.repairRevenue,
    required this.totalRevenue,
    required this.invoiceCount,
    required this.repairCount,
  });

  final double retailRevenue;
  final double repairRevenue;
  final double totalRevenue;
  final int invoiceCount;
  final int repairCount;

  factory AnalyticsOverview.fromJson(Map<String, dynamic> json) {
    return AnalyticsOverview(
      retailRevenue: asDouble(json['retailRevenue']),
      repairRevenue: asDouble(json['repairRevenue']),
      totalRevenue: asDouble(json['totalRevenue']),
      invoiceCount: asInt(json['invoiceCount']),
      repairCount: asInt(json['repairCount']),
    );
  }
}

class MonthlyReport {
  MonthlyReport({required this.months, required this.summary});

  final List<MonthBucket> months;
  final MonthlySummary summary;

  factory MonthlyReport.fromJson(Map<String, dynamic> json) {
    final list = json['months'];
    return MonthlyReport(
      months: list is List
          ? list.whereType<Map>().map((e) => MonthBucket.fromJson(asStringKeyedMap(e))).toList()
          : const [],
      summary: MonthlySummary.fromJson(asStringKeyedMap(json['summary'] ?? {})),
    );
  }
}

class MonthBucket {
  MonthBucket({
    required this.month,
    required this.label,
    required this.revenue,
    required this.invoices,
    required this.taxable,
    required this.tax,
  });

  final String month;
  final String label;
  final double revenue;
  final int invoices;
  final double taxable;
  final double tax;

  factory MonthBucket.fromJson(Map<String, dynamic> json) {
    return MonthBucket(
      month: json['month']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      revenue: asDouble(json['revenue']),
      invoices: asInt(json['invoices']),
      taxable: asDouble(json['taxable']),
      tax: asDouble(json['tax']),
    );
  }
}

class MonthlySummary {
  MonthlySummary({
    required this.totalRevenue,
    required this.totalInvoices,
    required this.avgMonthlyRevenue,
    this.bestMonth,
    this.bestMonthRevenue = 0,
  });

  final double totalRevenue;
  final int totalInvoices;
  final double avgMonthlyRevenue;
  final String? bestMonth;
  final double bestMonthRevenue;

  factory MonthlySummary.fromJson(Map<String, dynamic> json) {
    return MonthlySummary(
      totalRevenue: asDouble(json['totalRevenue']),
      totalInvoices: asInt(json['totalInvoices']),
      avgMonthlyRevenue: asDouble(json['avgMonthlyRevenue']),
      bestMonth: json['bestMonth']?.toString(),
      bestMonthRevenue: asDouble(json['bestMonthRevenue']),
    );
  }
}

class StockFlowReport {
  StockFlowReport({
    required this.days,
    required this.summary,
    required this.byType,
    required this.recent,
  });

  final int days;
  final StockFlowSummary summary;
  final List<StockTypeStat> byType;
  final List<StockMovement> recent;

  factory StockFlowReport.fromJson(Map<String, dynamic> json) {
    return StockFlowReport(
      days: asInt(json['days'], 30),
      summary: StockFlowSummary.fromJson(asStringKeyedMap(json['summary'] ?? {})),
      byType: (json['byType'] is List)
          ? (json['byType'] as List)
              .whereType<Map>()
              .map((e) => StockTypeStat.fromJson(asStringKeyedMap(e)))
              .toList()
          : const [],
      recent: (json['recent'] is List)
          ? (json['recent'] as List)
              .whereType<Map>()
              .map((e) => StockMovement.fromJson(asStringKeyedMap(e)))
              .toList()
          : const [],
    );
  }
}

class StockFlowSummary {
  StockFlowSummary({
    required this.stockInQty,
    required this.stockOutQty,
    required this.netQty,
    required this.movementCount,
  });

  final double stockInQty;
  final double stockOutQty;
  final double netQty;
  final int movementCount;

  factory StockFlowSummary.fromJson(Map<String, dynamic> json) {
    return StockFlowSummary(
      stockInQty: asDouble(json['stockInQty']),
      stockOutQty: asDouble(json['stockOutQty']),
      netQty: asDouble(json['netQty']),
      movementCount: asInt(json['movementCount']),
    );
  }
}

class StockTypeStat {
  StockTypeStat({
    required this.type,
    required this.qtyIn,
    required this.qtyOut,
    required this.count,
  });

  final String type;
  final double qtyIn;
  final double qtyOut;
  final int count;

  factory StockTypeStat.fromJson(Map<String, dynamic> json) {
    return StockTypeStat(
      type: json['type']?.toString() ?? '',
      qtyIn: asDouble(json['qtyIn']),
      qtyOut: asDouble(json['qtyOut']),
      count: asInt(json['count']),
    );
  }
}

class SaleLedgerReport {
  SaleLedgerReport({
    required this.summary,
    required this.entries,
    this.byGstSlab = const [],
  });

  final RegisterSummary summary;
  final List<RegisterEntry> entries;
  final List<int> byGstSlab;

  factory SaleLedgerReport.fromJson(Map<String, dynamic> json) {
    final summaryMap = asStringKeyedMap(json['summary'] ?? {});
    final slabs = summaryMap['byGstSlab'];
    return SaleLedgerReport(
      summary: RegisterSummary.fromJson(summaryMap, kind: 'sell'),
      entries: (json['entries'] is List)
          ? (json['entries'] as List)
              .whereType<Map>()
              .map((e) => RegisterEntry.fromJson(asStringKeyedMap(e)))
              .toList()
          : const [],
      byGstSlab: slabs is List
          ? slabs
              .whereType<Map>()
              .map((e) => asDouble(e['gstRate']).round())
              .toList()
          : const [],
    );
  }
}

class BuyLedgerReport {
  BuyLedgerReport({
    required this.summary,
    required this.entries,
    this.byGstSlab = const [],
  });

  final RegisterSummary summary;
  final List<RegisterEntry> entries;
  final List<int> byGstSlab;

  factory BuyLedgerReport.fromJson(Map<String, dynamic> json) {
    final summaryMap = asStringKeyedMap(json['summary'] ?? {});
    final slabs = summaryMap['byGstSlab'];
    return BuyLedgerReport(
      summary: RegisterSummary.fromJson(summaryMap, kind: 'buy'),
      entries: (json['entries'] is List)
          ? (json['entries'] as List)
              .whereType<Map>()
              .map((e) => RegisterEntry.fromJson(asStringKeyedMap(e)))
              .toList()
          : const [],
      byGstSlab: slabs is List
          ? slabs
              .whereType<Map>()
              .map((e) => asDouble(e['gstRate']).round())
              .toList()
          : const [],
    );
  }
}

class RegisterSummary {
  RegisterSummary({
    required this.totalAmount,
    required this.totalTax,
    required this.count,
    required this.totalQty,
    this.byPayment = const [],
  });

  final double totalAmount;
  final double totalTax;
  final int count;
  final double totalQty;
  final List<({String method, double amount})> byPayment;

  factory RegisterSummary.fromJson(Map<String, dynamic> json, {required String kind}) {
    final pay = json['byPayment'];
    return RegisterSummary(
      totalAmount: asDouble(
        json['totalAmount'] ?? json['totalSales'] ?? json['netSales'] ?? json['estimatedSpend'],
      ),
      totalTax: asDouble(json['totalTax'] ?? json['tax']),
      count: asInt(json['billCount'] ?? json['invoiceCount'] ?? json['entryCount']),
      totalQty: asDouble(json['totalQty'] ?? json['totalQtyIn']),
      byPayment: pay is List
          ? pay
              .whereType<Map>()
              .map((e) => (method: e['method']?.toString() ?? '', amount: asDouble(e['amount'])))
              .toList()
          : const [],
    );
  }
}

class RegisterEntry {
  RegisterEntry({
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

  factory RegisterEntry.fromJson(Map<String, dynamic> json) {
    final dateRaw = json['dateIso']?.toString() ?? json['date']?.toString() ?? '';
    return RegisterEntry(
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
    );
  }
}

// ─── UI pieces ────────────────────────────────────────────────────

class _OverviewStrip extends StatelessWidget {
  const _OverviewStrip({required this.overview, required this.label});
  final AnalyticsOverview overview;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: colors.heroGradient,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$label snapshot',
            style: GoogleFonts.plusJakartaSans(
              color: Colors.white70,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _inr.format(overview.totalRevenue),
            style: GoogleFonts.plusJakartaSans(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 28,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _miniStat('Retail', _inrCompact.format(overview.retailRevenue)),
              _miniStat('Repairs', _inrCompact.format(overview.repairRevenue)),
              _miniStat('Bills', '${overview.invoiceCount}'),
            ],
          ),
          if (overview.totalRevenue > 0) ...[
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: SizedBox(
                height: 8,
                child: Row(
                  children: [
                    Expanded(
                      flex: (overview.retailRevenue * 100).round().clamp(1, 10000),
                      child: Container(color: Color.lerp(colors.primary, Colors.white, 0.45)!),
                    ),
                    Expanded(
                      flex: (overview.repairRevenue * 100).round().clamp(0, 10000),
                      child: Container(color: colors.secondary),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Retail vs repairs mix',
              style: GoogleFonts.plusJakartaSans(color: Colors.white60, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }

  Widget _miniStat(String label, String value) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: GoogleFonts.plusJakartaSans(color: Colors.white60, fontSize: 11)),
          Text(value, style: GoogleFonts.plusJakartaSans(color: Colors.white, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _MonthlyView extends StatelessWidget {
  const _MonthlyView({required this.report});
  final MonthlyReport report;

  @override
  Widget build(BuildContext context) {
    final maxRevenue = report.months.fold<double>(0, (m, e) => e.revenue > m ? e.revenue : m);
    final chartPoints = report.months
        .map((m) => ChartPoint(m.label.replaceAll(RegExp(r' \d{4}$'), ''), m.revenue))
        .toList();
    final invoicePoints = report.months
        .map((m) => ChartPoint(m.label.replaceAll(RegExp(r' \d{4}$'), ''), m.invoices.toDouble()))
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StatRow(
          items: [
            ('Total', _inrCompact.format(report.summary.totalRevenue)),
            ('Avg / mo', _inrCompact.format(report.summary.avgMonthlyRevenue)),
            ('Bills', '${report.summary.totalInvoices}'),
          ],
        ),
        if (report.summary.bestMonth != null) ...[
          const SizedBox(height: 8),
          Text(
            'Best month: ${report.summary.bestMonth} · ${_inr.format(report.summary.bestMonthRevenue)}',
            style: GoogleFonts.plusJakartaSans(color: AppColors.tealDark, fontWeight: FontWeight.w600),
          ),
        ],
        const SizedBox(height: 14),
        ChartPanel(
          title: 'Revenue trend',
          subtitle: 'Monthly billed total',
          child: SimpleBarChart(points: chartPoints),
        ),
        const SizedBox(height: 12),
        ChartPanel(
          title: 'Invoice volume',
          subtitle: 'Bills per month',
          child: SimpleBarChart(points: invoicePoints),
        ),
        const SizedBox(height: 14),
        ...report.months.reversed.map((m) {
          final pct = maxRevenue <= 0 ? 0.0 : (m.revenue / maxRevenue).clamp(0.0, 1.0);
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.teal.withValues(alpha: 0.08)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(m.label, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                      ),
                      Text(_inr.format(m.revenue), style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: pct,
                      minHeight: 8,
                      backgroundColor: AppColors.tealSoft.withValues(alpha: 0.5),
                      color: AppColors.teal,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${m.invoices} invoices · tax ${_inr.format(m.tax)}',
                    style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
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

class _StockFlowView extends StatelessWidget {
  const _StockFlowView({required this.report});
  final StockFlowReport report;

  @override
  Widget build(BuildContext context) {
    final s = report.summary;
    final typeBars = report.byType
        .map((t) => ChartPoint(t.type.replaceAll('_', ' '), t.qtyIn.abs() + t.qtyOut.abs()))
        .toList();
    final inOutBars = [
      ChartPoint('Stock in', s.stockInQty),
      ChartPoint('Stock out', s.stockOutQty),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _StatRow(
          items: [
            ('In', '+${s.stockInQty.toStringAsFixed(0)}'),
            ('Out', '−${s.stockOutQty.toStringAsFixed(0)}'),
            ('Net', s.netQty.toStringAsFixed(0)),
          ],
        ),
        const SizedBox(height: 12),
        ChartPanel(
          title: 'In vs out',
          subtitle: 'Units moved',
          child: SimpleBarChart(points: inOutBars),
        ),
        const SizedBox(height: 12),
        ChartPanel(
          title: 'By movement type',
          child: SimpleHBarList(
            points: typeBars,
            valueLabel: (v) => '${v.round()} units',
          ),
        ),
        const SizedBox(height: 12),
        Text('By movement type', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        ...report.byType.map(
          (t) => ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: Text(t.type.replaceAll('_', ' '), style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(
              '${t.count} moves · in ${t.qtyIn.toStringAsFixed(0)} · out ${t.qtyOut.toStringAsFixed(0)}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text('Recent movements', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        ...report.recent.take(25).map(
              (m) => Card(
                margin: const EdgeInsets.only(bottom: 6),
                child: ListTile(
                  dense: true,
                  title: Text(m.productName, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text('${m.type} · ${_day.format(m.createdAt.toLocal())}'),
                  trailing: Text(
                    '${m.quantity > 0 ? '+' : ''}${m.quantity.toStringAsFixed(0)}',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: m.quantity >= 0 ? AppColors.teal : AppColors.danger,
                    ),
                  ),
                ),
              ),
            ),
      ],
    );
  }
}

class _RegisterLedgerView extends StatelessWidget {
  const _RegisterLedgerView({
    required this.title,
    required this.summary,
    required this.entries,
    this.onOpen,
  });

  final String title;
  final RegisterSummary summary;
  final List<RegisterEntry> entries;
  final ValueChanged<String>? onOpen;

  @override
  Widget build(BuildContext context) {
    final byName = <String, double>{};
    for (final e in entries) {
      byName[e.name] = (byName[e.name] ?? 0) + e.totalAmount;
    }
    final topBars = (byName.entries.toList()..sort((a, b) => b.value.compareTo(a.value)))
        .take(8)
        .map((e) => ChartPoint(e.key, e.value))
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 8),
        _StatRow(
          items: [
            ('Total', _inrCompact.format(summary.totalAmount)),
            ('Tax', _inrCompact.format(summary.totalTax)),
            ('Bills', '${summary.count}'),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          'SN · Date · Name · GSTIN · Invoice · QTY · Taxable · CGST · SGST · Tax · Amount',
          style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
        ),
        if (summary.byPayment.isNotEmpty) ...[
          const SizedBox(height: 12),
          ChartPanel(
            title: 'Payment mix',
            child: SimpleHBarList(
              points: summary.byPayment.map((p) => ChartPoint(p.method, p.amount)).toList(),
              valueLabel: (v) => _inr.format(v),
            ),
          ),
        ],
        if (topBars.isNotEmpty) ...[
          const SizedBox(height: 12),
          ChartPanel(
            title: 'By party',
            subtitle: 'Top in range',
            child: SimpleHBarList(points: topBars, valueLabel: (v) => _inr.format(v)),
          ),
        ],
        const SizedBox(height: 12),
        if (entries.isEmpty)
          Text('No entries in this period.', style: GoogleFonts.plusJakartaSans(color: AppColors.muted)),
        ...entries.asMap().entries.map((entry) {
          final i = entry.key;
          final e = entry.value;
          final sn = e.sn > 0 ? e.sn : i + 1;
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: onOpen != null && e.id.isNotEmpty ? () => onOpen!(e.id) : null,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          '#$sn',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppColors.muted,
                          ),
                        ),
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
                            color: e.totalAmount < 0 ? AppColors.warn : AppColors.tealDark,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_day.format(e.date.toLocal())}'
                      '${e.gstin != null && e.gstin!.isNotEmpty ? ' · ${e.gstin}' : ''}',
                      style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Invoice ${e.invoiceNumber}',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.teal,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'QTY ${e.qty} · Taxable ${_inr.format(e.taxAmount)} · '
                      'CGST ${_inr.format(e.cgst)} · SGST ${_inr.format(e.sgst)} · '
                      'Tax ${_inr.format(e.totalTax)}',
                      style: GoogleFonts.plusJakartaSans(fontSize: 11.5, color: AppColors.ink),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({required this.items});
  final List<(String, String)> items;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final ink = colors.inkOn(colors.surface);
    final muted = colors.mutedOn(colors.surface);
    return Row(
      children: [
        for (final item in items)
          Expanded(
            child: Container(
              margin: EdgeInsets.only(right: item == items.last ? 0 : 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: colors.primary.withValues(alpha: 0.08)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.$1, style: GoogleFonts.plusJakartaSans(fontSize: 11, color: muted)),
                  const SizedBox(height: 2),
                  Text(
                    item.$2,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                      color: ink,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
