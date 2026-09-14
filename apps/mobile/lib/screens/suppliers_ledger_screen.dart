import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../l10n/app_strings.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_loader.dart';
import '../widgets/document_viewer.dart';
import '../theme/app_ui.dart';
import '../utils/report_export.dart';
import '../widgets/app_toast.dart';
import 'app_settings_screen.dart';
import 'purchase_bills_screen.dart';
import 'supplier_form_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');

Map<String, dynamic> _normalizePayablesPayload(dynamic raw) {
  if (raw is Map) {
    final m = asStringKeyedMap(raw);
    if (m['suppliers'] is List || m['topSuppliers'] is List || m['items'] is List) return m;
  }
  if (raw is! List) return <String, dynamic>{};
  final items = raw.whereType<Map>().map(asStringKeyedMap).toList();
  final total = items.fold<double>(0, (s, r) => s + asDouble(r['outstanding']));
  final overdue = items.fold<int>(0, (s, r) => s + asInt(r['overdueCount']));
  return {
    'totalOutstanding': total,
    'overdueCount': overdue,
    'suppliers': items,
  };
}

Map<String, dynamic> _summaryOf(Map<String, dynamic> row) {
  final raw = row['summary'];
  if (raw is Map) return asStringKeyedMap(raw);
  return {
    'pendingPayable': asDouble(row['outstandingBalance']),
    'clearedPayments': 0.0,
    'paymentCount': 0,
    'billCount': 0,
    'openBillCount': 0,
    'paidBillCount': 0,
    'totalBilled': 0.0,
  };
}

String _fmtDate(dynamic v) {
  if (v == null) return '—';
  final d = DateTime.tryParse(v.toString());
  if (d == null) return v.toString();
  return DateFormat('dd MMM yyyy').format(d.toLocal());
}

Color _statusColor(String status) {
  switch (status.toUpperCase()) {
    case 'PAID':
      return AppColors.tealDark;
    case 'PARTIALLY_PAID':
      return const Color(0xFFB45309);
    case 'CANCELLED':
      return AppColors.muted;
    default:
      return AppColors.danger;
  }
}

class SuppliersLedgerScreen extends StatefulWidget {
  const SuppliersLedgerScreen({super.key});

  @override
  State<SuppliersLedgerScreen> createState() => _SuppliersLedgerScreenState();
}

class _SuppliersLedgerScreenState extends State<SuppliersLedgerScreen> {
  List<Map<String, dynamic>> suppliers = [];
  bool loading = true;
  String? error;
  String query = '';
  String debouncedQuery = '';
  bool dueOnly = false;
  bool filtersOpen = false;
  Timer? _debounce;

  Map<String, dynamic>? _aging;
  bool _agingLoading = false;

