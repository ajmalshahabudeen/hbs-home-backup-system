import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/floating_header.dart';
import '../../core/widgets/glass_card.dart';
import '../../core/widgets/input_dialog.dart';
import '../../core/widgets/skeleton_loader.dart';
import '../../models/backup_file_item.dart';
import '../../providers/auth_provider.dart';
import '../../providers/drive_provider.dart';
import '../../providers/server_provider.dart';
import '../../services/api_service.dart';
import '../../services/drive_cache_service.dart';
import '../search/search_screen.dart';
import '../settings/lan_scanner_modal.dart';
import 'drive_preview_screen.dart';
import 'upload_modal.dart';

class DriveScreen extends ConsumerWidget {
  const DriveScreen({super.key});

  void _showFileActions(BuildContext context, WidgetRef ref, BackupFileItem file) {
    final driveNotifier = ref.read(driveProvider.notifier);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        decoration: BoxDecoration(
          color: (isDark ? theme.cardColor : Colors.white).withValues(alpha: 0.95),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  file.isDir ? Icons.folder_rounded : Icons.insert_drive_file_rounded,
                  color: file.isDir ? const Color(0xFFF59E0B) : theme.primaryColor,
                  size: 28,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(file.name, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800), maxLines: 1),
                      Text(
                        file.isDir ? 'Folder' : '${Formatters.formatBytes(file.size)} • ${Formatters.formatShortDate(file.createdAt)}',
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (!file.isDir &&
                ['photo', 'video', 'audio'].contains(Formatters.getMimeTypeCategory(file.mimeType, file.name)))
              ListTile(
                leading: const Icon(Icons.play_circle_outline_rounded),
                title: const Text('Preview'),
                onTap: () {
                  Navigator.of(context).pop();
                  DrivePreviewScreen.open(context, file);
                },
              ),
            ListTile(
              leading: const Icon(Icons.download_rounded),
              title: const Text('Download'),
              onTap: () async {
                Navigator.of(context).pop();
                await _downloadFile(context, file);
              },
            ),
            ListTile(
              leading: const Icon(Icons.edit_rounded),
              title: const Text('Rename'),
              onTap: () async {
                Navigator.of(context).pop();
                final newName = await InputDialog.show(
                  context,
                  title: 'Rename',
                  initialValue: file.name,
                  confirmText: 'Rename',
                );
                if (newName != null && newName.isNotEmpty && newName != file.name) {
                  await driveNotifier.renameFile(file.path, newName);
                }
              },
            ),
            if (file.parentPath == 'Trash')
              ListTile(
                leading: const Icon(Icons.restore_from_trash_rounded),
                title: const Text('Restore'),
                onTap: () async {
                  Navigator.of(context).pop();
                  await ApiService().restoreFile(file.id);
                  await driveNotifier.loadFiles(ref.read(driveProvider).currentPath);
                },
              ),
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded, color: Colors.red),
              title: Text(
                file.parentPath == 'Trash' ? 'Delete forever' : 'Move to Trash',
                style: const TextStyle(color: Colors.red),
              ),
              onTap: () async {
                Navigator.of(context).pop();
                final inTrash = file.parentPath == 'Trash';
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: Text(inTrash ? 'Delete forever' : 'Move to Trash'),
                    content: Text(
                      inTrash
                          ? 'Permanently delete "${file.name}"? This cannot be undone.'
                          : 'Move "${file.name}" to Trash?',
                    ),
                    actions: [
                      TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
                      ElevatedButton(
                        onPressed: () => Navigator.of(ctx).pop(true),
                        style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
                        child: Text(inTrash ? 'Delete' : 'Trash'),
                      ),
                    ],
                  ),
                );
                if (confirm == true) {
                  await driveNotifier.deleteFile(file.id, permanent: inTrash);
                  if (context.mounted && !inTrash) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Moved to Trash')));
                  }
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _downloadFile(BuildContext context, BackupFileItem file) async {
    try {
      final dir = await getTemporaryDirectory();
      final dest = '${dir.path}/${file.name}';
      await ApiService().downloadFile(fileId: file.id, destPath: dest);
      await DriveCacheService().put(file.id, file.name, dest);
      final cat = Formatters.getMimeTypeCategory(file.mimeType, file.name);
      if (cat == 'photo') {
        await Gal.putImage(dest, album: 'HBS Cloud');
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved to gallery')));
        }
      } else if (cat == 'video') {
        await Gal.putVideo(dest, album: 'HBS Cloud');
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved to gallery')));
        }
      } else {
        await SharePlus.instance.share(ShareParams(files: [XFile(dest)], text: file.name));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Download failed: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;

    final driveState = ref.watch(driveProvider);
    final driveNotifier = ref.read(driveProvider.notifier);
    final serverInfo = ref.watch(serverProvider);
    final user = ref.watch(authProvider).user;

    final files = driveState.sortedAndFilteredFiles;
    final breadcrumbParts = driveState.currentPath.isEmpty ? <String>[] : driveState.currentPath.split('/');

    return Scaffold(
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (driveState.currentPath == 'Trash')
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: FloatingActionButton.extended(
                heroTag: 'emptyTrash',
                onPressed: () async {
                  await ApiService().emptyTrash();
                  await driveNotifier.loadFiles('Trash');
                },
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
                icon: const Icon(Icons.delete_forever_rounded),
                label: const Text('Empty Trash'),
              ),
            ),
          Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom),
            child: FloatingActionButton.extended(
              onPressed: () => UploadModal.show(context),
              backgroundColor: primary,
              foregroundColor: Colors.white,
              elevation: 6,
              icon: const Icon(Icons.add_rounded, size: 22),
              label: const Text('Add', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Floating Header
          FloatingHeader(
            title: 'HBS Drive',
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

          // Breadcrumb Navigation Row
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Row(
              children: [
                GestureDetector(
                  onTap: () => driveNotifier.loadFiles(''),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.home_rounded, size: 16, color: primary),
                      const SizedBox(width: 4),
                      Text('Drive', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: primary)),
                    ],
                  ),
                ),
                ...breadcrumbParts.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final part = entry.value;
                  final fullPath = breadcrumbParts.sublist(0, idx + 1).join('/');

                  return Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.chevron_right_rounded, size: 16, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.4)),
                      GestureDetector(
                        onTap: () => driveNotifier.loadFiles(fullPath),
                        child: Text(
                          part,
                          style: TextStyle(
                            fontWeight: idx == breadcrumbParts.length - 1 ? FontWeight.w800 : FontWeight.w500,
                            fontSize: 13,
                            color: idx == breadcrumbParts.length - 1 ? theme.textTheme.bodyLarge?.color : primary,
                          ),
                        ),
                      ),
                    ],
                  );
                }),
                const Spacer(),
                IconButton(
                  icon: Icon(driveState.isGridView ? Icons.view_list_rounded : Icons.grid_view_rounded, size: 18),
                  onPressed: driveNotifier.toggleViewMode,
                  tooltip: 'Toggle View',
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
          ),

          // File Explorer Content
          Expanded(
            child: driveState.isLoading && files.isEmpty
                ? const SkeletonFileList()
                : RefreshIndicator(
                    onRefresh: () => driveNotifier.loadFiles(driveState.currentPath),
                    color: primary,
                    child: files.isEmpty
                        ? ListView(
                            children: [
                              SizedBox(height: MediaQuery.of(context).size.height * 0.25),
                              Center(
                                child: Column(
                                  children: [
                                    Icon(Icons.folder_open_rounded, size: 56, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.3)),
                                    const SizedBox(height: 12),
                                    Text('This folder is empty', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                                  ],
                                ),
                              ),
                            ],
                          )
                        : driveState.isGridView
                            ? GridView.builder(
                                padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.paddingOf(context).bottom + 160),
                                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 2,
                                  crossAxisSpacing: 10,
                                  mainAxisSpacing: 10,
                                  childAspectRatio: 1.05,
                                ),
                                itemCount: files.length,
                                itemBuilder: (context, index) {
                                  final file = files[index];
                                  return GlassCard(
                                    padding: const EdgeInsets.all(12),
                                    borderRadius: 18,
                                    onTap: () {
                                      if (file.isDir) {
                                        driveNotifier.navigateToFolder(file.name);
                                      } else {
                                        final category = Formatters.getMimeTypeCategory(file.mimeType, file.name);
                                        if (category == 'photo' || category == 'video' || category == 'audio') {
                                          DrivePreviewScreen.open(context, file);
                                        } else {
                                          _showFileActions(context, ref, file);
                                        }
                                      }
                                    },
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            Container(
                                              width: 42,
                                              height: 42,
                                              decoration: BoxDecoration(
                                                color: file.isDir
                                                    ? const Color(0xFFF59E0B).withValues(alpha: 0.15)
                                                    : primary.withValues(alpha: 0.12),
                                                borderRadius: BorderRadius.circular(14),
                                              ),
                                              child: Icon(
                                                file.isDir ? Icons.folder_rounded : Icons.insert_drive_file_rounded,
                                                color: file.isDir ? const Color(0xFFF59E0B) : primary,
                                                size: 22,
                                              ),
                                            ),
                                            IconButton(
                                              icon: const Icon(Icons.more_vert_rounded, size: 18),
                                              padding: EdgeInsets.zero,
                                              constraints: const BoxConstraints(),
                                              onPressed: () => _showFileActions(context, ref, file),
                                            ),
                                          ],
                                        ),
                                        const Spacer(),
                                        Text(
                                          file.name,
                                          style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          file.isDir
                                              ? 'Folder'
                                              : '${Formatters.formatBytes(file.size)} • ${Formatters.formatShortDate(file.createdAt)}',
                                          style: theme.textTheme.bodySmall?.copyWith(
                                            fontSize: 11,
                                            color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              )
                            : ListView.separated(
                                padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.paddingOf(context).bottom + 160),
                                itemCount: files.length,
                                separatorBuilder: (_, __) => const SizedBox(height: 8),
                                itemBuilder: (context, index) {
                                  final file = files[index];
                                  return GlassCard(
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                    borderRadius: 16,
                                    onTap: () {
                                      if (file.isDir) {
                                        driveNotifier.navigateToFolder(file.name);
                                      } else {
                                        final category = Formatters.getMimeTypeCategory(file.mimeType, file.name);
                                        if (category == 'photo' || category == 'video' || category == 'audio') {
                                          DrivePreviewScreen.open(context, file);
                                        } else {
                                          _showFileActions(context, ref, file);
                                        }
                                      }
                                    },
                                    child: Row(
                                      children: [
                                        // Folder / File Icon
                                        Container(
                                          width: 40,
                                          height: 40,
                                          decoration: BoxDecoration(
                                            color: file.isDir ? const Color(0xFFF59E0B).withValues(alpha: 0.15) : primary.withValues(alpha: 0.12),
                                            borderRadius: BorderRadius.circular(12),
                                          ),
                                          child: Icon(
                                            file.isDir ? Icons.folder_rounded : Icons.insert_drive_file_rounded,
                                            color: file.isDir ? const Color(0xFFF59E0B) : primary,
                                            size: 22,
                                          ),
                                        ),
                                        const SizedBox(width: 12),

                                        // File Details
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                file.name,
                                                style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                              const SizedBox(height: 2),
                                              Text(
                                                file.isDir ? 'Folder' : '${Formatters.formatBytes(file.size)} • ${Formatters.formatShortDate(file.createdAt)}',
                                                style: theme.textTheme.bodySmall?.copyWith(
                                                  fontSize: 11,
                                                  color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),

                                        IconButton(
                                          icon: const Icon(Icons.more_vert_rounded, size: 18),
                                          onPressed: () => _showFileActions(context, ref, file),
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                  ),
          ),
        ],
      ),
    );
  }
}
