import 'dart:async';

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
import '../widgets/app_loader.dart';
import '../widgets/app_toast.dart';
import 'customer_collect.dart';
import 'customer_detail_screen.dart';
import 'customer_form_screen.dart';
import 'suppliers_ledger_screen.dart';
import 'supplier_form_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

enum _KhataTab { customers, suppliers }

/// Desktop-parity Khata — customer receivables & supplier payables in one place.
class KhataScreen extends StatefulWidget {
  const KhataScreen({super.key, this.initialTab});

  /// `customers` | `suppliers`
  final String? initialTab;

  @override
  State<KhataScreen> createState() => _KhataScreenState();
}

class _KhataScreenState extends State<KhataScreen> {
  late _KhataTab tab = switch (widget.initialTab) {
    'suppliers' => _KhataTab.suppliers,
    _ => _KhataTab.customers,
  };

  final searchCtrl = TextEditingController();
  String query = '';
  String debouncedQuery = '';
  Timer? _debounce;

  bool loading = true;
  String? error;

  List<_CustomerKhataRow> customers = [];
  List<_SupplierKhataRow> suppliers = [];
  List<_PartyHit> searchHits = [];
  bool searching = false;

  @override
  void initState() {
    super.initState();
    searchCtrl.addListener(() => setState(() => query = searchCtrl.text));
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    searchCtrl.dispose();
    super.dispose();
  }

