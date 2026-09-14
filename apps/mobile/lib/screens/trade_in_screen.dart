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
final _day = DateFormat('dd MMM yyyy');

const _statusFilters = [
  'OPEN',
  'ALL',
  'QUOTED',
  'ACCEPTED',
  'RECEIVED',
  'REFURBISHED',
  'SOLD',
  'REJECTED',
];

const _conditions = ['NEW', 'REFURB', 'OPEN_BOX'];

const _statusFlow = <String, List<String>>{
  'QUOTED': ['ACCEPTED', 'REJECTED'],
  'ACCEPTED': ['RECEIVED', 'REJECTED'],
  'RECEIVED': ['REJECTED'],
  'REFURBISHED': ['SOLD'],
  'SOLD': [],
  'REJECTED': [],
};

String _statusLabel(String s) => s.replaceAll('_', ' ');

Color _statusColor(String status) => switch (status) {
      'QUOTED' => AppColors.muted,
      'ACCEPTED' => AppColors.teal,
      'RECEIVED' => AppColors.tealDark,
      'REFURBISHED' => const Color(0xFFB45309),
      'SOLD' => AppColors.tealDark,
      'REJECTED' => AppColors.danger,
      _ => AppColors.ink,
    };

/// Trade-in intake — quote, accept, receive, convert to inventory.
class TradeInScreen extends StatefulWidget {
  const TradeInScreen({super.key});

  @override
  State<TradeInScreen> createState() => _TradeInScreenState();
}

