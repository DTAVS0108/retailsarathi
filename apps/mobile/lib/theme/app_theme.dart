import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_metrics.dart';

/// Everyday neutrals + Monsoon / OLED / outdoor + curated retail looks.
enum AppThemeMode {
  simpleWhite,
  softGrey,
  businessBlue,
  charcoalClean,
  ashDesk,
  indigoTrust,
  coralPulse,
  mintPaper,
  skySoft,
  oceanDusk,
  noirGold,
  sunsetGlow,
  citrusWave,
  cobaltAurora,
  berryBloom,
  emeraldFlame,
  twilightHarbor,
  light,
  dark,
  outdoor,
}

String appThemeModeTitle(AppThemeMode mode) => switch (mode) {
      AppThemeMode.simpleWhite => 'Simple White',
      AppThemeMode.softGrey => 'Soft Grey',
      AppThemeMode.businessBlue => 'Business Blue',
      AppThemeMode.charcoalClean => 'Charcoal Clean',
      AppThemeMode.ashDesk => 'Ash Desk',
      AppThemeMode.indigoTrust => 'Indigo Trust',
      AppThemeMode.coralPulse => 'Coral Pulse',
      AppThemeMode.mintPaper => 'Mint Paper',
      AppThemeMode.skySoft => 'Sky Soft',
      AppThemeMode.oceanDusk => 'Ocean Dusk',
      AppThemeMode.noirGold => 'Noir Gold',
      AppThemeMode.sunsetGlow => 'Sunset Glow',
      AppThemeMode.citrusWave => 'Citrus Wave',
      AppThemeMode.cobaltAurora => 'Cobalt Aurora',
      AppThemeMode.berryBloom => 'Berry Bloom',
      AppThemeMode.emeraldFlame => 'Emerald Flame',
      AppThemeMode.twilightHarbor => 'Twilight Harbor',
      AppThemeMode.light => 'Monsoon Light',
      AppThemeMode.dark => 'Midnight OLED',
      AppThemeMode.outdoor => 'Sunlit Outdoor',
    };

String appThemeModeStorageKey(AppThemeMode mode) => switch (mode) {
      AppThemeMode.simpleWhite => 'simple-white',
      AppThemeMode.softGrey => 'soft-grey',
      AppThemeMode.businessBlue => 'business-blue',
      AppThemeMode.charcoalClean => 'charcoal-clean',
      AppThemeMode.ashDesk => 'ash-desk',
      AppThemeMode.indigoTrust => 'indigo-trust',
      AppThemeMode.coralPulse => 'coral-pulse',
      AppThemeMode.mintPaper => 'mint-paper',
      AppThemeMode.skySoft => 'sky-soft',
      AppThemeMode.oceanDusk => 'ocean-dusk',
      AppThemeMode.noirGold => 'noir-gold',
      AppThemeMode.sunsetGlow => 'sunset-glow',
      AppThemeMode.citrusWave => 'citrus-wave',
      AppThemeMode.cobaltAurora => 'cobalt-aurora',
      AppThemeMode.berryBloom => 'berry-bloom',
      AppThemeMode.emeraldFlame => 'emerald-flame',
      AppThemeMode.twilightHarbor => 'twilight-harbor',
      AppThemeMode.light => 'light',
      AppThemeMode.dark => 'dark',
      AppThemeMode.outdoor => 'outdoor',
    };

AppThemeMode appThemeModeFromStorage(String? raw) => switch (raw) {
      'simple-white' => AppThemeMode.simpleWhite,
      'soft-grey' => AppThemeMode.softGrey,
      'business-blue' => AppThemeMode.businessBlue,
      'charcoal-clean' => AppThemeMode.charcoalClean,
      'ash-desk' => AppThemeMode.ashDesk,
      'indigo-trust' => AppThemeMode.indigoTrust,
      'coral-pulse' => AppThemeMode.coralPulse,
      'mint-paper' => AppThemeMode.mintPaper,
      'sky-soft' => AppThemeMode.skySoft,
      'ocean-dusk' => AppThemeMode.oceanDusk,
      'noir-gold' => AppThemeMode.noirGold,
      'sunset-glow' => AppThemeMode.sunsetGlow,
      'citrus-wave' => AppThemeMode.citrusWave,
      'cobalt-aurora' => AppThemeMode.cobaltAurora,
      'berry-bloom' => AppThemeMode.berryBloom,
      'emerald-flame' => AppThemeMode.emeraldFlame,
      'twilight-harbor' => AppThemeMode.twilightHarbor,
      'dark' => AppThemeMode.dark,
      'outdoor' => AppThemeMode.outdoor,
      _ => AppThemeMode.light,
    };

