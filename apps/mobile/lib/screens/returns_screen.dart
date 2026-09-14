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
import '../widgets/app_toast.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');

class ReturnsScreen extends StatefulWidget {
  const ReturnsScreen({super.key});

  @override
  State<ReturnsScreen> createState() => _ReturnsScreenState();
}

class _ReturnsScreenState extends State<ReturnsScreen> {
  List<Map<String, dynamic>> invoices = [];
  String? invoiceId;
  Map<String, dynamic>? invoice;
  final selected = <String, double>{};
  final notesCtrl = TextEditingController();
  bool loading = true;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _loadInvoices();
  }

  @override
  void dispose() {
    notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadInvoices() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/invoices', query: {'status': 'FINALIZED', 'pageSize': '100'});
      final items = asItemList(raw);
      setState(() {
        invoices = items.whereType<Map>().map((e) => asStringKeyedMap(e)).toList();
        if (invoices.isNotEmpty) {
          invoiceId = invoices.first['id']?.toString();
        }
        loading = false;
      });
      if (invoiceId != null) await _loadInvoice(invoiceId!);
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _loadInvoice(String id) async {
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/invoices/$id');
      final map = asStringKeyedMap(raw);
      final lines = map['lines'];
      selected.clear();
      if (lines is List) {
        for (final l in lines.whereType<Map>()) {
          final m = asStringKeyedMap(l);
          final lid = m['id']?.toString() ?? '';
          if (lid.isNotEmpty) selected[lid] = 0;
        }
      }
      setState(() {
        invoice = map;
        invoiceId = id;
        error = null;
      });
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  Future<void> _submit() async {
    final lines = selected.entries
        .where((e) => e.value > 0)
        .map((e) => {'invoiceLineId': e.key, 'quantity': e.value})
        .toList();
    if (invoiceId == null || lines.isEmpty) {
      setState(() => error = 'Select at least one line qty to return');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      await api.post('/invoices/returns', body: {
        'originalInvoiceId': invoiceId,
        'lines': lines,
        if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
      });
      if (!mounted) return;
      showSuccessToast(context, 'Credit note created · stock restored');
      notesCtrl.clear();
      await _loadInvoice(invoiceId!);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lines = (invoice?['lines'] is List) ? invoice!['lines'] as List : const [];
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(title: Text(context.watch<AppStrings>().t('returns_title'))),
      body: loading
          ? const AppLoader()
          : ListView(
              padding: AppSpace.page,
              children: [
                if (error != null)
                  AppPanel(child: Text(error!, style: const TextStyle(color: AppColors.danger))),
                DropdownButtonFormField<String>(
                  value: invoiceId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Original invoice'),
                  items: invoices
                      .map(
                        (i) => DropdownMenuItem(
                          value: i['id']?.toString(),
                          child: Text(
                            '${i['invoiceNumber']} · ${_inr.format(asDouble(i['grandTotal']))}',
                            overflow: TextOverflow.ellipsis,
                            maxLines: 1,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (v) {
                    if (v != null) {
                      _loadInvoice(v);
                    }
                  },
                ),
                const SizedBox(height: 12),
                Text('Return lines', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                ...lines.whereType<Map>().map((raw) {
                  final l = asStringKeyedMap(raw);
                  final id = l['id']?.toString() ?? '';
                  final maxQty = asDouble(l['quantity']);
                  final qty = selected[id] ?? 0;
                  return AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(l['productName']?.toString() ?? '', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                        Text('Max $maxQty · ${_inr.format(asDouble(l['total']))}', style: TextStyle(color: AppColors.muted)),
                        Row(
                          children: [
                            IconButton(
                              onPressed: () => setState(() => selected[id] = (qty - 1).clamp(0, maxQty)),
                              icon: const Icon(Icons.remove_circle_outline),
                            ),
                            Text(qty.toStringAsFixed(0), style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                            IconButton(
                              onPressed: () => setState(() => selected[id] = (qty + 1).clamp(0, maxQty)),
                              icon: const Icon(Icons.add_circle_outline),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                }),
                TextField(controller: notesCtrl, decoration: const InputDecoration(labelText: 'Notes')),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: saving ? null : _submit,
                  child: Text(saving ? 'Saving…' : 'Create credit note'),
                ),
              ],
            ),
    );
  }
}