class _TradeInScreenState extends State<TradeInScreen> {
  List<Map<String, dynamic>> items = [];
  List<Map<String, dynamic>> customers = [];
  String statusFilter = 'OPEN';
  bool loading = true;
  bool saving = false;
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
      final results = await Future.wait([
        api.get('/trade-in', query: {'status': statusFilter}),
        api.get('/customers', query: {'pageSize': '100'}),
      ]);
      if (!mounted) return;
      final rawItems = results[0];
      final list = rawItems is List
          ? rawItems
          : (rawItems is Map && rawItems['items'] is List ? rawItems['items'] as List : const []);
      final custRaw = results[1];
      final custList = custRaw is List
          ? custRaw
          : (custRaw is Map && custRaw['items'] is List ? custRaw['items'] as List : const []);
      setState(() {
        items = list.whereType<Map>().map(asStringKeyedMap).toList();
        customers = custList.whereType<Map>().map(asStringKeyedMap).toList();
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _openAddSheet() async {
    final brandCtrl = TextEditingController();
    final modelCtrl = TextEditingController();
    final imeiCtrl = TextEditingController();
    final quoteCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    String? customerId;
    String condition = 'REFURB';

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: AppSpace.md,
            right: AppSpace.md,
            top: AppSpace.sm,
            bottom: MediaQuery.viewInsetsOf(ctx).bottom + AppSpace.lg,
          ),
          child: StatefulBuilder(
            builder: (ctx, setLocal) {
              return SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'New trade-in',
                      style: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: AppSpace.md),
                    TextField(
                      controller: brandCtrl,
                      decoration: const InputDecoration(labelText: 'Device brand'),
                      textCapitalization: TextCapitalization.words,
                    ),
                    AppSpace.fieldGap,
                    TextField(
                      controller: modelCtrl,
                      decoration: const InputDecoration(labelText: 'Device model *'),
                      textCapitalization: TextCapitalization.words,
                    ),
                    AppSpace.fieldGap,
                    TextField(
                      controller: imeiCtrl,
                      decoration: const InputDecoration(labelText: 'IMEI / serial (optional)'),
                    ),
                    AppSpace.fieldGap,
                    DropdownButtonFormField<String>(
                      value: condition,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Condition'),
                      items: _conditions
                          .map((c) => DropdownMenuItem(value: c, child: Text(_statusLabel(c))))
                          .toList(),
                      onChanged: (v) => setLocal(() => condition = v ?? 'REFURB'),
                    ),
                    AppSpace.fieldGap,
                    TextField(
                      controller: quoteCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Quoted value *'),
                    ),
                    AppSpace.fieldGap,
                    DropdownButtonFormField<String?>(
                      value: customerId,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Customer (optional)'),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('Walk-in')),
                        ...customers.map(
                          (c) => DropdownMenuItem(
                            value: c['id']?.toString(),
                            child: Text(
                              '${c['name']} · ${c['phone'] ?? ''}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                      onChanged: (v) => setLocal(() => customerId = v),
                    ),
                    AppSpace.fieldGap,
                    TextField(
                      controller: notesCtrl,
                      maxLines: 2,
                      decoration: const InputDecoration(labelText: 'Notes (optional)'),
                    ),
                    const SizedBox(height: AppSpace.md),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Create trade-in'),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );

    if (ok != true || !mounted) {
      brandCtrl.dispose();
      modelCtrl.dispose();
      imeiCtrl.dispose();
      quoteCtrl.dispose();
      notesCtrl.dispose();
      return;
    }

    final model = [
      brandCtrl.text.trim(),
      modelCtrl.text.trim(),
    ].where((s) => s.isNotEmpty).join(' ');
    final quote = double.tryParse(quoteCtrl.text.trim()) ?? 0;
    final imei = imeiCtrl.text.trim();
    final notes = notesCtrl.text.trim();

    brandCtrl.dispose();
    modelCtrl.dispose();
    imeiCtrl.dispose();
    quoteCtrl.dispose();
    notesCtrl.dispose();

    if (model.isEmpty || quote <= 0) {
      showErrorToast(context, 'Device model and quoted value are required');
      return;
    }

    setState(() => saving = true);
    try {
      final api = context.read<AuthState>().api;
      await api.post('/trade-in', body: {
        'deviceModel': model,
        if (imei.isNotEmpty) 'imei': imei,
        'condition': condition,
        'quotedValue': quote,
        if (customerId != null) 'customerId': customerId,
        if (notes.isNotEmpty) 'notes': notes,
      });
      if (!mounted) return;
      showSuccessToast(context, 'Trade-in created');
      await _load();
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _openDetail(Map<String, dynamic> item) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _TradeInDetailSheet(
        item: item,
        onChanged: () async {
          await _load();
          if (ctx.mounted) Navigator.pop(ctx);
        },
      ),
    );
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('Trade-in'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'trade_in_add',
        onPressed: saving ? null : _openAddSheet,
        icon: const Icon(Icons.add),
        label: Text(saving ? 'Saving…' : 'Add trade-in'),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, AppSpace.xs),
            child: Row(
              children: [
                for (final s in _statusFilters)
                  Padding(
                    padding: const EdgeInsets.only(right: AppSpace.xs),
                    child: FilterChip(
                      label: Text(_statusLabel(s)),
                      selected: statusFilter == s,
                      onSelected: (selected) {
                        if (!selected) return;
                        setState(() => statusFilter = s);
                        _load();
                      },
                    ),
                  ),
              ],
            ),
          ),
          if (!loading)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
              child: Text(
                '${items.length} trade-ins',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
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
              child: loading && items.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 120),
                        AppLoader(),
                      ],
                    )
                  : items.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: AppSpace.page,
                          children: const [
                            SizedBox(height: 48),
                            AppEmptyState(
                              icon: Icons.phonelink_erase_rounded,
                              message: 'No trade-ins yet. Tap Add to quote a device.',
                            ),
                          ],
                        )
                      : ListView.builder(
                          padding: AppSpace.listWithFab(),
                          physics: const AlwaysScrollableScrollPhysics(),
                          itemCount: items.length,
                          itemBuilder: (_, i) {
                            final t = items[i];
                            return _TradeInCard(item: t, onTap: () => _openDetail(t));
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TradeInCard extends StatelessWidget {
  const _TradeInCard({required this.item, required this.onTap});
  final Map<String, dynamic> item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = item['status']?.toString() ?? '';
    final customer = item['customer'] is Map ? asStringKeyedMap(item['customer']) : null;
    final quoted = asDouble(item['quotedValue']);
    final finalVal = item['finalValue'] != null ? asDouble(item['finalValue']) : null;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.xs),
      child: AppPanel(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    item['deviceModel']?.toString() ?? '—',
                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 15),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _statusColor(status).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(
                    _statusLabel(status),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: _statusColor(status),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              [
                if (customer != null) customer['name']?.toString(),
                if (item['imei'] != null && item['imei'].toString().isNotEmpty) 'IMEI ${item['imei']}',
                if (item['condition'] != null) _statusLabel(item['condition'].toString()),
              ].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
              style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  'Quote ${_inr.format(quoted)}',
                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                ),
                if (finalVal != null) ...[
                  const SizedBox(width: 12),
                  Text(
                    'Final ${_inr.format(finalVal)}',
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      color: AppColors.tealDark,
                    ),
                  ),
                ],
                const Spacer(),
                Icon(Icons.chevron_right_rounded, color: AppColors.muted),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TradeInDetailSheet extends StatefulWidget {
  const _TradeInDetailSheet({required this.item, required this.onChanged});
  final Map<String, dynamic> item;
  final Future<void> Function() onChanged;

  @override
  State<_TradeInDetailSheet> createState() => _TradeInDetailSheetState();
}

class _TradeInDetailSheetState extends State<_TradeInDetailSheet> {
  bool busy = false;
  late Map<String, dynamic> item = Map<String, dynamic>.from(widget.item);

  String get id => item['id']?.toString() ?? '';
  String get status => item['status']?.toString() ?? '';

  List<String> get nextStatuses => _statusFlow[status] ?? const [];

  bool get canConvert => status == 'ACCEPTED' || status == 'RECEIVED';

  Future<void> _updateStatus(String next, {double? finalValue}) async {
    setState(() => busy = true);
    try {
      final api = context.read<AuthState>().api;
      final body = <String, dynamic>{'status': next};
      if (finalValue != null) body['finalValue'] = finalValue;
      final raw = await api.patch('/trade-in/$id/status', body: body);
      if (raw is Map) setState(() => item = asStringKeyedMap(raw));
      if (mounted) showSuccessToast(context, 'Status → ${_statusLabel(next)}');
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _convert() async {
    final skuCtrl = TextEditingController();
    final priceCtrl = TextEditingController(
      text: asDouble(item['finalValue'] ?? item['quotedValue']) > 0
          ? (asDouble(item['finalValue'] ?? item['quotedValue']) * 1.2).toStringAsFixed(0)
          : '',
    );

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Convert to inventory'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: skuCtrl,
              decoration: const InputDecoration(labelText: 'SKU (optional)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: priceCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Sale price (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Convert')),
        ],
      ),
    );

    if (ok != true || !mounted) {
      skuCtrl.dispose();
      priceCtrl.dispose();
      return;
    }

    setState(() => busy = true);
    try {
      final api = context.read<AuthState>().api;
      final body = <String, dynamic>{};
      if (skuCtrl.text.trim().isNotEmpty) body['sku'] = skuCtrl.text.trim();
      final price = double.tryParse(priceCtrl.text.trim());
      if (price != null && price > 0) body['salePrice'] = price;

      skuCtrl.dispose();
      priceCtrl.dispose();

      final raw = await api.post('/trade-in/$id/convert-to-inventory', body: body);
      if (raw is Map) setState(() => item = asStringKeyedMap(raw));
      if (!mounted) return;
      final product = item['product'];
      final sku = product is Map ? product['sku']?.toString() : null;
      showSuccessToast(context, sku != null ? 'Added to inventory · SKU $sku' : 'Converted to inventory');
      await widget.onChanged();
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _promptFinalValue(String next) async {
    final ctrl = TextEditingController(
      text: item['finalValue'] != null
          ? asDouble(item['finalValue']).toStringAsFixed(2)
          : asDouble(item['quotedValue']).toStringAsFixed(2),
    );
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Move to ${_statusLabel(next)}'),
        content: TextField(
          controller: ctrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'Final value (optional)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Update')),
        ],
      ),
    );
    if (ok != true || !mounted) {
      ctrl.dispose();
      return;
    }
    final val = double.tryParse(ctrl.text.trim());
    ctrl.dispose();
    await _updateStatus(next, finalValue: val);
  }

