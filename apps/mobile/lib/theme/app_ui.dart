import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_metrics.dart';
import 'app_theme.dart';

/// Shared spacing / radius scale for consistent layouts.
class AppSpace {
  AppSpace._();

  static const xxs = 4.0;
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 24.0;
  static const xxl = 32.0;

  /// Aliases of [AppMetrics] for screen-level spacing.
  static const controlHeight = AppMetrics.controlHeight;
  static const fieldHeight = AppMetrics.fieldHeight;
  static const controlHeightDense = AppMetrics.controlHeightDense;
  static const controlRadius = AppMetrics.controlRadius;
  static const controlHPad = AppMetrics.controlHPad;
  static const controlVPad = AppMetrics.controlVPad;
  static const fieldHPad = AppMetrics.fieldHPad;
  static const fieldVPad = AppMetrics.fieldVPad;

  /// Bottom inset so list content clears a single FAB above the shell nav.
  static const fabClearance = 96.0;

  /// Dual stacked FABs (e.g. Products scan + add).
  static const fabClearanceStacked = 168.0;

  /// Shell [NavigationBar] height (~68) + breathing room.
  static const navClearance = 72.0;

  /// Extra right pad so bottom action rows don’t sit under an end FAB.
  static const fabSideClearance = 140.0;

  static const page = EdgeInsets.fromLTRB(md, sm, md, md);
  static const pageH = EdgeInsets.symmetric(horizontal: md);
  static const sectionGap = SizedBox(height: lg);
  static const itemGap = SizedBox(height: sm);
  /// Vertical gap between form fields — prevents label/border overlap on mobile.
  static const fieldGap = SizedBox(height: 14);
  static const fieldGapLg = SizedBox(height: 18);

  /// List padding that clears a FAB (and optional extra bottom chrome).
  static EdgeInsets listWithFab({
    double left = md,
    double top = xs,
    double right = md,
    bool stacked = false,
    double extraBottom = 0,
  }) {
    return EdgeInsets.fromLTRB(
      left,
      top,
      right,
      (stacked ? fabClearanceStacked : fabClearance) + extraBottom,
    );
  }
}

/// Column that inserts consistent gaps between form children (TextField, dropdowns, etc.).
class AppFormColumn extends StatelessWidget {
  const AppFormColumn({
    super.key,
    required this.children,
    this.gap = AppSpace.fieldGap,
    this.crossAxisAlignment = CrossAxisAlignment.stretch,
  });

  final List<Widget> children;
  final Widget gap;
  final CrossAxisAlignment crossAxisAlignment;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    final out = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) out.add(gap);
      out.add(children[i]);
    }
    return Column(
      crossAxisAlignment: crossAxisAlignment,
      mainAxisSize: MainAxisSize.min,
      children: out,
    );
  }
}

class AppRadius {
  AppRadius._();

  static const sm = 10.0;
  static const md = 14.0;
  static const lg = 18.0;
  static const pill = 999.0;
}

/// Soft elevated panel used across lists and report cards.
class AppPanel extends StatelessWidget {
  const AppPanel({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final bg = colors.surface;
    final onBg = colors.inkOn(bg);
    final content = Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: colors.border),
        boxShadow: [
          BoxShadow(
            color: colors.shadow,
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: onBg),
        child: IconTheme.merge(
          data: IconThemeData(color: colors.primary),
          child: child,
        ),
      ),
    );

    if (onTap == null) {
      return Padding(padding: margin ?? EdgeInsets.zero, child: content);
    }

    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: content,
        ),
      ),
    );
  }
}

class AppSectionTitle extends StatelessWidget {
  const AppSectionTitle(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.sm),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
                color: colors.ink,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Segmented filter/tab chip — solid primary when selected (matches Stock page).
class AppSegChip extends StatelessWidget {
  const AppSegChip({
    super.key,
    required this.selected,
    required this.onTap,
    this.label,
    this.child,
    this.enabled = true,
    this.dense = false,
  }) : assert(label != null || child != null);

  final String? label;
  final Widget? child;
  final bool selected;
  final VoidCallback? onTap;
  final bool enabled;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final bg = selected ? colors.primary : colors.canvas;
    final fg = selected ? colors.onPrimary : colors.ink;
    final borderColor = selected ? colors.primary : colors.muted.withValues(alpha: 0.25);
    final hPad = dense ? 12.0 : 14.0;
    final vPad = dense ? 6.0 : 8.0;

    Widget content = child ??
        Text(
          label!,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: fg,
          ),
        );

    if (child != null) {
      content = DefaultTextStyle(
        style: GoogleFonts.plusJakartaSans(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: fg,
        ),
        child: IconTheme(
          data: IconThemeData(color: fg, size: 16),
          child: child!,
        ),
      );
    }

    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(20),
          child: Container(
            padding: EdgeInsets.symmetric(horizontal: hPad, vertical: vPad),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: borderColor),
            ),
            child: content,
          ),
        ),
      ),
    );
  }
}

class AppEmptyState extends StatelessWidget {
  const AppEmptyState({super.key, required this.message, this.icon});

  final String message;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon ?? Icons.inbox_outlined, size: 40, color: colors.muted.withValues(alpha: 0.7)),
            const SizedBox(height: AppSpace.sm),
            Text(
              message,
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                color: colors.muted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AppSearchField extends StatelessWidget {
  const AppSearchField({
    super.key,
    this.controller,
    required this.hint,
    this.onChanged,
    this.onSubmitted,
  });

  final TextEditingController? controller;
  final String hint;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return TextField(
      controller: controller,
      autofocus: false,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      textInputAction: TextInputAction.search,
      style: GoogleFonts.plusJakartaSans(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: colors.ink,
      ),
      cursorColor: colors.primary,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: GoogleFonts.plusJakartaSans(color: colors.muted),
        prefixIcon: Icon(Icons.search_rounded, size: 20, color: colors.muted),
        isDense: false,
        contentPadding: AppMetrics.fieldPadding,
        filled: true,
        fillColor: colors.surface,
      ),
    );
  }
}
