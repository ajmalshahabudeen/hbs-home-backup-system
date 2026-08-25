import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/backup_provider.dart';

class AlbumPickerModal extends ConsumerWidget {
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
  Widget build(BuildContext context, WidgetRef ref) {
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
              child: backupState.isLoadingAlbums
                  ? const Center(child: CircularProgressIndicator())
                  : backupState.albums.isEmpty
                      ? Center(
                          child: Text(
                            'No albums found on device',
                            style: TextStyle(color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6)),
                          ),
                        )
                      : ListView.separated(
                          itemCount: backupState.albums.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final album = backupState.albums[index];
                            final isSelected = backupState.selectedAlbumIds.contains(album.id);

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
