import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/color_palettes.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/floating_header.dart';
import '../../core/widgets/glass_card.dart';
import '../../core/widgets/input_dialog.dart';
import '../../models/user_stats.dart';
import '../../providers/app_lock_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/backup_provider.dart';
import '../../providers/server_provider.dart';
import '../../providers/theme_provider.dart';
import '../../services/api_service.dart';
import '../search/search_screen.dart';
import 'lan_scanner_modal.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  UserStats _stats = UserStats.empty;

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    try {
      final stats = await ApiService().getUserStats();
      if (mounted) setState(() => _stats = stats);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;

    final user = ref.watch(authProvider).user;
    final serverInfo = ref.watch(serverProvider);
    final themeState = ref.watch(themeProvider);
    final themeNotifier = ref.read(themeProvider.notifier);
    final lockState = ref.watch(appLockProvider);
    final lockNotifier = ref.read(appLockProvider.notifier);
    final backupNotifier = ref.read(backupProvider.notifier);

    final diskTotal = _stats.diskTotalBytes ?? (512 * 1024 * 1024 * 1024);
    final used = _stats.totalBytes;
    final storagePercent = diskTotal > 0 ? (used / diskTotal).clamp(0.0, 1.0) : 0.0;

    return Scaffold(
      body: Column(
        children: [
          // Floating Header
          FloatingHeader(
            title: 'Settings',
            serverUrl: serverInfo.url,
            isConnected: serverInfo.isConnected,
            userName: user?.name ?? 'User',
            currentThemeMode: themeState.mode,
            onServerTap: () {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => const LanScannerModal(),
              );
            },
            onThemeToggle: () => themeNotifier.toggleMode(),
            onSearchTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SearchScreen()),
              );
            },
          ),

          // Main Settings Body
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
              children: [
                // User Profile Card
                GlassCard(
                  padding: const EdgeInsets.all(16),
                  borderRadius: 20,
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: primary.withValues(alpha: 0.2),
                          border: Border.all(color: primary, width: 2),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          (user?.name.isNotEmpty == true ? user!.name[0] : 'U').toUpperCase(),
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: primary),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(user?.name ?? 'Local User', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                            Text(
                              user?.email ?? 'admin@hbs.local',
                              style: theme.textTheme.bodySmall?.copyWith(color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6)),
                            ),
                          ],
                        ),
                      ),
                      OutlinedButton(
                        onPressed: () => ref.read(authProvider.notifier).signOut(),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: const BorderSide(color: Colors.red, width: 1),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('Sign Out'),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // Server Storage Quota Card
                GlassCard(
                  padding: const EdgeInsets.all(16),
                  borderRadius: 20,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Server Storage', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                          Text(
                            '${Formatters.formatBytes(used)} / ${Formatters.formatBytes(diskTotal)}',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: primary),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: storagePercent,
                          backgroundColor: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.06),
                          valueColor: AlwaysStoppedAnimation<Color>(primary),
                          minHeight: 8,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${_stats.photoCount} Photos', style: TextStyle(fontSize: 11, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6))),
                          Text('${_stats.videoCount} Videos', style: TextStyle(fontSize: 11, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6))),
                          Text('${_stats.docCount} Docs', style: TextStyle(fontSize: 11, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6))),
                          Text('${_stats.fileCount} Total Files', style: TextStyle(fontSize: 11, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6))),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // LAN Server Settings Card
                GlassCard(
                  padding: const EdgeInsets.all(16),
                  borderRadius: 20,
                  onTap: () {
                    showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      backgroundColor: Colors.transparent,
                      builder: (_) => const LanScannerModal(),
                    );
                  },
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: primary.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(Icons.dns_rounded, color: primary, size: 22),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('HBS LAN Server', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                            Text(
                              serverInfo.url,
                              style: theme.textTheme.bodySmall?.copyWith(color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6)),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.4)),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // Theme Mode & Palette Selector Card
                GlassCard(
                  padding: const EdgeInsets.all(16),
                  borderRadius: 20,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Appearance & Accent Palette', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),

                      // Theme Mode Switcher (Light / Dark / AMOLED)
                      Row(
                        children: [
                          _modeChip(context, 'Light', ThemeModeOption.light, themeState.mode, themeNotifier),
                          const SizedBox(width: 8),
                          _modeChip(context, 'Dark', ThemeModeOption.dark, themeState.mode, themeNotifier),
                          const SizedBox(width: 8),
                          _modeChip(context, 'AMOLED', ThemeModeOption.amoled, themeState.mode, themeNotifier),
                        ],
                      ),

                      const SizedBox(height: 16),
                      Text('Accent Color', style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),

                      // 5 Color Palette Presets
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: AppPalettes.presets.values.map((preset) {
                          final isSelected = themeState.paletteKey == preset.id;
                          return GestureDetector(
                            onTap: () => themeNotifier.setPalette(preset.id),
                            child: Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: preset.previewColor,
                                shape: BoxShape.circle,
                                border: isSelected ? Border.all(color: Colors.white, width: 3) : null,
                                boxShadow: [
                                  BoxShadow(
                                    color: preset.previewColor.withValues(alpha: 0.4),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: isSelected ? const Icon(Icons.check_rounded, color: Colors.white, size: 20) : null,
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // App Security & Lock Card
                GlassCard(
                  padding: const EdgeInsets.all(16),
                  borderRadius: 20,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('App Security & Lock', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Require PIN / Biometrics', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        value: lockState.isLockEnabled,
                        activeTrackColor: primary,
                        onChanged: (val) async {
                          if (val && !lockState.hasPin) {
                            final pin = await InputDialog.show(
                              context,
                              title: 'Set App Lock PIN',
                              placeholder: 'Enter 4-digit PIN',
                              confirmText: 'Set PIN',
                            );
                            if (pin != null && pin.isNotEmpty) {
                              await lockNotifier.setPin(pin);
                              await lockNotifier.setLockEnabled(true);
                            }
                          } else {
                            await lockNotifier.setLockEnabled(val);
                          }
                        },
                      ),
                      if (lockState.isLockEnabled) ...[
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.pin_rounded),
                          title: const Text('Change PIN', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () async {
                            final pin = await InputDialog.show(
                              context,
                              title: 'New PIN',
                              placeholder: 'Enter new PIN',
                              confirmText: 'Update',
                            );
                            if (pin != null && pin.isNotEmpty) {
                              await lockNotifier.setPin(pin);
                            }
                          },
                        ),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.lock_clock_rounded),
                          title: const Text('Lock App Now', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                          onTap: () => lockNotifier.lockNow(),
                        ),
                      ],
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // Database & Cache Management Card
                GlassCard(
                  padding: const EdgeInsets.all(16),
                  borderRadius: 20,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Cache & Deduplication Index', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      Text(
                        'Purge local SQLite deduplication index to re-verify all camera roll files with server.',
                        style: TextStyle(fontSize: 12, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6)),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        icon: const Icon(Icons.delete_sweep_rounded, size: 18),
                        label: const Text('Purge & Rebuild Index'),
                        onPressed: () async {
                          await backupNotifier.purgeAndRebuildIndex();
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('SQLite deduplication index purged successfully')),
                            );
                          }
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: primary,
                          side: BorderSide(color: primary.withValues(alpha: 0.5)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _modeChip(
    BuildContext context,
    String label,
    ThemeModeOption mode,
    ThemeModeOption currentMode,
    ThemeNotifier notifier,
  ) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;
    final isSelected = mode == currentMode;

    return Expanded(
      child: GestureDetector(
        onTap: () => notifier.setMode(mode),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? primary : (theme.brightness == Brightness.dark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.04)),
            borderRadius: BorderRadius.circular(12),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: isSelected ? Colors.white : theme.textTheme.bodyMedium?.color,
            ),
          ),
        ),
      ),
    );
  }
}
