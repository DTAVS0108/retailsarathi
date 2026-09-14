import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../l10n/app_strings.dart';
import '../services/offline_sync.dart';
import '../theme/app_theme.dart';
import '../theme/app_ui.dart';
import '../theme/branding_prefs.dart';
import '../theme/theme_controller.dart';
import '../widgets/app_toast.dart';
import '../widgets/brand_logo.dart';
import '../widgets/floating_calculator.dart';
import 'analytics_screen.dart';
import 'app_settings_screen.dart';
import 'customers_screen.dart';
import 'gst_screen.dart';
import 'khata_screen.dart';
import 'ledgers_screen.dart';
import 'products_needing_details_screen.dart';
import 'profile_settings_screen.dart';
import 'purchase_bills_screen.dart';
import 'purchase_orders_screen.dart';
import 'repairs_screen.dart';
import 'reports_screen.dart';
import 'returns_screen.dart';
import 'stock_drafts_screen.dart';
import 'stock_in_screen.dart';
import 'stock_take_screen.dart';
import 'suppliers_ledger_screen.dart';
import 'trade_in_screen.dart';

/// More hub — Vyapar-style grouped modules with search (thumb-friendly ops).
class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key, this.onOpenRepairs});

  final VoidCallback? onOpenRepairs;

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  String query = '';

  void _push(Widget page) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    final branding = context.watch<BrandingPrefsController>();
    final sync = context.watch<OfflineSyncService>();

    final sections = <_MoreSection>[
      _MoreSection(
        title: 'Parties & money',
        items: [
          _MoreItem(
            icon: Icons.menu_book_rounded,
            title: strings.t('khata'),
            subtitle: strings.t('khata_sub'),
            onTap: () => _push(const KhataScreen()),
          ),
          _MoreItem(
            icon: Icons.receipt_long_outlined,
            title: strings.t('ledgers'),
            subtitle: strings.t('ledgers_sub'),
            onTap: () => _push(const LedgersScreen()),
          ),
          _MoreItem(
            icon: Icons.people_alt_rounded,
            title: strings.t('customers'),
            subtitle: 'All customers · CRM · loyalty',
            onTap: () => _push(const CustomersScreen()),
          ),
          _MoreItem(
            icon: Icons.account_balance_wallet_outlined,
            title: strings.t('suppliers_ledger'),
            subtitle: 'Payables & supplier pay',
            onTap: () => _push(const SuppliersLedgerScreen()),
          ),
          _MoreItem(
            icon: Icons.receipt_long_outlined,
            title: strings.t('purchase_bills'),
            subtitle: strings.t('purchase_bills_sub'),
            onTap: () => _push(const PurchaseBillsScreen()),
          ),
          _MoreItem(
            icon: Icons.assignment_return_outlined,
            title: strings.t('returns'),
            subtitle: strings.t('returns_sub'),
            onTap: () => _push(const ReturnsScreen()),
          ),
        ],
      ),
      _MoreSection(
        title: 'Stock & buying',
        items: [
          _MoreItem(
            icon: Icons.document_scanner_outlined,
            title: strings.t('stock_in'),
            subtitle: strings.t('stock_in_sub'),
            onTap: () => _push(const StockInScreen()),
          ),
          _MoreItem(
            icon: Icons.drafts_outlined,
            title: strings.t('stock_drafts'),
            subtitle: strings.t('stock_drafts_sub'),
            onTap: () => _push(const StockDraftsScreen()),
          ),
          _MoreItem(
            icon: Icons.playlist_add_check_rounded,
            title: strings.t('products_needing'),
            subtitle: strings.t('products_needing_sub'),
            onTap: () => _push(const ProductsNeedingDetailsScreen()),
          ),
          _MoreItem(
            icon: Icons.local_shipping_outlined,
            title: strings.t('purchase_orders'),
            subtitle: strings.t('purchase_orders_sub'),
            onTap: () => _push(const PurchaseOrdersScreen()),
          ),
          _MoreItem(
            icon: Icons.inventory_outlined,
            title: strings.t('stock_take'),
            subtitle: strings.t('stock_take_sub'),
            onTap: () => _push(const StockTakeScreen()),
          ),
          _MoreItem(
            icon: Icons.phone_android_rounded,
            title: 'Trade-in',
            subtitle: 'Buyback · quote · stock',
            onTap: () => _push(const TradeInScreen()),
          ),
        ],
      ),
      _MoreSection(
        title: 'Workshop',
        items: [
          _MoreItem(
            icon: Icons.build_circle_outlined,
            title: strings.t('repairs'),
            subtitle: strings.t('repairs_sub'),
            onTap: () {
              if (widget.onOpenRepairs != null) {
                widget.onOpenRepairs!();
              } else {
                _push(const RepairsScreen());
              }
            },
          ),
        ],
      ),
      _MoreSection(
        title: 'Insights & tax',
        items: [
          _MoreItem(
            icon: Icons.insights_rounded,
            title: strings.t('reports'),
            subtitle: strings.t('reports_sub'),
            onTap: () => _push(const ReportsScreen()),
          ),
          _MoreItem(
            icon: Icons.analytics_outlined,
            title: 'Analytics',
            subtitle: 'ABC · dead stock · margins',
            onTap: () => _push(const AnalyticsScreen()),
          ),
          _MoreItem(
            icon: Icons.account_balance_outlined,
            title: 'GST returns',
            subtitle: 'GSTR-1 · GSTR-3B',
            onTap: () => _push(const GstScreen()),
          ),
        ],
      ),
      _MoreSection(
        title: 'Shop & app',
        items: [
          _MoreItem(
            icon: Icons.settings_rounded,
            title: strings.t('app_settings'),
            subtitle: strings.t('app_settings_sub'),
            onTap: () => _push(const AppSettingsScreen()),
          ),
          _MoreItem(
            icon: Icons.storefront_outlined,
            title: strings.t('profile_settings'),
            subtitle: strings.t('profile_settings_sub'),
            onTap: () => _push(const ProfileSettingsScreen()),
          ),
        ],
      ),
    ];

    final q = query.trim().toLowerCase();
    final filtered = q.isEmpty
        ? sections
        : sections
            .map(
              (s) => _MoreSection(
                title: s.title,
                items: s.items
                    .where(
                      (i) =>
                          i.title.toLowerCase().contains(q) ||
                          i.subtitle.toLowerCase().contains(q),
                    )
                    .toList(),
              ),
            )
            .where((s) => s.items.isNotEmpty)
            .toList();

    final colors = AppColors.of(context);
    return Scaffold(
      backgroundColor: colors.canvas,
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              branding.displayShopName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w800,
                fontSize: 16,
                color: colors.ink,
              ),
            ),
            Text(
              strings.t('more'),
              style: TextStyle(fontSize: 12, color: colors.muted),
            ),
          ],
        ),
        actions: const [CalculatorAppBarButton()],
      ),
      body: ListView(
        padding: Breakpoints.pagePadding(context),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: Breakpoints.contentMaxWidth(context)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const BrandLogo(size: 40),
                  const SizedBox(height: AppSpace.md),
                  AppSearchField(
                    hint: 'Search customers, GST, trade-in…',
                    onChanged: (v) => setState(() => query = v),
                  ),
                  const SizedBox(height: AppSpace.md),
                  AppPanel(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Row(
                      children: [
                        Icon(
                          sync.online ? Icons.cloud_done_rounded : Icons.cloud_off_rounded,
                          color: sync.online ? colors.primary : AppColors.warn,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                sync.online ? strings.t('online') : strings.t('offline'),
                                style: GoogleFonts.plusJakartaSans(
                                  fontWeight: FontWeight.w800,
                                  color: colors.inkOn(colors.surface),
                                ),
                              ),
                              Text(
                                sync.pending > 0
                                    ? '${sync.pending} ${strings.t('pending_sync')}'
                                    : strings.t('sync_catalog_hint'),
                                style: TextStyle(
                                  fontSize: 12,
                                  color: colors.mutedOn(colors.surface),
                                ),
                              ),
                            ],
                          ),
                        ),
                        TextButton(
                          style: TextButton.styleFrom(foregroundColor: colors.primary),
                          onPressed: sync.syncing
                              ? null
                              : () async {
                                  final r = await sync.syncNow();
                                  if (!context.mounted) return;
                                  final msg =
                                      '${strings.t('sync_now')}: ${r.pushed} ok'
                                      '${r.failed > 0 ? ', ${r.failed} failed' : ''}';
                                  if (r.failed > 0) {
                                    showAppToast(context, msg, tone: AppToastTone.warn);
                                  } else {
                                    showSuccessToast(context, msg);
                                  }
                                },
                          child: Text(sync.syncing ? strings.t('syncing') : strings.t('sync_now')),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  ..._buildSections(filtered, colors),
                  const SizedBox(height: AppSpace.md),
                  AppPanel(
                    padding: EdgeInsets.zero,
                    child: ListTile(
                      leading: Icon(Icons.settings_rounded, color: colors.primary),
                      title: Text(
                        strings.t('app_settings'),
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          color: colors.inkOn(colors.surface),
                        ),
                      ),
                      subtitle: Text(
                        strings.t('app_settings_sub'),
                        style: TextStyle(color: colors.mutedOn(colors.surface)),
                      ),
                      trailing: Icon(
                        Icons.chevron_right_rounded,
                        color: colors.mutedOn(colors.surface),
                      ),
                      onTap: () => _push(const AppSettingsScreen()),
                    ),
                  ),
                  const SizedBox(height: AppSpace.xl),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildSections(List<_MoreSection> filtered, AppColorsLookup colors) {
    final cols = Breakpoints.moreColumns(context);
    final ink = colors.inkOn(colors.surface);
    final muted = colors.mutedOn(colors.surface);
    final out = <Widget>[];
    for (final section in filtered) {
      out.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 14, 4, 8),
          child: Text(
            section.title.toUpperCase(),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
              color: colors.muted,
            ),
          ),
        ),
      );
      if (cols >= 2) {
        out.add(
          LayoutBuilder(
            builder: (context, constraints) {
              final gap = 10.0;
              final w = (constraints.maxWidth - gap) / 2;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: [
                  for (final item in section.items)
                    SizedBox(
                      width: w,
                      child: AppPanel(
                        padding: EdgeInsets.zero,
                        child: ListTile(
                          dense: true,
                          leading: CircleAvatar(
                            radius: 18,
                            backgroundColor: colors.tealSoft,
                            child: Icon(item.icon, color: colors.primaryDark, size: 18),
                          ),
                          title: Text(
                            item.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                              color: ink,
                            ),
                          ),
                          subtitle: Text(
                            item.subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, color: muted),
                          ),
                          trailing: Icon(Icons.chevron_right_rounded, color: muted, size: 18),
                          onTap: item.onTap,
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        );
      } else {
        out.add(
          AppPanel(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < section.items.length; i++) ...[
                  if (i > 0) Divider(height: 1, indent: 56, endIndent: 12, color: colors.border),
                  ListTile(
                    leading: CircleAvatar(
                      backgroundColor: colors.tealSoft,
                      child: Icon(section.items[i].icon, color: colors.primaryDark, size: 20),
                    ),
                    title: Text(
                      section.items[i].title,
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, color: ink),
                    ),
                    subtitle: Text(
                      section.items[i].subtitle,
                      style: TextStyle(color: muted),
                    ),
                    trailing: Icon(Icons.chevron_right_rounded, color: muted),
                    onTap: section.items[i].onTap,
                  ),
                ],
              ],
            ),
          ),
        );
      }
    }
    return out;
  }
}

class _MoreSection {
  const _MoreSection({required this.title, required this.items});
  final String title;
  final List<_MoreItem> items;
}

class _MoreItem {
  const _MoreItem({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
}
