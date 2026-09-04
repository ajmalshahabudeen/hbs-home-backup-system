import 'package:flutter/material.dart';

class AppLogo extends StatelessWidget {
  static const assetPath = 'assets/images/HBS_Logo.png';

  final double size;
  final double borderRadius;
  final bool circular;

  const AppLogo({
    super.key,
    this.size = 110,
    this.borderRadius = 28,
    this.circular = false,
  });

  @override
  Widget build(BuildContext context) {
    final radius = circular ? size / 2 : borderRadius;
    final dpr = MediaQuery.maybeDevicePixelRatioOf(context) ?? 2.0;
    final cacheDimension = (size * dpr).round().clamp(64, 1024);

    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.asset(
        assetPath,
        width: size,
        height: size,
        cacheWidth: cacheDimension,
        cacheHeight: cacheDimension,
        fit: BoxFit.cover,
        filterQuality: FilterQuality.high,
        gaplessPlayback: true,
        semanticLabel: 'HBS Cloud',
      ),
    );
  }
}
