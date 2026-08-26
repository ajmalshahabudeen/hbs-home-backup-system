import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/color_palettes.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/vault_crypto.dart';
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
import '../../services/storage_service.dart';
import '../../services/watch_folder_service.dart';
import '../search/search_screen.dart';
import 'duplicates_screen.dart';
import 'family_share_screen.dart';
import 'lan_scanner_modal.dart';
import 'qr_pair_screen.dart';
import 'two_factor_screen.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  UserStats _stats = UserStats.empty;
  List<Map<String, dynamic>> _devices = [];

  @override
  void initState() {
    super.initState();
    _loadStats();
    _loadDevices();
  }

  Future<void> _loadDevices() async {
    try {
      final devices = await ApiService().listDevices();
      if (mounted) setState(() => _devices = devices);
    } catch (_) {}
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
            onServerTap: () {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => const LanScannerModal(),
              );
            },
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
                      const SizedBox(height: 4),
                      Text(
                        'Uses your phone lock (fingerprint, face, or device PIN). An optional 4-digit app PIN is available as a backup.',
                        style: TextStyle(fontSize: 12, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6)),
                      ),
                      const SizedBox(height: 8),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Lock with device security', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        subtitle: Text(
                          lockState.deviceAuthAvailable
                              ? 'Fingerprint, face, or your phone PIN'
                              : 'Set a screen lock on this device first',
                          style: const TextStyle(fontSize: 12),
                        ),
                        value: lockState.isDeviceLockEnabled,
                        activeTrackColor: primary,
                        onChanged: (val) async {
                          if (val) {
                            final ok = await lockNotifier.enableDeviceLock();
                            if (!ok && context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Could not enable device lock. Set a screen lock and try again.')),
                              );
                            }
                          } else {
                            await lockNotifier.disableDeviceLock();
                          }
                        },
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('4-digit app PIN', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        subtitle: const Text('Optional backup if device unlock is cancelled', style: TextStyle(fontSize: 12)),
                        value: lockState.hasPin,
                        activeTrackColor: primary,
                        onChanged: (val) async {
                          if (val) {
                            final pin = await _promptPin(context, title: 'Set 4-digit PIN');
                            if (pin == null || !context.mounted) return;
                            final confirm = await _promptPin(context, title: 'Confirm PIN');
                            if (confirm == null) return;
                            if (pin != confirm) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('PINs did not match')),
                                );
                              }
                              return;
                            }
                            final saved = await lockNotifier.setPin(pin);
                            if (!saved && context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('PIN must be exactly 4 digits')),
                              );
                            }
                          } else {
                            await lockNotifier.clearPin();
                          }
                        },
                      ),
                      if (lockState.hasPin)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.pin_rounded),
                          title: const Text('Change PIN', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () async {
                            final pin = await _promptPin(context, title: 'New 4-digit PIN');
                            if (pin == null || !context.mounted) return;
                            final confirm = await _promptPin(context, title: 'Confirm new PIN');
                            if (confirm == null) return;
                            if (pin != confirm) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('PINs did not match')),
                                );
                              }
                              return;
                            }
                            await lockNotifier.setPin(pin);
                          },
                        ),
                      if (lockState.isLockEnabled)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.lock_clock_rounded),
                          title: const Text('Lock App Now', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                          onTap: () => lockNotifier.lockNow(),
                        ),
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
                const SizedBox(height: 16),
                GlassCard(
                  padding: const EdgeInsets.all(16),
                  borderRadius: 20,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('More', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.qr_code_scanner_rounded),
                        title: const Text('Scan server QR'),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const QrPairScreen())),
                      ),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.copy_all_rounded),
                        title: const Text('Find duplicates'),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DuplicatesScreen())),
                      ),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.family_restroom_rounded),
                        title: const Text('Family folders'),
                        subtitle: Text('Quota ${Formatters.formatBytes(_stats.quotaBytes ?? _stats.diskTotalBytes ?? 0)}'),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const FamilyShareScreen())),
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        secondary: const Icon(Icons.lock_rounded),
                        title: const Text('End-to-end encrypt uploads'),
                        subtitle: const Text('AES-256-GCM. Server never sees the passphrase.'),
                        value: VaultCrypto.enabled,
                        onChanged: (v) async {
                          if (v) {
                            final pass = await InputDialog.show(
                              context,
                              title: 'Vault passphrase',
                              placeholder: 'At least 8 characters',
                              confirmText: 'Enable',
                              obscureText: true,
                            );
                            if (pass == null || pass.length < 8) return;
                            await VaultCrypto.setPassphrase(pass);
                          }
                          await VaultCrypto.setEnabled(v);
                          setState(() {});
                        },
                      ),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.phonelink_lock_rounded),
                        title: const Text('Authenticator 2FA'),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const TwoFactorScreen()),
                        ),
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        secondary: const Icon(Icons.photo_rounded),
                        title: const Text('Backup photos'),
                        value: StorageService().getBool('hbs_backup_photos', defaultValue: true),
                        onChanged: (v) async {
                          await StorageService().setBool('hbs_backup_photos', v);
                          setState(() {});
                        },
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        secondary: const Icon(Icons.videocam_rounded),
                        title: const Text('Backup videos'),
                        value: StorageService().getBool('hbs_backup_videos', defaultValue: true),
                        onChanged: (v) async {
                          await StorageService().setBool('hbs_backup_videos', v);
                          setState(() {});
                        },
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        secondary: const Icon(Icons.compress_rounded),
                        title: const Text('Optimize storage'),
                        subtitle: const Text('Prefer thumbs; skip extra full-file cache'),
                        value: StorageService().getBool('hbs_optimize_storage', defaultValue: false),
                        onChanged: (v) async {
                          await StorageService().setBool('hbs_optimize_storage', v);
                          setState(() {});
                        },
                      ),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.folder_copy_rounded),
                        title: const Text('Desktop watch folder'),
                        subtitle: Text(StorageService().getString('hbs_watch_folder').isEmpty
                            ? 'Pick a folder to auto-upload (Windows/macOS)'
                            : StorageService().getString('hbs_watch_folder')),
                        onTap: () async {
                          final dir = await FilePicker.platform.getDirectoryPath();
                          if (dir == null) return;
                          await StorageService().setString('hbs_watch_folder', dir);
                          await WatchFolderService().start();
                          setState(() {});
                        },
                      ),
                      if (_devices.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text('Devices', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                        ..._devices.map((d) {
                          final seen = DateTime.tryParse(d['lastSeenAt']?.toString() ?? '');
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.smartphone_rounded),
                            title: Text(d['deviceName']?.toString() ?? d['deviceId']?.toString() ?? 'Device'),
                            subtitle: Text(
                              '${d['platform'] ?? ''} · last seen ${seen == null ? 'unknown' : Formatters.formatDate(seen)}',
                            ),
                          );
                        }),
                      ],
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

  Future<String?> _promptPin(BuildContext context, {required String title}) {
    return InputDialog.show(
      context,
      title: title,
      placeholder: '4 digits',
      confirmText: 'Continue',
      obscureText: true,
      digitsOnly: true,
      maxLength: 4,
      keyboardType: TextInputType.number,
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