/// RetailSarathi mobile visual system — neutrals + teal trust + amber POS energy.
///
/// Surface/text tokens follow [AppColors.applyMode] so themes update panels
/// and typography, not only the scaffold background.
class AppColors {
  AppColors._();

  static AppThemeMode _mode = AppThemeMode.light;

  static void applyMode(AppThemeMode mode) {
    _mode = mode;
  }

  static AppThemeMode get mode => _mode;

  static AppColorsLookup get lookup => AppColorsLookup.forMode(_mode);

  // Stable semantic colors
  static const amber = Color(0xFFF59E0B);
  static const amberDeep = Color(0xFFD97706);
  static const danger = Color(0xFFB91C1C);
  static const warn = Color(0xFFC2410C);

  /// Brand teal (Monsoon default) — prefer [teal] for themed accents.
  static const brandTeal = Color(0xFF0F766E);
  static const brandTealDark = Color(0xFF0A4F4A);

  /// Active theme primary (was always teal; now follows the selected look).
  static Color get teal => lookup.primary;
  static Color get tealDark => lookup.primaryDark;

  static Color get tealSoft => lookup.tealSoft;
  static Color get ink => lookup.ink;
  static Color get muted => lookup.muted;
  static Color get canvas => lookup.canvas;
  static Color get surface => lookup.surface;
  static Color get border => lookup.border;
  static Color get shadow => lookup.shadow;

  /// Resolve palette from [BuildContext] (preferred in widgets).
  static AppColorsLookup of(BuildContext context) {
    final extras = Theme.of(context).extension<AppThemeExtras>();
    if (extras != null) return AppColorsLookup.forMode(extras.mode);
    if (Theme.of(context).brightness == Brightness.dark) {
      return const AppColorsLookup.dark();
    }
    return const AppColorsLookup.light();
  }
}

/// Snapshot of theme colors for a given mode (safe in ThemeData builders).
class AppColorsLookup {
  const AppColorsLookup._({
    required this.ink,
    required this.muted,
    required this.canvas,
    required this.surface,
    required this.tealSoft,
    required this.primary,
    required this.primaryDark,
    required this.onPrimary,
    required this.secondary,
    required this.isOutdoor,
    required this.isDark,
    this.borderOverride,
    this.shadowOverride,
    this.gradientA,
    this.gradientB,
    this.gradientC,
  });