  @override
  void initState() {
    super.initState();
    _load();
    _loadAging();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _onQueryChanged(String v) {
    setState(() => query = v);
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      setState(() => debouncedQuery = v.trim());
      _load();
    });
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final params = <String, String>{
        'sort': 'pending',
        if (debouncedQuery.isNotEmpty) 'q': debouncedQuery,
        if (dueOnly) 'outstanding': 'due',
      };
      final qs = params.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
      final raw = await api.get('/suppliers?$qs');
      final list = raw is List ? raw : <dynamic>[];
      setState(() {
        suppliers = list.whereType<Map>().map(asStringKeyedMap).toList();
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _loadAging() async {
    if (mounted) setState(() => _agingLoading = true);
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/suppliers/aging/report');
      if (!mounted) return;
      final normalized = _normalizePayablesPayload(raw);
      if (normalized.isNotEmpty) {
        setState(() => _aging = normalized);
      }
    } catch (_) {
      // Aging board is supplementary; swallow errors silently
    } finally {
      if (mounted) setState(() => _agingLoading = false);
    }
  }

  Future<void> _openCreateSupplier() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const SupplierFormScreen()),
    );
    if (created == true && mounted) {
      await _load();
      _loadAging();
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalPayable = suppliers.fold<double>(0, (sum, s) {
      return sum + asDouble(_summaryOf(s)['pendingPayable'] ?? s['outstandingBalance']);
    });

    return Scaffold(
      backgroundColor: AppColors.canvas,
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'suppliers_add',
        onPressed: _openCreateSupplier,
        icon: const Icon(Icons.add_business_rounded),
        label: const Text('Add supplier'),
      ),
      appBar: AppBar(
        title: Text(context.watch<AppStrings>().t('suppliers_ledger')),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Export',
            onSelected: (format) async {
              try {
                final api = context.read<AuthState>().api;
                final msg = await exportAndShareReport(
                  api,
                  path: '/reports/payables',
                  query: const {},
                  format: format,
                );
                if (context.mounted) showSuccessToast(context, msg);
              } catch (e) {
                if (context.mounted) showErrorToast(context, e.toString());
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'csv', child: Text('Export CSV')),
              PopupMenuItem(value: 'xlsx', child: Text('Export Excel')),
              PopupMenuItem(value: 'pdf', child: Text('Export PDF')),
            ],
            icon: const Icon(Icons.ios_share_rounded),
          ),
        ],
      ),
      body: loading
          ? const AppLoader()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: AppSpace.page,
                children: [
                  if (error != null) ...[
                    AppPanel(
                      child: Text(error!, style: const TextStyle(color: AppColors.danger)),
                    ),
                    AppSpace.itemGap,
                  ],
                  AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Total payable (this list)',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _inr.format(totalPayable),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: totalPayable > 0 ? AppColors.danger : AppColors.tealDark,
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          decoration: const InputDecoration(
                            labelText: 'Search name / GSTIN / phone',
                            prefixIcon: Icon(Icons.search),
                          ),
                          onChanged: _onQueryChanged,
                        ),
                        const SizedBox(height: 4),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          title: Text(
                            'Filters',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                          ),
                          subtitle: !filtersOpen && dueOnly
                              ? Text(
                                  'Only with payable',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    color: AppColors.tealDark,
                                  ),
                                )
                              : null,
                          trailing: Icon(
                            filtersOpen ? Icons.expand_less : Icons.expand_more,
                            color: AppColors.muted,
                          ),
                          onTap: () => setState(() => filtersOpen = !filtersOpen),
                        ),
                        if (filtersOpen)
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            title: const Text('Only with payable'),
                            value: dueOnly,
                            onChanged: (v) {
                              setState(() => dueOnly = v);
                              _load();
                            },
                          ),
                      ],
                    ),
                  ),
                  AppSpace.sectionGap,
                  if (_agingLoading && _aging == null)
                    const Padding(
                      padding: EdgeInsets.only(bottom: AppSpace.sm),
                      child: LinearProgressIndicator(),
                    )
                  else if (_aging != null) ...[
                    _SupplierPayablesBoard(
                      payables: _aging!,
                      onSettle: (supplierId) => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => SupplierDetailScreen(supplierId: supplierId),
                        ),
                      ),
                      onWhatsApp: (supplierId) async {
                        try {
                          final api = context.read<AuthState>().api;
                          final res = await api.post('/suppliers/$supplierId/reminders');
                          final map = asStringKeyedMap(res);
                          final wa = map['waUrl']?.toString();
                          if (wa != null && wa.isNotEmpty) {
                            await launchUrl(Uri.parse(wa), mode: LaunchMode.externalApplication);
                          }
                        } catch (_) {}
                      },
                    ),
                    AppSpace.sectionGap,
                  ],
                  if (suppliers.isEmpty)
                    AppEmptyState(
                      message: debouncedQuery.isNotEmpty || dueOnly
                          ? 'No suppliers match this search/filter.'
                          : 'No suppliers yet — tap Add supplier below.',
                      icon: Icons.local_shipping_outlined,
                    )
                  else
                    ...suppliers.map((s) {
                      final summary = _summaryOf(s);
                      final openBills = asInt(summary['openBillCount']);
                      final paidBills = asInt(summary['paidBillCount']);
                      final pending = asDouble(summary['pendingPayable'] ?? s['outstandingBalance']);
                      return Padding(
                        padding: const EdgeInsets.only(bottom: AppSpace.sm),
                        child: AppPanel(
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => SupplierDetailScreen(supplierId: s['id']!.toString()),
                              ),
                            );
                          },
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      s['name']?.toString() ?? '',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16,
                                      ),
                                    ),
                                    if (s['gstin'] != null || s['phone'] != null) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        [
                                          if (s['gstin'] != null) s['gstin'].toString(),
                                          if (s['phone'] != null) s['phone'].toString(),
                                        ].join(' · '),
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 12,
                                          color: AppColors.muted,
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 6),
                                    Text(
                                      '$openBills open · $paidBills paid bills',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        color: AppColors.muted,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    _inr.format(pending),
                                    style: GoogleFonts.plusJakartaSans(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 15,
                                      color: pending > 0.009 ? AppColors.danger : AppColors.tealDark,
                                    ),
                                  ),
                                  Text(
                                    'payable',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 11,
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(width: 4),
                              Icon(
                                Icons.chevron_right_rounded,
                                color: AppColors.muted.withValues(alpha: 0.7),
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

// ---------------------------------------------------------------------------
// Payables board (suppliers list screen)
// ---------------------------------------------------------------------------

class _SupplierPayablesBoard extends StatelessWidget {
  const _SupplierPayablesBoard({
    required this.payables,
    required this.onSettle,
    required this.onWhatsApp,
  });

  final Map<String, dynamic> payables;
  final void Function(String supplierId) onSettle;
  final void Function(String supplierId) onWhatsApp;

  @override
  Widget build(BuildContext context) {
    final total = asDouble(
      payables['totalOutstanding'] ?? payables['total'] ?? payables['outstanding'] ?? payables['totalDue'],
    );
    final overdueCount = asInt(payables['overdueCount']);

    final rawList = payables['suppliers'] ?? payables['topSuppliers'] ?? payables['top'] ?? payables['items'];
    final topSuppliers = rawList is List
        ? rawList.whereType<Map>().map(asStringKeyedMap).take(8).toList()
        : <Map<String, dynamic>>[];

    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Who you owe',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.muted,
              letterSpacing: -0.1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            _inr.format(total),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: total > 0 ? AppColors.danger : AppColors.tealDark,
            ),
          ),
          Text(
            overdueCount > 0 ? 'total payable · $overdueCount overdue bill(s)' : 'total payable',
            style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
          ),
          if (topSuppliers.isNotEmpty) ...[
            const SizedBox(height: 14),
            Divider(height: 1, color: AppColors.border),
            const SizedBox(height: 10),
            Text(
              'Top by outstanding',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.muted,
              ),
            ),
            const SizedBox(height: 8),
            ...topSuppliers.map((s) {
              final id = s['id']?.toString() ?? s['supplierId']?.toString() ?? '';
              final name = s['name']?.toString() ?? s['supplierName']?.toString() ?? '';
              final outstanding = asDouble(
                s['outstanding'] ?? s['totalDue'] ?? s['pendingPayable'] ?? s['outstandingBalance'],
              );
              final rowOverdue = asInt(s['overdueCount']);
              final phone = s['phone']?.toString();
              final gstin = s['gstin']?.toString();
              final email = s['email']?.toString();
              final msme = s['isMsme'] == true;
              final addr = [
                s['address'],
                s['addressLine2'],
                s['city'],
                s['pincode'],
              ].where((x) => x != null && x.toString().trim().isNotEmpty).join(', ');
              final meta = [
                if (phone != null && phone.isNotEmpty) phone,
                if (gstin != null && gstin.isNotEmpty) gstin,
                if (email != null && email.isNotEmpty) email,
                if (msme) 'MSME',
              ].join(' · ');
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (meta.isNotEmpty)
                            Text(
                              meta,
                              style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          if (addr.isNotEmpty)
                            Text(
                              addr,
                              style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          Text(
                            rowOverdue > 0
                                ? '${_inr.format(outstanding)} · $rowOverdue overdue'
                                : _inr.format(outstanding),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppColors.danger,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (id.isNotEmpty) ...[
                      IconButton(
                        tooltip: 'WhatsApp dues',
                        onPressed: () => onWhatsApp(id),
                        icon: const Icon(Icons.chat_rounded, size: 20),
                        color: const Color(0xFF128C7E),
                        visualDensity: VisualDensity.compact,
                      ),
                      TextButton(
                        onPressed: () => onSettle(id),
                        style: TextButton.styleFrom(
                          minimumSize: const Size(60, 34),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          foregroundColor: AppColors.teal,
                        ),
                        child: Text(
                          'Settle',
                          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 13),
                        ),
                      ),
                    ],
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.label,
    required this.value,
    required this.accent,
  });

  final String label;
  final String value;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: accent.withValues(alpha: 0.14)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.muted,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: accent,
            ),
          ),
        ],
      ),
    );
  }
}

