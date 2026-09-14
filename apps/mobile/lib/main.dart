import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'l10n/app_strings.dart';
import 'screens/app_screens.dart';
import 'services/auth_state.dart';
import 'services/offline_sync.dart';
import 'services/voice_billing.dart';
import 'theme/branding_prefs.dart';
import 'theme/theme_controller.dart';
import 'theme/appearance_prefs.dart';
import 'widgets/app_splash.dart';
import 'widgets/floating_calculator.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppStrings.instance.bootstrap();
  await ThemeController.instance.bootstrap();
  await AppearancePrefsController.instance.bootstrap();
  await BrandingPrefsController.instance.bootstrap();
  runApp(const RetailSarathiApp());
}

class RetailSarathiApp extends StatelessWidget {
  const RetailSarathiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthState()..bootstrap()),
        ChangeNotifierProvider.value(value: AppStrings.instance),
        ChangeNotifierProvider.value(value: ThemeController.instance),
        ChangeNotifierProvider.value(value: AppearancePrefsController.instance),
        ChangeNotifierProvider.value(value: BrandingPrefsController.instance),
        ChangeNotifierProvider(create: (_) => VoiceBillingService()),
        ChangeNotifierProvider(create: (_) => CalculatorController()),
        ChangeNotifierProxyProvider<AuthState, OfflineSyncService>(
          create: (ctx) {
            final auth = ctx.read<AuthState>();
            final sync = OfflineSyncService(auth.api);
            sync.bootstrap();
            return sync;
          },
          update: (_, auth, previous) {
            final sync = previous ?? OfflineSyncService(auth.api);
            sync.updateApi(auth.api);
            if (auth.isLoggedIn) {
              sync.cacheProductsFromServer();
            }
            return sync;
          },
        ),
      ],
      child: Consumer3<AppStrings, ThemeController, BrandingPrefsController>(
        builder: (context, strings, themeCtrl, branding, _) {
          return MaterialApp(
            key: ValueKey('theme-${themeCtrl.mode.name}'),
            title: branding.displayShopName,
            debugShowCheckedModeBanner: false,
            theme: themeCtrl.buildTheme(),
            home: const _Root(),
          );
        },
      ),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    if (!auth.ready) {
      return const AppSplash();
    }
    if (!auth.isLoggedIn) {
      return const LoginScreen();
    }
    return const ShellScreen();
  }
}
