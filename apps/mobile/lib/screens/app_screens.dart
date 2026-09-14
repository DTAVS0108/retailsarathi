import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/api_config.dart';
import '../l10n/app_strings.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/theme_controller.dart';
import '../widgets/brand_logo.dart';
import '../widgets/floating_calculator.dart';
import 'home_screen.dart';
import 'invoices_screen.dart';
import 'pos_screen.dart';
import 'products_screen.dart';
import 'repairs_screen.dart';
import 'more_screen.dart';

export 'home_screen.dart';
export 'invoices_screen.dart';
export 'pos_screen.dart';
export 'products_screen.dart';
export 'more_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController(text: 'owner@demo.retailsarathi.in');
  final password = TextEditingController(text: 'Demo@123');
  final apiUrl = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthState>();
      apiUrl.text = auth.api.baseUrl;
      // Don't open the keypad until the user taps a field.
      FocusManager.instance.primaryFocus?.unfocus();
    });
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    apiUrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    final auth = context.read<AuthState>();
    try {
      await auth.setBaseUrl(apiUrl.text);
      await auth.login(email.text, password.text);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return Scaffold(
      backgroundColor: colors.canvas,
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color.lerp(colors.tealSoft, colors.canvas, 0.15)!,
              colors.canvas,
            ],
            stops: const [0, 0.35],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  const SizedBox(height: 28),
                  const BrandLogo(size: 52),
                  const SizedBox(height: 28),
                  TextField(
                    controller: apiUrl,
                    autofocus: false,
                    decoration: InputDecoration(
                      labelText: context.watch<AppStrings>().t('api_url'),
                      helperMaxLines: 5,
                      helperText:
                          'Production: ${ApiConfig.productionBaseUrl}\n'
                          'Physical phone (same Wi‑Fi as PC):\n'
                          'http://YOUR_PC_LAN_IP:4000/api/v1\n'
                          'Emulator only: http://10.0.2.2:4000/api/v1\n'
                          '10.0.2.2 will timeout on a real phone.',
                    ),
                    keyboardType: TextInputType.url,
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: email,
                    autofocus: false,
                    decoration: InputDecoration(labelText: context.watch<AppStrings>().t('email')),
                    keyboardType: TextInputType.emailAddress,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: password,
                    decoration: InputDecoration(labelText: context.watch<AppStrings>().t('password')),
                    obscureText: true,
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 12),
                    Text(error!, style: const TextStyle(color: AppColors.danger)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: busy ? null : _submit,
                    child: Text(
                      busy
                          ? context.watch<AppStrings>().t('signing_in')
                          : context.watch<AppStrings>().t('sign_in'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => context.read<AppStrings>().toggle(),
                    child: Text(context.watch<AppStrings>().t('language')),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int index = 0;
  String stockFilter = 'all';
  String invoiceStatus = 'ALL';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      FocusManager.instance.primaryFocus?.unfocus();
    });
  }

  void _go(AppNavRequest req) {
    setState(() {
      index = req.tab;
      if (req.stockFilter != null) stockFilter = req.stockFilter!;
      if (req.invoiceStatus != null) invoiceStatus = req.invoiceStatus!;
    });
    // Always clear focus on tab change; POS/Stock re-focus when their `active` flag flips.
    FocusManager.instance.primaryFocus?.unfocus();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomeScreen(onNavigate: _go),
      PosScreen(active: index == AppTabs.pos),
      ProductsScreen(
        active: index == AppTabs.stock,
        stockFilter: stockFilter,
        onStockFilterChanged: (f) => setState(() => stockFilter = f),
      ),
      InvoicesScreen(
        statusFilter: invoiceStatus,
        onStatusFilterChanged: (f) => setState(() => invoiceStatus = f),
        onNewBill: () => _go(const AppNavRequest(AppTabs.pos)),
      ),
      const RepairsScreen(),
      MoreScreen(onOpenRepairs: () => _go(AppNavRequest.repairs)),
    ];

    final strings = context.watch<AppStrings>();
    final wide = Breakpoints.useNavRail(context);
    final destinations = [
      (Icons.home_outlined, Icons.home_rounded, strings.t('home')),
      (Icons.point_of_sale_outlined, Icons.point_of_sale_rounded, strings.t('pos')),
      (Icons.inventory_2_outlined, Icons.inventory_2_rounded, strings.t('stock')),
      (Icons.receipt_long_outlined, Icons.receipt_long_rounded, strings.t('bills')),
      (Icons.build_circle_outlined, Icons.build_circle_rounded, strings.t('repairs')),
      (Icons.more_horiz, Icons.more_horiz, strings.t('more')),
    ];

    if (wide) {
      return Stack(
        children: [
          Scaffold(
            resizeToAvoidBottomInset: false,
            body: Row(
              children: [
                _ShellSideNav(
                  index: index,
                  destinations: destinations,
                  onSelect: (i) => _go(AppNavRequest(i)),
                ),
                const VerticalDivider(width: 1),
                Expanded(child: IndexedStack(index: index, children: pages)),
              ],
            ),
          ),
          const FloatingCalculatorOverlay(),
        ],
      );
    }

    return Stack(
      children: [
        Scaffold(
          // Bottom nav must not resize with keyboard — prevents overflow under keypad.
          resizeToAvoidBottomInset: false,
          body: IndexedStack(index: index, children: pages),
          bottomNavigationBar: MediaQuery.viewInsetsOf(context).bottom > 0
              ? null
              : NavigationBar(
                  selectedIndex: index,
                  onDestinationSelected: (i) => _go(AppNavRequest(i)),
                  labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                  height: 72,
                  destinations: [
                    for (final d in destinations)
                      NavigationDestination(
                        icon: Icon(d.$1),
                        selectedIcon: Icon(d.$2),
                        label: d.$3,
                      ),
                  ],
                ),
        ),
        const FloatingCalculatorOverlay(),
      ],
    );
  }
}

/// Scrollable side nav — avoids Material [NavigationRail] Column overflow on short viewports.
class _ShellSideNav extends StatelessWidget {
  const _ShellSideNav({
    required this.index,
    required this.destinations,
    required this.onSelect,
  });

  final int index;
  final List<(IconData, IconData, String)> destinations;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: SafeArea(
        right: false,
        child: SizedBox(
          width: 88,
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              children: [
                const Padding(
                  padding: EdgeInsets.only(bottom: 12),
                  child: BrandMark(size: 36),
                ),
                for (var i = 0; i < destinations.length; i++) ...[
                  if (i > 0) const SizedBox(height: 4),
                  _SideNavItem(
                    icon: destinations[i].$1,
                    selectedIcon: destinations[i].$2,
                    label: destinations[i].$3,
                    selected: index == i,
                    onTap: () => onSelect(i),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SideNavItem extends StatelessWidget {
  const _SideNavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final fg = selected ? colors.primary : colors.muted;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Material(
        color: selected ? colors.tealSoft : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(selected ? selectedIcon : icon, color: fg, size: 24),
                const SizedBox(height: 4),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    color: fg,
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

