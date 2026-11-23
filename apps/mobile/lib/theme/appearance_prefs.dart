import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_theme.dart';
import 'theme_controller.dart';

/// Mobile-only counter prefs (device-local). Everyday neutrals plus Monsoon /
/// OLED / outdoor — phone-first, not desktop POS layouts.
class AppearancePrefsController extends ChangeNotifier {
  AppearancePrefsController._();
  static final AppearancePrefsController instance = AppearancePrefsController._();

  static const _kSound = 'rs_mobile_sound_scan';
  static const _kHaptic = 'rs_mobile_haptic';
  static const _kLargeTouch = 'rs_mobile_large_touch';
  static const _kCalcFab = 'rs_mobile_calc_fab';
  static const _kReduceMotion = 'rs_mobile_reduce_motion';
  static const _kHardwareScanFocus = 'rs_mobile_hw_scan_focus';
  static const _kPrinterMac = 'rs_mobile_printer_mac';

  bool soundOnScan = false;
  bool hapticFeedback = true;
  bool largeTouchTargets = true;
  bool showCalculatorFab = true;
  bool reduceMotion = false;
  /// When true, Stock tab auto-focuses the hardware gun field (opens soft keyboard on phones).
  bool hardwareScannerFocus = false;
  String printerMac = '';

  Future<void> bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    soundOnScan = prefs.getBool(_kSound) ?? false;
    hapticFeedback = prefs.getBool(_kHaptic) ?? true;
    largeTouchTargets = prefs.getBool(_kLargeTouch) ?? true;
    showCalculatorFab = prefs.getBool(_kCalcFab) ?? true;
    reduceMotion = prefs.getBool(_kReduceMotion) ?? false;
    hardwareScannerFocus = prefs.getBool(_kHardwareScanFocus) ?? false;
    printerMac = prefs.getString(_kPrinterMac) ?? '';
    notifyListeners();
  }

  Future<void> patch({
    bool? soundOnScan,
    bool? hapticFeedback,
    bool? largeTouchTargets,
    bool? showCalculatorFab,
    bool? reduceMotion,
    bool? hardwareScannerFocus,
    String? printerMac,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    if (soundOnScan != null) {
      this.soundOnScan = soundOnScan;
      await prefs.setBool(_kSound, soundOnScan);
    }
    if (hapticFeedback != null) {
      this.hapticFeedback = hapticFeedback;
      await prefs.setBool(_kHaptic, hapticFeedback);
    }
    if (largeTouchTargets != null) {
      this.largeTouchTargets = largeTouchTargets;
      await prefs.setBool(_kLargeTouch, largeTouchTargets);
    }
    if (showCalculatorFab != null) {
      this.showCalculatorFab = showCalculatorFab;
      await prefs.setBool(_kCalcFab, showCalculatorFab);
    }
    if (reduceMotion != null) {
      this.reduceMotion = reduceMotion;
      await prefs.setBool(_kReduceMotion, reduceMotion);
    }
    if (hardwareScannerFocus != null) {
      this.hardwareScannerFocus = hardwareScannerFocus;
      await prefs.setBool(_kHardwareScanFocus, hardwareScannerFocus);
    }
    if (printerMac != null) {
      this.printerMac = printerMac.trim();
      await prefs.setString(_kPrinterMac, this.printerMac);
    }
    notifyListeners();
  }
}

class MobileThemeOption {
  const MobileThemeOption({
    required this.mode,
    required this.title,
    required this.subtitle,
    required this.bg,
    required this.surface,
    required this.accent,
    required this.ink,
    this.gradient,
  });

  final AppThemeMode mode;
  final String title;
  final String subtitle;
  final Color bg;
  final Color surface;
  final Color accent;
  final Color ink;
  /// Optional 2–3 stop preview gradient for the theme card header.
  final List<Color>? gradient;
}

