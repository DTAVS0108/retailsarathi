import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/app_ui.dart';
import '../widgets/app_loader.dart';
import '../widgets/app_toast.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
final _inrCompact = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹');

/// Inventory analytics — overview, ABC, dead stock, margin by SKU.
class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  bool loading = true;
  bool refreshingAbc = false;
  String? error;

  Map<String, dynamic>? overview;
  List<Map<String, dynamic>> abc = [];
  List<Map<String, dynamic>> deadStock = [];
  List<Map<String, dynamic>> marginBySku = [];

  String abcGradeFilter = '';

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
        api.get('/analytics/overview'),
        api.get('/analytics/abc'),
        api.get('/analytics/dead-stock'),
        api.get('/analytics/margin-by-sku'),
      ]);
      if (!mounted) return;
      setState(() {
        overview = results[0] is Map ? asStringKeyedMap(results[0]) : null;
        abc = _asList(results[1]);
        deadStock = _asList(results[2]);
        marginBySku = _asList(results[3]);
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  List<Map<String, dynamic>> _asList(dynamic raw) {
    if (raw is List) return raw.whereType<Map>().map(asStringKeyedMap).toList();
    if (raw is Map && raw['items'] is List) {
      return (raw['items'] as List).whereType<Map>().map(asStringKeyedMap).toList();
    }
    return const [];
  }

  Future<void> _refreshAbcGrades() async {
    setState(() => refreshingAbc = true);
    try {
      final api = context.read<AuthState>().api;
      await api.post('/analytics/abc/refresh');
      if (!mounted) return;
      showSuccessToast(context, 'ABC grades refreshed on products');
      await _load();
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    } finally {
      if (mounted) setState(() => refreshingAbc = false);
    }
  }

  List<Map<String, dynamic>> get filteredAbc {
    if (abcGradeFilter.isEmpty) return abc.take(15).toList();
    return abc.where((r) => r['grade']?.toString() == abcGradeFilter).take(15).toList();
  }

  int _gradeCount(String g) => abc.where((r) => r['grade']?.toString() == g).length;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('Analytics'),
        actions: [
          IconButton(
            tooltip: 'Refresh ABC grades',
            onPressed: loading || refreshingAbc ? null : _refreshAbcGrades,
            icon: refreshingAbc
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.auto_fix_high_rounded),
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
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
              child: loading && overview == null
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 120),
                        AppLoader(),
                      ],
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.xs, AppSpace.md, AppSpace.xxl),
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        if (overview != null) _OverviewSection(data: overview!),
                        const SizedBox(height: AppSpace.lg),
                        _AbcSection(
                          items: filteredAbc,
                          gradeFilter: abcGradeFilter,
                          gradeCounts: {'A': _gradeCount('A'), 'B': _gradeCount('B'), 'C': _gradeCount('C')},
                          onFilter: (g) => setState(() => abcGradeFilter = g),
                        ),
                        const SizedBox(height: AppSpace.lg),
                        _DeadStockSection(items: deadStock.take(15).toList()),
                        const SizedBox(height: AppSpace.lg),
                        _MarginSection(items: marginBySku.take(15).toList()),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OverviewSection extends StatelessWidget {
  const _OverviewSection({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final retail = asDouble(data['retailRevenue']);
    final repair = asDouble(data['repairRevenue']);
    final total = asDouble(data['totalRevenue']);
    final invoices = asInt(data['invoiceCount']);
    final repairs = asInt(data['repairCount']);
    final colors = AppColors.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AppSectionTitle('Overview'),
        Container(
          padding: const EdgeInsets.all(AppSpace.md),
          decoration: BoxDecoration(
            gradient: colors.heroGradient,
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Total revenue',
                style: GoogleFonts.plusJakartaSans(color: Colors.white70, fontWeight: FontWeight.w600, fontSize: 12),
              ),
              const SizedBox(height: 4),
              Text(
                _inr.format(total),
                style: GoogleFonts.plusJakartaSans(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 28),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _overviewMiniStat('Retail', _inrCompact.format(retail)),
                  _overviewMiniStat('Repairs', _inrCompact.format(repair)),
                  _overviewMiniStat('Bills', '$invoices'),
                  _overviewMiniStat('Jobs', '$repairs'),
                ],
              ),
            ],
          ),
        ),
        if (data['byBranch'] is List && (data['byBranch'] as List).isNotEmpty) ...[
          const SizedBox(height: AppSpace.sm),
          ...((data['byBranch'] as List).whereType<Map>().take(5).map((b) {
            final m = asStringKeyedMap(b);
            return Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.xs),
              child: AppPanel(
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        m['name']?.toString() ?? 'Branch',
                        style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                      ),
                    ),
                    Text(
                      _inr.format(asDouble(m['revenue'])),
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: colors.primaryDark),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${asInt(m['invoices'])} bills',
                      style: GoogleFonts.plusJakartaSans(fontSize: 11, color: colors.muted),
                    ),
                  ],
                ),
              ),
            );
          })),
        ],
      ],
    );
  }

  Widget _overviewMiniStat(String label, String value) {
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

class _AbcSection extends StatelessWidget {
  const _AbcSection({
    required this.items,
    required this.gradeFilter,
    required this.gradeCounts,
    required this.onFilter,
  });

  final List<Map<String, dynamic>> items;
  final String gradeFilter;
  final Map<String, int> gradeCounts;
  final ValueChanged<String> onFilter;

  Color _gradeColor(String g, AppColorsLookup colors) => switch (g) {
        'A' => colors.primaryDark,
        'B' => const Color(0xFFB45309),
        'C' => colors.muted,
        _ => colors.ink,
      };

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AppSectionTitle('ABC analysis'),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              Padding(
                padding: const EdgeInsets.only(right: AppSpace.xs),
                child: FilterChip(
                  label: const Text('All'),
                  selected: gradeFilter.isEmpty,
                  onSelected: (s) {
                    if (!s) return;
                    onFilter('');
                  },
                ),
              ),
              for (final g in ['A', 'B', 'C'])
                Padding(
                  padding: const EdgeInsets.only(right: AppSpace.xs),
                  child: FilterChip(
                    avatar: CircleAvatar(
                      radius: 10,
                      backgroundColor: _gradeColor(g, colors).withValues(alpha: 0.15),
                      child: Text(g, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: _gradeColor(g, colors))),
                    ),
                    label: Text('${gradeCounts[g] ?? 0}'),
                    selected: gradeFilter == g,
                    onSelected: (s) {
                      if (!s) return;
                      onFilter(g);
                    },
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.sm),
        if (items.isEmpty)
          const AppPanel(child: Text('No ABC data yet — sell products to build grades.'))
        else
          ...items.map((r) {
            final grade = r['grade']?.toString() ?? '?';
            return Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.xs),
              child: AppPanel(
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: _gradeColor(grade, colors).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        grade,
                        style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: _gradeColor(grade, colors)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            r['name']?.toString() ?? '—',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            'Qty ${asDouble(r['qty']).toStringAsFixed(0)} · '
                            '${asInt(r['cumulativePct'])}% cumulative',
                            style: GoogleFonts.plusJakartaSans(fontSize: 11, color: colors.muted),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      _inrCompact.format(asDouble(r['revenue'])),
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: colors.primaryDark),
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

class _DeadStockSection extends StatelessWidget {
  const _DeadStockSection({required this.items});
  final List<Map<String, dynamic>> items;

  @override
  Widget build(BuildContext context) {
    final totalValue = items.fold<double>(0, (s, r) => s + asDouble(r['valueAtCost']));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppSectionTitle('Dead stock', trailing: Text(
          items.isEmpty ? '' : _inrCompact.format(totalValue),
          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: AppColors.warn),
        )),
        if (items.isEmpty)
          const AppPanel(child: Text('No dead stock — everything moved recently.'))
        else
          ...items.map((r) {
            return Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.xs),
              child: AppPanel(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            r['name']?.toString() ?? '—',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            'SKU ${r['sku'] ?? '—'} · Qty ${asDouble(r['stockQty']).toStringAsFixed(0)}',
                            style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      _inr.format(asDouble(r['valueAtCost'])),
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: AppColors.warn),
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

class _MarginSection extends StatelessWidget {
  const _MarginSection({required this.items});
  final List<Map<String, dynamic>> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AppSectionTitle('Margin by SKU'),
        if (items.isEmpty)
          const AppPanel(child: Text('No margin data — sell products in the last 30 days.'))
        else
          ...items.map((r) {
            final margin = asDouble(r['margin']);
            final pct = asInt(r['marginPct']);
            return Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.xs),
              child: AppPanel(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            r['name']?.toString() ?? '—',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            'Rev ${_inrCompact.format(asDouble(r['revenue']))} · '
                            'Cost ${_inrCompact.format(asDouble(r['cost']))} · '
                            'Qty ${asDouble(r['qty']).toStringAsFixed(0)}',
                            style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _inr.format(margin),
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800,
                            color: margin >= 0 ? AppColors.tealDark : AppColors.danger,
                          ),
                        ),
                        Text(
                          '$pct%',
                          style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                        ),
                      ],
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
