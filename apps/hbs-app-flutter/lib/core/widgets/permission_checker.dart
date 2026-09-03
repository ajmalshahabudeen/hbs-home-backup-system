import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../providers/backup_provider.dart';
import '../../providers/media_provider.dart';
import '../../services/media_discovery_service.dart';
import '../backup_engine/notifications/backup_notifications.dart';
import 'glass_card.dart';

class PermissionChecker {
  static bool _hasCheckedThisSession = false;

  /// Checks if any required permissions are missing and shows the friendly prompt
  static Future<void> checkAndPrompt(BuildContext context, WidgetRef ref) async {
    if (_hasCheckedThisSession || kIsWeb) return;
    _hasCheckedThisSession = true;

    final mediaGranted = await MediaDiscoveryService().isPermissionGranted();
    bool notificationGranted = true;
    if (Platform.isAndroid || Platform.isIOS) {
      notificationGranted = await Permission.notification.isGranted;
    }

    if (mediaGranted && notificationGranted) {
      return;
    }

    if (!context.mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: false,
      enableDrag: false,
      builder: (ctx) => _PermissionModal(
        missingMedia: !mediaGranted,
        missingNotification: !notificationGranted,
        onGrantCompleted: () {
          ref.read(mediaProvider.notifier).loadMedia(force: true);
          ref.read(backupProvider.notifier).loadAlbums(force: true);
        },
      ),
    );
  }
}

class _PermissionModal extends StatefulWidget {
  final bool missingMedia;
  final bool missingNotification;
  final VoidCallback onGrantCompleted;

  const _PermissionModal({
    required this.missingMedia,
    required this.missingNotification,
    required this.onGrantCompleted,
  });

  @override
  State<_PermissionModal> createState() => _PermissionModalState();
}

class _PermissionModalState extends State<_PermissionModal> {
  bool _isRequesting = false;

  Future<void> _handleAllowAll() async {
    setState(() => _isRequesting = true);
    try {
      if (widget.missingMedia) {
        await MediaDiscoveryService().requestPermissions(force: true);
      }
      if (widget.missingNotification) {
        await BackupNotificationManager().requestPermission();
      }
      widget.onGrantCompleted();
    } catch (_) {} finally {
      if (mounted) {
        setState(() => _isRequesting = false);
        Navigator.of(context).pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;

    return PopScope(
      canPop: true,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: GlassCard(
            padding: const EdgeInsets.all(24),
            borderRadius: 28,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [primary, primary.withValues(alpha: 0.7)],
                        ),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(Icons.security_rounded, color: Colors.white, size: 24),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Permissions Required',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              fontSize: 18,
                            ),
                          ),
                          Text(
                            'HBS Cloud requires a few permissions to function',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Media Permission Card
                if (widget.missingMedia) ...[
                  _PermissionItem(
                    icon: Icons.photo_library_rounded,
                    iconColor: const Color(0xFF3B82F6),
                    title: 'Photos & Videos',
                    description: 'Enables gallery browsing and camera roll backup to your personal home server.',
                  ),
                  const SizedBox(height: 12),
                ],

                // Notification Permission Card
                if (widget.missingNotification) ...[
                  _PermissionItem(
                    icon: Icons.notifications_active_rounded,
                    iconColor: const Color(0xFF10B981),
                    title: 'Notifications',
                    description: 'Sends upload progress updates and alerts when your media backup completes.',
                  ),
                  const SizedBox(height: 12),
                ],

                const SizedBox(height: 12),

                // Action Buttons
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton.icon(
                    icon: _isRequesting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.check_circle_outline_rounded, size: 20),
                    label: Text(
                      _isRequesting ? 'Requesting Permissions...' : 'Allow Permissions',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    ),
                    onPressed: _isRequesting ? null : _handleAllowAll,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      elevation: 0,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Center(
                  child: TextButton(
                    onPressed: _isRequesting ? null : () => Navigator.of(context).pop(),
                    child: Text(
                      'Maybe Later',
                      style: TextStyle(
                        color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PermissionItem extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String description;

  const _PermissionItem({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.05),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.65),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
