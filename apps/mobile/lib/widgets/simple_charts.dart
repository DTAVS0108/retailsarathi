import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/app_theme.dart';
import '../theme/app_ui.dart';

List<Color> _chartPalette(AppColorsLookup colors) => [
      colors.primary,
      colors.secondary,
      colors.primaryDark,
      const Color(0xFFDB2777),
      const Color(0xFF7C3AED),
      Color.lerp(colors.primary, Colors.white, 0.25)!,
    ];

class ChartPoint {
  const ChartPoint(this.label, this.value);
  final String label;
  final double value;
}

class ChartPanel extends StatelessWidget {
  const ChartPanel({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 15)),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: TextStyle(fontSize: 12, color: colors.muted)),
          ],
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class SimpleBarChart extends StatelessWidget {
  const SimpleBarChart({super.key, required this.points, this.height = 140});

  final List<ChartPoint> points;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    if (points.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Text('No data', textAlign: TextAlign.center, style: TextStyle(color: colors.muted)),
      );
    }
    final max = points.fold<double>(1, (m, p) => p.value > m ? p.value : m);
    return SizedBox(
      height: height,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final p in points)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      _abbr(p.value),
                      style: TextStyle(fontSize: 9, color: colors.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Flexible(
                      child: FractionallySizedBox(
                        heightFactor: (p.value / max).clamp(0.04, 1),
                        widthFactor: 1,
                        alignment: Alignment.bottomCenter,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: colors.primary,
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      p.label,
                      style: TextStyle(fontSize: 9, color: colors.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class SimpleHBarList extends StatelessWidget {
  const SimpleHBarList({super.key, required this.points, this.valueLabel});

  final List<ChartPoint> points;
  final String Function(double)? valueLabel;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final palette = _chartPalette(colors);
    if (points.isEmpty) {
      return Text('No data', style: TextStyle(color: colors.muted));
    }
    final max = points.fold<double>(1, (m, p) => p.value > m ? p.value : m);
    return Column(
      children: [
        for (var i = 0; i < points.length; i++) ...[
          Row(
            children: [
              Expanded(
                child: Text(
                  points[i].label,
                  style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  valueLabel?.call(points[i].value) ?? _abbr(points[i].value),
                  style: TextStyle(fontSize: 11, color: colors.inkOn(colors.surface)),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: (points[i].value / max).clamp(0.02, 1),
              minHeight: 8,
              backgroundColor: colors.tealSoft.withValues(alpha: 0.5),
              color: palette[i % palette.length],
            ),
          ),
          if (i < points.length - 1) const SizedBox(height: 10),
        ],
      ],
    );
  }
}

String _abbr(double n) {
  if (n >= 10000000) return '${(n / 10000000).toStringAsFixed(1)}Cr';
  if (n >= 100000) return '${(n / 100000).toStringAsFixed(1)}L';
  if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
  return n.round().toString();
}
