import 'package:flutter/services.dart';

import '../theme/appearance_prefs.dart';

/// Device feedback gated by [AppearancePrefsController].
class AppFeedback {
  AppFeedback._();

  static AppearancePrefsController get _prefs => AppearancePrefsController.instance;

  static Future<void> selection() async {
    if (!_prefs.hapticFeedback) return;
    await HapticFeedback.selectionClick();
  }

  static Future<void> light() async {
    if (!_prefs.hapticFeedback) return;
    await HapticFeedback.lightImpact();
  }

  static Future<void> medium() async {
    if (!_prefs.hapticFeedback) return;
    await HapticFeedback.mediumImpact();
  }

  static Future<void> heavy() async {
    if (!_prefs.hapticFeedback) return;
    await HapticFeedback.heavyImpact();
  }

  /// Soft system click used as scan beep when [soundOnScan] is on.
  static Future<void> scanBeep() async {
    if (_prefs.soundOnScan) {
      await SystemSound.play(SystemSoundType.click);
    }
    await medium();
  }
}
