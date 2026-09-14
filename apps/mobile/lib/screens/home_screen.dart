import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../l10n/app_strings.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/branding_prefs.dart';
import '../widgets/app_loader.dart';
import '../widgets/brand_logo.dart';
import '../widgets/floating_calculator.dart';
import '../theme/app_ui.dart';
import '../theme/theme_controller.dart';
import '../widgets/simple_charts.dart';
import 'analytics_screen.dart';
import 'customers_screen.dart';
import 'gst_screen.dart';
import 'khata_screen.dart';
import 'invoices_screen.dart';
import 'ledgers_screen.dart';
import 'reports_screen.dart';
import 'trade_in_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _inrExact = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
final _day = DateFormat('EEEE, d MMM');

/// Tab indices in [ShellScreen].
class AppTabs {
  static const home = 0;
  static const pos = 1;
  static const stock = 2;
  static const bills = 3;
  static const repairs = 4;
  static const more = 5;
}

/// Navigate to a tab and optionally apply a list filter.
class AppNavRequest {
  const AppNavRequest(
    this.tab, {
    this.stockFilter,
    this.invoiceStatus,
  });

  final int tab;

  /// `'all'` | `'low'` — only applied when non-null.
  final String? stockFilter;

  /// `'ALL'` | `'FINALIZED'` | `'DRAFT'` | `'CANCELLED'` — only when non-null.
  final String? invoiceStatus;

