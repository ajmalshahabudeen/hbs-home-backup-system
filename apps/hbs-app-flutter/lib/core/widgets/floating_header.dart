import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/color_palettes.dart';

class FloatingHeader extends StatefulWidget {
  final String title;
  final String serverUrl;
  final bool isConnected;
  final String userName;
  final ThemeModeOption currentThemeMode;
  final VoidCallback? onServerTap;
  final VoidCallback? onThemeToggle;
  final VoidCallback? onSearchTap;
  final VoidCallback? onProfileTap;

  const FloatingHeader({
    super.key,
    required this.title,
    required this.serverUrl,
    required this.isConnected,
    this.userName = 'User',
    required this.currentThemeMode,
    this.onServerTap,
    this.onThemeToggle,
    this.onSearchTap,
    this.onProfileTap,
  });

  @override
  State<FloatingHeader> createState() => _FloatingHeaderState();
}

class _FloatingHeaderState extends State<FloatingHeader> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.85, end: 1.25).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  String _formatServerDisplay(String url) {
    try {
      final uri = Uri.parse(url);
      return uri.host.isNotEmpty ? uri.host : url;
    } catch (_) {
      return url.replaceAll('http://', '').replaceAll('https://', '');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;

    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24.0),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 10.0),
              decoration: BoxDecoration(
                color: (isDark ? theme.cardColor : Colors.white).withValues(alpha: 0.75),
                borderRadius: BorderRadius.circular(24.0),
                border: Border.all(
                  color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.06),
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.06),
                    blurRadius: 20,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  // Brand Icon Badge
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [primary, primary.withValues(alpha: 0.8)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: primary.withValues(alpha: 0.3),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.cloud_sync_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 10),

                  // App Title & Server Pulse Capsule
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.title,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        GestureDetector(
                          onTap: widget.onServerTap,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Pulse Dot
                              AnimatedBuilder(
                                animation: _pulseAnimation,
                                child: Container(
                                  width: 7,
                                  height: 7,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: widget.isConnected ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                                    boxShadow: widget.isConnected
                                        ? [
                                            BoxShadow(
                                              color: const Color(0xFF10B981).withValues(alpha: 0.6),
                                              blurRadius: 6,
                                              spreadRadius: 1,
                                            ),
                                          ]
                                        : null,
                                  ),
                                ),
                                builder: (context, child) {
                                  return Transform.scale(
                                    scale: widget.isConnected ? _pulseAnimation.value : 1.0,
                                    child: child,
                                  );
                                },
                              ),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  _formatServerDisplay(widget.serverUrl),
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.7),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Quick Action: Search
                  if (widget.onSearchTap != null)
                    IconButton(
                      icon: const Icon(Icons.search_rounded, size: 20),
                      onPressed: widget.onSearchTap,
                      tooltip: 'Search',
                      visualDensity: VisualDensity.compact,
                    ),

                  // Quick Action: Theme Mode Toggle Pill
                  if (widget.onThemeToggle != null)
                    InkWell(
                      onTap: widget.onThemeToggle,
                      borderRadius: BorderRadius.circular(16),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Icon(
                          widget.currentThemeMode == ThemeModeOption.light
                              ? Icons.wb_sunny_rounded
                              : (widget.currentThemeMode == ThemeModeOption.dark
                                  ? Icons.nightlight_round
                                  : Icons.brightness_auto_rounded),
                          size: 16,
                          color: primary,
                        ),
                      ),
                    ),

                  const SizedBox(width: 8),

                  // User Avatar Ring
                  GestureDetector(
                    onTap: widget.onProfileTap,
                    child: Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: primary, width: 1.5),
                        color: primary.withValues(alpha: 0.15),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        widget.userName.isNotEmpty ? widget.userName[0].toUpperCase() : 'U',
                        style: TextStyle(
                          color: primary,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
