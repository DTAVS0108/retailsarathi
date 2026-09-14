import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/app_strings.dart';
import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_loader.dart';
import '../theme/app_ui.dart';
import '../theme/theme_controller.dart';
import '../utils/report_export.dart';
import '../widgets/app_toast.dart';
import 'customer_collect.dart';
import 'customer_detail_screen.dart';
import 'customer_form_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// Mobile CRM lite — search, outstanding, call/WhatsApp.
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  final searchCtrl = TextEditingController();
  final scrollCtrl = ScrollController();
  List<Map<String, dynamic>> customers = [];
  int total = 0;
  int page = 1;
  static const int pageSize = 25;
  bool loading = true;
  bool loadingMore = false;
  String? error;
  String query = '';

  Map<String, dynamic>? _receivablesAging;
  bool _agingLoading = false;

  bool get hasMore => customers.length < total;

  @override
  void initState() {
    super.initState();
    scrollCtrl.addListener(_onScroll);
    _load(reset: true);
    _loadReceivablesAging();
  }

  @override
  void dispose() {
    scrollCtrl.removeListener(_onScroll);
    scrollCtrl.dispose();
    searchCtrl.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!scrollCtrl.hasClients || loading || loadingMore || !hasMore) return;
    final pos = scrollCtrl.position;
    if (pos.pixels >= pos.maxScrollExtent - 320) {
      _load(reset: false);
    }
  }

  Future<void> _load({bool reset = true}) async {
    if (reset) {
      if (loadingMore) return;
      setState(() {
        loading = true;
        error = null;
        page = 1;
      });
    } else {
      if (loading || loadingMore || !hasMore) return;
      setState(() => loadingMore = true);
    }

    final requestPage = reset ? 1 : page + 1;
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get(
        '/customers',
        query: {
          'page': '$requestPage',
          'pageSize': '$pageSize',
          if (query.trim().isNotEmpty) 'search': query.trim(),
        },
      );
      final map = raw is Map ? asStringKeyedMap(raw) : <String, dynamic>{};
      final list = raw is List
          ? raw
          : (map['items'] is List)
              ? map['items'] as List
              : <dynamic>[];
      final batch = list.whereType<Map>().map((e) => asStringKeyedMap(e)).toList();
      final matched = asInt(map['total'], batch.length);
      if (!mounted) return;
      setState(() {
        total = matched;
        page = requestPage;
        if (reset) {
          customers = batch;
        } else {
          final seen = customers.map((e) => e['id']?.toString()).whereType<String>().toSet();
          customers = [
            ...customers,
            ...batch.where((e) => !seen.contains(e['id']?.toString())),
          ];
        }
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (!scrollCtrl.hasClients) return;
        if (customers.length < total && scrollCtrl.position.maxScrollExtent <= 48) {
          _load(reset: false);
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (reset) error = e.toString();
      });
      if (!reset && mounted) showErrorToast(context, e.toString());
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
          loadingMore = false;
        });
      }
    }
  }

  Future<void> _loadReceivablesAging() async {
    if (mounted) setState(() => _agingLoading = true);
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/customers/aging/report');
      if (!mounted) return;
      if (raw is List) {
        final items = raw.whereType<Map>().map(asStringKeyedMap).toList();
        double bucket(String key) => items.fold<double>(0, (s, r) {
              final aging = r['aging'];
              if (aging is Map) return s + asDouble(asStringKeyedMap(aging)[key]);
              return s;
            });
        final total = items.fold<double>(0, (s, r) => s + asDouble(r['outstanding']));
        setState(() {
          _receivablesAging = {
            'totalOutstanding': total,
            'current': bucket('current'),
            'days30': bucket('days30'),
            'days60': bucket('days60'),
            'days90plus': bucket('days90plus'),
            'customers': items,
          };
        });
      } else if (raw is Map) {
        setState(() => _receivablesAging = asStringKeyedMap(raw));
      }
    } catch (_) {
      // Receivables board is supplementary; swallow errors silently
    } finally {
      if (mounted) setState(() => _agingLoading = false);
    }
  }

  void _applySearch(String value) {
    query = value.trim();
    _load(reset: true);
  }

  Future<void> _openDetail(Map<String, dynamic> c) async {
    final id = c['id']?.toString() ?? '';
    if (id.isEmpty) return;
    final refreshed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => CustomerDetailScreen(customerId: id, initial: c)),
    );
    if (refreshed == true && mounted) {
      await _load(reset: true);
      _loadReceivablesAging();
    }
  }

  Future<void> _openCreate() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const CustomerFormScreen()),
    );
    if (created == true && mounted) {
      await _load(reset: true);
      _loadReceivablesAging();
    }
  }

  Future<void> _collectPayment(Map<String, dynamic> c) async {
    await showCustomerCollectPayment(
      context,
      c,
      onCollected: () async {
        await _load(reset: true);
        _loadReceivablesAging();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    final pad = Breakpoints.pagePadding(context);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'customers_add',
        onPressed: _openCreate,
        icon: const Icon(Icons.person_add_rounded),
        label: const Text('Add customer'),
      ),
      appBar: AppBar(
        title: Text(strings.t('customers')),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Export',
            onSelected: (format) async {
              try {
                final api = context.read<AuthState>().api;
                final msg = await exportAndShareReport(
                  api,
                  path: '/reports/receivables',
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
          IconButton(
            tooltip: strings.t('refresh'),
            onPressed: () {
              _load(reset: true);
              _loadReceivablesAging();
            },
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(pad.left, AppSpace.sm, pad.right, AppSpace.xs),
            child: TextField(
              controller: searchCtrl,
              decoration: InputDecoration(
                hintText: '${strings.t('customers')} / phone',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: searchCtrl.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear_rounded),
                        onPressed: () {
                          searchCtrl.clear();
                          setState(() {});
                          _applySearch('');
                        },
                      ),
              ),
              textInputAction: TextInputAction.search,
              onChanged: (_) => setState(() {}),
              onSubmitted: _applySearch,
            ),
          ),
          // Receivables aging board — compact, shown above the list
          if (_agingLoading && _receivablesAging == null)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpace.md),
              child: LinearProgressIndicator(),
            )
          else if (_receivablesAging != null)
            Padding(
              padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, AppSpace.xs),
              child: _ReceivablesBoard(
                aging: _receivablesAging!,
                onCollect: _collectPayment,
              ),
            ),
          if (total > 0)
            Padding(
              padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, AppSpace.xs),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '${customers.length} of $total',
                  style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                ),
              ),
            ),
          if (loading && customers.isEmpty) const AppLinearLoader(),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.teal,
              onRefresh: () async {
                await _load(reset: true);
                _loadReceivablesAging();
              },
              child: loading && customers.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 120),
                        Center(child: AppLoader()),
                      ],
                    )
                  : error != null && customers.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: pad,
                          children: [
                            AppPanel(
                              child: Text(error!, style: const TextStyle(color: AppColors.danger)),
                            ),
                          ],
                        )
                      : customers.isEmpty
                          ? ListView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: pad,
                              children: const [
                                SizedBox(height: 48),
                                AppEmptyState(
                                  icon: Icons.people_outline_rounded,
                                  message: 'No customers yet — tap Add customer below.',
                                ),
                              ],
                            )
                          : ListView.builder(
                              controller: scrollCtrl,
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: EdgeInsets.fromLTRB(pad.left, AppSpace.xs, pad.right, AppSpace.lg),
                              itemCount: customers.length + (loadingMore ? 1 : 0),
                              itemBuilder: (_, i) {
                                if (i >= customers.length) {
                                  return const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 16),
                                    child: Center(
                                      child: SizedBox(
                                        width: 28,
                                        height: 28,
                                        child: CircularProgressIndicator(strokeWidth: 2.5),
                                      ),
                                    ),
                                  );
                                }
                                final c = customers[i];
                                final name = c['name']?.toString() ?? '';
                                final phone = c['phone']?.toString() ?? '';
                                final outstanding = asDouble(c['outstandingBalance']);
                                final points = asInt(c['loyaltyPoints']);
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: AppPanel(
                                    padding: EdgeInsets.zero,
                                    child: ListTile(
                                      leading: CircleAvatar(
                                        backgroundColor: AppColors.tealSoft,
                                        child: Text(
                                          name.isNotEmpty ? name[0].toUpperCase() : '?',
                                          style: GoogleFonts.plusJakartaSans(
                                            fontWeight: FontWeight.w800,
                                            color: AppColors.tealDark,
                                          ),
                                        ),
                                      ),
                                      title: Text(name, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                                      subtitle: Text(
                                        [
                                          if (phone.isNotEmpty) phone,
                                          if (outstanding > 0) 'Udhaar ${_inr.format(outstanding)}',
                                          if (points > 0) '$points pts',
                                        ].join(' · '),
                                      ),
                                      trailing: phone.isEmpty
                                          ? null
                                          : IconButton(
                                              icon: Icon(Icons.call_rounded, color: AppColors.teal),
                                              onPressed: () => launchUrl(Uri.parse('tel:$phone')),
                                            ),
                                      onTap: () => _openDetail(c),
                                    ),
                                  ),
                                );
                              },
                            ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Receivables aging board (compact, shown above the customer list)
