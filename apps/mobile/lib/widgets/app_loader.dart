import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/app_theme.dart';
import 'brand_logo.dart';

/// Branded loading indicator — logo mark with spinning theme-colored ring.
class AppLoader extends StatefulWidget {
  const AppLoader({
    super.key,
    this.label = 'Loading…',
    this.size = 48,
    this.centered = true,
  });

  final String? label;
  final double size;
  final bool centered;

  @override
  State<AppLoader> createState() => _AppLoaderState();
}

class _AppLoaderState extends State<AppLoader> with SingleTickerProviderStateMixin {
  late final AnimationController _spin;

  @override
  void initState() {
    super.initState();
    _spin = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
      ..repeat();
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final ring = widget.size * 1.45;
    final body = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: ring,
          height: ring,
          child: Stack(
            alignment: Alignment.center,
            children: [
              RotationTransition(
                turns: _spin,
                child: CustomPaint(
                  size: Size(ring, ring),
                  painter: _LoaderRingPainter(
                    primary: colors.primary,
                    secondary: colors.secondary,
                  ),
                ),
              ),
              BrandMark(size: widget.size),
            ],
          ),
        ),
        if (widget.label != null && widget.label!.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            widget.label!,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: colors.muted,
            ),
          ),
        ],
      ],
    );

    if (!widget.centered) return body;
    return Center(child: body);
  }
}

/// Compact top-of-list progress bar in brand colors.
class AppLinearLoader extends StatelessWidget {
  const AppLinearLoader({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return LinearProgressIndicator(
      minHeight: 3,
      color: colors.primary,
      backgroundColor: colors.primary.withValues(alpha: 0.2),
    );
  }
}

class _LoaderRingPainter extends CustomPainter {
  _LoaderRingPainter({required this.primary, required this.secondary});

  final Color primary;
  final Color secondary;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 2;
    final track = Paint()
      ..color = primary.withValues(alpha: 0.2)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    final arc = Paint()
      ..shader = SweepGradient(
        colors: [primary, secondary, primary],
        stops: const [0.0, 0.45, 1.0],
        transform: const GradientRotation(-1.2),
      ).createShader(Rect.fromCircle(center: center, radius: radius))
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(center, radius, track);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -1.2,
      4.2,
      false,
      arc,
    );
  }

  @override
  bool shouldRepaint(covariant _LoaderRingPainter oldDelegate) =>
      oldDelegate.primary != primary || oldDelegate.secondary != secondary;
}