const kMobileThemeOptions = <MobileThemeOption>[
  MobileThemeOption(
    mode: AppThemeMode.simpleWhite,
    title: 'Simple White',
    subtitle: 'Clean white · easy all day',
    bg: Color(0xFFF4F4F5),
    surface: Colors.white,
    accent: Color(0xFF2563EB),
    ink: Color(0xFF18181B),
  ),
  MobileThemeOption(
    mode: AppThemeMode.businessBlue,
    title: 'Business Blue',
    subtitle: 'Light office · clear actions',
    bg: Color(0xFFF1F5F9),
    surface: Colors.white,
    accent: Color(0xFF1D4ED8),
    ink: Color(0xFF0F172A),
  ),
  MobileThemeOption(
    mode: AppThemeMode.indigoTrust,
    title: 'Indigo Trust',
    subtitle: 'Banking indigo · premium feel',
    bg: Color(0xFFEEF2FF),
    surface: Colors.white,
    accent: Color(0xFF4338CA),
    ink: Color(0xFF1E1B4B),
  ),
  MobileThemeOption(
    mode: AppThemeMode.skySoft,
    title: 'Sky Soft',
    subtitle: 'Calm sky · soft fintech',
    bg: Color(0xFFF0F9FF),
    surface: Colors.white,
    accent: Color(0xFF0284C7),
    ink: Color(0xFF0C4A6E),
  ),
  MobileThemeOption(
    mode: AppThemeMode.coralPulse,
    title: 'Coral Pulse',
    subtitle: 'Retail energy · strong CTAs',
    bg: Color(0xFFFFF1F2),
    surface: Colors.white,
    accent: Color(0xFFE11D48),
    ink: Color(0xFF4C0519),
  ),
  MobileThemeOption(
    mode: AppThemeMode.mintPaper,
    title: 'Mint Paper',
    subtitle: 'Fresh green · inventory calm',
    bg: Color(0xFFF0FDF4),
    surface: Colors.white,
    accent: Color(0xFF16A34A),
    ink: Color(0xFF14532D),
  ),
  MobileThemeOption(
    mode: AppThemeMode.softGrey,
    title: 'Soft Grey',
    subtitle: 'Quiet greys · no distraction',
    bg: Color(0xFFE8EAED),
    surface: Color(0xFFF8F9FA),
    accent: Color(0xFF475569),
    ink: Color(0xFF0F172A),
  ),
  MobileThemeOption(
    mode: AppThemeMode.charcoalClean,
    title: 'Charcoal Clean',
    subtitle: 'White pages · charcoal buttons',
    bg: Color(0xFFFAFAFA),
    surface: Colors.white,
    accent: Color(0xFF1F2937),
    ink: Color(0xFF111827),
  ),
  MobileThemeOption(
    mode: AppThemeMode.ashDesk,
    title: 'Ash Desk',
    subtitle: 'Warm ash · soft lighting',
    bg: Color(0xFFEDEBE8),
    surface: Color(0xFFFAF9F7),
    accent: Color(0xFF57534E),
    ink: Color(0xFF1C1917),
  ),
  MobileThemeOption(
    mode: AppThemeMode.light,
    title: 'Monsoon Light',
    subtitle: 'Calm teal · indoor counters',
    bg: Color(0xFFF3F7F6),
    surface: Colors.white,
    accent: Color(0xFF0F766E),
    ink: Color(0xFF14201E),
  ),
  MobileThemeOption(
    mode: AppThemeMode.oceanDusk,
    title: 'Ocean Dusk',
    subtitle: 'Navy night · sky cyan glow',
    bg: Color(0xFF0B1220),
    surface: Color(0xFF111827),
    accent: Color(0xFF38BDF8),
    ink: Color(0xFFE2E8F0),
  ),
  MobileThemeOption(
    mode: AppThemeMode.dark,
    title: 'Midnight OLED',
    subtitle: 'Soft graphite · night shifts',
    bg: Color(0xFF0B1413),
    surface: Color(0xFF13201E),
    accent: Color(0xFF2DD4BF),
    ink: Color(0xFFE8F5F2),
  ),
  MobileThemeOption(
    mode: AppThemeMode.noirGold,
    title: 'Noir Gold',
    subtitle: 'Luxury black · gold accents',
    bg: Color(0xFF0C0A09),
    surface: Color(0xFF1C1917),
    accent: Color(0xFFEAB308),
    ink: Color(0xFFFAFAF9),
  ),
  MobileThemeOption(
    mode: AppThemeMode.sunsetGlow,
    title: 'Sunset Glow',
    subtitle: 'Gradient · orange → rose',
    bg: Color(0xFFFFF7ED),
    surface: Colors.white,
    accent: Color(0xFFEA580C),
    ink: Color(0xFF431407),
    gradient: [Color(0xFFEA580C), Color(0xFFE11D48), Color(0xFFDB2777)],
  ),
  MobileThemeOption(
    mode: AppThemeMode.citrusWave,
    title: 'Citrus Wave',
    subtitle: 'Gradient · gold → emerald',
    bg: Color(0xFFFEFCE8),
    surface: Colors.white,
    accent: Color(0xFF65A30D),
    ink: Color(0xFF365314),
    gradient: [Color(0xFFEAB308), Color(0xFF84CC16), Color(0xFF10B981)],
  ),
  MobileThemeOption(
    mode: AppThemeMode.cobaltAurora,
    title: 'Cobalt Aurora',
    subtitle: 'Gradient · blue → teal',
    bg: Color(0xFFF0F9FF),
    surface: Colors.white,
    accent: Color(0xFF0284C7),
    ink: Color(0xFF0C4A6E),
    gradient: [Color(0xFF1D4ED8), Color(0xFF0891B2), Color(0xFF14B8A6)],
  ),
  MobileThemeOption(
    mode: AppThemeMode.berryBloom,
    title: 'Berry Bloom',
    subtitle: 'Gradient · berry → blush',
    bg: Color(0xFFFDF2F8),
    surface: Colors.white,
    accent: Color(0xFFDB2777),
    ink: Color(0xFF500724),
    gradient: [Color(0xFF9D174D), Color(0xFFDB2777), Color(0xFFFB7185)],
  ),
  MobileThemeOption(
    mode: AppThemeMode.emeraldFlame,
    title: 'Emerald Flame',
    subtitle: 'Gradient · emerald → amber',
    bg: Color(0xFFECFDF5),
    surface: Colors.white,
    accent: Color(0xFF059669),
    ink: Color(0xFF064E3B),
    gradient: [Color(0xFF065F46), Color(0xFF0D9488), Color(0xFFD97706)],
  ),
  MobileThemeOption(
    mode: AppThemeMode.twilightHarbor,
    title: 'Twilight Harbor',
    subtitle: 'Dark gradient · navy → sky',
    bg: Color(0xFF020617),
    surface: Color(0xFF0F172A),
    accent: Color(0xFF60A5FA),
    ink: Color(0xFFE2E8F0),
    gradient: [Color(0xFF0F172A), Color(0xFF1E3A8A), Color(0xFF0369A1)],
  ),
  MobileThemeOption(
    mode: AppThemeMode.outdoor,
    title: 'Sunlit Outdoor',
    subtitle: 'High contrast · bright shops',
    bg: Color(0xFFFFFFF0),
    surface: Colors.white,
    accent: Color(0xFF065F5B),
    ink: Colors.black,
  ),
];

