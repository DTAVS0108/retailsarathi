import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Consistent floating snackbars for success / error / info across mobile screens.
void showAppToast(
  BuildContext context,
  String message, {
  AppToastTone tone = AppToastTone.info,
  Duration duration = const Duration(seconds: 3),
}) {
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();

  final Color bg;
  final Color fg;
  final IconData icon;
  switch (tone) {
    case AppToastTone.success:
      bg = AppColors.tealDark;
      fg = Colors.white;
      icon = Icons.check_circle_rounded;
      break;
    case AppToastTone.error:
      bg = AppColors.danger;
      fg = Colors.white;
      icon = Icons.error_outline_rounded;
      break;
    case AppToastTone.warn:
      bg = AppColors.warn;
      fg = Colors.white;
      icon = Icons.warning_amber_rounded;
      break;
    case AppToastTone.info:
      bg = AppColors.ink;
      fg = AppColors.surface;
      icon = Icons.info_outline_rounded;
      break;
  }

  messenger.showSnackBar(
    SnackBar(
      behavior: SnackBarBehavior.floating,
      duration: duration,
      backgroundColor: bg,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      content: Row(
        children: [
          Icon(icon, color: fg, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: fg, fontWeight: FontWeight.w600, height: 1.3),
            ),
          ),
        ],
      ),
      action: SnackBarAction(
        label: 'OK',
        textColor: fg.withValues(alpha: 0.9),
        onPressed: messenger.hideCurrentSnackBar,
      ),
    ),
  );
}

enum AppToastTone { success, error, info, warn }

void showSuccessToast(BuildContext context, String message) =>
    showAppToast(context, message, tone: AppToastTone.success);

void showErrorToast(BuildContext context, String message) =>
    showAppToast(context, message, tone: AppToastTone.error, duration: const Duration(seconds: 3));