  static const lowStock = AppNavRequest(AppTabs.stock, stockFilter: 'low');
  static const allStock = AppNavRequest(AppTabs.stock, stockFilter: 'all');
  static const allBills = AppNavRequest(AppTabs.bills, invoiceStatus: 'ALL');
  static const repairs = AppNavRequest(AppTabs.repairs);
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.onNavigate});

  final ValueChanged<AppNavRequest> onNavigate;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  DashboardStats? stats;
  List<ChartPoint> monthlyBars = [];
  List<ChartPoint> paymentBars = [];
  List<ChartPoint> stockBars = [];
  String? error;
  bool loading = true;

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
        api.get('/tenants/dashboard'),
        api.get('/analytics/monthly', query: {'months': '6'}),
        api.get('/analytics/sale-ledger', query: {'days': '30'}),
        api.get('/analytics/stock-flow', query: {'days': '30'}),
      ]);
      // Keep shop/owner branding in sync with server profile.
      try {
        final profile = await api.get('/tenants/profile');
        if (profile is Map) {
          final name = asStringKeyedMap(profile)['name']?.toString() ?? '';
          if (name.isNotEmpty) {
            await BrandingPrefsController.instance.patch(shopName: name);
          }
        }
      } catch (_) {}
      final dash = DashboardStats.fromJson(asStringKeyedMap(results[0]));
      final mon = asStringKeyedMap(results[1]);
      final sale = asStringKeyedMap(results[2]);
      final flow = asStringKeyedMap(results[3]);

      final months = mon['months'] is List ? mon['months'] as List : const [];
      final pays = sale['summary'] is Map
          ? (asStringKeyedMap(sale['summary'])['byPayment'] is List
              ? asStringKeyedMap(sale['summary'])['byPayment'] as List
              : const [])
          : const [];
      final types = flow['byType'] is List ? flow['byType'] as List : const [];

      if (!mounted) return;
      setState(() {
        stats = dash;
        monthlyBars = months
            .whereType<Map>()
            .map((m) {
              final row = asStringKeyedMap(m);
              final label = (row['label']?.toString() ?? '').replaceAll(RegExp(r' \d{4}$'), '');
              return ChartPoint(label, asDouble(row['revenue']));
            })
            .toList();
        paymentBars = pays
            .whereType<Map>()
            .map((m) {
              final row = asStringKeyedMap(m);
              return ChartPoint(row['method']?.toString() ?? '', asDouble(row['amount']));
            })
            .toList();
        stockBars = types
            .whereType<Map>()
            .map((m) {
              final row = asStringKeyedMap(m);
              return ChartPoint(
                row['type']?.toString() ?? '',
                asDouble(row['qtyIn']).abs() + asDouble(row['qtyOut']).abs(),
              );
            })
            .toList();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  Future<void> _openInvoice(String id) async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoiceId: id)),
    );
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthState>().user;
    final branding = context.watch<BrandingPrefsController>();
    final colors = AppColors.of(context);
    final s = stats;
    final pad = Breakpoints.pagePadding(context);
    final maxW = Breakpoints.contentMaxWidth(context);
    final displayName = branding.ownerName.isNotEmpty
        ? branding.ownerName
        : (user?.name ?? 'there');

    return Scaffold(
      backgroundColor: colors.canvas,
      // Shell already pins the bottom nav; avoid double keyboard inset fights.
      resizeToAvoidBottomInset: true,
      body: RefreshIndicator(
        color: colors.primary,
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            SliverToBoxAdapter(
              child: _HomeTop(
                greeting: _greeting(),
                name: displayName,
                role: user?.role ?? '',
                onRefresh: _load,
                revenue: s?.todayRevenue,
                invoiceCount: s?.todayInvoices,
                onNewBill: () => widget.onNavigate(const AppNavRequest(AppTabs.pos)),
                loading: loading && s == null,
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(
                pad.left,
                pad.top > 0 ? AppSpace.sm : AppSpace.sm,
                pad.right,
                pad.bottom + AppSpace.fabClearance,
              ),
              sliver: SliverToBoxAdapter(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxW),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (error != null) ...[
                          _ErrorBanner(message: error!, onRetry: _load),
                          const SizedBox(height: 12),
                        ],
                        if (s != null) ...[
                          if (s.lowStockCount > 0) ...[
                            _AlertStrip(
                              icon: Icons.warning_amber_rounded,
                              title: '${s.lowStockCount} items need restock',
                              subtitle: 'Open stock to review low inventory',
                              color: AppColors.warn,
                              onTap: () => widget.onNavigate(AppNavRequest.lowStock),
                            ),
                            const SizedBox(height: 14),
                          ],
                          Text(
                            'Shop pulse',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.ink,
                            ),
                          ),
                          const SizedBox(height: 10),
                          _MetricGrid(
                            stats: s,
                            onTapProducts: () => widget.onNavigate(AppNavRequest.allStock),
                            onTapLowStock: () => widget.onNavigate(AppNavRequest.lowStock),
                            onTapCustomers: () {
                              Navigator.of(context).push(
                                MaterialPageRoute(builder: (_) => const CustomersScreen()),
                              );
                            },
                            onTapRepairs: () => widget.onNavigate(AppNavRequest.repairs),
                          ),
                          const SizedBox(height: 18),
                          Text(
                            'Trends',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.ink,
                            ),
                          ),
                          const SizedBox(height: 10),
                          ChartPanel(
                            title: 'Revenue by month',
                            subtitle: 'Last 6 months',
                            child: SimpleBarChart(points: monthlyBars),
                          ),
                          const SizedBox(height: 12),
                          ChartPanel(
                            title: 'Payment mix',
                            subtitle: 'Last 30 days',
                            child: SimpleHBarList(
                              points: paymentBars,
                              valueLabel: (v) => _inr.format(v),
                            ),
                          ),
                          const SizedBox(height: 12),
                          ChartPanel(
                            title: 'Stock movements',
                            subtitle: 'By type · 30 days',
                            child: SimpleHBarList(
                              points: stockBars,
                              valueLabel: (v) => '${v.round()} units',
                            ),
                          ),
                          const SizedBox(height: 22),
                          Text(
                            'Quick actions',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.ink,
                            ),
                          ),
                          const SizedBox(height: 10),
                          _QuickActions(onNavigate: widget.onNavigate),
                          const SizedBox(height: 14),
                          _ReportsLaunchCard(
                            onOpen: () {
                              Navigator.of(context).push(
                                MaterialPageRoute(builder: (_) => const ReportsScreen()),
                              );
                            },
                          ),
                          if (s.recentInvoices.isNotEmpty) ...[
                            const SizedBox(height: 22),
                            _SectionHeader(
                              title: 'Recent bills',
                              actionLabel: 'See all',
                              onAction: () => widget.onNavigate(AppNavRequest.allBills),
                            ),
                            const SizedBox(height: 10),
                            _RecentInvoicesCard(
                              invoices: s.recentInvoices,
                              onOpen: (id) => _openInvoice(id),
                            ),
                          ],
                          if (s.recentProducts.isNotEmpty) ...[
                            const SizedBox(height: 22),
                            _SectionHeader(
                              title: 'New products',
                              actionLabel: 'Stock',
                              onAction: () => widget.onNavigate(AppNavRequest.allStock),
                            ),
                            const SizedBox(height: 10),
                            _RecentProductsCard(
                              products: s.recentProducts,
                              onOpenStock: () => widget.onNavigate(AppNavRequest.allStock),
                            ),
                          ],
                          if (s.recentStockMovements.isNotEmpty) ...[
                            const SizedBox(height: 22),
                            _SectionHeader(
                              title: 'Recent stock moves',
                              actionLabel: 'Stock',
                              onAction: () => widget.onNavigate(AppNavRequest.allStock),
                            ),
                            const SizedBox(height: 10),
                            _RecentStockCard(movements: s.recentStockMovements),
                          ],
                          if (s.lowStockItems.isNotEmpty) ...[
                            const SizedBox(height: 22),
                            _SectionHeader(
                              title: 'Low stock watch',
                              actionLabel: 'Fix',
                              onAction: () => widget.onNavigate(AppNavRequest.lowStock),
                            ),
                            const SizedBox(height: 10),
                            _LowStockCard(
                              items: s.lowStockItems,
                              onOpenStock: () => widget.onNavigate(AppNavRequest.lowStock),
                            ),
                          ],
                          const SizedBox(height: 22),
                          _TipCard(
                            title: 'On this device',
                            body:
                                'Overview cards open Stock, Bills, Customers, Repairs, Khata & more. Mic on POS for voice add. Offline bills sync from More.',
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Greeting + today's sale stacked so the sale card is fully visible (not under the header).
class _HomeTop extends StatelessWidget {
  const _HomeTop({
    required this.greeting,
    required this.name,
    required this.role,
    required this.onRefresh,
    required this.onNewBill,
    required this.loading,
    this.revenue,
    this.invoiceCount,
  });

  final String greeting;
  final String name;
  final String role;
  final VoidCallback onRefresh;
  final VoidCallback onNewBill;
  final bool loading;
  final double? revenue;
  final int? invoiceCount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _HeroHeader(
          greeting: greeting,
          name: name,
          role: role,
          onRefresh: onRefresh,
        ),
        if (loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: const AppLoader(),
          )
        else if (revenue != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpace.md, 12, AppSpace.md, 4),
            child: _RevenueHero(
              revenue: revenue!,
              invoiceCount: invoiceCount ?? 0,
              onNewBill: onNewBill,
            ),
          ),
      ],
    );
  }
}

