import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/app_ui.dart';
import '../widgets/app_loader.dart';
import '../widgets/app_toast.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
final _monthLabel = DateFormat('MMM yyyy');

enum _GstTab { gstr1, gstr3b }

/// GST return summaries — GSTR-1 and GSTR-3B for a filing period.
class GstScreen extends StatefulWidget {
  const GstScreen({super.key});

  @override
  State<GstScreen> createState() => _GstScreenState();
}

class _GstScreenState extends State<GstScreen> {
  _GstTab tab = _GstTab.gstr1;
  late DateTime period = DateTime(DateTime.now().year, DateTime.now().month);

  bool loading = true;
  String? error;
  Map<String, dynamic>? gstr1;
  Map<String, dynamic>? gstr3b;

  int get year => period.year;
  int get month => period.month;

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
      final q = {'year': '$year', 'month': '$month'};
      final results = await Future.wait([
        api.get('/gst/gstr1', query: q),
        api.get('/gst/gstr3b', query: q),
      ]);
      if (!mounted) return;
      setState(() {
        gstr1 = _asMap(results[0]);
        gstr3b = _asMap(results[1]);
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Map<String, dynamic>? _asMap(dynamic raw) {
    if (raw is Map) return asStringKeyedMap(raw);
    return null;
  }

  Map<String, dynamic>? get _activeData => tab == _GstTab.gstr1 ? gstr1 : gstr3b;

  Future<void> _pickPeriod() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: period,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDatePickerMode: DatePickerMode.year,
    );
    if (picked == null || !mounted) return;
    setState(() => period = DateTime(picked.year, picked.month));
    _load();
  }

