import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../services/api_client.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/branding_prefs.dart';

/// RetailSarathi brand mark (R + sarathi guide motif), or tenant logo when set.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 36});

  final double size;

  String? _resolveLogoUrl(BuildContext context) {
    final raw = BrandingPrefsController.instance.logoUrl.trim();
    if (raw.isEmpty) return null;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    try {
      return ApiClient.publicUploadUrl(context.read<AuthState>().api.baseUrl, raw);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final logoUrl = _resolveLogoUrl(context);
    if (logoUrl != null && logoUrl.isNotEmpty) {
      return SizedBox(
        width: size,
        height: size,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(size * 0.22),
          child: Image.network(
            logoUrl,
            width: size,
            height: size,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => _DefaultBrandMark(size: size),
          ),
        ),
      );
    }
    return _DefaultBrandMark(size: size);
  }
}

class _DefaultBrandMark extends StatelessWidget {
  const _DefaultBrandMark({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final stops = colors.heroGradientColors;
    return SizedBox(
      width: size,
      height: size,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.22),
        child: CustomPaint(
          painter: _BrandMarkPainter(
            primary: stops.length > 1 ? stops[1] : colors.primary,
            primaryDark: stops.first,
          ),
        ),
      ),
    );
  }
}

class BrandLogo extends StatelessWidget {
  const BrandLogo({
    super.key,
    this.size = 36,
    this.withWordmark = true,
    this.subtitle,
    this.light = false,
  });

  final double size;
  final bool withWordmark;
  final String? subtitle;
  final bool light;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final titleColor = light ? Colors.white : colors.primaryDark;
    final subColor = light ? Colors.white70 : colors.muted;

    return ListenableBuilder(
      listenable: BrandingPrefsController.instance,
      builder: (context, _) {
        final branding = BrandingPrefsController.instance;
        final title = branding.displayShopName;
        final subtitleText = subtitle ??
            (branding.ownerName.isNotEmpty
                ? branding.ownerName
                : (branding.hasShopName ? kProductBrandName : null));

        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandMark(size: size),
            if (withWordmark) ...[
              SizedBox(width: size * 0.28),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.fraunces(
                        fontSize: size * 0.48,
                        fontWeight: FontWeight.w700,
                        color: titleColor,
                        height: 1.05,
                      ),
                    ),
                    if (subtitleText != null)
                      Text(
                        subtitleText,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: size * 0.28,
                          color: subColor,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _BrandMarkPainter extends CustomPainter {
  _BrandMarkPainter({required this.primary, required this.primaryDark});

  final Color primary;
  final Color primaryDark;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final bg = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [primary, primaryDark],
      ).createShader(rect);
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, Radius.circular(size.width * 0.22)),
      bg,
    );

    // Keep mark inside a safe inset so corners/mask never crop the R motif.
    final pad = size.width * 0.08;
    final inner = size.width - (pad * 2);
    final s = inner / 128;
    canvas.save();
    canvas.translate(pad, pad);

    final white = Paint()..color = const Color(0xFFF8FFFE);
    final accent = Paint()..color = const Color(0xFFF59E0B);

    final body = Path()
      ..moveTo(34 * s, 98 * s)
      ..cubicTo(34 * s, 70 * s, 48 * s, 52 * s, 76 * s, 46 * s)
      ..cubicTo(84 * s, 44 * s, 90 * s, 38 * s, 90 * s, 30 * s)
      ..cubicTo(90 * s, 20 * s, 82 * s, 14 * s, 70 * s, 14 * s)
      ..lineTo(42 * s, 14 * s)
      ..cubicTo(38 * s, 14 * s, 36 * s, 16 * s, 36 * s, 20 * s)
      ..lineTo(36 * s, 86 * s)
      ..cubicTo(36 * s, 90 * s, 38 * s, 92 * s, 42 * s, 92 * s)
      ..lineTo(50 * s, 92 * s)
      ..cubicTo(54 * s, 92 * s, 56 * s, 90 * s, 56 * s, 86 * s)
      ..lineTo(56 * s, 74 * s)
      ..cubicTo(74 * s, 76 * s, 86 * s, 88 * s, 86 * s, 106 * s)
      ..cubicTo(86 * s, 110 * s, 84 * s, 112 * s, 80 * s, 112 * s)
      ..lineTo(70 * s, 112 * s)
      ..cubicTo(66 * s, 112 * s, 64 * s, 110 * s, 64 * s, 106 * s)
      ..cubicTo(64 * s, 96 * s, 56 * s, 90 * s, 44 * s, 90 * s)
      ..lineTo(40 * s, 90 * s)
      ..cubicTo(36 * s, 90 * s, 34 * s, 92 * s, 34 * s, 96 * s)
      ..close();
    canvas.drawPath(body, white);

    final bowl = RRect.fromRectAndRadius(
      Rect.fromLTWH(52 * s, 38 * s, 26 * s, 16 * s),
      Radius.circular(4 * s),
    );
    canvas.drawRRect(bowl, white);
    canvas.drawCircle(Offset(74 * s, 34 * s), 7 * s, accent);

    final crescent = Path()
      ..moveTo(96 * s, 52 * s)
      ..cubicTo(104 * s, 58 * s, 108 * s, 68 * s, 106 * s, 78 * s)
      ..cubicTo(105 * s, 82 * s, 108 * s, 84 * s, 111 * s, 82 * s)
      ..cubicTo(119 * s, 70 * s, 115 * s, 52 * s, 101 * s, 42 * s)
      ..cubicTo(98 * s, 40 * s, 95 * s, 43 * s, 96 * s, 52 * s)
      ..close();
    canvas.drawPath(crescent, accent);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _BrandMarkPainter oldDelegate) =>
      oldDelegate.primary != primary || oldDelegate.primaryDark != primaryDark;
}
