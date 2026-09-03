import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'app_logo.dart';

/// Animated splash screen whose background color perfectly matches the logo's background (0xFFF1EBE3).
/// Features floating logo physics, expanding accent line, shimmering animated text,
/// and smooth breathing loading indicators.
class AppSplashScreen extends StatefulWidget {
  /// The exact edge pixel color of HBS_Logo.png (RGB: 241, 235, 227)
  static const backgroundColor = Color(0xFFF1EBE3);
  static const wordmarkColor = Color(0xFF3F2A1D);
  static const accentColor = Color(0xFFC27346);
  static const subtitleColor = Color(0xFF7D6553);

  const AppSplashScreen({super.key});

  @override
  State<AppSplashScreen> createState() => _AppSplashScreenState();
}

class _AppSplashScreenState extends State<AppSplashScreen> with TickerProviderStateMixin {
  late final AnimationController _entranceController;
  late final AnimationController _floatController;
  late final AnimationController _shimmerController;

  // Logo animations
  late final Animation<double> _logoScale;
  late final Animation<double> _logoFade;

  // Text animations
  late final Animation<Offset> _textSlide;
  late final Animation<double> _textFade;
  late final Animation<double> _letterSpacing;

  // Divider accent line animation
  late final Animation<double> _dividerWidth;
  late final Animation<double> _dividerFade;

  // Subtitle animations
  late final Animation<Offset> _subtitleSlide;
  late final Animation<double> _subtitleFade;

  @override
  void initState() {
    super.initState();

    // 1. Entrance Controller (1350ms)
    _entranceController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1350),
    );

    // Logo entrance: elastic scale + fade
    _logoScale = Tween<double>(begin: 0.55, end: 1.0).animate(
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.0, 0.65, curve: Curves.easeOutBack),
      ),
    );

    _logoFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.0, 0.45, curve: Curves.easeIn),
      ),
    );

    // Main Wordmark: slide up, fade, letter spacing
    _textSlide = Tween<Offset>(
      begin: const Offset(0, 0.35),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.3, 0.75, curve: Curves.fastOutSlowIn),
      ),
    );

    _textFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.3, 0.7, curve: Curves.easeIn),
      ),
    );

    _letterSpacing = Tween<double>(begin: 1.0, end: 3.2).animate(
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.35, 0.85, curve: Curves.easeOutCubic),
      ),
    );

    // Expanding divider accent line
    _dividerWidth = Tween<double>(begin: 0.0, end: 44.0).animate(
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.5, 0.85, curve: Curves.easeOutCubic),
      ),
    );

    _dividerFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.5, 0.75, curve: Curves.easeIn),
      ),
    );

    // Subtitle entrance
    _subtitleSlide = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.55, 0.95, curve: Curves.fastOutSlowIn),
      ),
    );

    _subtitleFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.55, 0.9, curve: Curves.easeIn),
      ),
    );

    // 2. Organic Floating Loop (3000ms)
    _floatController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3000),
    )..repeat(reverse: true);

    // 3. Ambient Shimmer Loop (2200ms)
    _shimmerController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();

    _entranceController.forward();
  }

  @override
  void dispose() {
    _entranceController.dispose();
    _floatController.dispose();
    _shimmerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppSplashScreen.backgroundColor,
      body: SafeArea(
        child: Stack(
          children: [
            // Center Logo, Wordmark, and Accents
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Floating Animated Logo (Blends 100% seamlessly with 0xFFF1EBE3)
                  AnimatedBuilder(
                    animation: Listenable.merge([_entranceController, _floatController]),
                    builder: (context, child) {
                      // Smooth sine wave vertical float (-5px to +5px)
                      final floatOffset = math.sin(_floatController.value * math.pi) * 5.0;
                      // Gentle breathing scale (1.0 to 1.03)
                      final breathingScale = 1.0 + 0.03 * math.sin(_floatController.value * math.pi);

                      return Transform.translate(
                        offset: Offset(0, floatOffset),
                        child: Transform.scale(
                          scale: _logoScale.value * breathingScale,
                          child: Opacity(
                            opacity: _logoFade.value,
                            child: const AppLogo(
                              size: 118,
                              borderRadius: 0,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 22),

                  // Animated Main Wordmark ("HBS CLOUD") with Shimmer Sheen & Expanding Letter Spacing
                  SlideTransition(
                    position: _textSlide,
                    child: FadeTransition(
                      opacity: _textFade,
                      child: AnimatedBuilder(
                        animation: Listenable.merge([_entranceController, _shimmerController]),
                        builder: (context, child) {
                          return ShaderMask(
                            shaderCallback: (bounds) {
                              final shimmerX = _shimmerController.value * 2.0 - 0.5;
                              return LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                stops: [
                                  (shimmerX - 0.25).clamp(0.0, 1.0),
                                  shimmerX.clamp(0.0, 1.0),
                                  (shimmerX + 0.25).clamp(0.0, 1.0),
                                ],
                                colors: const [
                                  AppSplashScreen.wordmarkColor,
                                  AppSplashScreen.accentColor,
                                  AppSplashScreen.wordmarkColor,
                                ],
                              ).createShader(bounds);
                            },
                            child: Text(
                              'HBS CLOUD',
                              style: TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w900,
                                letterSpacing: _letterSpacing.value,
                                color: Colors.white,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Animated Expanding Accent Divider Line
                  AnimatedBuilder(
                    animation: _entranceController,
                    builder: (context, child) {
                      return Opacity(
                        opacity: _dividerFade.value,
                        child: Container(
                          width: _dividerWidth.value,
                          height: 2.5,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [
                                Colors.transparent,
                                AppSplashScreen.accentColor,
                                Colors.transparent,
                              ],
                            ),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 10),

                  // Animated Subtitle / Tagline
                  SlideTransition(
                    position: _subtitleSlide,
                    child: FadeTransition(
                      opacity: _subtitleFade,
                      child: const Text(
                        'PERSONAL CLOUD & HOME BACKUP',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 2.0,
                          color: AppSplashScreen.subtitleColor,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Bottom Wave-Pulsing Dots
            Positioned(
              left: 0,
              right: 0,
              bottom: 34,
              child: FadeTransition(
                opacity: _subtitleFade,
                child: const _BouncingLoadingDots(
                  color: AppSplashScreen.accentColor,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BouncingLoadingDots extends StatefulWidget {
  final Color color;
  const _BouncingLoadingDots({required this.color});

  @override
  State<_BouncingLoadingDots> createState() => _BouncingLoadingDotsState();
}

class _BouncingLoadingDotsState extends State<_BouncingLoadingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(3, (index) {
            final delay = index * 0.22;
            final phase = (_controller.value - delay) % 1.0;
            final bounce = math.sin(phase * math.pi);
            final scale = 0.6 + 0.4 * bounce;
            final opacity = 0.35 + 0.65 * bounce;

            return Transform.translate(
              offset: Offset(0, -3.0 * bounce),
              child: Transform.scale(
                scale: scale,
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: widget.color.withValues(alpha: opacity),
                  ),
                ),
              ),
            );
          }),
        );
      },
    );
  }
}
