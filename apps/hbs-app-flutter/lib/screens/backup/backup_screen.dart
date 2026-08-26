import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/floating_header.dart';
import '../../core/widgets/glass_card.dart';
import '../../providers/auth_provider.dart';
import '../../providers/backup_provider.dart';
import '../../providers/server_provider.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../../core/utils/background_backup.dart';
import '../search/search_screen.dart';
import '../settings/lan_scanner_modal.dart';
import 'album_picker_modal.dart';

class BackupScreen extends ConsumerWidget {
  const BackupScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;

    final backupState = ref.watch(backupProvider);
    final backupNotifier = ref.read(backupProvider.notifier);
    final serverInfo = ref.watch(serverProvider);
    final user = ref.watch(authProvider).user;
    final syncState = backupState.syncState;

    final isSyncing = syncState.isSyncing;
    final percent = (syncState.overallProgress * 100).toInt();

    return Scaffold(
      body: Column(
        children: [
          // Floating Header
          FloatingHeader(
            title: 'HBS Backup',
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

          // Main Backup Dashboard Content
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
              children: [
                // Hero Sync Card
                GlassCard(
                  padding: const EdgeInsets.all(20),
                  borderRadius: 24,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 44,
                                height: 44,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [primary, primary.withValues(alpha: 0.7)],
                                  ),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Icon(
                                  isSyncing ? Icons.sync_rounded : Icons.cloud_done_rounded,
                                  color: Colors.white,
                                  size: 24,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    isSyncing ? 'Backing Up Media...' : 'Backup Status',
                                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                                  ),
                                  Text(
                                    isSyncing
                                        ? '${syncState.syncedCount + syncState.skippedCount} / ${syncState.totalToSync} files'
                                        : (syncState.lastSyncTime != null
                                            ? 'Last synced: ${Formatters.formatDate(syncState.lastSyncTime)}'
                                            : 'Ready to sync'),
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          if (isSyncing)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: primary.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                '$percent%',
                                style: TextStyle(
                                  color: primary,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                        ],
                      ),

                      if (isSyncing) ...[
                        const SizedBox(height: 16),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: LinearProgressIndicator(
                            value: syncState.overallProgress,
                            backgroundColor: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05),
                            valueColor: AlwaysStoppedAnimation<Color>(primary),
                            minHeight: 6,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          syncState.currentFileName ?? 'Processing...',
                          style: TextStyle(
                            fontSize: 11,
                            color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton.icon(
                            icon: const Icon(Icons.pause_rounded, size: 16),
                            label: const Text('Cancel Backup'),
                            onPressed: backupNotifier.cancelSync,
                            style: TextButton.styleFrom(foregroundColor: Colors.red),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // Auto-Sync Selected Folders Card
                GlassCard(
                  padding: const EdgeInsets.all(16),
                  borderRadius: 20,
                  onTap: () => AlbumPickerModal.show(context),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFF3B82F6).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.folder_special_rounded, color: Color(0xFF3B82F6), size: 22),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Auto-Sync Folders',
                              style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            Text(
                              backupState.selectedAlbumIds.isEmpty
                                  ? 'All Camera Roll Photos'
                                  : '${backupState.selectedAlbumIds.length} folder(s) selected',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.4)),
                    ],
                  ),
                ),

                const SizedBox(height: 12),

                // Deduplication Index Card
                GlassCard(
                  padding: const EdgeInsets.all(16),
                  borderRadius: 20,
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.fingerprint_rounded, color: Color(0xFF10B981), size: 22),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Local Deduplication Index',
                              style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            Text(
                              '${backupState.indexedCount} files cached in fast SQLite database',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 12),

                // Battery Saver Mode Toggle Card
                GlassCard(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  borderRadius: 20,
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.battery_charging_full_rounded, color: Color(0xFFF59E0B), size: 22),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Battery Saver Mode',
                              style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            Text(
                              'Limits concurrent uploads to 2 to preserve battery',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Switch(
                        value: backupState.batterySaverEnabled,
                        activeTrackColor: primary,
                        onChanged: backupNotifier.setBatterySaver,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GlassCard(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  borderRadius: 20,
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFF3B82F6).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.wifi_rounded, color: Color(0xFF3B82F6), size: 22),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Wi-Fi only', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                            Text(
                              'Do not upload on cellular data',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Switch(
                        value: backupState.wifiOnly,
                        activeTrackColor: primary,
                        onChanged: backupNotifier.setWifiOnly,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GlassCard(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  borderRadius: 20,
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFF8B5CF6).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.schedule_rounded, color: Color(0xFF8B5CF6), size: 22),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Auto-backup on resume', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                            Text(
                              'Sync new photos when you reopen the app',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Switch(
                        value: backupState.autoBackup,
                        activeTrackColor: primary,
                        onChanged: backupNotifier.setAutoBackup,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GlassCard(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  borderRadius: 20,
                  child: Row(
                    children: [
                      const Icon(Icons.timer_outlined),
                      const SizedBox(width: 12),
                      const Expanded(child: Text('Background interval')),
                      DropdownButton<String>(
                        value: StorageService().getString('hbs_backup_minutes', defaultValue: '15').isEmpty
                            ? '15'
                            : StorageService().getString('hbs_backup_minutes', defaultValue: '15'),
                        items: const [
                          DropdownMenuItem(value: '15', child: Text('15 min')),
                          DropdownMenuItem(value: '30', child: Text('30 min')),
                          DropdownMenuItem(value: '60', child: Text('Hourly')),
                          DropdownMenuItem(value: '360', child: Text('6 hours')),
                          DropdownMenuItem(value: '1440', child: Text('Daily')),
                        ],
                        onChanged: (v) async {
                          if (v == null) return;
                          await StorageService().setString('hbs_backup_minutes', v);
                          if (backupState.autoBackup) await scheduleBackgroundBackup();
                        },
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Start Auto-Sync Now Button
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: ElevatedButton.icon(
                    icon: Icon(isSyncing ? Icons.sync_rounded : Icons.cloud_upload_rounded),
                    label: Text(
                      isSyncing ? 'Sync in Progress...' : 'Start Auto-Sync Now',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                    ),
                    onPressed: isSyncing
                        ? null
                        : () async {
                            try {
                              final stats = await ApiService().getUserStats();
                              final quota = stats.quotaBytes;
                              final used = stats.usedBytes ?? stats.totalBytes;
                              if (quota != null && quota > 0 && context.mounted) {
                                if (used >= quota) {
                                  await showDialog<void>(
                                    context: context,
                                    builder: (ctx) => AlertDialog(
                                      title: const Text('Quota full'),
                                      content: const Text('Your HBS Cloud quota is full. Free space or ask an admin to raise it.'),
                                      actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
                                    ),
                                  );
                                  return;
                                }
                                if (used > quota * 0.9) {
                                  final go = await showDialog<bool>(
                                    context: context,
                                    builder: (ctx) => AlertDialog(
                                      title: const Text('Quota almost full'),
                                      content: Text(
                                        'You have used ${((used / quota) * 100).toStringAsFixed(0)}% of your quota. Continue backup?',
                                      ),
                                      actions: [
                                        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                                        TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Continue')),
                                      ],
                                    ),
                                  );
                                  if (go != true) return;
                                }
                              }
                            } catch (_) {}
                            await backupNotifier.startSync();
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primary,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
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