class _HeroHeader extends StatelessWidget {
  const _HeroHeader({
    required this.greeting,
    required this.name,
    required this.role,
    required this.onRefresh,
  });

  final String greeting;
  final String name;
  final String role;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final top = MediaQuery.paddingOf(context).top;
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(20, top + 12, 12, 20),
      decoration: BoxDecoration(
        gradient: colors.heroGradient,
      ),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            right: -20,
            top: 8,
            child: Container(
              width: 140,
              height: 140,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.06),
              ),
            ),
          ),
          Positioned(
            right: 40,
            bottom: 0,
            child: Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: colors.secondary.withValues(alpha: 0.18),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const BrandLogo(size: 28, light: true),
                        const SizedBox(height: 6),
                        Text(
                          _day.format(DateTime.now()),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: Colors.white.withValues(alpha: 0.65),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const CalculatorAppBarButton(color: Colors.white),
                  IconButton(
                    onPressed: onRefresh,
                    tooltip: 'Refresh',
                    icon: const Icon(Icons.refresh_rounded, color: Colors.white),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Text(
                '$greeting,',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16,
                  color: Colors.white.withValues(alpha: 0.8),
                ),
              ),
              Text(
                name,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  height: 1.15,
                  color: Colors.white,
                ),
              ),
              if (role.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    role,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _RevenueHero extends StatelessWidget {
  const _RevenueHero({
    required this.revenue,
    required this.invoiceCount,
    required this.onNewBill,
  });

  final double revenue;
  final int invoiceCount;
  final VoidCallback onNewBill;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colors.primary.withValues(alpha: 0.1)),
        boxShadow: [
          BoxShadow(
            color: colors.primaryDark.withValues(alpha: 0.08),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: colors.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.payments_outlined, color: colors.primaryDark),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  context.watch<AppStrings>().t('today_sale'),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.muted,
                  ),
                ),
              ),
              Text(
                '$invoiceCount bills',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: colors.primary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            revenue >= 1000 ? _inr.format(revenue) : _inrExact.format(revenue),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 34,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.8,
              color: colors.ink,
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onNewBill,
              icon: Icon(Icons.point_of_sale_rounded, size: 20),
              label: Text(context.watch<AppStrings>().t('start_new_bill')),
              style: FilledButton.styleFrom(
                backgroundColor: colors.primary,
                foregroundColor: colors.onPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricGrid extends StatelessWidget {
  const _MetricGrid({
    required this.stats,
    required this.onTapProducts,
    required this.onTapLowStock,
    required this.onTapCustomers,
    required this.onTapRepairs,
  });

  final DashboardStats stats;
  final VoidCallback onTapProducts;
  final VoidCallback onTapLowStock;
  final VoidCallback onTapCustomers;
  final VoidCallback onTapRepairs;

  @override
  Widget build(BuildContext context) {
    final tablet = Breakpoints.isTablet(context);
    final cols = Breakpoints.kpiGridCount(context);
    final colors = AppColors.of(context);
    final items = [
      _MetricSpec(
        label: 'Products',
        value: '${stats.totalProducts}',
        icon: Icons.inventory_2_outlined,
        tint: colors.primary,
        onTap: onTapProducts,
      ),
      _MetricSpec(
        label: 'Low stock',
        value: '${stats.lowStockCount}',
        icon: Icons.trending_down_rounded,
        tint: stats.lowStockCount > 0 ? AppColors.warn : colors.primary,
        onTap: onTapLowStock,
      ),
      _MetricSpec(
        label: 'Customers',
        value: '${stats.totalCustomers}',
        icon: Icons.people_outline_rounded,
        tint: colors.primaryDark,
        onTap: onTapCustomers,
      ),
      _MetricSpec(
        label: 'Open repairs',
        value: '${stats.openRepairs}',
        icon: Icons.build_circle_outlined,
        tint: colors.primary,
        onTap: onTapRepairs,
      ),
    ];

    return GridView.count(
      crossAxisCount: cols,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      // Phone: taller tiles; tablet: compact so cards don't look empty.
      childAspectRatio: tablet ? 2.4 : 1.45,
      children: items.map((e) => _MetricTile(spec: e, compact: tablet)).toList(),
    );
  }
}

class _MetricSpec {
  const _MetricSpec({
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color tint;
  final VoidCallback? onTap;
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.spec, this.compact = false});
  final _MetricSpec spec;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: spec.onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.primary.withValues(alpha: 0.08)),
          ),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: compact ? 12 : 14,
              vertical: compact ? 10 : 14,
            ),
            child: compact
                ? Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: spec.tint.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(spec.icon, size: 18, color: spec.tint),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              spec.value,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: colors.ink,
                              ),
                            ),
                            Text(
                              spec.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: colors.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, size: 18, color: colors.muted),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: spec.tint.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(spec.icon, size: 18, color: spec.tint),
                      ),
                      const Spacer(),
                      Text(
                        spec.value,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: colors.ink,
                        ),
                      ),
                      Text(
                        spec.label,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: colors.muted,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.onNavigate});
  final ValueChanged<AppNavRequest> onNavigate;

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    final tablet = Breakpoints.isTablet(context);
    final actions = [
      (Icons.point_of_sale_rounded, strings.t('bill'), () => onNavigate(const AppNavRequest(AppTabs.pos)), AppColors.amber),
      (Icons.inventory_2_rounded, strings.t('stock'), () => onNavigate(AppNavRequest.allStock), AppColors.teal),
      (Icons.receipt_long_rounded, strings.t('bills'), () => onNavigate(AppNavRequest.allBills), const Color(0xFF0369A1)),
      (
        Icons.menu_book_rounded,
        strings.t('khata'),
        () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const KhataScreen()),
          );
        },
        const Color(0xFF7C3AED),
      ),
      (
        Icons.people_alt_rounded,
        strings.t('customers'),
        () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const CustomersScreen()),
          );
        },
        const Color(0xFF0369A1),
      ),
      (
        Icons.account_balance_wallet_outlined,
        strings.t('ledgers'),
        () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const LedgersScreen()),
          );
        },
        const Color(0xFF0F766E),
      ),
      (
        Icons.analytics_outlined,
        'Analytics',
        () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const AnalyticsScreen()),
          );
        },
        const Color(0xFF0369A1),
      ),
      (
        Icons.account_balance_outlined,
        'GST',
        () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const GstScreen()),
          );
        },
        const Color(0xFFB45309),
      ),
      (
        Icons.phone_android_rounded,
        'Trade-in',
        () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const TradeInScreen()),
          );
        },
        const Color(0xFFBE185D),
      ),
      (
        Icons.insights_rounded,
        strings.t('reports'),
        () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const ReportsScreen()),
          );
        },
        const Color(0xFF1D4ED8),
      ),
    ];

    final cross = Breakpoints.quickActionCount(context);
    // Fixed tile height avoids Column overflow on narrow phones (aspect-ratio was too short).
    final tileH = tablet ? 78.0 : 88.0;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: actions.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: cross,
        mainAxisExtent: tileH,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
      ),
      itemBuilder: (_, i) {
        final a = actions[i];
        return _ActionChip(
          icon: a.$1,
          label: a.$2,
          color: a.$4,
          large: !tablet,
          onTap: a.$3,
        );
      },
    );
  }
}