  const AppColorsLookup.simpleWhite()
      : this._(
          ink: const Color(0xFF18181B),
          muted: const Color(0xFF71717A),
          canvas: const Color(0xFFF4F4F5),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFDBEAFE),
          primary: const Color(0xFF2563EB),
          primaryDark: const Color(0xFF1D4ED8),
          onPrimary: Colors.white,
          secondary: const Color(0xFF64748B),
          isOutdoor: false,
          isDark: false,
        );

  const AppColorsLookup.softGrey()
      : this._(
          ink: const Color(0xFF0F172A),
          muted: const Color(0xFF64748B),
          canvas: const Color(0xFFE8EAED),
          surface: const Color(0xFFF8F9FA),
          tealSoft: const Color(0xFFE2E8F0),
          primary: const Color(0xFF475569),
          primaryDark: const Color(0xFF334155),
          onPrimary: Colors.white,
          secondary: const Color(0xFF94A3B8),
          isOutdoor: false,
          isDark: false,
        );

  const AppColorsLookup.businessBlue()
      : this._(
          ink: const Color(0xFF0F172A),
          muted: const Color(0xFF64748B),
          canvas: const Color(0xFFF1F5F9),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFDBEAFE),
          primary: const Color(0xFF1D4ED8),
          primaryDark: const Color(0xFF1E40AF),
          onPrimary: Colors.white,
          secondary: const Color(0xFF3B82F6),
          isOutdoor: false,
          isDark: false,
        );

  const AppColorsLookup.charcoalClean()
      : this._(
          ink: const Color(0xFF111827),
          muted: const Color(0xFF6B7280),
          canvas: const Color(0xFFFAFAFA),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFE5E7EB),
          primary: const Color(0xFF1F2937),
          primaryDark: const Color(0xFF111827),
          onPrimary: Colors.white,
          secondary: const Color(0xFF9CA3AF),
          isOutdoor: false,
          isDark: false,
        );

  const AppColorsLookup.ashDesk()
      : this._(
          ink: const Color(0xFF1C1917),
          muted: const Color(0xFF78716C),
          canvas: const Color(0xFFEDEBE8),
          surface: const Color(0xFFFAF9F7),
          tealSoft: const Color(0xFFE7E5E4),
          primary: const Color(0xFF57534E),
          primaryDark: const Color(0xFF44403C),
          onPrimary: const Color(0xFFFAFAF9),
          secondary: const Color(0xFFA8A29E),
          isOutdoor: false,
          isDark: false,
        );

  /// Banking / fintech trust — deep indigo on cool white.
  const AppColorsLookup.indigoTrust()
      : this._(
          ink: const Color(0xFF1E1B4B),
          muted: const Color(0xFF64748B),
          canvas: const Color(0xFFEEF2FF),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFE0E7FF),
          primary: const Color(0xFF4338CA),
          primaryDark: const Color(0xFF312E81),
          onPrimary: Colors.white,
          secondary: const Color(0xFF818CF8),
          isOutdoor: false,
          isDark: false,
        );

  /// Retail checkout energy — coral actions on soft blush.
  const AppColorsLookup.coralPulse()
      : this._(
          ink: const Color(0xFF4C0519),
          muted: const Color(0xFF9F6B78),
          canvas: const Color(0xFFFFF1F2),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFFFE4E6),
          primary: const Color(0xFFE11D48),
          primaryDark: const Color(0xFFBE123C),
          onPrimary: Colors.white,
          secondary: const Color(0xFFFB7185),
          isOutdoor: false,
          isDark: false,
        );

  /// Fresh inventory / wellness retail — soft mint paper.
  const AppColorsLookup.mintPaper()
      : this._(
          ink: const Color(0xFF14532D),
          muted: const Color(0xFF4B7B5A),
          canvas: const Color(0xFFF0FDF4),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFDCFCE7),
          primary: const Color(0xFF16A34A),
          primaryDark: const Color(0xFF15803D),
          onPrimary: Colors.white,
          secondary: const Color(0xFF86EFAC),
          isOutdoor: false,
          isDark: false,
        );

  /// Calm sky — popular soft-fintech light look.
  const AppColorsLookup.skySoft()
      : this._(
          ink: const Color(0xFF0C4A6E),
          muted: const Color(0xFF0369A1),
          canvas: const Color(0xFFF0F9FF),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFE0F2FE),
          primary: const Color(0xFF0284C7),
          primaryDark: const Color(0xFF0369A1),
          onPrimary: Colors.white,
          secondary: const Color(0xFF38BDF8),
          isOutdoor: false,
          isDark: false,
        );

  /// Modern banking dark — deep navy + sky cyan.
  const AppColorsLookup.oceanDusk()
      : this._(
          ink: const Color(0xFFE2E8F0),
          muted: const Color(0xFF94A3B8),
          canvas: const Color(0xFF0B1220),
          surface: const Color(0xFF111827),
          tealSoft: const Color(0xFF1E3A5F),
          primary: const Color(0xFF38BDF8),
          primaryDark: const Color(0xFF0EA5E9),
          onPrimary: const Color(0xFF0C4A6E),
          secondary: const Color(0xFFFBBF24),
          isOutdoor: false,
          isDark: true,
          gradientA: const Color(0xFF0B1220),
          gradientB: const Color(0xFF0E7490),
          gradientC: const Color(0xFF38BDF8),
        );

  /// Luxury night counter — near-black with gold accents.
  const AppColorsLookup.noirGold()
      : this._(
          ink: const Color(0xFFFAFAF9),
          muted: const Color(0xFFA8A29E),
          canvas: const Color(0xFF0C0A09),
          surface: const Color(0xFF1C1917),
          tealSoft: const Color(0xFF292524),
          primary: const Color(0xFFEAB308),
          primaryDark: const Color(0xFFCA8A04),
          onPrimary: const Color(0xFF1C1917),
          secondary: const Color(0xFFFDE68A),
          isOutdoor: false,
          isDark: true,
          gradientA: const Color(0xFF0C0A09),
          gradientB: const Color(0xFF44403C),
          gradientC: const Color(0xFFCA8A04),
        );

  const AppColorsLookup.light()
      : this._(
          ink: const Color(0xFF14201E),
          muted: const Color(0xFF5B6B68),
          canvas: const Color(0xFFF3F7F6),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFCCFBF1),
          primary: const Color(0xFF0F766E),
          primaryDark: const Color(0xFF0A4F4A),
          onPrimary: Colors.white,
          secondary: const Color(0xFFF59E0B),
          isOutdoor: false,
          isDark: false,
        );

  const AppColorsLookup.dark()
      : this._(
          ink: const Color(0xFFE8F5F2),
          muted: const Color(0xFF9BB5B0),
          canvas: const Color(0xFF0B1413),
          surface: const Color(0xFF13201E),
          tealSoft: const Color(0xFF134E4A),
          primary: const Color(0xFF2DD4BF),
          primaryDark: const Color(0xFF14B8A6),
          onPrimary: const Color(0xFF042F2E),
          secondary: const Color(0xFFF59E0B),
          isOutdoor: false,
          isDark: true,
        );

  const AppColorsLookup.outdoor()
      : this._(
          ink: Colors.black,
          muted: const Color(0xFF1F2937),
          canvas: const Color(0xFFFFFFF0),
          surface: Colors.white,
          tealSoft: const Color(0xFFCCFBF1),
          primary: const Color(0xFF065F5B),
          primaryDark: const Color(0xFF044F4B),
          onPrimary: Colors.white,
          secondary: const Color(0xFFB45309),
          isOutdoor: true,
          isDark: false,
          borderOverride: const Color(0xBF000000),
          shadowOverride: const Color(0x14000000),
        );

  /// Warm sunset gradient — orange → coral → rose.
  const AppColorsLookup.sunsetGlow()
      : this._(
          ink: const Color(0xFF431407),
          muted: const Color(0xFF9A3412),
          canvas: const Color(0xFFFFF7ED),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFFFEDD5),
          primary: const Color(0xFFEA580C),
          primaryDark: const Color(0xFFC2410C),
          onPrimary: Colors.white,
          secondary: const Color(0xFFFB7185),
          isOutdoor: false,
          isDark: false,
          gradientA: const Color(0xFFEA580C),
          gradientB: const Color(0xFFE11D48),
          gradientC: const Color(0xFFDB2777),
        );

  /// Fresh citrus gradient — gold → lime → emerald.
  const AppColorsLookup.citrusWave()
      : this._(
          ink: const Color(0xFF365314),
          muted: const Color(0xFF4D7C0F),
          canvas: const Color(0xFFFEFCE8),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFECFCCB),
          primary: const Color(0xFF65A30D),
          primaryDark: const Color(0xFF4D7C0F),
          onPrimary: Colors.white,
          secondary: const Color(0xFFEAB308),
          isOutdoor: false,
          isDark: false,
          gradientA: const Color(0xFFEAB308),
          gradientB: const Color(0xFF84CC16),
          gradientC: const Color(0xFF10B981),
        );

  /// Cobalt → cyan → teal aurora (popular retail dashboard look).
  const AppColorsLookup.cobaltAurora()
      : this._(
          ink: const Color(0xFF0C4A6E),
          muted: const Color(0xFF0369A1),
          canvas: const Color(0xFFF0F9FF),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFCFFAFE),
          primary: const Color(0xFF0284C7),
          primaryDark: const Color(0xFF1D4ED8),
          onPrimary: Colors.white,
          secondary: const Color(0xFF14B8A6),
          isOutdoor: false,
          isDark: false,
          gradientA: const Color(0xFF1D4ED8),
          gradientB: const Color(0xFF0891B2),
          gradientC: const Color(0xFF14B8A6),
        );

  /// Soft berry bloom — magenta → rose → blush.
  const AppColorsLookup.berryBloom()
      : this._(
          ink: const Color(0xFF500724),
          muted: const Color(0xFF9D174D),
          canvas: const Color(0xFFFDF2F8),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFFCE7F3),
          primary: const Color(0xFFDB2777),
          primaryDark: const Color(0xFFBE185D),
          onPrimary: Colors.white,
          secondary: const Color(0xFFF472B6),
          isOutdoor: false,
          isDark: false,
          gradientA: const Color(0xFF9D174D),
          gradientB: const Color(0xFFDB2777),
          gradientC: const Color(0xFFFB7185),
        );

  /// Emerald → teal → amber flame (money + energy).
  const AppColorsLookup.emeraldFlame()
      : this._(
          ink: const Color(0xFF064E3B),
          muted: const Color(0xFF047857),
          canvas: const Color(0xFFECFDF5),
          surface: const Color(0xFFFFFFFF),
          tealSoft: const Color(0xFFD1FAE5),
          primary: const Color(0xFF059669),
          primaryDark: const Color(0xFF047857),
          onPrimary: Colors.white,
          secondary: const Color(0xFFF59E0B),
          isOutdoor: false,
          isDark: false,
          gradientA: const Color(0xFF065F46),
          gradientB: const Color(0xFF0D9488),
          gradientC: const Color(0xFFD97706),
        );

  /// Dark harbor twilight — navy → cobalt → sky.
  const AppColorsLookup.twilightHarbor()
      : this._(
          ink: const Color(0xFFE2E8F0),
          muted: const Color(0xFF94A3B8),
          canvas: const Color(0xFF020617),
          surface: const Color(0xFF0F172A),
          tealSoft: const Color(0xFF1E3A5F),
          primary: const Color(0xFF60A5FA),
          primaryDark: const Color(0xFF2563EB),
          onPrimary: const Color(0xFF0F172A),
          secondary: const Color(0xFF38BDF8),
          isOutdoor: false,
          isDark: true,
          gradientA: const Color(0xFF0F172A),
          gradientB: const Color(0xFF1E3A8A),
          gradientC: const Color(0xFF0369A1),
        );

  factory AppColorsLookup.forMode(AppThemeMode mode) => switch (mode) {
        AppThemeMode.simpleWhite => const AppColorsLookup.simpleWhite(),
        AppThemeMode.softGrey => const AppColorsLookup.softGrey(),
        AppThemeMode.businessBlue => const AppColorsLookup.businessBlue(),
        AppThemeMode.charcoalClean => const AppColorsLookup.charcoalClean(),
        AppThemeMode.ashDesk => const AppColorsLookup.ashDesk(),
        AppThemeMode.indigoTrust => const AppColorsLookup.indigoTrust(),
        AppThemeMode.coralPulse => const AppColorsLookup.coralPulse(),
        AppThemeMode.mintPaper => const AppColorsLookup.mintPaper(),
        AppThemeMode.skySoft => const AppColorsLookup.skySoft(),
        AppThemeMode.oceanDusk => const AppColorsLookup.oceanDusk(),
        AppThemeMode.noirGold => const AppColorsLookup.noirGold(),
        AppThemeMode.sunsetGlow => const AppColorsLookup.sunsetGlow(),
        AppThemeMode.citrusWave => const AppColorsLookup.citrusWave(),
        AppThemeMode.cobaltAurora => const AppColorsLookup.cobaltAurora(),
        AppThemeMode.berryBloom => const AppColorsLookup.berryBloom(),
        AppThemeMode.emeraldFlame => const AppColorsLookup.emeraldFlame(),
        AppThemeMode.twilightHarbor => const AppColorsLookup.twilightHarbor(),
        AppThemeMode.light => const AppColorsLookup.light(),
        AppThemeMode.dark => const AppColorsLookup.dark(),
        AppThemeMode.outdoor => const AppColorsLookup.outdoor(),
      };

  final Color ink;
  final Color muted;
  final Color canvas;
  final Color surface;
  final Color tealSoft;
  final Color primary;
  final Color primaryDark;
  final Color onPrimary;
  final Color secondary;
  final bool isOutdoor;
  final bool isDark;
  final Color? borderOverride;
  final Color? shadowOverride;
  final Color? gradientA;
  final Color? gradientB;
  final Color? gradientC;

  /// True when this theme defines a custom 3-stop hero gradient.
  bool get hasCustomGradient => gradientA != null && gradientB != null && gradientC != null;

  /// Header / hero gradient colors (3 stops).
  List<Color> get heroGradientColors {
    if (hasCustomGradient) return [gradientA!, gradientB!, gradientC!];
    return [
      primaryDark,
      primary,
      Color.lerp(primary, isDark ? Colors.white : Colors.white, isDark ? 0.18 : 0.28)!,
    ];
  }

  LinearGradient get heroGradient => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: heroGradientColors,
        stops: const [0.0, 0.55, 1.0],
      );

  Color get border =>
      borderOverride ??
      (isDark ? Colors.white.withValues(alpha: 0.08) : primary.withValues(alpha: 0.08));

  Color get shadow =>
      shadowOverride ??
      (isDark
          ? Colors.black.withValues(alpha: 0.35)
          : primaryDark.withValues(alpha: isOutdoor ? 0.08 : 0.04));

  /// Readable text on [surface] / cards.
  Color get onSurface => ink;

  /// Soft fill for chips/keys that must stay readable with [ink].
  Color get softFill =>
      isDark ? Color.lerp(surface, Colors.white, 0.08)! : Color.lerp(surface, primary, 0.08)!;

  /// Forced dark ink for always-white fields (POS header inputs, etc.).
  static const Color onWhiteField = Color(0xFF18181B);
  static const Color mutedOnWhiteField = Color(0xFF475569);

  /// Readable primary text for [background] (fixes light ink on white cards).
  Color inkOn(Color background) =>
      background.computeLuminance() > 0.52 ? onWhiteField : ink;

  /// Readable secondary text for [background].
  Color mutedOn(Color background) =>
      background.computeLuminance() > 0.52 ? mutedOnWhiteField : muted;
}

