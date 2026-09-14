import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../l10n/app_strings.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_loader.dart';
import '../theme/app_ui.dart';
import 'stock_in_screen.dart';

const _fieldLabels = {
  'supplier': 'Supplier',
  'invoiceNumber': 'Invoice #',
  'items': 'Items',
  'serials': 'Serials',
};

class StockDraftsScreen extends StatefulWidget {
  const StockDraftsScreen({super.key});

  @override
  State<StockDraftsScreen> createState() => _StockDraftsScreenState();
}

class _StockDraftsScreenState extends State<StockDraftsScreen> {
  List<Map<String, dynamic>> drafts = [];
  bool loading = true;
  String? error;
  String? success;

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
      final raw = await api.get('/scan/drafts');
      final list = raw is List ? raw : <dynamic>[];
      setState(() {
        drafts = list.whereType<Map>().map(asStringKeyedMap).toList();
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _discard(String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard draft?'),
        content: const Text(
          'This only removes the unfinished stock-in draft. Confirmed stock is not changed.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final api = context.read<AuthState>().api;
      await api.delete('/scan/drafts/$id');
      setState(() => success = 'Draft discarded.');
      await _load();
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  Future<void> _resume(String id) async {
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/scan/drafts/$id');
      final draft = asStringKeyedMap(raw);
      final missing = (draft['missingFields'] is List)
          ? (draft['missingFields'] as List).map((e) => e.toString()).toList()
          : <String>[];
      if (missing.contains('items')) {
        setState(() => error = 'This draft has no line items. Parse an invoice on Stock-in or discard it.');
        return;
      }
      final preview = draft['previewJson'] is Map
          ? asStringKeyedMap(draft['previewJson'])
          : <String, dynamic>{};
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => StockInScreen(
            resumeDraftId: draft['id']?.toString(),
            resumePreview: {
              ...preview,
              'supplierName': draft['supplierName'] ?? preview['supplierName'],
              'invoiceNumber': draft['invoiceNumber'] ?? preview['invoiceNumber'],
              'invoiceDate': draft['invoiceDate'] ?? preview['invoiceDate'],
              'gstin': draft['gstin'] ?? preview['gstin'],
              'notes': draft['notes'] ?? preview['notes'],
            },
          ),
        ),
      );
      await _load();
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(context.watch<AppStrings>().t('stock_drafts')),
        actions: [
          IconButton(onPressed: loading ? null : _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: loading
          ? const AppLoader()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: AppSpace.page,
                children: [
                  if (error != null)
                    AppPanel(child: Text(error!, style: TextStyle(color: AppColors.danger))),
                  if (success != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: AppPanel(
                        child: Text(success!, style: TextStyle(color: AppColors.teal)),
                      ),
                    ),
                  if (drafts.isEmpty)
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'No open drafts',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'On Stock-in, use Save draft after parsing to pause mid-enrichment.',
                            style: GoogleFonts.plusJakartaSans(color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                  if (drafts.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '${drafts.length} draft${drafts.length == 1 ? '' : 's'} waiting to confirm',
                        style: GoogleFonts.plusJakartaSans(color: AppColors.muted, fontSize: 13),
                      ),
                    ),
                  ...drafts.map((d) {
                    final preview =
                        d['previewJson'] is Map ? asStringKeyedMap(d['previewJson']) : <String, dynamic>{};
                    final lineCount = d['lineCount'] is num
                        ? (d['lineCount'] as num).toInt()
                        : (preview['lines'] is List ? (preview['lines'] as List).length : 0);
                    final missing = (d['missingFields'] is List)
                        ? (d['missingFields'] as List).map((e) => e.toString()).toList()
                        : <String>[];
                    final needsSerials =
                        d['needsSerials'] is num ? (d['needsSerials'] as num).toInt() : 0;
                    final unmatched = d['unmatched'] is num ? (d['unmatched'] as num).toInt() : 0;
                    final canResume = !missing.contains('items');
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: AppPanel(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              '${d['supplierName'] ?? 'Supplier'} · ${d['invoiceNumber'] ?? 'No invoice #'}',
                              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
                            ),
                            Text(
                              '${d['invoiceDate'] ?? '—'} · ${d['status']} · $lineCount lines'
                              '${d['gstin'] != null ? ' · ${d['gstin']}' : ''}',
                              style: TextStyle(fontSize: 12, color: AppColors.muted),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                if (missing.isEmpty)
                                  Chip(
                                    label: const Text('Ready to resume', style: TextStyle(fontSize: 11)),
                                    backgroundColor: AppColors.teal.withValues(alpha: 0.12),
                                    side: BorderSide.none,
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                  ),
                                ...missing.map(
                                  (f) => Chip(
                                    label: Text(
                                      _fieldLabels[f] ?? f,
                                      style: const TextStyle(fontSize: 11),
                                    ),
                                    backgroundColor: Colors.amber.shade50,
                                    side: BorderSide(color: Colors.amber.shade200),
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                  ),
                                ),
                                if (needsSerials > 0)
                                  Chip(
                                    label: Text(
                                      '$needsSerials need serials',
                                      style: const TextStyle(fontSize: 11),
                                    ),
                                    backgroundColor: Colors.orange.shade50,
                                    side: BorderSide(color: Colors.orange.shade200),
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                  ),
                                if (unmatched > 0)
                                  Chip(
                                    label: Text(
                                      '$unmatched unmatched',
                                      style: const TextStyle(fontSize: 11),
                                    ),
                                    visualDensity: VisualDensity.compact,
                                    padding: EdgeInsets.zero,
                                  ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: FilledButton(
                                    onPressed: canResume ? () => _resume(d['id']?.toString() ?? '') : null,
                                    child: const Text('Resume'),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: () => _discard(d['id']?.toString() ?? ''),
                                    child: const Text('Discard'),
                                  ),
                                ),
                              ],
                            ),
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