  void _onSearchChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 280), () {
      if (!mounted) return;
      setState(() => debouncedQuery = v.trim());
      _runPartySearch(v.trim());
    });
  }

  Future<void> _runPartySearch(String term) async {
    if (term.length < 2) {
      if (mounted) setState(() => searchHits = []);
      return;
    }
    setState(() => searching = true);
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/parties/search', query: {'q': term, 'limit': '20'});
      final map = raw is Map ? asStringKeyedMap(raw) : <String, dynamic>{};
      final list = map['parties'] is List ? map['parties'] as List : const [];
      if (!mounted) return;
      setState(() {
        searchHits = list
            .whereType<Map>()
            .map((e) => _PartyHit.fromJson(asStringKeyedMap(e)))
            .toList();
      });
    } catch (_) {
      if (mounted) setState(() => searchHits = []);
    } finally {
      if (mounted) setState(() => searching = false);
    }
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      if (tab == _KhataTab.customers) {
        final raw = await api.get('/customers/aging/report');
        final list = raw is List ? raw : const [];
        final rows = list
            .whereType<Map>()
            .map((e) => _CustomerKhataRow.fromJson(asStringKeyedMap(e)))
            .toList()
          ..sort((a, b) => b.outstanding.compareTo(a.outstanding));
        if (!mounted) return;
        setState(() => customers = rows);
      } else {
        final raw = await api.get('/suppliers/aging/report');
        final list = raw is List ? raw : const [];
        final rows = list
            .whereType<Map>()
            .map((e) => _SupplierKhataRow.fromJson(asStringKeyedMap(e)))
            .where((s) => s.supplierId != null && s.supplierId!.isNotEmpty)
            .toList()
          ..sort((a, b) => b.outstanding.compareTo(a.outstanding));
        if (!mounted) return;
        setState(() => suppliers = rows);
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _switchTab(_KhataTab next) {
    if (tab == next) return;
    setState(() => tab = next);
    _load();
  }

  List<_CustomerKhataRow> get _filteredCustomers {
    final term = debouncedQuery.toLowerCase();
    if (term.isEmpty) return customers;
    // When party search hits exist, aging list is hidden — hits are shown above.
    if (searchHits.isNotEmpty) return const [];
    return customers.where((c) => c.matches(term)).toList();
  }

  List<_SupplierKhataRow> get _filteredSuppliers {
    final term = debouncedQuery.toLowerCase();
    if (term.isEmpty) return suppliers;
    if (searchHits.isNotEmpty) return const [];
    return suppliers.where((s) => s.matches(term)).toList();
  }

  double get _totalOutstanding {
    if (tab == _KhataTab.customers) {
      return customers.fold<double>(0, (s, c) => s + c.outstanding);
    }
    return suppliers.fold<double>(0, (s, r) => s + r.outstanding);
  }

  Future<void> _export(String format) async {
    try {
      final api = context.read<AuthState>().api;
      final path = tab == _KhataTab.customers ? '/reports/receivables' : '/reports/payables';
      final msg = await exportAndShareReport(api, path: path, query: const {}, format: format);
      if (mounted) showSuccessToast(context, msg);
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    }
  }

  Future<void> _openCustomer(_CustomerKhataRow row) async {
    final id = row.customerId;
    if (id == null || id.isEmpty) return;
    final refreshed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => CustomerDetailScreen(
          customerId: id,
          initial: row.toDetailMap(),
        ),
      ),
    );
    if (refreshed == true && mounted) await _load();
  }

  Future<void> _openSupplier(_SupplierKhataRow row) async {
    final id = row.supplierId;
    if (id == null || id.isEmpty) return;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => SupplierDetailScreen(supplierId: id)),
    );
    if (mounted) await _load();
  }

  Future<void> _openPartyHit(_PartyHit hit) async {
    if (hit.type == 'CUSTOMER') {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => CustomerDetailScreen(customerId: hit.id)),
      );
    } else {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => SupplierDetailScreen(supplierId: hit.id)),
      );
    }
    if (mounted) await _load();
  }

  Future<void> _addParty() async {
    if (tab == _KhataTab.customers) {
      final ok = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => const CustomerFormScreen()),
      );
      if (ok == true && mounted) await _load();
    } else {
      final ok = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => const SupplierFormScreen()),
      );
      if (ok == true && mounted) await _load();
    }
  }

  Future<void> _collectCustomer(_CustomerKhataRow row) async {
    final id = row.customerId;
    if (id == null) return;
    await showCustomerCollectPayment(
      context,
      row.toDetailMap(),
      onCollected: _load,
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    final pad = Breakpoints.pagePadding(context);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'khata_add',
        onPressed: _addParty,
        icon: Icon(tab == _KhataTab.customers ? Icons.person_add_rounded : Icons.add_business_rounded),
        label: Text(tab == _KhataTab.customers ? strings.t('khata_add_customer') : strings.t('khata_add_supplier')),
      ),
      appBar: AppBar(
        title: Text(strings.t('khata')),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Export',
            onSelected: _export,
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'csv', child: Text('Export CSV')),
              PopupMenuItem(value: 'xlsx', child: Text('Export Excel')),
              PopupMenuItem(value: 'pdf', child: Text('Export PDF')),
            ],
            icon: const Icon(Icons.ios_share_rounded),
          ),
          IconButton(
            tooltip: strings.t('refresh'),
            onPressed: _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(pad.left, AppSpace.sm, pad.right, AppSpace.xs),
            child: SegmentedButton<_KhataTab>(
              segments: [
                ButtonSegment(
                  value: _KhataTab.customers,
                  label: Text(strings.t('khata_receivable'), style: const TextStyle(fontSize: 12)),
                  icon: const Icon(Icons.people_alt_rounded, size: 16),
                ),
                ButtonSegment(
                  value: _KhataTab.suppliers,
                  label: Text(strings.t('khata_payable'), style: const TextStyle(fontSize: 12)),
                  icon: const Icon(Icons.local_shipping_outlined, size: 16),
                ),
              ],
              selected: {tab},
              onSelectionChanged: (s) => _switchTab(s.first),
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, AppSpace.xs),
            child: TextField(
              controller: searchCtrl,
              decoration: InputDecoration(
                hintText: strings.t('khata_search_hint'),
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: searchCtrl.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear_rounded),
                        onPressed: () {
                          searchCtrl.clear();
                          setState(() {
                            debouncedQuery = '';
                            searchHits = [];
                          });
                        },
                      ),
              ),
              textInputAction: TextInputAction.search,
              onChanged: _onSearchChanged,
            ),
          ),
          if (loading) const AppLinearLoader(),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.teal,
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: EdgeInsets.fromLTRB(pad.left, AppSpace.xs, pad.right, AppSpace.xxl),
                children: [
                  if (error != null) ...[
                    AppPanel(
                      child: Text(error!, style: const TextStyle(color: AppColors.danger)),
                    ),
                    AppSpace.itemGap,
                  ],
                  AppPanel(
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                tab == _KhataTab.customers
                                    ? strings.t('khata_total_receivable')
                                    : strings.t('khata_total_payable'),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.muted,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _inr.format(_totalOutstanding),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                  color: _totalOutstanding > 0 ? AppColors.danger : AppColors.tealDark,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              strings.t('khata_parties'),
                              style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                            ),
                            Text(
                              '${tab == _KhataTab.customers ? customers.length : suppliers.length}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (debouncedQuery.length >= 2) ...[
                    AppSpace.sectionGap,
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            searching
                                ? strings.t('khata_searching')
                                : strings.t('khata_search_results').replaceAll('{n}', '${searchHits.length}'),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppColors.muted,
                            ),
                          ),
                          const SizedBox(height: 8),
                          if (searchHits.isEmpty && !searching)
                            Text(
                              strings.t('khata_no_matches'),
                              style: GoogleFonts.plusJakartaSans(color: AppColors.muted),
                            )
                          else
                            ...searchHits.map((h) {
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(h.name, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                                subtitle: Text(
                                  [
                                    h.type == 'CUSTOMER' ? 'Customer' : 'Supplier',
                                    if ((h.phone ?? '').isNotEmpty) h.phone!,
                                    if ((h.gstin ?? '').isNotEmpty) h.gstin!,
                                    if ((h.city ?? '').isNotEmpty) h.city!,
                                  ].join(' · '),
                                  style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                                ),
                                trailing: Text(
                                  _inr.format(h.balance),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontWeight: FontWeight.w800,
                                    color: h.balance > 0 ? AppColors.danger : AppColors.tealDark,
                                  ),
                                ),
                                onTap: () => _openPartyHit(h),
                              );
                            }),
                        ],
                      ),
                    ),
                  ],
                  AppSpace.sectionGap,
                  if (tab == _KhataTab.customers)
                    ..._buildCustomerList(strings)
                  else
                    ..._buildSupplierList(strings),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildCustomerList(AppStrings strings) {
    final rows = _filteredCustomers;
    if (!loading && rows.isEmpty) {
      return [
        AppEmptyState(
          icon: Icons.people_outline_rounded,
          message: debouncedQuery.isNotEmpty ? strings.t('khata_no_matches') : strings.t('khata_no_customers'),
        ),
      ];
    }
    return rows.map((c) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: AppPanel(
          padding: EdgeInsets.zero,
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            leading: CircleAvatar(
              backgroundColor: AppColors.tealSoft,
              child: Text(
                c.name.isNotEmpty ? c.name[0].toUpperCase() : '?',
                style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: AppColors.tealDark),
              ),
            ),
            title: Text(c.name, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if ((c.phone ?? '').isNotEmpty || (c.gstin ?? '').isNotEmpty)
                  Text(
                    [if ((c.phone ?? '').isNotEmpty) c.phone!, if ((c.gstin ?? '').isNotEmpty) c.gstin!].join(' · '),
                    style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                  ),
                if ((c.address ?? '').isNotEmpty)
                  Text(
                    c.address!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                  ),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if ((c.segment ?? '').isNotEmpty)
                      _TagChip(label: c.segment!),
                    if (c.whatsappOptIn) _TagChip(label: 'WA', color: AppColors.tealDark),
                    if ((c.loyaltyPoints ?? 0) > 0) _TagChip(label: '${c.loyaltyPoints} pts'),
                    if ((c.creditLimit ?? 0) > 0)
                      _TagChip(label: 'Limit ${_inr.format(c.creditLimit!)}'),
                  ],
                ),
              ],
            ),
            trailing: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  _inr.format(c.outstanding),
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    color: c.outstanding > 0 ? AppColors.danger : AppColors.tealDark,
                  ),
                ),
                if (c.outstanding > 0)
                  TextButton(
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      minimumSize: const Size(0, 28),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                    ),
                    onPressed: () => _collectCustomer(c),
                    child: const Text('Collect'),
                  ),
              ],
            ),
            isThreeLine: false,
            onTap: () => _openCustomer(c),
          ),
        ),
      );
    }).toList();
  }

  List<Widget> _buildSupplierList(AppStrings strings) {
    final rows = _filteredSuppliers;
    if (!loading && rows.isEmpty) {
      return [
        AppEmptyState(
          icon: Icons.local_shipping_outlined,
          message: debouncedQuery.isNotEmpty ? strings.t('khata_no_matches') : strings.t('khata_no_suppliers'),
        ),
      ];
    }
    return rows.map((s) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: AppPanel(
          padding: EdgeInsets.zero,
          onTap: () => _openSupplier(s),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            leading: CircleAvatar(
              backgroundColor: const Color(0xFFFFF7ED),
              child: Icon(Icons.storefront_rounded, color: AppColors.warn, size: 20),
            ),
            title: Row(
              children: [
                Expanded(
                  child: Text(s.name, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                ),
                if (s.isMsme) _TagChip(label: 'MSME', color: AppColors.tealDark),
              ],
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if ((s.phone ?? '').isNotEmpty || (s.gstin ?? '').isNotEmpty)
                  Text(
                    [if ((s.phone ?? '').isNotEmpty) s.phone!, if ((s.gstin ?? '').isNotEmpty) s.gstin!].join(' · '),
                    style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                  ),
                if ((s.address ?? '').isNotEmpty)
                  Text(
                    s.address!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                  ),
                if (s.billCount != null || (s.overdueCount ?? 0) > 0)
                  Text(
                    [
                      if (s.billCount != null) '${s.billCount} open bills',
                      if ((s.overdueCount ?? 0) > 0) '${s.overdueCount} overdue',
                    ].join(' · '),
                    style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.warn),
                  ),
              ],
            ),
            trailing: Text(
              _inr.format(s.outstanding),
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w800,
                color: s.outstanding > 0 ? AppColors.danger : AppColors.tealDark,
              ),
            ),
            isThreeLine: true,
          ),
        ),
      );
    }).toList();
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label, this.color});

  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: (color ?? AppColors.muted).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color ?? AppColors.muted,
        ),
      ),
    );
  }
}