class SupplierDetailScreen extends StatefulWidget {
  const SupplierDetailScreen({super.key, required this.supplierId});

  final String supplierId;

  @override
  State<SupplierDetailScreen> createState() => _SupplierDetailScreenState();
}

class _SupplierDetailScreenState extends State<SupplierDetailScreen> {
  Map<String, dynamic>? data;
  bool loading = true;
  bool saving = false;
  String? error;
  String? success;

  final amountCtrl = TextEditingController();
  final refCtrl = TextEditingController();
  final bankCtrl = TextEditingController();
  final notesCtrl = TextEditingController();
  String method = 'CHEQUE';
  String paymentDate = DateTime.now().toIso8601String().split('T').first;
  String? chequePath;
  String? chequeName;
  bool pickBills = true;
  final Map<String, TextEditingController> allocCtrls = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    amountCtrl.dispose();
    refCtrl.dispose();
    bankCtrl.dispose();
    notesCtrl.dispose();
    for (final c in allocCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _allocCtrl(String billId) {
    return allocCtrls.putIfAbsent(billId, TextEditingController.new);
  }

  List<Map<String, dynamic>> _pendingBills() {
    final bills = data?['bills'] is List ? data!['bills'] as List : const [];
    return bills
        .whereType<Map>()
        .map(asStringKeyedMap)
        .where((b) {
          final status = b['status']?.toString() ?? '';
          if (status == 'CANCELLED' || status == 'PAID') return false;
          final due = b['dueAmount'] != null
              ? asDouble(b['dueAmount'])
              : (asDouble(b['totalAmount']) - asDouble(b['paidAmount'])).clamp(0.0, double.infinity);
          return due > 0.009;
        })
        .toList();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/suppliers/${widget.supplierId}');
      setState(() {
        data = asStringKeyedMap(raw);
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _pickCheque() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    );
    if (result == null || result.files.isEmpty || result.files.first.path == null) return;
    setState(() {
      chequePath = result.files.first.path;
      chequeName = result.files.first.name;
    });
  }

  Future<void> _sendReminder() async {
    try {
      final api = context.read<AuthState>().api;
      final res = await api.post('/suppliers/${widget.supplierId}/reminders');
      final map = asStringKeyedMap(res);
      final wa = map['waUrl']?.toString();
      if (wa != null && wa.isNotEmpty) {
        await launchUrl(Uri.parse(wa), mode: LaunchMode.externalApplication);
      }
      if (mounted) {
        setState(() => success = 'Reminder logged');
        await _load();
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> _voidPayment(String paymentId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Void payment?'),
        content: const Text('Bills allocated to this payment will reopen.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Void')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final api = context.read<AuthState>().api;
      await api.post('/supplier-payments/$paymentId/void');
      if (mounted) {
        setState(() => success = 'Payment voided');
        await _load();
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> _bouncePayment(String paymentId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cheque bounced?'),
        content: const Text('This will reopen bills settled by this cheque.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Bounce')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final api = context.read<AuthState>().api;
      await api.post('/supplier-payments/$paymentId/bounce');
      if (mounted) {
        setState(() => success = 'Cheque marked bounced');
        await _load();
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> _openReceipt(String paymentId) async {
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/supplier-payments/$paymentId/receipt');
      final map = asStringKeyedMap(raw);
      final html = map['html']?.toString();
      if (html == null || html.isEmpty) throw Exception('Receipt missing');
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => HtmlViewerScreen(
            html: html,
            title: 'Payment receipt',
            fileName: 'supplier-payment-$paymentId.html',
          ),
        ),
      );
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> _pay() async {
    final amount = double.tryParse(amountCtrl.text) ?? 0;
    if (amount <= 0) {
      setState(() => error = 'Enter a valid payment amount');
      return;
    }
    if (pickBills) {
      final allocations = _pendingBills()
          .map((b) {
            final id = b['id']?.toString() ?? '';
            final amt = double.tryParse(_allocCtrl(id).text.trim()) ?? 0;
            return {'billId': id, 'amount': amt};
          })
          .where((a) => (a['billId'] as String).isNotEmpty && (a['amount'] as double) > 0.009)
          .toList();
      if (allocations.isEmpty) {
        setState(() => error = 'Enter at least one bill allocation, or switch to FIFO.');
        return;
      }
    }
    setState(() {
      saving = true;
      error = null;
      success = null;
    });
    try {
      final api = context.read<AuthState>().api;
      await _postPayment(api);
      setState(() {
        success = 'Payment recorded.';
        amountCtrl.clear();
        refCtrl.clear();
        notesCtrl.clear();
        chequePath = null;
        chequeName = null;
        for (final c in allocCtrls.values) {
          c.clear();
        }
      });
      await _load();
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _postPayment(ApiClient api) async {
    final amount = double.tryParse(amountCtrl.text) ?? 0;
    final fields = <String, String>{
      'supplierId': widget.supplierId,
      'amount': amount.toString(),
      'method': method,
      'paymentDate': paymentDate,
      if (refCtrl.text.trim().isNotEmpty) 'referenceNo': refCtrl.text.trim(),
      if (bankCtrl.text.trim().isNotEmpty) 'bankName': bankCtrl.text.trim(),
      if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
    };
    if (pickBills) {
      final allocations = _pendingBills()
          .map((b) {
            final id = b['id']?.toString() ?? '';
            final amt = double.tryParse(_allocCtrl(id).text.trim()) ?? 0;
            return {'billId': id, 'amount': amt};
          })
          .where((a) => (a['billId'] as String).isNotEmpty && (a['amount'] as double) > 0.009)
          .toList();
      if (allocations.isNotEmpty) {
        fields['allocationsJson'] = jsonEncode(allocations);
      }
    }
    if (chequePath != null && chequePath!.isNotEmpty) {
      await api.uploadFile(
        '/supplier-payments',
        filePath: chequePath!,
        filename: chequeName,
        fields: fields,
      );
    } else {
      await api.uploadFields('/supplier-payments', fields: fields);
    }
  }

  @override
  Widget build(BuildContext context) {
    final supplier = data?['supplier'] is Map ? asStringKeyedMap(data!['supplier']) : null;
    final bills = data?['bills'] is List ? data!['bills'] as List : const [];
    final payments = data?['payments'] is List ? data!['payments'] as List : const [];
    final ledger = data?['ledger'] is List ? data!['ledger'] as List : const [];
    final summary = data != null ? _summaryOf(data!) : <String, dynamic>{};
    final pending = asDouble(summary['pendingPayable'] ?? supplier?['outstandingBalance']);
    final cleared = asDouble(summary['clearedPayments']);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(title: Text(supplier?['name']?.toString() ?? context.watch<AppStrings>().t('supplier'))),
      body: loading
          ? const AppLoader()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: AppSpace.page,
                children: [
                  if (error != null) ...[
                    AppPanel(
                      child: Text(error!, style: const TextStyle(color: AppColors.danger)),
                    ),
                    AppSpace.itemGap,
                  ],
                  if (success != null) ...[
                    AppPanel(
                      child: Text(success!, style: TextStyle(color: AppColors.tealDark)),
                    ),
                    AppSpace.itemGap,
                  ],
                  if (supplier != null) ...[
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            supplier['name']?.toString() ?? '',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w800,
                              fontSize: 18,
                            ),
                          ),
                          if (supplier['gstin'] != null || supplier['phone'] != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              [
                                if (supplier['gstin'] != null) 'GSTIN ${supplier['gstin']}',
                                if (supplier['phone'] != null) supplier['phone'].toString(),
                              ].join(' · '),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              Expanded(
                                child: _MiniStat(
                                  label: context.watch<AppStrings>().t('pending_payable'),
                                  value: _inr.format(pending),
                                  accent: pending > 0 ? AppColors.danger : AppColors.tealDark,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _MiniStat(
                                  label: context.watch<AppStrings>().t('cleared_payments'),
                                  value: _inr.format(cleared),
                                  accent: AppColors.tealDark,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: _MiniStat(
                                  label: 'Bills',
                                  value:
                                      '${asInt(summary['openBillCount'])} open / ${asInt(summary['paidBillCount'])} paid',
                                  accent: AppColors.ink,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: _sendReminder,
                                  icon: const Icon(Icons.chat_rounded, size: 18),
                                  label: const Text('WA dues'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    AppSpace.sectionGap,
                  ],
                  AppPanel(
                    child: AppFormColumn(
                      children: [
                        Text(
                          context.watch<AppStrings>().t('record_payment'),
                          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 15),
                        ),
                        TextField(
                          controller: amountCtrl,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(
                            labelText: '${context.watch<AppStrings>().t('amount')} *',
                            hintText: '0.00',
                          ),
                        ),
                        DropdownButtonFormField<String>(
                          value: method,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Method'),
                          items: const [
                            DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                            DropdownMenuItem(value: 'UPI', child: Text('UPI')),
                            DropdownMenuItem(value: 'NEFT', child: Text('NEFT')),
                            DropdownMenuItem(value: 'RTGS', child: Text('RTGS')),
                            DropdownMenuItem(value: 'CHEQUE', child: Text('Cheque')),
                            DropdownMenuItem(value: 'BANK_TRANSFER', child: Text('Bank transfer')),
                            DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                          ],
                          onChanged: (v) => setState(() => method = v ?? 'CHEQUE'),
                        ),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Payment date'),
                          subtitle: Text(_fmtDate(paymentDate)),
                          trailing: const Icon(Icons.calendar_today_outlined, size: 18),
                          onTap: () async {
                            final now = DateTime.tryParse(paymentDate) ?? DateTime.now();
                            final picked = await showDatePicker(
                              context: context,
                              initialDate: now,
                              firstDate: DateTime(2020),
                              lastDate: DateTime.now().add(const Duration(days: 1)),
                            );
                            if (picked != null) {
                              setState(() {
                                paymentDate = picked.toIso8601String().split('T').first;
                              });
                            }
                          },
                        ),
                        TextField(
                          controller: refCtrl,
                          decoration: const InputDecoration(labelText: 'Cheque / UTR no.'),
                        ),
                        TextField(
                          controller: bankCtrl,
                          decoration: const InputDecoration(labelText: 'Bank'),
                        ),
                        TextField(
                          controller: notesCtrl,
                          maxLines: 2,
                          decoration: const InputDecoration(labelText: 'Notes'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _pickCheque,
                          icon: const Icon(Icons.image_outlined),
                          label: Text(
                            chequeName ?? 'Attach cheque / receipt image',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Builder(
                          builder: (context) {
                            final pendingBills = _pendingBills();
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        'Pending bills (${pendingBills.length})',
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                          color: AppColors.muted,
                                        ),
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: () => setState(() => pickBills = !pickBills),
                                      child: Text(pickBills ? 'Use FIFO' : 'Pick bills'),
                                    ),
                                  ],
                                ),
                                if (pendingBills.isEmpty)
                                  Text(
                                    'No pending bills — nothing to settle.',
                                    style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                                  )
                                else ...[
                                  Text(
                                    pickBills
                                        ? 'Enter how much of this payment goes to each bill.'
                                        : 'Payment will clear these oldest-first.',
                                    style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                                  ),
                                  const SizedBox(height: 6),
                                  ...pendingBills.map((b) {
                                    final id = b['id']?.toString() ?? '';
                                    final inv = b['invoiceNumber']?.toString() ?? id;
                                    final due = b['dueAmount'] != null
                                        ? asDouble(b['dueAmount'])
                                        : (asDouble(b['totalAmount']) - asDouble(b['paidAmount']))
                                            .clamp(0.0, double.infinity);
                                    return Padding(
                                      padding: const EdgeInsets.only(bottom: 6),
                                      child: Row(
                                        children: [
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  'Inv $inv',
                                                  style: GoogleFonts.plusJakartaSans(
                                                    fontSize: 13,
                                                    fontWeight: FontWeight.w700,
                                                  ),
                                                ),
                                                Text(
                                                  'Due ${_inr.format(due)}',
                                                  style: GoogleFonts.plusJakartaSans(
                                                    fontSize: 11,
                                                    color: AppColors.danger,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          if (pickBills) ...[
                                            TextButton(
                                              onPressed: () {
                                                _allocCtrl(id).text = due.toStringAsFixed(2);
                                                setState(() {});
                                              },
                                              child: const Text('Full'),
                                            ),
                                            SizedBox(
                                              width: 88,
                                              child: TextField(
                                                controller: _allocCtrl(id),
                                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                                decoration: const InputDecoration(
                                                  isDense: true,
                                                  hintText: '0',
                                                ),
                                              ),
                                            ),
                                          ] else
                                            Text(
                                              'Pending',
                                              style: GoogleFonts.plusJakartaSans(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                                color: AppColors.warn,
                                              ),
                                            ),
                                        ],
                                      ),
                                    );
                                  }),
                                ],
                              ],
                            );
                          },
                        ),
                        FilledButton(
                          onPressed: saving ? null : _pay,
                          child: Text(saving ? 'Saving…' : 'Save payment'),
                        ),
                      ],
                    ),
                  ),
                  AppSpace.sectionGap,
                  const AppSectionTitle('Ledger'),
                  if (ledger.isEmpty)
                    AppPanel(
                      child: Text(
                        'No ledger entries yet.',
                        style: GoogleFonts.plusJakartaSans(color: AppColors.muted),
                      ),
                    )
                  else
                    ...ledger.whereType<Map>().map((raw) {
                      final e = asStringKeyedMap(raw);
                      final isPay = e['type'] == 'PAYMENT';
                      final amount = asDouble(e['amount']);
                      return Padding(
                        padding: const EdgeInsets.only(bottom: AppSpace.sm),
                        child: AppPanel(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 36,
                                height: 36,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: (isPay ? AppColors.tealDark : AppColors.danger)
                                      .withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Icon(
                                  isPay ? Icons.south_west_rounded : Icons.north_east_rounded,
                                  size: 18,
                                  color: isPay ? AppColors.tealDark : AppColors.danger,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      e['type']?.toString() ?? '',
                                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      _fmtDate(e['entryDate']),
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        color: AppColors.muted,
                                      ),
                                    ),
                                    if (e['notes'] != null && e['notes'].toString().isNotEmpty) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        e['notes'].toString(),
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 12,
                                          color: AppColors.muted,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    '${isPay ? '−' : '+'}${_inr.format(amount)}',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontWeight: FontWeight.w800,
                                      color: isPay ? AppColors.tealDark : AppColors.danger,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    'Bal ${_inr.format(asDouble(e['balanceAfter']))}',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 11,
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                  AppSpace.sectionGap,
                  const AppSectionTitle('Purchase bills'),
                  if (bills.isEmpty)
                    AppPanel(
                      child: Text(
                        'No bills. Confirm stock-in with an invoice # to create one.',
                        style: GoogleFonts.plusJakartaSans(color: AppColors.muted),
                      ),
                    )
                  else
                    ...bills.whereType<Map>().map((raw) {
                      final b = asStringKeyedMap(raw);
                      final status = b['status']?.toString() ?? '';
                      final total = asDouble(b['totalAmount']);
                      final paid = asDouble(b['paidAmount']);
                      final due = b['dueAmount'] != null
                          ? asDouble(b['dueAmount'])
                          : (total - paid).clamp(0, double.infinity);
                      final aging = b['agingBucket']?.toString();
                      return Padding(
                        padding: const EdgeInsets.only(bottom: AppSpace.sm),
                        child: AppPanel(
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => PurchaseBillDetailScreen(billId: b['id']!.toString()),
                              ),
                            );
                          },
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      'Inv ${b['invoiceNumber']}',
                                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: _statusColor(status).withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Text(
                                      status.replaceAll('_', ' '),
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: _statusColor(status),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                '${_fmtDate(b['invoiceDate'])}'
                                '${b['dueDate'] != null ? ' · due ${_fmtDate(b['dueDate'])}' : ''}'
                                '${aging != null && aging != 'PAID' ? ' · $aging' : ''}'
                                '${b['_count'] is Map && (b['_count'] as Map)['lines'] != null ? ' · ${(b['_count'] as Map)['lines']} lines' : ''}',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  color: AppColors.muted,
                                ),
                              ),
                              if (b['billImagePath'] != null) ...[
                                const SizedBox(height: 8),
                                DocumentAttachmentTile(
                                  apiBaseUrl: context.read<AuthState>().api.baseUrl,
                                  path: b['billImagePath']?.toString(),
                                  mimeType: b['billImageMime']?.toString(),
                                  fileName: b['billImageName']?.toString() ?? 'Bill',
                                  height: 120,
                                  compact: true,
                                ),
                              ],
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      'Paid ${_inr.format(paid)} / ${_inr.format(total)}',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  if (due > 0)
                                    Text(
                                      'Due ${_inr.format(due)}',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.danger,
                                      ),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                  AppSpace.sectionGap,
                  AppSectionTitle(context.watch<AppStrings>().t('cleared_payments')),
                  if (payments.isEmpty)
                    AppPanel(
                      child: Text(
                        'No payments recorded yet.',
                        style: GoogleFonts.plusJakartaSans(color: AppColors.muted),
                      ),
                    )
                  else
                    ...payments.whereType<Map>().map((raw) {
                      final p = asStringKeyedMap(raw);
                      final paymentId = p['id']?.toString() ?? '';
                      final status = (p['status']?.toString() ?? 'POSTED').toUpperCase();
                      final isPosted = status == 'POSTED' || status.isEmpty;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: AppSpace.sm),
                        child: AppPanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      _inr.format(asDouble(p['amount'])),
                                      style: GoogleFonts.plusJakartaSans(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16,
                                        color: AppColors.tealDark,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    '${p['method'] ?? ''}${status != 'POSTED' ? ' · $status' : ''}',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _fmtDate(p['paymentDate']),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  color: AppColors.muted,
                                ),
                              ),
                              if (p['referenceNo'] != null &&
                                  p['referenceNo'].toString().isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  'Ref ${p['referenceNo']}',
                                  style: GoogleFonts.plusJakartaSans(fontSize: 12),
                                ),
                              ],
                              if (p['allocations'] is List && (p['allocations'] as List).isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  (p['allocations'] as List).whereType<Map>().map((a) {
                                    final row = asStringKeyedMap(a);
                                    final bill = row['bill'] is Map
                                        ? asStringKeyedMap(row['bill'] as Map)
                                        : <String, dynamic>{};
                                    return '${bill['invoiceNumber'] ?? '?'} (${_inr.format(asDouble(row['amount']))})';
                                  }).join(', '),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    color: AppColors.muted,
                                  ),
                                ),
                              ],
                              if (p['attachmentPath'] != null)
                                DocumentAttachmentTile(
                                  apiBaseUrl: context.read<AuthState>().api.baseUrl,
                                  path: p['attachmentPath']?.toString(),
                                  mimeType: p['attachmentMime']?.toString(),
                                  fileName: p['attachmentName']?.toString() ?? 'attachment',
                                  height: 120,
                                  compact: true,
                                ),
                              if (paymentId.isNotEmpty) ...[
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 4,
                                  children: [
                                    TextButton(
                                      onPressed: () => _openReceipt(paymentId),
                                      child: const Text('Receipt'),
                                    ),
                                    if (isPosted) ...[
                                      TextButton(
                                        onPressed: () => _voidPayment(paymentId),
                                        style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                                        child: const Text('Void'),
                                      ),
                                      if ((p['method']?.toString() ?? '') == 'CHEQUE')
                                        TextButton(
                                          onPressed: () => _bouncePayment(paymentId),
                                          style: TextButton.styleFrom(foregroundColor: AppColors.warn),
                                          child: const Text('Bounce'),
                                        ),
                                    ],
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    }),
                  if ((data?['reminders'] is List) && (data!['reminders'] as List).isNotEmpty) ...[
                    AppSpace.sectionGap,
                    AppSectionTitle('Reminder history'),
                    ...(data!['reminders'] as List).whereType<Map>().map((raw) {
                      final r = asStringKeyedMap(raw);
                      return Padding(
                        padding: const EdgeInsets.only(bottom: AppSpace.sm),
                        child: AppPanel(
                          child: Text(
                            '${r['channel'] ?? 'WHATSAPP'} · ${_fmtDate(r['createdAt'] ?? r['sentAt'])}\n'
                            '${(r['body'] ?? r['notes'] ?? '').toString()}',
                            style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                          ),
                        ),
                      );
                    }),
                  ],
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }
}
