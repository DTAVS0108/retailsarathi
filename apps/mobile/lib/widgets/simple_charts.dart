import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/app_theme.dart';
import '../theme/app_ui.dart';

/// Validated categorical palette (dataviz skill default) — fixed slot order, not cycled
/// arbitrarily: clears CVD-separation and normal-vision-floor checks on every adjacent pair.
/// Fixed hex values (not theme-derived) so charts look consistent with web/desktop.
const List<Color> _chartPalette = [
      Color(0xFF2A78D6), // blue
      Color(0xFFEB6834), // orange
      Color(0xFF1BAF7A), // aqua
      Color(0xFFEDA100), // yellow
      Color(0xFFE87BA4), // magenta
      Color(0xFF008300), // green
      Color(0xFF4A3AA7), // violet
      Color(0xFFE34948), // red
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
      child: BarChart(
        BarChartData(
          alignment: BarChartAlignment.spaceAround,
          maxY: max * 1.2,
          minY: 0,
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(show: false),
          barTouchData: BarTouchData(
            touchTooltipData: BarTouchTooltipData(
              getTooltipColor: (_) => colors.surface,
              tooltipBorder: BorderSide(color: colors.border),
              getTooltipItem: (group, groupIndex, rod, rodIndex) => BarTooltipItem(
                '${points[group.x.toInt()].label}\n',
                TextStyle(color: colors.inkOn(colors.surface), fontWeight: FontWeight.w700, fontSize: 12),
                children: [
                  TextSpan(
                    text: _abbr(rod.toY),
                    style: TextStyle(color: colors.muted, fontSize: 11, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ),
          titlesData: FlTitlesData(
            show: true,
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 26,
                getTitlesWidget: (value, meta) {
                  final i = value.toInt();
                  if (i < 0 || i >= points.length) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      points[i].label,
                      style: TextStyle(fontSize: 9, color: colors.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  );
                },
              ),
            ),
          ),
          barGroups: [
            for (var i = 0; i < points.length; i++)
              BarChartGroupData(
                x: i,
                barRods: [
                  BarChartRodData(
                    toY: points[i].value,
                    color: _chartPalette[i % _chartPalette.length],
                    width: points.length > 6 ? 14 : 22,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                  ),
                ],
              ),
          ],
        ),
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
    final palette = _chartPalette;
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