class _ReportsLaunchCard extends StatelessWidget {
  const _ReportsLaunchCard({required this.onOpen});
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.teal.withValues(alpha: 0.12)),
            gradient: LinearGradient(
              colors: [
                AppColors.amber.withValues(alpha: 0.12),
                AppColors.tealSoft.withValues(alpha: 0.35),
              ],
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.teal.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.insights_rounded, color: AppColors.teal),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Reports & ledgers',
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      'Monthly sales · stock in/out · sale & buy ledgers',
                      style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: AppColors.teal),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    this.large = false,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.teal.withValues(alpha: 0.08)),
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, color: color, size: large ? 26 : 22),
                const SizedBox(height: 6),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AlertStrip extends StatelessWidget {
  const _AlertStrip({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(icon, color: color),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: color),
            ],
          ),
        ),
      ),
    );
  }
}

class _TipCard extends StatelessWidget {
  const _TipCard({required this.title, required this.body});
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          colors: [
            AppColors.tealSoft.withValues(alpha: 0.55),
            AppColors.surface,
          ],
        ),
        border: Border.all(color: AppColors.teal.withValues(alpha: 0.12)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.auto_awesome, color: AppColors.teal, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    height: 1.4,
                    color: AppColors.muted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message, style: const TextStyle(color: AppColors.danger)),
          TextButton(onPressed: onRetry, child: Text(context.watch<AppStrings>().t('retry'))),
        ],
      ),
    );
  }
}

