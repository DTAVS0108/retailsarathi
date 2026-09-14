import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_metrics.dart';
import 'app_theme.dart';
import 'app_ui.dart';

/// Everyday neutrals + Monsoon light / OLED dark / outdoor themes.
class ThemeController extends ChangeNotifier {
  ThemeController._();
  static final ThemeController instance = ThemeController._();

  static const prefKey = 'app_theme_mode';
  /// Hex `#RRGGBB` read by Android [MainActivity] for native splash / window bg.
  static const splashColorPrefKey = 'splash_bg_color';
  AppThemeMode _mode = AppThemeMode.light;

  AppThemeMode get mode => _mode;

  Future<void> bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    _mode = appThemeModeFromStorage(prefs.getString(prefKey));
    AppColors.applyMode(_mode);
    await _persistSplashColor(prefs);
    _syncSystemUi();
    notifyListeners();
  }

  Future<void> setMode(AppThemeMode mode) async {
    _mode = mode;
    AppColors.applyMode(mode);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(prefKey, appThemeModeStorageKey(mode));
    await _persistSplashColor(prefs);
    _syncSystemUi();
    notifyListeners();
  }

  AppColorsLookup get colors => AppColorsLookup.forMode(_mode);

  /// Branded splash / launch background for the active theme.
  Color get splashBackground => colors.heroGradientColors.first;

  Future<void> _persistSplashColor(SharedPreferences prefs) async {
    await prefs.setString(splashColorPrefKey, colorToSplashHex(splashBackground));
  }

  void _syncSystemUi() {
    final bg = splashBackground;
    final lightIcons = bg.computeLuminance() < 0.45;
    SystemChrome.setSystemUIOverlayStyle(
      SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: lightIcons ? Brightness.light : Brightness.dark,
        statusBarBrightness: lightIcons ? Brightness.dark : Brightness.light,
        systemNavigationBarColor: colors.canvas,
        systemNavigationBarIconBrightness:
            colors.isDark ? Brightness.light : Brightness.dark,
      ),
    );
  }

  ThemeData buildTheme() {
    return switch (_mode) {
      AppThemeMode.simpleWhite =>
        buildNeutralTheme(const AppColorsLookup.simpleWhite(), AppThemeMode.simpleWhite),
      AppThemeMode.softGrey =>
        buildNeutralTheme(const AppColorsLookup.softGrey(), AppThemeMode.softGrey),
      AppThemeMode.businessBlue =>
        buildNeutralTheme(const AppColorsLookup.businessBlue(), AppThemeMode.businessBlue),
      AppThemeMode.charcoalClean =>
        buildNeutralTheme(const AppColorsLookup.charcoalClean(), AppThemeMode.charcoalClean),
      AppThemeMode.ashDesk =>
        buildNeutralTheme(const AppColorsLookup.ashDesk(), AppThemeMode.ashDesk),
      AppThemeMode.indigoTrust =>
        buildNeutralTheme(const AppColorsLookup.indigoTrust(), AppThemeMode.indigoTrust),
      AppThemeMode.coralPulse =>
        buildNeutralTheme(const AppColorsLookup.coralPulse(), AppThemeMode.coralPulse),
      AppThemeMode.mintPaper =>
        buildNeutralTheme(const AppColorsLookup.mintPaper(), AppThemeMode.mintPaper),
      AppThemeMode.skySoft =>
        buildNeutralTheme(const AppColorsLookup.skySoft(), AppThemeMode.skySoft),
      AppThemeMode.sunsetGlow =>
        buildNeutralTheme(const AppColorsLookup.sunsetGlow(), AppThemeMode.sunsetGlow),
      AppThemeMode.citrusWave =>
        buildNeutralTheme(const AppColorsLookup.citrusWave(), AppThemeMode.citrusWave),
      AppThemeMode.cobaltAurora =>
        buildNeutralTheme(const AppColorsLookup.cobaltAurora(), AppThemeMode.cobaltAurora),
      AppThemeMode.berryBloom =>
        buildNeutralTheme(const AppColorsLookup.berryBloom(), AppThemeMode.berryBloom),
      AppThemeMode.emeraldFlame =>
        buildNeutralTheme(const AppColorsLookup.emeraldFlame(), AppThemeMode.emeraldFlame),
      AppThemeMode.oceanDusk =>
        buildDarkNeutralTheme(const AppColorsLookup.oceanDusk(), AppThemeMode.oceanDusk),
      AppThemeMode.noirGold =>
        buildDarkNeutralTheme(const AppColorsLookup.noirGold(), AppThemeMode.noirGold),
      AppThemeMode.twilightHarbor =>
        buildDarkNeutralTheme(const AppColorsLookup.twilightHarbor(), AppThemeMode.twilightHarbor),
      AppThemeMode.light => buildAppTheme(),
      AppThemeMode.dark => buildDarkTheme(),
      AppThemeMode.outdoor => buildOutdoorTheme(),
    };
  }
}