class _CustomerKhataRow {
  _CustomerKhataRow({
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

  factory _CustomerKhataRow.fromJson(Map<String, dynamic> json) {
    final addr = [
      json['address'],
      json['addressLine2'],
      json['city'],
      json['stateCode'],
      json['pincode'],
    ].where((e) => (e?.toString() ?? '').trim().isNotEmpty).join(', ');
    return _CustomerKhataRow(
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

  bool matches(String term) {
    return _haystack(name, phone, email, gstin, address, segment).contains(term);
  }

  Map<String, dynamic> toDetailMap() => {
        'id': customerId,
        'name': name,
        'phone': phone,
        'email': email,
        'gstin': gstin,
        'segment': segment,
        'outstanding': outstanding,
        'outstandingBalance': outstanding,
        'creditLimit': creditLimit,
        'loyaltyPoints': loyaltyPoints,
        'whatsappOptIn': whatsappOptIn,
      };
}

class _SupplierKhataRow {
  _SupplierKhataRow({
    required this.supplierId,
    required this.name,
    required this.outstanding,
    this.phone,
    this.email,
    this.gstin,
    this.address,
    this.isMsme = false,
    this.billCount,
    this.overdueCount,
    this.advanceBalance,
  });

  final String? supplierId;
  final String name;
  final String? phone;
  final String? email;
  final String? gstin;
  final String? address;
  final double outstanding;
  final bool isMsme;
  final int? billCount;
  final int? overdueCount;
  final double? advanceBalance;

  factory _SupplierKhataRow.fromJson(Map<String, dynamic> json) {
    final addr = [
      json['address'],
      json['addressLine2'],
      json['city'],
      json['stateCode'],
      json['pincode'],
    ].where((e) => (e?.toString() ?? '').trim().isNotEmpty).join(', ');
    return _SupplierKhataRow(
      supplierId: json['supplierId']?.toString() ?? json['id']?.toString(),
      name: json['name']?.toString() ?? '—',
      phone: json['phone']?.toString(),
      email: json['email']?.toString(),
      gstin: json['gstin']?.toString(),
      address: addr.isEmpty ? null : addr,
      outstanding: asDouble(json['outstanding']),
      isMsme: json['isMsme'] == true,
      billCount: json['billCount'] == null ? null : asInt(json['billCount']),
      overdueCount: json['overdueCount'] == null ? null : asInt(json['overdueCount']),
      advanceBalance: json['advanceBalance'] == null ? null : asDouble(json['advanceBalance']),
    );
  }

  bool matches(String term) {
    return _haystack(name, phone, email, gstin, address).contains(term);
  }
}

class _PartyHit {
  _PartyHit({
    required this.id,
    required this.type,
    required this.name,
    required this.balance,
    this.phone,
    this.gstin,
    this.city,
  });

  final String id;
  final String type;
  final String name;
  final String? phone;
  final String? gstin;
  final String? city;
  final double balance;

  factory _PartyHit.fromJson(Map<String, dynamic> json) {
    return _PartyHit(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'CUSTOMER',
      name: json['name']?.toString() ?? '—',
      phone: json['phone']?.toString(),
      gstin: json['gstin']?.toString(),
      city: json['city']?.toString(),
      balance: asDouble(json['balance']),
    );
  }
}

String _haystack(String? a, String? b, String? c, String? d, String? e, [String? f]) {
  return [a, b, c, d, e, f].where((x) => (x ?? '').trim().isNotEmpty).join(' ').toLowerCase();
}