final _shortDate = DateFormat('dd MMM, hh:mm a');

String _relativeTime(DateTime dt) {
  final local = dt.toLocal();
  final diff = DateTime.now().difference(local);
  if (diff.inMinutes < 1) return 'Just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return _shortDate.format(local);
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.actionLabel,
    required this.onAction,
  });

  final String title;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
        ),
        TextButton(
          onPressed: onAction,
          style: TextButton.styleFrom(
            foregroundColor: AppColors.teal,
            padding: const EdgeInsets.symmetric(horizontal: 8),
          ),
          child: Text(actionLabel, style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

class _RecentInvoicesCard extends StatelessWidget {
  const _RecentInvoicesCard({required this.invoices, required this.onOpen});

  final List<InvoiceSummary> invoices;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      children: [
        for (var i = 0; i < invoices.length; i++) ...[
          if (i > 0) Divider(height: 1, color: AppColors.teal.withValues(alpha: 0.08)),
          InkWell(
            onTap: () => onOpen(invoices[i].id),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: AppColors.tealSoft.withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.receipt_long_rounded, size: 18, color: AppColors.teal),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          invoices[i].invoiceNumber,
                          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          '${invoices[i].customerName ?? 'Walk-in'} · ${_relativeTime(invoices[i].createdAt)}',
                          style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        _inrExact.format(invoices[i].grandTotal),
                        style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        invoices[i].status,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: invoices[i].isCancelled ? AppColors.danger : AppColors.teal,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _RecentProductsCard extends StatelessWidget {
  const _RecentProductsCard({required this.products, required this.onOpenStock});

  final List<Product> products;
  final VoidCallback onOpenStock;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      children: [
        for (var i = 0; i < products.length; i++) ...[
          if (i > 0) Divider(height: 1, color: AppColors.teal.withValues(alpha: 0.08)),
          InkWell(
            onTap: onOpenStock,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: AppColors.amber.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.new_releases_outlined, size: 18, color: AppColors.amberDeep),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          products[i].name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          '${products[i].sku} · qty ${products[i].stockQty.toStringAsFixed(0)}',
                          style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    _inrExact.format(products[i].salePrice),
                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, color: AppColors.tealDark),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _RecentStockCard extends StatelessWidget {
  const _RecentStockCard({required this.movements});

  final List<StockMovement> movements;

  Color _tint(String type, bool isIn) {
    if (type == 'SALE') return AppColors.danger;
    if (type == 'RETURN' || type == 'PURCHASE') return AppColors.teal;
    return isIn ? AppColors.teal : AppColors.warn;
  }

  @override
  Widget build(BuildContext context) {
    return _Panel(
      children: [
        for (var i = 0; i < movements.length; i++) ...[
          if (i > 0) Divider(height: 1, color: AppColors.teal.withValues(alpha: 0.08)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            child: Row(
              children: [
                Icon(
                  movements[i].isIn ? Icons.south_west_rounded : Icons.north_east_rounded,
                  size: 18,
                  color: _tint(movements[i].type, movements[i].isIn),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        movements[i].productName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                      Text(
                        '${movements[i].type.replaceAll('_', ' ')} · ${_relativeTime(movements[i].createdAt)}',
                        style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
                Text(
                  '${movements[i].quantity > 0 ? '+' : ''}${movements[i].quantity.toStringAsFixed(0)}',
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    color: _tint(movements[i].type, movements[i].isIn),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _LowStockCard extends StatelessWidget {
  const _LowStockCard({required this.items, required this.onOpenStock});

  final List<Product> items;
  final VoidCallback onOpenStock;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) Divider(height: 1, color: AppColors.teal.withValues(alpha: 0.08)),
          InkWell(
            onTap: onOpenStock,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          items[i].name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          items[i].sku,
                          style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.warn.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'Qty ${items[i].stockQty.toStringAsFixed(0)}',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: AppColors.warn,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.teal.withValues(alpha: 0.08)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }
}
