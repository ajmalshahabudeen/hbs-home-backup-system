import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/session_token_cleaner.dart';
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
import '../../services/storage_service.dart';
import '../search/search_screen.dart';
import '../settings/lan_scanner_modal.dart';
import 'drive_preview_screen.dart';
import 'drive_thumbnail.dart';
import 'upload_modal.dart';

class DriveScreen extends ConsumerWidget {
  const DriveScreen({super.key});

  Future<void> _handleAddAction(BuildContext context, WidgetRef ref) async {
    final action = await UploadModal.show(context);
    if (action == null || !context.mounted) return;

    final driveNotifier = ref.read(driveProvider.notifier);
    final driveState = ref.read(driveProvider);

    switch (action) {
      case UploadAction.createFolder:
        final folderName = await InputDialog.show(
          context,
          title: 'New Folder',
          placeholder: 'Folder name',
          confirmText: 'Create',
        );
        if (folderName != null && folderName.trim().isNotEmpty && context.mounted) {
          final trimmed = folderName.trim();
          final success = await driveNotifier.createFolder(trimmed);
          if (context.mounted) {
            if (success) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Folder "$trimmed" created'),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            } else {
              final err = ref.read(driveProvider).errorMessage ?? 'Create folder failed';
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(err),
                  backgroundColor: Colors.red,
                  behavior: SnackBarBehavior.floating,
                ),
              );
            }
          }
        }
        break;

      case UploadAction.uploadFiles:
      case UploadAction.uploadMedia:
        final isMedia = action == UploadAction.uploadMedia;
        final result = await FilePicker.platform.pickFiles(
          allowMultiple: true,
          type: isMedia ? FileType.media : FileType.any,
        );
        if (result == null || result.files.isEmpty || !context.mounted) return;

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Uploading ${result.files.length} file(s)...'),
            behavior: SnackBarBehavior.floating,
          ),
        );

        for (final file in result.files) {
          if (file.path != null) {
            final data = await ApiService().uploadFile(
              filePath: file.path!,
              fileName: file.name,
              parentPath: driveState.currentPath,
              onConflict: 'ask',
            );
            if (data is Map && data['conflict'] == true && context.mounted) {
              final choice = await showDialog<String>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('File already exists'),
                  content: Text('${file.name} is already in this folder with a different size.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, 'skip'), child: const Text('Skip')),
                    TextButton(onPressed: () => Navigator.pop(ctx, 'rename'), child: const Text('Keep both')),
                    TextButton(onPressed: () => Navigator.pop(ctx, 'overwrite'), child: const Text('Replace')),
                  ],
                ),
              );
              if (choice == 'overwrite' || choice == 'rename') {
                await ApiService().uploadFile(
                  filePath: file.path!,
                  fileName: file.name,
                  parentPath: driveState.currentPath,
                  onConflict: choice,
                );
              }
            }
          }
        }

        await driveNotifier.loadFiles(driveState.currentPath);

        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Upload complete!'),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
        break;
    }
  }

  void _showFileActions(
    BuildContext context,
    WidgetRef ref,
    BackupFileItem file, {
    Map<String, String>? mediaHeaders,
    String? serverUrl,
  }) {
    final driveNotifier = ref.read(driveProvider.notifier);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;
    final sUrl = serverUrl ?? ref.read(serverProvider).url;
    final category = Formatters.getMimeTypeCategory(file.mimeType, file.name);
    final isMedia = !file.isDir && (category == 'photo' || category == 'video' || category == 'audio');

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.85,
        ),
        decoration: BoxDecoration(
          color: (isDark ? theme.cardColor : Colors.white).withValues(alpha: 0.95),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Material(
          color: Colors.transparent,
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      DriveThumbnail(
                        file: file,
                        serverUrl: sUrl,
                        headers: mediaHeaders,
                        size: 48,
                        borderRadius: 14,
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                           crossAxisAlignment: CrossAxisAlignment.start,
                           children: [
                             Text(
                               file.name,
                               style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                               maxLines: 1,
                               overflow: TextOverflow.ellipsis,
                             ),
                             const SizedBox(height: 2),
                             Text(
                               file.isDir
                                   ? 'Folder'
                                   : '${Formatters.formatBytes(file.size)} • ${Formatters.formatShortDate(file.createdAt)}',
                               style: theme.textTheme.bodySmall?.copyWith(
                                 color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                               ),
                             ),
                           ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  const Divider(height: 1),
                  const SizedBox(height: 6),
                  if (isMedia)
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                      leading: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: primary.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(
                          category == 'video'
                              ? Icons.play_arrow_rounded
                              : (category == 'audio' ? Icons.headphones_rounded : Icons.visibility_rounded),
                          color: primary,
                          size: 24,
                        ),
                      ),
                      title: Text(
                        category == 'video' ? 'Play Video' : (category == 'audio' ? 'Play Audio' : 'View Photo'),
                        style: TextStyle(fontWeight: FontWeight.w700, color: primary),
                      ),
                      subtitle: const Text('Open full screen preview', style: TextStyle(fontSize: 12)),
                      onTap: () {
                        Navigator.of(context).pop();
                        DrivePreviewScreen.open(context, file);
                      },
                    ),
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                    leading: const Icon(Icons.download_rounded),
                    title: const Text('Download'),
                    onTap: () async {
                      Navigator.of(context).pop();
                      await _downloadFile(context, file);
                    },
                  ),
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
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
                        final ok = await driveNotifier.renameFile(file.path, newName);
                        if (context.mounted) {
                          if (ok) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Renamed to "$newName"'),
                                behavior: SnackBarBehavior.floating,
                              ),
                            );
                          } else {
                            final err = ref.read(driveProvider).errorMessage ?? 'Rename failed';
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(err),
                                backgroundColor: Colors.red,
                                behavior: SnackBarBehavior.floating,
                              ),
                            );
                          }
                        }
                      }
                    },
                  ),
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                    leading: const Icon(Icons.link_rounded),
                    title: const Text('Public link (24h)'),
                    onTap: () async {
                      Navigator.of(context).pop();
                      try {
                        final data = await ApiService().createPublicLink(fileId: file.id);
                        final path = data['link']?['path'] ?? data['path'];
                        final url = '${ref.read(serverProvider).url}$path';
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(url)));
                        }
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Link failed: $e')));
                        }
                      }
                    },
                  ),
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                    leading: const Icon(Icons.verified_rounded),
                    title: const Text('Verify checksum'),
                    onTap: () async {
                      Navigator.of(context).pop();
                      try {
                        final data = await ApiService().verifyChecksum(file.id);
                        if (context.mounted) {
                          final ok = data['ok'] == true;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(ok ? 'Checksum OK' : 'Bitrot or mismatch: ${data['actual']}')),
                          );
                        }
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Verify failed: $e')));
                        }
                      }
                    },
                  ),
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                    leading: const Icon(Icons.history_rounded),
                    title: const Text('Versions'),
                    onTap: () async {
                      Navigator.of(context).pop();
                      final versions = await ApiService().fileVersions(file.id);
                      if (!context.mounted) return;
                      await showModalBottomSheet<void>(
                        context: context,
                        builder: (ctx) => ListView(
                          padding: const EdgeInsets.all(16),
                          children: [
                            const Text('File versions', style: TextStyle(fontWeight: FontWeight.w800)),
                            if (versions.isEmpty) const ListTile(title: Text('No older copies yet')),
                            ...versions.map((v) => ListTile(
                                  title: Text('v${v['version']} · ${v['name'] ?? file.name}'),
                                  subtitle: Text(v['createdAt']?.toString() ?? ''),
                                  trailing: TextButton(
                                    onPressed: () async {
                                      await ApiService().restoreVersion(
                                        fileId: file.id,
                                        version: (v['version'] as num).toInt(),
                                      );
                                      if (ctx.mounted) Navigator.pop(ctx);
                                      await driveNotifier.loadFiles(ref.read(driveProvider).currentPath);
                                    },
                                    child: const Text('Restore'),
                                  ),
                                )),
                          ],
                        ),
                      );
                    },
                  ),
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                    leading: const Icon(Icons.person_add_alt_1_rounded),
                    title: const Text('Add to person'),
                    onTap: () async {
                      Navigator.of(context).pop();
                      final people = await ApiService().listPeople();
                      if (!context.mounted) return;
                      if (people.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Create a person album in Settings first')),
                        );
                        return;
                      }
                      final id = await showDialog<String>(
                        context: context,
                        builder: (ctx) => SimpleDialog(
                          title: const Text('Assign to'),
                          children: people
                              .map(
                                (p) => SimpleDialogOption(
                                  onPressed: () => Navigator.pop(ctx, p['id']?.toString()),
                                  child: Text(p['name']?.toString() ?? ''),
                                ),
                              )
                              .toList(),
                        ),
                      );
                      if (id == null) return;
                      await ApiService().assignPerson(albumId: id, fileId: file.id);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Assigned')));
                      }
                    },
                  ),
                  if (file.parentPath == 'Trash')
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                      leading: const Icon(Icons.restore_from_trash_rounded),
                      title: const Text('Restore'),
                      onTap: () async {
                        Navigator.of(context).pop();
                        await ApiService().restoreFile(file.id);
                        await driveNotifier.loadFiles(ref.read(driveProvider).currentPath);
                      },
                    ),
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
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
          ),
        ),
      ),
    );
  }

  Future<void> _downloadFile(BuildContext context, BackupFileItem file) async {
    try {
      final dir = await getTemporaryDirectory();
      final dest = '${dir.path}/${file.name}';
      await ApiService().downloadFile(fileId: file.id, destPath: dest);
      if (!StorageService().getBool('hbs_optimize_storage', defaultValue: false)) {
        await DriveCacheService().put(file.id, file.name, dest);
      }
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
    final isDark = theme.brightness == Brightness.dark;

    final driveState = ref.watch(driveProvider);
    final driveNotifier = ref.read(driveProvider.notifier);
    final serverInfo = ref.watch(serverProvider);
    final authState = ref.watch(authProvider);
    final user = authState.user;
    final mediaHeaders = SessionTokenCleaner.authHeaders(authState.token);

    final files = driveState.sortedAndFilteredFiles;
    final breadcrumbParts = driveState.currentPath.isEmpty ? <String>[] : driveState.currentPath.split('/');

    return PopScope(
      canPop: driveState.currentPath.isEmpty,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (driveState.currentPath.isNotEmpty) {
          driveNotifier.navigateUp();
        }
      },
      child: Scaffold(
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
                onPressed: () => _handleAddAction(context, ref),
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
              title: driveState.currentPath.isEmpty
                  ? 'HBS Drive'
                  : (breadcrumbParts.isNotEmpty ? breadcrumbParts.last : 'HBS Drive'),
              onBackTap: driveState.currentPath.isNotEmpty ? () => driveNotifier.navigateUp() : null,
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
                  if (driveState.currentPath.isNotEmpty) ...[
                    InkWell(
                      onTap: () => driveNotifier.navigateUp(),
                      borderRadius: BorderRadius.circular(8),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.arrow_upward_rounded, size: 15, color: primary),
                            const SizedBox(width: 2),
                            Text('Up', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: primary)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(width: 1, height: 16, color: theme.dividerColor.withValues(alpha: 0.2)),
                    const SizedBox(width: 8),
                  ],
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
                                  crossAxisSpacing: 12,
                                  mainAxisSpacing: 12,
                                  childAspectRatio: 0.82,
                                ),
                                itemCount: files.length,
                                itemBuilder: (context, index) {
                                  final file = files[index];
                                  return InkWell(
                                    onTap: () {
                                      if (file.isDir) {
                                        driveNotifier.navigateToFolder(file.path.isNotEmpty ? file.path : file.name);
                                      } else {
                                        final category = Formatters.getMimeTypeCategory(file.mimeType, file.name);
                                        if (category == 'photo' || category == 'video' || category == 'audio') {
                                          DrivePreviewScreen.open(context, file);
                                        } else {
                                          _showFileActions(
                                            context,
                                            ref,
                                            file,
                                            mediaHeaders: mediaHeaders,
                                            serverUrl: serverInfo.url,
                                          );
                                        }
                                      }
                                    },
                                    borderRadius: BorderRadius.circular(16),
                                    child: Container(
                                      padding: const EdgeInsets.all(8),
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(16),
                                        color: isDark ? Colors.white.withValues(alpha: 0.03) : Colors.black.withValues(alpha: 0.02),
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          // Pure Icon or Media Thumbnail
                                          Expanded(
                                            child: DriveThumbnail(
                                              file: file,
                                              serverUrl: serverInfo.url,
                                              headers: mediaHeaders,
                                              width: double.infinity,
                                              height: double.infinity,
                                              borderRadius: 14,
                                            ),
                                          ),
                                          const SizedBox(height: 8),

                                          // Name, details, and menu icon below
                                          Row(
                                            crossAxisAlignment: CrossAxisAlignment.center,
                                            children: [
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  mainAxisSize: MainAxisSize.min,
                                                  children: [
                                                    Text(
                                                      file.name,
                                                      style: theme.textTheme.bodyMedium?.copyWith(
                                                        fontWeight: FontWeight.w700,
                                                        fontSize: 13,
                                                      ),
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
                                              ),
                                              IconButton(
                                                icon: const Icon(Icons.more_vert_rounded, size: 18),
                                                padding: EdgeInsets.zero,
                                                constraints: const BoxConstraints(),
                                                onPressed: () => _showFileActions(
                                                  context,
                                                  ref,
                                                  file,
                                                  mediaHeaders: mediaHeaders,
                                                  serverUrl: serverInfo.url,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
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
                                        driveNotifier.navigateToFolder(file.path.isNotEmpty ? file.path : file.name);
                                      } else {
                                        final category = Formatters.getMimeTypeCategory(file.mimeType, file.name);
                                        if (category == 'photo' || category == 'video' || category == 'audio') {
                                          DrivePreviewScreen.open(context, file);
                                        } else {
                                          _showFileActions(
                                            context,
                                            ref,
                                            file,
                                            mediaHeaders: mediaHeaders,
                                            serverUrl: serverInfo.url,
                                          );
                                        }
                                      }
                                    },
                                    child: Row(
                                      children: [
                                        DriveThumbnail(
                                          file: file,
                                          serverUrl: serverInfo.url,
                                          headers: mediaHeaders,
                                          size: 40,
                                          borderRadius: 12,
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
                                          onPressed: () => _showFileActions(
                                            context,
                                            ref,
                                            file,
                                            mediaHeaders: mediaHeaders,
                                            serverUrl: serverInfo.url,
                                          ),
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
    ),
  );
}
}