/// Compact Design & settings sheet / section for phone.
class AppearanceSettingsSection extends StatelessWidget {
  const AppearanceSettingsSection({super.key});

  @override
  Widget build(BuildContext context) {
    final themeCtrl = ThemeController.instance;
    final prefs = AppearancePrefsController.instance;
    return ListenableBuilder(
      listenable: Listenable.merge([themeCtrl, prefs]),
      builder: (context, _) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Design & settings',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              'Everyday neutrals first, then Monsoon, OLED dark, and sunlit outdoor. Layout split is desktop-only.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.muted),
            ),
            const SizedBox(height: 14),
            ...kMobileThemeOptions.map((opt) {
              final selected = themeCtrl.mode == opt.mode;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: selected ? opt.accent.withValues(alpha: 0.12) : AppColors.surface,
                  borderRadius: BorderRadius.circular(16),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => themeCtrl.setMode(opt.mode),
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: selected ? opt.accent : AppColors.border,
                          width: selected ? 2 : 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          _ThemePreviewCard(opt: opt, selected: selected),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  opt.title,
                                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                        fontWeight: FontWeight.w700,
                                      ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  opt.subtitle,
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                        color: AppColors.muted,
                                      ),
                                ),
                                if (selected)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Text(
                                      'Active',
                                      style: TextStyle(
                                        color: opt.accent,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          Icon(
                            selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                            color: selected ? opt.accent : AppColors.muted,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
            Text(
              'Counter',
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: AppColors.muted,
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 6),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Hardware scanner focus'),
              subtitle: const Text('Auto-focus barcode gun field on Stock (may open keypad)'),
              value: prefs.hardwareScannerFocus,
              activeColor: AppColors.teal,
              onChanged: (v) => prefs.patch(hardwareScannerFocus: v),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Scan beep'),
              subtitle: const Text('Soft sound when a barcode adds a line'),
              value: prefs.soundOnScan,
              activeColor: AppColors.teal,
              onChanged: (v) => prefs.patch(soundOnScan: v),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Haptic feedback'),
              subtitle: const Text('Light vibration on key actions'),
              value: prefs.hapticFeedback,
              activeColor: AppColors.teal,
              onChanged: (v) => prefs.patch(hapticFeedback: v),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Large touch targets'),
              subtitle: const Text('Bigger buttons for busy counters'),
              value: prefs.largeTouchTargets,
              activeColor: AppColors.teal,
              onChanged: (v) => prefs.patch(largeTouchTargets: v),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Floating calculator'),
              value: prefs.showCalculatorFab,
              activeColor: AppColors.teal,
              onChanged: (v) => prefs.patch(showCalculatorFab: v),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Reduce motion'),
              value: prefs.reduceMotion,
              activeColor: AppColors.teal,
              onChanged: (v) => prefs.patch(reduceMotion: v),
            ),
          ],
        );
      },
    );
  }
}

class _ThemePreviewCard extends StatelessWidget {
  const _ThemePreviewCard({required this.opt, required this.selected});
  final MobileThemeOption opt;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final header = opt.gradient != null && opt.gradient!.length >= 2
        ? Container(
            height: 12,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: opt.gradient!),
            ),
          )
        : Container(height: 12, color: opt.accent);
    return Container(
      width: 72,
      height: 56,
      decoration: BoxDecoration(
        color: opt.bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: opt.ink.withValues(alpha: 0.12)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          header,
          Expanded(
            child: Row(
              children: [
                Expanded(flex: 2, child: Container(color: opt.surface)),
                Expanded(
                  flex: 3,
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: Align(
                      alignment: Alignment.bottomRight,
                      child: Container(
                        width: 18,
                        height: 8,
                        decoration: BoxDecoration(
                          color: opt.accent,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
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