/// `#RRGGBB` for Android [Color.parseColor].
String colorToSplashHex(Color color) {
  final rgb = color.toARGB32() & 0xFFFFFF;
  return '#${rgb.toRadixString(16).padLeft(6, '0').toUpperCase()}';
}

ThemeData buildDarkTheme() =>
    buildDarkNeutralTheme(const AppColorsLookup.dark(), AppThemeMode.dark);

ThemeData buildDarkNeutralTheme(AppColorsLookup c, AppThemeMode mode) {
  final base = ColorScheme.fromSeed(
    seedColor: c.primary,
    brightness: Brightness.dark,
    primary: c.primary,
    secondary: c.secondary,
    surface: c.surface,
  );
  final textTheme = GoogleFonts.plusJakartaSansTextTheme(ThemeData.dark().textTheme).apply(
    bodyColor: c.ink,
    displayColor: c.ink,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    extensions: [AppThemeExtras(mode: mode)],
    colorScheme: base.copyWith(
      primary: c.primary,
      secondary: c.secondary,
      surface: c.surface,
      onSurface: c.ink,
      onSurfaceVariant: c.muted,
      onPrimary: c.onPrimary,
      error: AppColors.danger,
    ),
    scaffoldBackgroundColor: c.canvas,
    textTheme: textTheme.copyWith(
      titleLarge: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: c.ink),
      titleMedium: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: c.ink),
      bodyLarge: textTheme.bodyLarge?.copyWith(color: c.ink),
      bodyMedium: textTheme.bodyMedium?.copyWith(color: c.ink, height: 1.35),
      bodySmall: textTheme.bodySmall?.copyWith(color: c.muted, height: 1.35),
      labelLarge: textTheme.labelLarge?.copyWith(color: c.ink),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.canvas,
      foregroundColor: c.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: c.ink,
      ),
      iconTheme: IconThemeData(color: c.ink, size: 22),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: c.primary,
      textColor: c.ink,
      titleTextStyle: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w600, color: c.ink),
      subtitleTextStyle: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w500, color: c.muted),
    ),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: c.border),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface,
      indicatorColor: c.tealSoft,
      height: 70,
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
        foregroundColor: c.primary,
        side: BorderSide(color: Colors.white.withValues(alpha: 0.2)),
        minimumSize: AppMetrics.buttonMinSize,
        padding: AppMetrics.buttonPadding,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppMetrics.controlRadius)),
        textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: c.primary,
        minimumSize: const Size(48, AppMetrics.controlHeightDense),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: c.surface,
      selectedColor: c.tealSoft,
      labelStyle: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w600, color: c.ink),
      side: BorderSide(color: c.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      showCheckmark: false,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
      labelPadding: const EdgeInsets.symmetric(horizontal: 2),
    ),
    dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      isDense: false,
      floatingLabelBehavior: FloatingLabelBehavior.auto,
      alignLabelWithHint: true,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppMetrics.controlRadius)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppMetrics.controlRadius),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.12)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppMetrics.controlRadius),
        borderSide: BorderSide(color: c.primary, width: 1.5),
      ),
      contentPadding: AppMetrics.fieldPadding,
      constraints: AppMetrics.fieldConstraints,
      labelStyle: GoogleFonts.plusJakartaSans(color: c.muted, fontWeight: FontWeight.w500),
      hintStyle: GoogleFonts.plusJakartaSans(color: c.muted.withValues(alpha: 0.8)),
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
      titleTextStyle: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w700, color: c.ink),
      contentTextStyle: GoogleFonts.plusJakartaSans(color: c.ink, height: 1.4),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.primaryDark,
      contentTextStyle: GoogleFonts.plusJakartaSans(color: c.ink, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: c.primary,
      foregroundColor: c.onPrimary,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    iconTheme: IconThemeData(color: c.ink),
    primaryIconTheme: IconThemeData(color: c.ink),
  );
}