  @override
  Widget build(BuildContext context) {
    final customer = item['customer'] is Map ? asStringKeyedMap(item['customer']) : null;
    final updated = item['updatedAt']?.toString();
    final d = updated != null ? DateTime.tryParse(updated) : null;

    return Padding(
      padding: EdgeInsets.only(
        left: AppSpace.md,
        right: AppSpace.md,
        bottom: MediaQuery.viewInsetsOf(context).bottom + AppSpace.lg,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              item['deviceModel']?.toString() ?? 'Trade-in',
              style: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              _statusLabel(status),
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                color: _statusColor(status),
              ),
            ),
            if (d != null)
              Text(
                'Updated ${_day.format(d.toLocal())}',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
              ),
            const SizedBox(height: AppSpace.md),
            _DetailRow('Customer', customer?['name']?.toString() ?? 'Walk-in'),
            if (customer?['phone'] != null) _DetailRow('Phone', customer!['phone'].toString()),
            if (item['imei'] != null && item['imei'].toString().isNotEmpty)
              _DetailRow('IMEI', item['imei'].toString()),
            _DetailRow('Condition', _statusLabel(item['condition']?.toString() ?? '')),
            _DetailRow('Quoted', _inr.format(asDouble(item['quotedValue']))),
            if (item['finalValue'] != null)
              _DetailRow('Final', _inr.format(asDouble(item['finalValue']))),
            if (item['notes'] != null && item['notes'].toString().isNotEmpty)
              _DetailRow('Notes', item['notes'].toString()),
            if (item['missingFields'] is List && (item['missingFields'] as List).isNotEmpty) ...[
              const SizedBox(height: AppSpace.sm),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.warn.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  border: Border.all(color: AppColors.warn.withValues(alpha: 0.2)),
                ),
                child: Text(
                  'Missing: ${(item['missingFields'] as List).map((e) => e.toString()).join(', ')}',
                  style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.warn),
                ),
              ),
            ],
            if (busy) ...[
              const SizedBox(height: AppSpace.md),
              const LinearProgressIndicator(),
            ],
            if (nextStatuses.isNotEmpty) ...[
              const SizedBox(height: AppSpace.md),
              Text(
                'Update status',
                style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, color: AppColors.muted),
              ),
              const SizedBox(height: AppSpace.xs),
              Wrap(
                spacing: AppSpace.xs,
                runSpacing: AppSpace.xs,
                children: [
                  for (final next in nextStatuses)
                    ActionChip(
                      label: Text(_statusLabel(next)),
                      onPressed: busy
                          ? null
                          : () async {
                              if (next == 'ACCEPTED' || next == 'RECEIVED') {
                                await _promptFinalValue(next);
                              } else {
                                await _updateStatus(next);
                              }
                            },
                    ),
                ],
              ),
            ],
            if (canConvert) ...[
              const SizedBox(height: AppSpace.md),
              FilledButton.icon(
                onPressed: busy ? null : _convert,
                icon: const Icon(Icons.inventory_2_outlined),
                label: const Text('Convert to inventory'),
              ),
            ],
            if (item['product'] is Map) ...[
              const SizedBox(height: AppSpace.sm),
              AppPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Inventory product',
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.muted),
                    ),
                    Text(
                      '${asStringKeyedMap(item['product'])['name']} · SKU ${asStringKeyedMap(item['product'])['sku']}',
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88,
            child: Text(label, style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted)),
          ),
          Expanded(
            child: Text(value, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
