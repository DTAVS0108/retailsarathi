import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/app_strings.dart';
import '../services/auth_state.dart';
import '../services/bluetooth_thermal_printer.dart';
import '../services/local_db.dart';
import '../services/offline_sync.dart';
import '../theme/app_theme.dart';
import '../theme/appearance_prefs.dart';
import '../theme/app_ui.dart';
import '../theme/branding_prefs.dart';
import '../theme/theme_controller.dart';
import '../widgets/app_toast.dart';
import '../widgets/brand_logo.dart';

/// Device & app settings hub — connection, appearance, sync, printer, about.
class AppSettingsScreen extends StatefulWidget {
  const AppSettingsScreen({super.key});

  @override
  State<AppSettingsScreen> createState() => _AppSettingsScreenState();
}

class _AppSettingsScreenState extends State<AppSettingsScreen> {
  late final TextEditingController apiCtrl;
  late final TextEditingController printerCtrl;
  bool pinging = false;
  bool clearing = false;
  String? pingMsg;
  PackageInfo? packageInfo;
  List<BluetoothInfo> paired = const [];
  bool loadingPrinters = false;

  @override
  void initState() {
    super.initState();
    apiCtrl = TextEditingController();
    printerCtrl = TextEditingController(text: AppearancePrefsController.instance.printerMac);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      apiCtrl.text = context.read<AuthState>().api.baseUrl;
    });
    _loadAbout();
  }

  @override
  void dispose() {
    apiCtrl.dispose();
    printerCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadAbout() async {
    final info = await PackageInfo.fromPlatform();
    if (mounted) setState(() => packageInfo = info);
  }

  Future<void> _saveApi() async {
    final url = apiCtrl.text.trim();
    if (url.isEmpty) {
      showErrorToast(context, 'Enter API base URL');
      return;
    }
    try {
      await context.read<AuthState>().setBaseUrl(url);
      if (!mounted) return;
      showSuccessToast(context, 'API URL saved');
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    }
  }

  Future<void> _ping() async {
    setState(() {
      pinging = true;
      pingMsg = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final sw = Stopwatch()..start();
      await api.get('/auth/me');
      sw.stop();
      if (!mounted) return;
      setState(() => pingMsg = 'OK · ${sw.elapsedMilliseconds} ms');
      showSuccessToast(context, 'Server reachable');
    } catch (e) {
      if (!mounted) return;
      setState(() => pingMsg = e.toString());
      showErrorToast(context, 'Ping failed');
    } finally {
      if (mounted) setState(() => pinging = false);
    }
  }

  Future<void> _refreshPrinters() async {
    setState(() => loadingPrinters = true);
    try {
      final list = await BluetoothThermalPrinter.pairedPrinters();
      if (!mounted) return;
      setState(() => paired = list);
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    } finally {
      if (mounted) setState(() => loadingPrinters = false);
    }
  }

  Future<void> _savePrinter([String? mac]) async {
    final value = (mac ?? printerCtrl.text).trim();
    printerCtrl.text = value;
    await AppearancePrefsController.instance.patch(printerMac: value);
    if (mounted) showSuccessToast(context, value.isEmpty ? 'Printer cleared' : 'Printer saved');
  }

  Future<void> _clearCatalogCache() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clear product cache?'),
        content: const Text(
          'Removes offline product catalog. Pending offline bills are kept. Sync again when online.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Clear')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => clearing = true);
    try {
      final n = await LocalDb.instance.clearProductCache();
      if (!mounted) return;
      final sync = context.read<OfflineSyncService>();
      await sync.cacheProductsFromServer();
      await sync.refreshPending();
      if (!mounted) return;
      showSuccessToast(context, 'Cleared $n cached products');
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    } finally {
      if (mounted) setState(() => clearing = false);
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again to use POS and sync.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) {
      await context.read<AuthState>().logout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    final auth = context.watch<AuthState>();
    final sync = context.watch<OfflineSyncService>();
    final themeCtrl = context.watch<ThemeController>();
    final pad = Breakpoints.pagePadding(context);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(title: Text(strings.t('app_settings'))),
      body: ListView(
        padding: pad,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: Breakpoints.contentMaxWidth(context)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Connection', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        Text(
                          'API used by this device for billing & sync',
                          style: TextStyle(fontSize: 12, color: AppColors.muted),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: apiCtrl,
                          decoration: const InputDecoration(
                            labelText: 'API base URL',
                            hintText: 'http://192.168.x.x:3001',
                            prefixIcon: Icon(Icons.link_rounded),
                          ),
                          keyboardType: TextInputType.url,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _saveApi(),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: FilledButton(
                                onPressed: _saveApi,
                                child: const Text('Save URL'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton(
                                onPressed: pinging ? null : _ping,
                                child: Text(pinging ? 'Pinging…' : 'Test'),
                              ),
                            ),
                          ],
                        ),
                        if (pingMsg != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            pingMsg!,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              color: pingMsg!.startsWith('OK') ? AppColors.tealDark : AppColors.danger,
                            ),
                          ),
                        ],
                        const SizedBox(height: 6),
                        Text(
                          'Signed in as ${auth.user?.email ?? '—'}',
                          style: TextStyle(fontSize: 12, color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                  AppSpace.sectionGap,
                  AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Language', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<String>(
                          value: strings.locale,
                          decoration: const InputDecoration(labelText: 'App language'),
                          items: [
                            DropdownMenuItem(value: 'en', child: Text(strings.t('language_en'))),
                            DropdownMenuItem(value: 'hi', child: Text(strings.t('language_hi'))),
                          ],
                          onChanged: (v) {
                            if (v != null) strings.setLocale(v);
                          },
                        ),
                      ],
                    ),
                  ),
                  AppSpace.sectionGap,
                  AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                'Appearance',
                                style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
                              ),
                            ),
                            Text(
                              appThemeModeTitle(themeCtrl.mode),
                              style: TextStyle(fontSize: 12, color: AppColors.muted),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        const AppearanceSettingsSection(),
                      ],
                    ),
                  ),
                  AppSpace.sectionGap,
                  AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Offline & sync', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            sync.online ? Icons.cloud_done_rounded : Icons.cloud_off_rounded,
                            color: sync.online ? AppColors.teal : AppColors.warn,
                          ),
                          title: Text(sync.online ? strings.t('online') : strings.t('offline')),
                          subtitle: Text(
                            sync.pending > 0
                                ? '${sync.pending} ${strings.t('pending_sync')}'
                                : strings.t('sync_catalog_hint'),
                          ),
                          trailing: TextButton(
                            onPressed: sync.syncing
                                ? null
                                : () async {
                                    final r = await sync.syncNow();
                                    if (!context.mounted) return;
                                    showSuccessToast(
                                      context,
                                      '${strings.t('sync_now')}: ${r.pushed} ok'
                                      '${r.failed > 0 ? ', ${r.failed} failed' : ''}',
                                    );
                                  },
                            child: Text(sync.syncing ? strings.t('syncing') : strings.t('sync_now')),
                          ),
                        ),
                        if (sync.lastError != null)
                          Text(
                            sync.lastError!,
                            style: const TextStyle(fontSize: 12, color: AppColors.danger),
                          ),
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed: clearing ? null : _clearCatalogCache,
                          icon: clearing
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.cleaning_services_outlined),
                          label: Text(clearing ? 'Clearing…' : 'Clear product cache'),
                        ),
                      ],
                    ),
                  ),
                  AppSpace.sectionGap,
                  AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Thermal printer', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        Text(
                          'Saved Bluetooth MAC used for ESC/POS bill print',
                          style: TextStyle(fontSize: 12, color: AppColors.muted),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: printerCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Printer MAC',
                            hintText: 'AA:BB:CC:DD:EE:FF',
                            prefixIcon: Icon(Icons.print_rounded),
                          ),
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _savePrinter(),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: FilledButton(
                                onPressed: () => _savePrinter(),
                                child: const Text('Save printer'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton(
                                onPressed: loadingPrinters ? null : _refreshPrinters,
                                child: Text(loadingPrinters ? 'Loading…' : 'Paired'),
                              ),
                            ),
                          ],
                        ),
                        if (paired.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          ...paired.map((p) {
                            final mac = p.macAdress;
                            final name = p.name;
                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              title: Text(name),
                              subtitle: Text(mac),
                              trailing: TextButton(
                                onPressed: () => _savePrinter(mac),
                                child: const Text('Use'),
                              ),
                            );
                          }),
                        ],
                      ],
                    ),
                  ),
                  AppSpace.sectionGap,
                  AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const BrandLogo(size: 40),
                        const SizedBox(height: 12),
                        Text('About', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        _AboutRow(
                          label: 'Organization',
                          value: context.watch<BrandingPrefsController>().displayShopName,
                        ),
                        if (context.watch<BrandingPrefsController>().ownerName.isNotEmpty)
                          _AboutRow(
                            label: 'Owner',
                            value: context.watch<BrandingPrefsController>().ownerName,
                          ),
                        _AboutRow(label: 'App', value: packageInfo?.appName ?? kProductBrandName),
                        _AboutRow(
                          label: 'Version',
                          value: packageInfo == null
                              ? '…'
                              : '${packageInfo!.version} (${packageInfo!.buildNumber})',
                        ),
                        _AboutRow(label: 'Package', value: packageInfo?.packageName ?? '—'),
                      ],
                    ),
                  ),
                  AppSpace.sectionGap,
                  AppPanel(
                    padding: EdgeInsets.zero,
                    child: ListTile(
                      leading: const Icon(Icons.logout_rounded, color: AppColors.danger),
                      title: Text(
                        strings.t('logout'),
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          color: AppColors.danger,
                        ),
                      ),
                      onTap: _logout,
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
}