/// High-contrast theme for bright outdoor counters.
ThemeData buildOutdoorTheme() {
  const c = AppColorsLookup.outdoor();
  final textTheme = GoogleFonts.plusJakartaSansTextTheme().apply(
    bodyColor: c.ink,
    displayColor: c.ink,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    extensions: const [AppThemeExtras(mode: AppThemeMode.outdoor)],
    colorScheme: ColorScheme.light(
      primary: c.primary,
      secondary: c.secondary,
      surface: c.surface,
      onSurface: c.ink,
      onPrimary: c.onPrimary,
      onSecondary: Colors.white,
      error: const Color(0xFF991B1B),
    ),
    scaffoldBackgroundColor: c.canvas,
    textTheme: textTheme.copyWith(
      bodyMedium: textTheme.bodyMedium?.copyWith(fontSize: 16, fontWeight: FontWeight.w600, color: c.ink),
      titleLarge: textTheme.titleLarge?.copyWith(fontSize: 22, fontWeight: FontWeight.w800, color: c.ink),
      bodySmall: textTheme.bodySmall?.copyWith(color: c.muted),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.canvas,
      foregroundColor: c.ink,
      elevation: 0,
      titleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 20,
        fontWeight: FontWeight.w800,
        color: c.ink,
      ),
      iconTheme: IconThemeData(color: c.ink, size: 24),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: const Color(0xFF065F5B),
      textColor: c.ink,
      titleTextStyle: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: c.ink),
      subtitleTextStyle: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w600, color: c.muted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: const Color(0xFF065F5B),
        foregroundColor: Colors.white,
        minimumSize: AppMetrics.buttonMinSize,
        padding: AppMetrics.buttonPadding,
        textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppMetrics.controlRadius)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFF065F5B),
        minimumSize: AppMetrics.buttonMinSize,
        padding: AppMetrics.buttonPadding,
        side: BorderSide(color: c.border, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppMetrics.controlRadius)),
        textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: const Color(0xFF065F5B),
        minimumSize: const Size(48, AppMetrics.controlHeightDense),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface,
      indicatorColor: const Color(0xFF99F6E4),
      height: 72,
      labelTextStyle: WidgetStateProperty.all(
        GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w800, color: c.ink),
      ),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          size: 24,
          color: selected ? const Color(0xFF065F5B) : c.muted,
        );
      }),
    ),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: c.border, width: 1.5),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: c.surface,
      selectedColor: c.tealSoft,
      labelStyle: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: c.ink),
      side: BorderSide(color: c.border, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      showCheckmark: false,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
      labelPadding: const EdgeInsets.symmetric(horizontal: 2),
    ),
    dividerTheme: DividerThemeData(color: c.border, thickness: 1.5, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      isDense: false,
      floatingLabelBehavior: FloatingLabelBehavior.auto,
      alignLabelWithHint: true,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppMetrics.controlRadius),
        borderSide: BorderSide(color: c.border, width: 1.5),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppMetrics.controlRadius),
        borderSide: BorderSide(color: c.border, width: 1.5),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppMetrics.controlRadius),
        borderSide: const BorderSide(color: Color(0xFF065F5B), width: 2),
      ),
      contentPadding: AppMetrics.fieldPadding,
      constraints: AppMetrics.fieldConstraints,
      labelStyle: GoogleFonts.plusJakartaSans(color: c.ink, fontWeight: FontWeight.w600),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      showDragHandle: true,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.surface,
      titleTextStyle: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w800, color: c.ink),
      contentTextStyle: GoogleFonts.plusJakartaSans(color: c.ink, fontWeight: FontWeight.w600),
    ),
    iconTheme: IconThemeData(color: c.ink),
    primaryIconTheme: IconThemeData(color: c.ink),
  );
}

/// Shared layout breakpoints for phone / tablet.
class Breakpoints {
  Breakpoints._();
  static const tablet = 700.0;
  static const desktop = 1024.0;

  static bool isTablet(BuildContext context) => MediaQuery.sizeOf(context).width >= tablet;

  static bool isWide(BuildContext context) => MediaQuery.sizeOf(context).width >= desktop;

  static bool isLandscape(BuildContext context) =>
      MediaQuery.orientationOf(context) == Orientation.landscape;

  /// Short viewport — landscape phone, keyboard, or split-screen.
  static bool isCompactHeight(BuildContext context) =>
      MediaQuery.sizeOf(context).height < 520;

  static EdgeInsets pagePadding(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= desktop) return const EdgeInsets.symmetric(horizontal: 32, vertical: 16);
    if (w >= tablet) return const EdgeInsets.fromLTRB(24, 14, 24, 20);
    // Match AppSpace.md sides; keep a little more bottom so content isn’t flush to nav.
    return const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, AppSpace.lg);
  }

  /// Page padding plus FAB clearance for scrollable bodies with a FAB.
  static EdgeInsets pagePaddingWithFab(BuildContext context, {bool stacked = false}) {
    final base = pagePadding(context);
    return base.copyWith(
      bottom: base.bottom + (stacked ? AppSpace.fabClearanceStacked : AppSpace.fabClearance),
    );
  }

  static int productGridCount(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= 1100) return 4;
    if (w >= tablet) return 3;
    return 2;
  }

  /// Home / dashboard KPI tiles — denser on tablet so cards aren't empty.
  static int kpiGridCount(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= desktop) return 4;
    if (w >= tablet) return 4;
    return 2;
  }

  /// Home quick-action chips.
  static int quickActionCount(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= desktop) return 6;
    if (w >= tablet) return 5;
    return 4;
  }

  /// More hub: single column phone, two columns tablet+.
  static int moreColumns(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= desktop) return 2;
    if (w >= tablet) return 2;
    return 1;
  }

  /// Constrain overview / list content on large tablets so cards don't stretch.
  static double contentMaxWidth(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= desktop) return 1100;
    if (w >= tablet) return 900;
    return double.infinity;
  }

  /// Use side NavigationRail instead of bottom bar.
  ///
  /// Only on large widths — mid-size phones (~720 logical px) were incorrectly
  /// treated as tablets and overflowed with labeled rail destinations.
  static bool useNavRail(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return size.width >= desktop && size.height >= 700;
  }
}
