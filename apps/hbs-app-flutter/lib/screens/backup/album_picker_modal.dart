import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/backup_provider.dart';
import '../../services/media_discovery_service.dart';

class AlbumPickerModal extends ConsumerStatefulWidget {
  const AlbumPickerModal({super.key});

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const AlbumPickerModal(),
    );
  }

  @override
  ConsumerState<AlbumPickerModal> createState() => _AlbumPickerModalState();
}

class _AlbumPickerModalState extends ConsumerState<AlbumPickerModal> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ref.read(backupProvider).hasPermission && ref.read(backupProvider).albums.isEmpty) {
        ref.read(backupProvider.notifier).loadAlbums();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;

    final backupState = ref.watch(backupProvider);
    final backupNotifier = ref.read(backupProvider.notifier);

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
      child: Container(
        height: MediaQuery.of(context).size.height * 0.65,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        decoration: BoxDecoration(
          color: (isDark ? theme.cardColor : Colors.white).withValues(alpha: 0.95),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(
            top: BorderSide(
              color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.08),
            ),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Auto-Sync Folders',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Done', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            Text(
              'Select device folders to automatically back up to HBS',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(height: 16),

            Expanded(
              child: !backupState.hasPermission
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.lock_outline_rounded,
                            size: 48,
                            color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.4),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Media access is required to view albums',
                            style: TextStyle(color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.7)),
                          ),
                          const SizedBox(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              ElevatedButton.icon(
                                onPressed: () async {
                                  await MediaDiscoveryService().requestPermissions(force: true);
                                  await backupNotifier.loadAlbums(force: true);
                                },
                                icon: const Icon(Icons.check_circle_outline_rounded, size: 18),
                                label: const Text('Grant Access'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: primary,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                              ),
                              const SizedBox(width: 8),
                              OutlinedButton.icon(
                                onPressed: () => MediaDiscoveryService().openSettings(),
                                icon: const Icon(Icons.settings_outlined, size: 18),
                                label: const Text('Settings'),
                                style: OutlinedButton.styleFrom(
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    )
                  : backupState.isLoadingAlbums
                      ? const Center(child: CircularProgressIndicator())
                      : backupState.albums.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.folder_off_outlined,
                                    size: 48,
                                    color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.4),
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    'No albums found on device',
                                    style: TextStyle(color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.7)),
                                  ),
                                  const SizedBox(height: 16),
                                  TextButton.icon(
                                    onPressed: () => backupNotifier.loadAlbums(force: true),
                                    icon: const Icon(Icons.refresh_rounded, size: 18),
                                    label: const Text('Refresh'),
                                  ),
                                ],
                              ),
                            )
                      : ListView.separated(
                          itemCount: backupState.albums.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final album = backupState.albums[index];
                            final isSelected = backupState.selectedAlbumIds.contains(album.id) ||
                                backupState.selectedAlbumIds.contains(album.name.toLowerCase());

                            return InkWell(
                              onTap: () => backupNotifier.toggleAlbum(album.id),
                              borderRadius: BorderRadius.circular(16),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                decoration: BoxDecoration(
                                  color: isDark ? Colors.white.withValues(alpha: 0.04) : Colors.black.withValues(alpha: 0.03),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: isSelected ? primary : Colors.transparent,
                                    width: 1.5,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      Icons.photo_library_rounded,
                                      color: isSelected ? primary : Colors.grey,
                                      size: 22,
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            album.name,
                                            style: theme.textTheme.bodyMedium?.copyWith(
                                              fontWeight: FontWeight.w700,
                                              color: isSelected ? primary : null,
                                            ),
                                          ),
                                          Text(
                                            '${album.assetCount} items',
                                            style: theme.textTheme.bodySmall?.copyWith(
                                              fontSize: 11,
                                              color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Checkbox(
                                      value: isSelected,
                                      activeColor: primary,
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                      onChanged: (_) => backupNotifier.toggleAlbum(album.id),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