class _AboutRow extends StatelessWidget {
  const _AboutRow({required this.label, required this.value});
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
            child: Text(label, style: TextStyle(color: AppColors.muted, fontSize: 13)),
          ),
          Expanded(
            child: Text(value, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}

/// Opens HTML content (receipts, report previews) with share + browser.
class HtmlViewerScreen extends StatelessWidget {
  const HtmlViewerScreen({
    super.key,
    required this.html,
    this.title = 'Document',
    this.fileName = 'document.html',
  });

  final String html;
  final String title;
  final String fileName;

  String get _plain {
    var text = html;
    text = text.replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n');
    text = text.replaceAll(RegExp(r'</p>', caseSensitive: false), '\n\n');
    text = text.replaceAll(RegExp(r'</tr>', caseSensitive: false), '\n');
    text = text.replaceAll(RegExp(r'</(div|h\d|li)>', caseSensitive: false), '\n');
    text = text.replaceAll(RegExp(r'<td[^>]*>', caseSensitive: false), '  ');
    text = text.replaceAll(RegExp(r'<[^>]+>'), ' ');
    text = text.replaceAll('&nbsp;', ' ');
    text = text.replaceAll('&amp;', '&');
    text = text.replaceAll('&lt;', '<');
    text = text.replaceAll('&gt;', '>');
    text = text.replaceAll(RegExp(r'[ \t]+\n'), '\n');
    text = text.replaceAll(RegExp(r'\n{3,}'), '\n\n');
    text = text.replaceAll(RegExp(r'[ \t]{2,}'), ' ');
    return text.trim();
  }

  Future<File> _writeTemp() async {
    final dir = await getTemporaryDirectory();
    final safe = fileName.replaceAll(RegExp(r'[^\w.\-]+'), '_');
    final file = File('${dir.path}/$safe');
    final body = html.contains('<html')
        ? html
        : '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;padding:16px;line-height:1.45}</style></head><body>$html</body></html>';
    await file.writeAsString(body);
    return file;
  }

  Future<void> _share(BuildContext context) async {
    try {
      final file = await _writeTemp();
      await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path, mimeType: 'text/html')], subject: title),
      );
    } catch (e) {
      if (context.mounted) showErrorToast(context, e.toString());
    }
  }

  Future<void> _openBrowser(BuildContext context) async {
    try {
      final file = await _writeTemp();
      final uri = Uri.file(file.path);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && context.mounted) showErrorToast(context, 'Could not open browser');
    } catch (e) {
      if (context.mounted) showErrorToast(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(title),
        actions: [
          IconButton(
            tooltip: 'Share',
            onPressed: () => _share(context),
            icon: const Icon(Icons.ios_share_rounded),
          ),
          IconButton(
            tooltip: 'Open in browser',
            onPressed: () => _openBrowser(context),
            icon: const Icon(Icons.open_in_browser_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: AppSpace.page,
        children: [
          AppPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Readable preview',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.muted,
                  ),
                ),
                const SizedBox(height: 10),
                SelectableText(
                  _plain.isEmpty ? 'No content' : _plain,
                  style: GoogleFonts.plusJakartaSans(fontSize: 14, height: 1.45),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => _openBrowser(context),
            icon: const Icon(Icons.visibility_outlined),
            label: const Text('Open full HTML layout'),
          ),
        ],
      ),
    );
  }
}