// ---------------------------------------------------------------------------

class _ReceivablesBoard extends StatelessWidget {
  const _ReceivablesBoard({required this.aging, required this.onCollect});

  final Map<String, dynamic> aging;
  final void Function(Map<String, dynamic> customer) onCollect;

  double _val(List<String> keys) {
    for (final k in keys) {
      if (aging.containsKey(k)) return asDouble(aging[k]);
    }
    final buckets = aging['buckets'];
    if (buckets is Map) {
      final b = asStringKeyedMap(buckets);
      for (final k in keys) {
        if (b.containsKey(k)) return asDouble(b[k]);
      }
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final total = _val(['totalOutstanding', 'total', 'outstanding', 'totalDue', 'totalReceivable']);

    final rawList = aging['customers'] ?? aging['topCustomers'] ?? aging['top'];
    final topCustomers = rawList is List
        ? rawList.whereType<Map>().map(asStringKeyedMap).take(5).toList()
        : <Map<String, dynamic>>[];

    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Receivables',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.muted,
                    letterSpacing: -0.1,
                  ),
                ),
              ),
              if (total > 0)
                Text(
                  _inr.format(total),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.warn,
                  ),
                ),
            ],
          ),
          if (topCustomers.isNotEmpty) ...[
            const SizedBox(height: 10),
            Divider(height: 1, color: AppColors.border),
            const SizedBox(height: 8),
            ...topCustomers.map((s) {
              final name = s['name']?.toString() ?? s['customerName']?.toString() ?? '';
              final due = asDouble(s['outstanding'] ?? s['totalDue'] ?? s['outstandingBalance']);
              final phone = s['phone']?.toString();
              final gstin = s['gstin']?.toString();
              final email = s['email']?.toString();
              final limit = asDouble(s['creditLimit']);
              final advance = asDouble(s['advanceBalance']);
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
                            style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w700),
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
                          Row(
                            children: [
                              Text(
                                _inr.format(due),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.warn,
                                ),
                              ),
                              if (limit > 0) ...[
                                const SizedBox(width: 8),
                                Text(
                                  'Limit ${_inr.format(limit)}',
                                  style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                                ),
                              ],
                              if (advance > 0.009) ...[
                                const SizedBox(width: 8),
                                Text(
                                  'Adv ${_inr.format(advance)}',
                                  style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.tealDark),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => onCollect({
                        'id': s['id'] ?? s['customerId'],
                        'name': name,
                        'phone': phone,
                        'gstin': gstin,
                        'outstandingBalance': due,
                        'creditLimit': limit,
                      }),
                      style: TextButton.styleFrom(
                        minimumSize: const Size(60, 32),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        foregroundColor: AppColors.teal,
                      ),
                      child: Text(
                        'Collect',
                        style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                    ),
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