/// Marks theme mode inside [ThemeData.extensions].
class AppThemeExtras extends ThemeExtension<AppThemeExtras> {
  const AppThemeExtras({required this.mode});

  final AppThemeMode mode;

  bool get isOutdoor => mode == AppThemeMode.outdoor;

  @override
  AppThemeExtras copyWith({AppThemeMode? mode}) =>
      AppThemeExtras(mode: mode ?? this.mode);

  @override
  AppThemeExtras lerp(ThemeExtension<AppThemeExtras>? other, double t) {
    if (other is! AppThemeExtras) return this;
    return t < 0.5 ? this : other;
  }
}

ThemeData buildAppTheme() => buildNeutralTheme(const AppColorsLookup.light(), AppThemeMode.light);

ThemeData buildNeutralTheme(AppColorsLookup c, AppThemeMode mode) {
  final base = ColorScheme.fromSeed(
    seedColor: c.primary,
    primary: c.primary,
    secondary: c.secondary,
    surface: c.surface,
    brightness: Brightness.light,
  );

  final textTheme = GoogleFonts.plusJakartaSansTextTheme().apply(
    bodyColor: c.ink,
    displayColor: c.ink,
  );

  return ThemeData(
    useMaterial3: true,
    visualDensity: VisualDensity.standard,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    extensions: [AppThemeExtras(mode: mode)],
    colorScheme: base.copyWith(
      primary: c.primary,
      secondary: c.secondary,
      onPrimary: c.onPrimary,
      onSecondary: c.ink,
      surface: c.surface,
      onSurface: c.ink,
      onSurfaceVariant: c.muted,
      error: AppColors.danger,
    ),
    scaffoldBackgroundColor: c.canvas,
    textTheme: textTheme.copyWith(
      titleLarge: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3, color: c.ink),
      titleMedium: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.2, color: c.ink),
      bodyLarge: textTheme.bodyLarge?.copyWith(color: c.ink),
      bodyMedium: textTheme.bodyMedium?.copyWith(height: 1.35, color: c.ink),
      bodySmall: textTheme.bodySmall?.copyWith(color: c.muted, height: 1.35),
      labelLarge: textTheme.labelLarge?.copyWith(color: c.ink),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.canvas,
      foregroundColor: c.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: 16,
      toolbarHeight: 56,
      titleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
        color: c.ink,
      ),
      iconTheme: IconThemeData(color: c.ink, size: 22),
    ),
    listTileTheme: ListTileThemeData(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      minVerticalPadding: 10,
      horizontalTitleGap: 12,
      iconColor: c.primary,
      textColor: c.ink,
      titleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: c.ink,
      ),
      subtitleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        color: c.muted,
        height: 1.3,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: c.border),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface,
      indicatorColor: c.tealSoft,
      elevation: 8,
      shadowColor: c.primaryDark.withValues(alpha: 0.08),
      height: 70,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return GoogleFonts.plusJakartaSans(
          fontSize: 11,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected ? c.primary : c.muted,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          size: 22,
          color: selected ? c.primary : c.muted,
        );
      }),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      isDense: false,
      floatingLabelBehavior: FloatingLabelBehavior.auto,
      alignLabelWithHint: true,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: c.primary.withValues(alpha: 0.16)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: c.primary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.danger),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.danger, width: 1.5),
      ),
      contentPadding: AppMetrics.fieldPadding,
      constraints: AppMetrics.fieldConstraints,
      labelStyle: GoogleFonts.plusJakartaSans(color: c.muted, fontWeight: FontWeight.w500),
      floatingLabelStyle: GoogleFonts.plusJakartaSans(color: c.primaryDark, fontWeight: FontWeight.w600),
      hintStyle: GoogleFonts.plusJakartaSans(color: c.muted.withValues(alpha: 0.8)),
      helperStyle: GoogleFonts.plusJakartaSans(fontSize: 11, color: c.muted, height: 1.35),
      errorStyle: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.danger),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.primary,
        foregroundColor: c.onPrimary,
        minimumSize: AppMetrics.buttonMinSize,
        padding: AppMetrics.buttonPadding,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppMetrics.controlRadius)),
        textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.primaryDark,
        minimumSize: AppMetrics.buttonMinSize,
        padding: AppMetrics.buttonPadding,
        side: BorderSide(color: c.primary.withValues(alpha: 0.3)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppMetrics.controlRadius)),
        textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: c.primary,
        minimumSize: const Size(48, AppMetrics.controlHeightDense),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 13),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: c.canvas,
      selectedColor: c.primary,
      disabledColor: c.canvas,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
      labelPadding: const EdgeInsets.symmetric(horizontal: 2),
      labelStyle: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w600, color: c.ink),
      secondaryLabelStyle: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: c.onPrimary),
      side: BorderSide(color: c.muted.withValues(alpha: 0.25)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      showCheckmark: false,
    ),
    dividerTheme: DividerThemeData(
      color: c.primary.withValues(alpha: 0.08),
      thickness: 1,
      space: 1,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      showDragHandle: true,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      titleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: c.ink,
      ),
      contentTextStyle: GoogleFonts.plusJakartaSans(color: c.ink, height: 1.4),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.ink,
      contentTextStyle: GoogleFonts.plusJakartaSans(color: c.surface, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: c.primary,
      foregroundColor: c.onPrimary,
      elevation: 2,
      extendedPadding: const EdgeInsets.symmetric(horizontal: 18),
      extendedTextStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: c.primary,
      linearTrackColor: c.tealSoft,
    ),
    iconTheme: IconThemeData(color: c.ink),
    primaryIconTheme: IconThemeData(color: c.ink),
  );
}