  Future<void> _copyJson() async {
    final data = _activeData;
    if (data == null) return;
    final text = const JsonEncoder.withIndent('  ').convert(data);
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) showSuccessToast(context, 'JSON copied to clipboard');
  }

  Future<void> _shareJson() async {
    final data = _activeData;
    if (data == null) return;
    final label = tab == _GstTab.gstr1 ? 'GSTR-1' : 'GSTR-3B';
    final text = const JsonEncoder.withIndent('  ').convert(data);
    await SharePlus.instance.share(
      ShareParams(
        text: '$label · ${_monthLabel.format(period)}\n\n$text',
        subject: '$label $_monthLabel.format(period)',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final kpis = _extractKpis(_activeData, tab);
    final sections = _buildSections(_activeData, tab);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('GST returns'),
        actions: [
          if (_activeData != null) ...[
            IconButton(
              tooltip: 'Copy JSON',
              onPressed: _copyJson,
              icon: const Icon(Icons.copy_rounded),
            ),
            IconButton(
              tooltip: 'Share JSON',
              onPressed: _shareJson,
              icon: const Icon(Icons.ios_share_rounded),
            ),
          ],
          IconButton(
            tooltip: 'Refresh',
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, AppSpace.xs),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: loading ? null : _pickPeriod,
                    icon: const Icon(Icons.calendar_month_rounded, size: 18),
                    label: Text(
                      _monthLabel.format(period),
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpace.xs),
                DropdownButtonHideUnderline(
                  child: DropdownButton<int>(
                    value: month,
                    borderRadius: BorderRadius.circular(12),
                    items: List.generate(12, (i) {
                      final m = i + 1;
                      return DropdownMenuItem(value: m, child: Text(DateFormat('MMM').format(DateTime(2024, m))));
                    }),
                    onChanged: loading
                        ? null
                        : (v) {
                            if (v == null) return;
                            setState(() => period = DateTime(year, v));
                            _load();
                          },
                  ),
                ),
                const SizedBox(width: 4),
                DropdownButtonHideUnderline(
                  child: DropdownButton<int>(
                    value: year,
                    borderRadius: BorderRadius.circular(12),
                    items: List.generate(6, (i) {
                      final y = DateTime.now().year - i;
                      return DropdownMenuItem(value: y, child: Text('$y'));
                    }),
                    onChanged: loading
                        ? null
                        : (v) {
                            if (v == null) return;
                            setState(() => period = DateTime(v, month));
                            _load();
                          },
                  ),
                ),
              ],
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(AppSpace.md, 0, AppSpace.md, AppSpace.xs),
            child: Row(
              children: [
                ChoiceChip(
                  label: const Text('GSTR-1'),
                  selected: tab == _GstTab.gstr1,
                  onSelected: (s) {
                    if (!s) return;
                    setState(() => tab = _GstTab.gstr1);
                  },
                ),
                const SizedBox(width: AppSpace.xs),
                ChoiceChip(
                  label: const Text('GSTR-3B'),
                  selected: tab == _GstTab.gstr3b,
                  onSelected: (s) {
                    if (!s) return;
                    setState(() => tab = _GstTab.gstr3b);
                  },
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
              child: loading && _activeData == null
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
                        if (kpis.isNotEmpty) ...[
                          _KpiRow(kpis: kpis),
                          const SizedBox(height: AppSpace.md),
                        ],
                        if (sections.isEmpty && !loading)
                          const AppEmptyState(
                            icon: Icons.receipt_long_outlined,
                            message: 'No GST data for this period.',
                          ),
                        ...sections,
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

List<({String label, String value})> _extractKpis(Map<String, dynamic>? data, _GstTab tab) {
  if (data == null) return const [];

  if (tab == _GstTab.gstr3b) {
    return [
      if (_hasNum(data, ['outwardTaxable', 'taxable', 'taxableValue']))
        (label: 'Taxable', value: _fmtMoney(_firstNum(data, ['outwardTaxable', 'taxable', 'taxableValue']))),
      if (_hasNum(data, ['outwardIgst', 'igst', 'totalIgst']))
        (label: 'IGST', value: _fmtMoney(_firstNum(data, ['outwardIgst', 'igst', 'totalIgst']))),
      if (_hasNum(data, ['outwardCgst', 'cgst', 'totalCgst']))
        (label: 'CGST', value: _fmtMoney(_firstNum(data, ['outwardCgst', 'cgst', 'totalCgst']))),
      if (_hasNum(data, ['outwardSgst', 'sgst', 'totalSgst']))
        (label: 'SGST', value: _fmtMoney(_firstNum(data, ['outwardSgst', 'sgst', 'totalSgst']))),
      if (_hasNum(data, ['totalTaxPayable', 'totalTax', 'tax']))
        (label: 'Tax payable', value: _fmtMoney(_firstNum(data, ['totalTaxPayable', 'totalTax', 'tax']))),
    ];
  }

  final b2b = data['b2b'];
  final b2cs = data['b2cs'];
  final hsn = data['hsn'];
  final b2bCount = b2b is List ? b2b.length : 0;
  final b2csCount = b2cs is List ? b2cs.length : 0;

  double taxable = 0;
  double igst = 0;
  double cgst = 0;
  double sgst = 0;

  if (hsn is Map && hsn['data'] is List) {
    for (final row in (hsn['data'] as List).whereType<Map>()) {
      final m = asStringKeyedMap(row);
      taxable += asDouble(m['taxableValue'] ?? m['txval'] ?? m['taxable']);
      igst += asDouble(m['igst'] ?? m['iamt']);
      cgst += asDouble(m['cgst'] ?? m['camt']);
      sgst += asDouble(m['sgst'] ?? m['samt']);
    }
  }

  final out = <({String label, String value})>[
    if (data['gstin'] != null) (label: 'GSTIN', value: data['gstin'].toString()),
    if (data['fp'] != null) (label: 'Period', value: data['fp'].toString()),
    (label: 'B2B parties', value: '$b2bCount'),
    (label: 'B2CS entries', value: '$b2csCount'),
  ];
  if (taxable > 0) out.add((label: 'Taxable', value: _fmtMoney(taxable)));
  if (igst > 0) out.add((label: 'IGST', value: _fmtMoney(igst)));
  if (cgst > 0) out.add((label: 'CGST', value: _fmtMoney(cgst)));
  if (sgst > 0) out.add((label: 'SGST', value: _fmtMoney(sgst)));
  return out;
}

bool _hasNum(Map<String, dynamic> m, List<String> keys) =>
    _firstNum(m, keys) != 0 || keys.any((k) => m.containsKey(k) && m[k] != null);

double _firstNum(Map<String, dynamic> m, List<String> keys) {
  for (final k in keys) {
    if (m.containsKey(k)) return asDouble(m[k]);
  }
  return 0;
}

String _fmtMoney(double v) => _inr.format(v);

String _humanKey(String key) {
  if (key.isEmpty) return key;
  final spaced = key.replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]}');
  return spaced[0].toUpperCase() + spaced.substring(1);
}

List<Widget> _buildSections(Map<String, dynamic>? data, _GstTab tab) {
  if (data == null) return const [];

  final widgets = <Widget>[];

  // Meta header
  final meta = <String, String>{};
  for (final k in ['gstin', 'fp', 'version']) {
    if (data[k] != null) meta[k] = data[k].toString();
  }
  if (meta.isNotEmpty) {
    widgets.add(_SectionCard(title: 'Filing info', rows: meta));
    widgets.add(const SizedBox(height: AppSpace.sm));
  }

  if (tab == _GstTab.gstr3b) {
    widgets.add(
      _SectionCard(
        title: 'Outward supplies summary',
        rows: {
          for (final e in data.entries)
            if (e.value is num || e.value is String && double.tryParse(e.value as String) != null)
              e.key: _fmtMoney(asDouble(e.value)),
        },
      ),
    );
    return widgets;
  }

  // GSTR-1 sections
  final b2b = data['b2b'];
  if (b2b is List && b2b.isNotEmpty) {
    widgets.add(AppSectionTitle('B2B (${b2b.length})'));
    for (final entry in b2b.take(20)) {
      if (entry is! Map) continue;
      final m = asStringKeyedMap(entry);
      final ctin = m['ctin']?.toString() ?? '—';
      final invList = m['inv'];
      if (invList is List) {
        for (final inv in invList.whereType<Map>()) {
          final im = asStringKeyedMap(inv);
          widgets.add(
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.xs),
              child: AppPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ctin, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                    Text(
                      'Invoice ${im['inum']} · ${im['idt']} · ${_fmtMoney(asDouble(im['val']))}',
                      style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
            ),
          );
        }
      }
    }
    widgets.add(const SizedBox(height: AppSpace.sm));
  }

  final b2cs = data['b2cs'];
  if (b2cs is List && b2cs.isNotEmpty) {
    widgets.add(AppSectionTitle('B2CS (${b2cs.length})'));
    for (final entry in b2cs.take(15)) {
      if (entry is! Map) continue;
      final m = asStringKeyedMap(entry);
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpace.xs),
          child: AppPanel(
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'POS ${m['pos'] ?? '—'} · ${m['rt'] ?? ''}%',
                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  _fmtMoney(asDouble(m['txval'])),
                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: AppColors.tealDark),
                ),
              ],
            ),
          ),
        ),
      );
    }
    widgets.add(const SizedBox(height: AppSpace.sm));
  }

  final hsn = data['hsn'];
  if (hsn is Map && hsn['data'] is List) {
    final rows = (hsn['data'] as List).whereType<Map>().toList();
    widgets.add(AppSectionTitle('HSN summary (${rows.length})'));
    for (final row in rows.take(25)) {
      final m = asStringKeyedMap(row);
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpace.xs),
          child: AppPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${m['hsnCode'] ?? m['hsn_sc'] ?? '—'} · ${m['description'] ?? ''}',
                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  'Qty ${asDouble(m['totalQuantity'] ?? m['qty']).toStringAsFixed(0)} · '
                  'Taxable ${_fmtMoney(asDouble(m['taxableValue'] ?? m['txval']))} · '
                  'Tax ${_fmtMoney(asDouble(m['igst'] ?? m['iamt']) + asDouble(m['cgst'] ?? m['camt']) + asDouble(m['sgst'] ?? m['samt']))}',
                  style: GoogleFonts.plusJakartaSans(fontSize: 11.5, color: AppColors.muted),
                ),
              ],
            ),
          ),
        ),
      );
    }
  }

  return widgets;
}

class _KpiRow extends StatelessWidget {
  const _KpiRow({required this.kpis});
  final List<({String label, String value})> kpis;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpace.xs,
      runSpacing: AppSpace.xs,
      children: [
        for (final k in kpis)
          Container(
            width: (MediaQuery.sizeOf(context).width - AppSpace.md * 2 - AppSpace.xs) / 2,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(color: AppColors.teal.withValues(alpha: 0.08)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(k.label, style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted)),
                const SizedBox(height: 2),
                Text(
                  k.value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 14),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.rows});
  final String title;
  final Map<String, String> rows;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: AppSpace.sm),
          for (final e in rows.entries)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _humanKey(e.key),
                      style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                    ),
                  ),
                  Text(e.value, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
