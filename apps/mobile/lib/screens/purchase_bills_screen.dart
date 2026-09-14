import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../l10n/app_strings.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_loader.dart';
import '../widgets/document_viewer.dart';
import '../theme/app_ui.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');

class PurchaseBillsScreen extends StatefulWidget {
  const PurchaseBillsScreen({super.key});

  @override
  State<PurchaseBillsScreen> createState() => _PurchaseBillsScreenState();
}

class _PurchaseBillsScreenState extends State<PurchaseBillsScreen> {
  List<Map<String, dynamic>> bills = [];
  List<Map<String, dynamic>> users = [];
  List<Map<String, dynamic>> suppliers = [];
  bool loading = true;
  String? error;
  String searchQ = '';
  String debouncedQ = '';
  String supplierId = '';
  String dateFrom = '';
  String dateTo = '';
  String createdByUserId = '';
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _loadUsers();
    _loadSuppliers();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _loadUsers() async {
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/users');
      final list = raw is List ? raw : <dynamic>[];
      if (!mounted) return;
      setState(() {
        users = list.whereType<Map>().map(asStringKeyedMap).toList();
      });
    } catch (_) {}
  }

  Future<void> _loadSuppliers() async {
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/suppliers');
      final list = raw is List ? raw : <dynamic>[];
      if (!mounted) return;
      setState(() {
        suppliers = list.whereType<Map>().map(asStringKeyedMap).toList();
      });
    } catch (_) {}
  }

  void _onSearchChanged(String v) {
    setState(() => searchQ = v);
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      setState(() => debouncedQ = v.trim());
      _load();
    });
  }

  String _query() {
    final params = <String, String>{};
    if (debouncedQ.isNotEmpty) params['q'] = debouncedQ;
    if (supplierId.trim().isNotEmpty) params['supplierId'] = supplierId.trim();
    if (dateFrom.isNotEmpty) params['dateFrom'] = dateFrom;
    if (dateTo.isNotEmpty) params['dateTo'] = dateTo;
    if (createdByUserId.isNotEmpty) params['createdByUserId'] = createdByUserId;
    if (params.isEmpty) return '';
    return '?${params.entries.map((e) => '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}').join('&')}';
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/purchase-bills${_query()}');
      final list = raw is List
          ? raw
          : (raw is Map && raw['items'] is List)
              ? raw['items'] as List
              : <dynamic>[];
      setState(() {
        bills = list.whereType<Map>().map(asStringKeyedMap).toList();
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _openFilters() async {
    var selectedSupplier = supplierId;
    final fromCtrl = TextEditingController(text: dateFrom);
    final toCtrl = TextEditingController(text: dateTo);
    var selectedUser = createdByUserId;

    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: AppSpace.md,
            right: AppSpace.md,
            top: AppSpace.md,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + AppSpace.md,
          ),
          child: StatefulBuilder(
            builder: (context, setModalState) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Filter bills', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 18)),
                  const SizedBox(height: AppSpace.sm),
                  DropdownButtonFormField<String>(
                    value: selectedSupplier,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Supplier'),
                    items: [
                      const DropdownMenuItem<String>(value: '', child: Text('All suppliers')),
                      ...suppliers.map(
                        (s) => DropdownMenuItem<String>(
                          value: s['id']?.toString() ?? '',
                          child: Text(
                            [
                              s['name']?.toString() ?? '',
                              if ((s['gstin']?.toString() ?? '').isNotEmpty) s['gstin'].toString(),
                            ].join(' · '),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: (v) => setModalState(() => selectedSupplier = v ?? ''),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  TextField(
                    controller: fromCtrl,
                    decoration: const InputDecoration(labelText: 'From date (YYYY-MM-DD)'),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  TextField(
                    controller: toCtrl,
                    decoration: const InputDecoration(labelText: 'To date (YYYY-MM-DD)'),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  DropdownButtonFormField<String>(
                    value: selectedUser,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Created by'),
                    items: [
                      const DropdownMenuItem<String>(value: '', child: Text('All users')),
                      ...users.map(
                        (u) => DropdownMenuItem<String>(
                          value: u['id']?.toString() ?? '',
                          child: Text(u['name']?.toString() ?? ''),
                        ),
                      ),
                    ],
                    onChanged: (v) => setModalState(() => selectedUser = v ?? ''),
                  ),
                  const SizedBox(height: AppSpace.md),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () {
                            fromCtrl.clear();
                            toCtrl.clear();
                            setModalState(() {
                              selectedSupplier = '';
                              selectedUser = '';
                            });
                          },
                          child: const Text('Clear'),
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(
                        child: FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Apply'),
                        ),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        );
      },
    );

    if (applied == true && mounted) {
      setState(() {
        supplierId = selectedSupplier;
        dateFrom = fromCtrl.text.trim();
        dateTo = toCtrl.text.trim();
        createdByUserId = selectedUser;
      });
      await _load();
    }
    fromCtrl.dispose();
    toCtrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasFilters = supplierId.trim().isNotEmpty ||
        dateFrom.isNotEmpty ||
        dateTo.isNotEmpty ||
        createdByUserId.isNotEmpty;
    String? supplierLabel;
    for (final s in suppliers) {
      if (s['id']?.toString() == supplierId) {
        supplierLabel = s['name']?.toString();
        break;
      }
    }

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(context.watch<AppStrings>().t('purchase_bills')),
        actions: [
          IconButton(
            tooltip: 'Filter',
            onPressed: _openFilters,
            icon: Badge(
              isLabelVisible: hasFilters,
              smallSize: 8,
              child: const Icon(Icons.filter_list_rounded),
            ),
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
                  AppPanel(
                    child: TextField(
                      decoration: const InputDecoration(
                        labelText: 'Search invoice / GSTIN / product',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: _onSearchChanged,
                    ),
                  ),
                  AppSpace.itemGap,
                  if (hasFilters || debouncedQ.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(
                        [
                          if (debouncedQ.isNotEmpty) 'Search: $debouncedQ',
                          if (supplierLabel != null && supplierLabel.isNotEmpty) 'Supplier: $supplierLabel',
                          if (dateFrom.isNotEmpty || dateTo.isNotEmpty)
                            'Dates: ${dateFrom.isEmpty ? '…' : dateFrom} – ${dateTo.isEmpty ? '…' : dateTo}',
                          if (createdByUserId.isNotEmpty)
                            'Created by: ${users.firstWhere((u) => u['id'] == createdByUserId, orElse: () => <String, dynamic>{})['name'] ?? createdByUserId}',
                        ].join(' · '),
                        style: TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                    ),
                  if (error != null)
                    AppPanel(child: Text(error!, style: TextStyle(color: AppColors.danger))),
                  if (bills.isEmpty)
                    AppPanel(
                      child: Text(
                        hasFilters || debouncedQ.isNotEmpty
                            ? 'No bills match these filters.'
                            : 'No bills yet. Confirm stock-in with an invoice number to group products.',
                        style: GoogleFonts.plusJakartaSans(color: AppColors.muted),
                      ),
                    ),
                  ...bills.map((b) {
                    final supplier = b['supplier'] is Map ? asStringKeyedMap(b['supplier']) : null;
                    final createdBy = b['createdBy'] is Map ? asStringKeyedMap(b['createdBy']) : null;
                    final count = b['_count'] is Map ? asStringKeyedMap(b['_count'])['lines'] : null;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: AppPanel(
                        child: ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            'Inv ${b['invoiceNumber']}',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
                          ),
                          subtitle: Text(
                            '${supplier?['name'] ?? b['supplierName'] ?? 'Supplier'} · '
                            '${count ?? '?'} products · ${b['status']}\n'
                            'Paid ${_inr.format(asDouble(b['paidAmount']))} / ${_inr.format(asDouble(b['totalAmount']))}'
                            '${createdBy?['name'] != null ? '\nBy ${createdBy!['name']}' : ''}',
                          ),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => PurchaseBillDetailScreen(billId: b['id']!.toString()),
                              ),
                            );
                          },
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

class PurchaseBillDetailScreen extends StatefulWidget {
  const PurchaseBillDetailScreen({super.key, required this.billId});

  final String billId;

  @override
  State<PurchaseBillDetailScreen> createState() => _PurchaseBillDetailScreenState();
}

class _PurchaseBillDetailScreenState extends State<PurchaseBillDetailScreen> {
  Map<String, dynamic>? bill;
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
      final raw = await api.get('/purchase-bills/${widget.billId}');
      setState(() {
        bill = asStringKeyedMap(raw);
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _attach() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'txt'],
    );
    if (result == null || result.files.isEmpty || result.files.first.path == null) return;
    try {
      setState(() {
        error = null;
        success = null;
      });
      if (!mounted) return;
      final api = context.read<AuthState>().api;
      await api.uploadFile(
        '/purchase-bills/${widget.billId}/attach',
        filePath: result.files.first.path!,
        filename: result.files.first.name,
      );
      if (!mounted) return;
      setState(() => success = 'Bill file attached.');
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = context.watch<AuthState>().api;
    final lines = bill?['lines'] is List ? bill!['lines'] as List : const [];
    final supplier = bill?['supplier'] is Map ? asStringKeyedMap(bill!['supplier']) : null;
    final createdBy = bill?['createdBy'] is Map ? asStringKeyedMap(bill!['createdBy']) : null;
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(title: Text('Inv ${bill?['invoiceNumber'] ?? ''}')),
      body: loading
          ? const AppLoader()
          : ListView(
              padding: AppSpace.page,
              children: [
                if (error != null)
                  AppPanel(child: Text(error!, style: const TextStyle(color: AppColors.danger))),
                if (success != null)
                  AppPanel(child: Text(success!, style: TextStyle(color: AppColors.tealDark))),
                AppPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        supplier?['name']?.toString() ?? bill?['supplierName']?.toString() ?? 'Supplier',
                        style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 16),
                      ),
                      Text(
                        '${bill?['status']} · due ${_inr.format(asDouble(bill?['totalAmount']) - asDouble(bill?['paidAmount']))}',
                        style: TextStyle(color: AppColors.muted),
                      ),
                      if (createdBy?['name'] != null)
                        Text('Created by ${createdBy!['name']}', style: TextStyle(color: AppColors.muted, fontSize: 12)),
                      const SizedBox(height: 8),
                      if (bill?['billImagePath'] != null) ...[
                        DocumentAttachmentTile(
                          apiBaseUrl: api.baseUrl,
                          path: bill?['billImagePath']?.toString(),
                          mimeType: bill?['billImageMime']?.toString(),
                          fileName: bill?['billImageName']?.toString() ?? 'Bill',
                        ),
                        const SizedBox(height: 8),
                      ],
                      OutlinedButton.icon(
                        onPressed: _attach,
                        icon: const Icon(Icons.attach_file),
                        label: const Text('Attach / replace bill image'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Text('Products on this invoice', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                ...lines.whereType<Map>().map((raw) {
                  final l = asStringKeyedMap(raw);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l['productName']?.toString() ?? '', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                          Text(
                            '${l['sku'] ?? ''} · qty ${l['quantity']} · ${_inr.format(asDouble(l['unitCost']))} → ${_inr.format(asDouble(l['lineTotal']))}',
                            style: TextStyle(fontSize: 12, color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
                Text(
                  'Total ${_inr.format(asDouble(bill?['totalAmount']))} · Paid ${_inr.format(asDouble(bill?['paidAmount']))}',
                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                ),
              ],
            ),
    );
  }
}
