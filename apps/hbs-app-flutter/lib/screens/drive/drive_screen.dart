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
import '../../services/drive_websocket_service.dart';
import '../search/search_screen.dart';
import '../settings/lan_scanner_modal.dart';
import 'drive_filter_sheet.dart';
import 'drive_preview_screen.dart';
import 'drive_thumbnail.dart';
import 'folder_picker_sheet.dart';
import 'upload_modal.dart';

class DriveScreen extends ConsumerStatefulWidget {
  const DriveScreen({super.key});

  @override
  ConsumerState<DriveScreen> createState() => _DriveScreenState();
}

class _DriveScreenState extends ConsumerState<DriveScreen> {
  final ScrollController _scrollController = ScrollController();
  String _previousPath = '';

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final serverUrl = ref.read(serverProvider).url;
      final token = ref.read(authProvider).token;
      DriveWebSocketService().updateConfig(serverUrl: serverUrl, sessionToken: token);
      DriveWebSocketService().connect();
    });
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.hasClients) {
      final maxScroll = _scrollController.position.maxScrollExtent;
      final currentScroll = _scrollController.position.pixels;
      if (currentScroll >= maxScroll - 400) {
        ref.read(driveProvider.notifier).loadMoreFiles();
      }
    }
  }

  Future<void> _handleAddAction(BuildContext context, WidgetRef ref) async {
    final action = await UploadModal.show(context);
    if (action == null || !context.mounted) return;

    final driveNotifier = ref.read(driveProvider.notifier);

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
        final result = await FilePicker.platform.pickFiles(allowMultiple: true);
        if (result == null || result.files.isEmpty || !context.mounted) return;

        int uploaded = 0;
        final currentPath = ref.read(driveProvider).currentPath;
        for (final f in result.files) {
          if (f.path == null) continue;
          try {
            await ApiService().uploadFile(
              filePath: f.path!,
              fileName: f.name,
              parentPath: currentPath,
            );
            uploaded++;
          } catch (_) {}
        }
        await driveNotifier.loadFiles(currentPath);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Uploaded $uploaded file${uploaded == 1 ? '' : 's'}'),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
        break;

      case UploadAction.uploadMedia:
        final result = await FilePicker.platform.pickFiles(
          allowMultiple: true,
          type: FileType.media,
        );
        if (result == null || result.files.isEmpty || !context.mounted) return;

        int uploadedMedia = 0;
        final currentPathMedia = ref.read(driveProvider).currentPath;
        for (final f in result.files) {
          if (f.path == null) continue;
          try {
            await ApiService().uploadFile(
              filePath: f.path!,
              fileName: f.name,
              parentPath: currentPathMedia,
            );
            uploadedMedia++;
          } catch (_) {}
        }
        await driveNotifier.loadFiles(currentPathMedia);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Uploaded $uploadedMedia media file${uploadedMedia == 1 ? '' : 's'}'),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
        break;
    }
  }

  Future<void> _handleBatchMove(BuildContext context, WidgetRef ref) async {
    final driveState = ref.read(driveProvider);
    final driveNotifier = ref.read(driveProvider.notifier);
    final selectedItems = driveState.files.where((f) => driveState.isSelected(f.id)).toList();
    if (selectedItems.isEmpty) return;

    final destPath = await FolderPickerSheet.show(
      context,
      title: 'Move to...',
      actionName: 'Move',
      initialPath: driveState.currentPath,
      selectedItems: selectedItems,
    );

    if (destPath != null && context.mounted) {
      final count = selectedItems.length;
      final success = await driveNotifier.batchMove(
        selectedItems.map((f) => f.id).toList(),
        destPath,
      );
      if (context.mounted) {
        if (success) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Moved $count item${count == 1 ? '' : 's'} successfully'),
              behavior: SnackBarBehavior.floating,
            ),
          );
        } else {
          final err = ref.read(driveProvider).errorMessage ?? 'Move failed';
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
  }

  Future<void> _handleBatchCopy(BuildContext context, WidgetRef ref) async {
    final driveState = ref.read(driveProvider);
    final driveNotifier = ref.read(driveProvider.notifier);
    final selectedItems = driveState.files.where((f) => driveState.isSelected(f.id)).toList();
    if (selectedItems.isEmpty) return;

    final destPath = await FolderPickerSheet.show(
      context,
      title: 'Copy to...',
      actionName: 'Copy',
      initialPath: driveState.currentPath,
      selectedItems: selectedItems,
    );

    if (destPath != null && context.mounted) {
      final count = selectedItems.length;
      final success = await driveNotifier.batchCopy(
        selectedItems.map((f) => f.id).toList(),
        destPath,
      );
      if (context.mounted) {
        if (success) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Copied $count item${count == 1 ? '' : 's'} successfully'),
              behavior: SnackBarBehavior.floating,
            ),
          );
        } else {
          final err = ref.read(driveProvider).errorMessage ?? 'Copy failed';
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
  }

  Future<void> _handleBatchDelete(BuildContext context, WidgetRef ref) async {
    final driveState = ref.read(driveProvider);
    final driveNotifier = ref.read(driveProvider.notifier);
    final selectedItems = driveState.files.where((f) => driveState.isSelected(f.id)).toList();
    if (selectedItems.isEmpty) return;

    final count = selectedItems.length;
    final isPermanent = driveState.currentPath == 'Trash';

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(isPermanent ? 'Permanently delete $count item${count == 1 ? '' : 's'}?' : 'Delete $count item${count == 1 ? '' : 's'}?'),
        content: Text(isPermanent
            ? 'This action cannot be undone. Files will be deleted forever.'
            : 'Selected items will be moved to the Trash.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm == true && context.mounted) {
      final success = await driveNotifier.batchDelete(
        selectedItems.map((f) => f.id).toList(),
        permanent: isPermanent,
      );
      if (context.mounted) {
        if (success) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Deleted $count item${count == 1 ? '' : 's'}'),
              behavior: SnackBarBehavior.floating,
            ),
          );
        } else {
          final err = ref.read(driveProvider).errorMessage ?? 'Delete failed';
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
  }

  void _showFileActions(
    BuildContext context,
    WidgetRef ref,
    BackupFileItem file, {
    Map<String, String>? mediaHeaders,
    String? serverUrl,
  }) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;
    final isDark = theme.brightness == Brightness.dark;
    final isTrash = file.parentPath == 'Trash' || file.path.startsWith('Trash/');
    final category = Formatters.getMimeTypeCategory(file.mimeType, file.name);
    final isMedia = category == 'photo' || category == 'video' || category == 'audio';
    final sUrl = serverUrl ?? ref.read(serverProvider).url;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (bottomSheetContext) => Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(bottomSheetContext).size.height * 0.85,
        ),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF161616) : Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.3),
              blurRadius: 24,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              physics: const BouncingScrollPhysics(),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Center(
                    child: Container(
                      margin: const EdgeInsets.only(top: 12, bottom: 8),
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: isDark ? Colors.white24 : Colors.black12,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),

                  // Header with Thumbnail Preview
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 12.0),
                    child: Row(
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
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                file.isDir ? 'Folder' : Formatters.formatBytes(file.size),
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, size: 20),
                          onPressed: () => Navigator.of(bottomSheetContext).pop(),
                        ),
                      ],
                    ),
                  ),

                  const Divider(height: 1),

                  if (isTrash) ...[
                    ListTile(
                      leading: const Icon(Icons.restore_from_trash_rounded, color: Colors.green),
                      title: const Text('Restore File'),
                      onTap: () async {
                        Navigator.of(bottomSheetContext).pop();
                        try {
                          await ApiService().restoreFile(file.id);
                          ref.read(driveProvider.notifier).loadFiles('Trash');
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('File restored')),
                            );
                          }
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Restore failed: $e')),
                            );
                          }
                        }
                      },
                    ),
                    ListTile(
                      leading: const Icon(Icons.delete_forever_rounded, color: Colors.red),
                      title: const Text('Delete Permanently'),
                      onTap: () async {
                        Navigator.of(bottomSheetContext).pop();
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                            title: const Text('Delete Permanently?'),
                            content: const Text('This file will be deleted forever.'),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.of(ctx).pop(false),
                                child: const Text('Cancel'),
                              ),
                              FilledButton(
                                style: FilledButton.styleFrom(backgroundColor: Colors.red),
                                onPressed: () => Navigator.of(ctx).pop(true),
                                child: const Text('Delete'),
                              ),
                            ],
                          ),
                        );
                        if (confirm == true) {
                          await ref.read(driveProvider.notifier).deleteFile(file.id, permanent: true);
                        }
                      },
                    ),
                  ] else ...[
                    if (!file.isDir && isMedia)
                      ListTile(
                        leading: Icon(
                          category == 'video'
                              ? Icons.play_arrow_rounded
                              : (category == 'audio' ? Icons.headphones_rounded : Icons.visibility_rounded),
                          color: category == 'video' ? const Color(0xFF10B981) : primary,
                          size: 26,
                        ),
                        title: Text(
                          category == 'video' ? 'Play Video' : (category == 'audio' ? 'Play Audio' : 'View Photo'),
                          style: TextStyle(fontWeight: FontWeight.w700, color: category == 'video' ? const Color(0xFF10B981) : primary),
                        ),
                        subtitle: const Text('Open full screen preview', style: TextStyle(fontSize: 11)),
                        onTap: () {
                          Navigator.of(bottomSheetContext).pop();
                          DrivePreviewScreen.open(context, file);
                        },
                      ),

                    // Multi-select option
                    ListTile(
                      leading: const Icon(Icons.checklist_rounded),
                      title: const Text('Select Item'),
                      onTap: () {
                        Navigator.of(bottomSheetContext).pop();
                        ref.read(driveProvider.notifier).selectItem(file.id);
                      },
                    ),

                    // Move file
                    ListTile(
                      leading: const Icon(Icons.drive_file_move_rounded),
                      title: const Text('Move to...'),
                      onTap: () async {
                        Navigator.of(bottomSheetContext).pop();
                        ref.read(driveProvider.notifier).selectItem(file.id);
                        _handleBatchMove(context, ref);
                      },
                    ),

                    // Copy file
                    ListTile(
                      leading: const Icon(Icons.content_copy_rounded),
                      title: const Text('Copy to...'),
                      onTap: () async {
                        Navigator.of(bottomSheetContext).pop();
                        ref.read(driveProvider.notifier).selectItem(file.id);
                        _handleBatchCopy(context, ref);
                      },
                    ),

                    if (!file.isDir) ...[
                      ListTile(
                        leading: const Icon(Icons.share_rounded),
                        title: const Text('Share File'),
                        onTap: () async {
                          Navigator.of(bottomSheetContext).pop();
                          try {
                            final cached = await DriveCacheService().cached(file.id, file.name);
                            if (cached != null) {
                              await SharePlus.instance.share(ShareParams(files: [XFile(cached.path)]));
                            } else {
                              final dir = await getTemporaryDirectory();
                              final localPath = '${dir.path}/${file.name}';
                              await ApiService().downloadFile(
                                fileId: file.id,
                                destPath: localPath,
                              );
                              await SharePlus.instance.share(ShareParams(files: [XFile(localPath)]));
                            }
                          } catch (e) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Share failed: $e')),
                              );
                            }
                          }
                        },
                      ),
                      ListTile(
                        leading: const Icon(Icons.download_rounded),
                        title: const Text('Download to Device'),
                        onTap: () async {
                          Navigator.of(bottomSheetContext).pop();
                          try {
                            final dir = await getDownloadsDirectory() ?? await getApplicationDocumentsDirectory();
                            final targetPath = '${dir.path}/${file.name}';
                            await ApiService().downloadFile(
                              fileId: file.id,
                              destPath: targetPath,
                            );
                            if (category == 'photo' || category == 'video') {
                              try {
                                if (category == 'photo') {
                                  await Gal.putImage(targetPath);
                                } else {
                                  await Gal.putVideo(targetPath);
                                }
                              } catch (_) {}
                            }
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Downloaded: ${file.name}')),
                              );
                            }
                          } catch (e) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Download failed: $e')),
                              );
                            }
                          }
                        },
                      ),
                    ],

                    ListTile(
                      leading: const Icon(Icons.edit_rounded),
                      title: const Text('Rename'),
                      onTap: () async {
                        Navigator.of(bottomSheetContext).pop();
                        final newName = await InputDialog.show(
                          context,
                          title: 'Rename',
                          initialValue: file.name,
                          confirmText: 'Save',
                        );
                        if (newName != null && newName.trim().isNotEmpty && newName.trim() != file.name) {
                          await ref.read(driveProvider.notifier).renameFile(file.path, newName.trim());
                        }
                      },
                    ),

                    ListTile(
                      leading: const Icon(Icons.delete_rounded, color: Colors.redAccent),
                      title: const Text('Move to Trash', style: TextStyle(color: Colors.redAccent)),
                      onTap: () async {
                        Navigator.of(bottomSheetContext).pop();
                        await ref.read(driveProvider.notifier).deleteFile(file.id);
                      },
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ref = this.ref;
    final theme = Theme.of(context);
    final primary = theme.primaryColor;
    final isDark = theme.brightness == Brightness.dark;

    final driveState = ref.watch(driveProvider);
    final driveNotifier = ref.read(driveProvider.notifier);
    final serverInfo = ref.watch(serverProvider);
    final authState = ref.watch(authProvider);
    final user = authState.user;
    final mediaHeaders = SessionTokenCleaner.authHeaders(authState.token);

    if (driveState.currentPath != _previousPath) {
      _previousPath = driveState.currentPath;
      if (_scrollController.hasClients) {
        _scrollController.jumpTo(0);
      }
    }

    final files = driveState.sortedAndFilteredFiles;
    final groupedFiles = driveState.groupedFiles;
    final breadcrumbParts = driveState.currentPath.isEmpty ? <String>[] : driveState.currentPath.split('/');

    return PopScope(
      canPop: driveState.currentPath.isEmpty && !driveState.isSelectionMode,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (driveState.isSelectionMode) {
          driveNotifier.clearSelection();
        } else if (driveState.currentPath.isNotEmpty) {
          driveNotifier.navigateUp();
        }
      },
      child: Scaffold(
        floatingActionButton: driveState.isSelectionMode
            ? null
            : Column(
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
            // Top Bar: Selection Mode Header vs Standard FloatingHeader
            if (driveState.isSelectionMode)
              Container(
                padding: EdgeInsets.fromLTRB(16, MediaQuery.paddingOf(context).top + 8, 16, 12),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.1),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => driveNotifier.clearSelection(),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${driveState.selectedCount} selected',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: Icon(
                        driveState.selectedCount == files.length
                            ? Icons.deselect_rounded
                            : Icons.select_all_rounded,
                      ),
                      tooltip: driveState.selectedCount == files.length
                          ? 'Deselect all'
                          : 'Select all',
                      onPressed: () {
                        if (driveState.selectedCount == files.length) {
                          driveNotifier.clearSelection();
                        } else {
                          driveNotifier.selectAll();
                        }
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.drive_file_move_rounded),
                      tooltip: 'Move',
                      onPressed: () => _handleBatchMove(context, ref),
                    ),
                    IconButton(
                      icon: const Icon(Icons.content_copy_rounded),
                      tooltip: 'Copy',
                      onPressed: () => _handleBatchCopy(context, ref),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline_rounded, color: Colors.redAccent),
                      tooltip: 'Delete',
                      onPressed: () => _handleBatchDelete(context, ref),
                    ),
                  ],
                ),
              )
            else
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

            // Subheader: Breadcrumb Navigation & Filter/Sort Controls
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

                  // Live Realtime Indicator
                  if (driveState.isRealtimeConnected)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.green.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                color: Colors.green,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 4),
                            const Text(
                              'Live',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: Colors.green,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                  // Filter & Group Button
                  Stack(
                    alignment: Alignment.topRight,
                    children: [
                      IconButton(
                        icon: Icon(
                          Icons.tune_rounded,
                          size: 18,
                          color: driveState.hasActiveFilters ? primary : null,
                        ),
                        onPressed: () {
                          DriveFilterSheet.show(
                            context,
                            currentType: driveState.filterType,
                            currentDate: driveState.filterDate,
                            currentSize: driveState.filterSize,
                            currentGroup: driveState.groupBy,
                            onApply: ({required type, required date, required size, required group}) {
                              driveNotifier.setFilterType(type);
                              driveNotifier.setFilterDate(date);
                              driveNotifier.setFilterSize(size);
                              driveNotifier.setGroupBy(group);
                            },
                          );
                        },
                        tooltip: 'Filter & Group',
                        visualDensity: VisualDensity.compact,
                      ),
                      if (driveState.hasActiveFilters)
                        Positioned(
                          top: 8,
                          right: 8,
                          child: Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: primary,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                    ],
                  ),

                  // View Mode Toggle
                  IconButton(
                    icon: Icon(driveState.isGridView ? Icons.view_list_rounded : Icons.grid_view_rounded, size: 18),
                    onPressed: driveNotifier.toggleViewMode,
                    tooltip: 'Toggle View',
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ),

            // Active Filters Chip Row (if any)
            if (driveState.hasActiveFilters)
              Container(
                height: 32,
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  physics: const BouncingScrollPhysics(),
                  children: [
                    if (driveState.filterType != DriveTypeFilter.all)
                      _buildActiveFilterChip(
                        'Type: ${driveState.filterType.name}',
                        () => driveNotifier.setFilterType(DriveTypeFilter.all),
                        primary,
                        theme,
                      ),
                    if (driveState.filterDate != DriveDateFilter.all)
                      _buildActiveFilterChip(
                        'Date: ${driveState.filterDate.name}',
                        () => driveNotifier.setFilterDate(DriveDateFilter.all),
                        primary,
                        theme,
                      ),
                    if (driveState.filterSize != DriveSizeFilter.all)
                      _buildActiveFilterChip(
                        'Size: ${driveState.filterSize.name}',
                        () => driveNotifier.setFilterSize(DriveSizeFilter.all),
                        primary,
                        theme,
                      ),
                    if (driveState.groupBy != DriveGroupBy.none)
                      _buildActiveFilterChip(
                        'Grouped by ${driveState.groupBy.name}',
                        () => driveNotifier.setGroupBy(DriveGroupBy.none),
                        primary,
                        theme,
                      ),
                    TextButton(
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        visualDensity: VisualDensity.compact,
                      ),
                      onPressed: () => driveNotifier.resetFilters(),
                      child: const Text('Clear all', style: TextStyle(fontSize: 11)),
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
                                      Text('No files found', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                                      if (driveState.hasActiveFilters) ...[
                                        const SizedBox(height: 6),
                                        TextButton(
                                          onPressed: () => driveNotifier.resetFilters(),
                                          child: const Text('Reset filters'),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ],
                            )
                          : _buildFileContent(
                              context: context,
                              ref: ref,
                              driveState: driveState,
                              driveNotifier: driveNotifier,
                              groupedFiles: groupedFiles,
                              files: files,
                              mediaHeaders: mediaHeaders,
                              serverUrl: serverInfo.url,
                              primary: primary,
                              isDark: isDark,
                              theme: theme,
                            ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveFilterChip(String label, VoidCallback onClear, Color primary, ThemeData theme) {
    return Container(
      margin: const EdgeInsets.only(right: 6),
      child: Chip(
        label: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: primary)),
        deleteIcon: Icon(Icons.close_rounded, size: 14, color: primary),
        onDeleted: onClear,
        backgroundColor: primary.withValues(alpha: 0.12),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  Widget _buildFileContent({
    required BuildContext context,
    required WidgetRef ref,
    required DriveState driveState,
    required DriveNotifier driveNotifier,
    required Map<String, List<BackupFileItem>> groupedFiles,
    required List<BackupFileItem> files,
    required Map<String, String>? mediaHeaders,
    required String serverUrl,
    required Color primary,
    required bool isDark,
    required ThemeData theme,
  }) {
    if (driveState.isGridView) {
      if (driveState.groupBy == DriveGroupBy.none) {
        return GridView.builder(
          controller: _scrollController,
          padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.paddingOf(context).bottom + 160),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 0.82,
          ),
          itemCount: files.length + (driveState.isLoadingMore ? 1 : 0),
          itemBuilder: (context, index) {
            if (index >= files.length) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: CircularProgressIndicator.adaptive(
                    valueColor: AlwaysStoppedAnimation<Color>(primary),
                  ),
                ),
              );
            }
            final file = files[index];
            return _buildGridItem(
              context: context,
              ref: ref,
              file: file,
              driveState: driveState,
              driveNotifier: driveNotifier,
              mediaHeaders: mediaHeaders,
              serverUrl: serverUrl,
              primary: primary,
              isDark: isDark,
              theme: theme,
            );
          },
        );
      }

      // Grouped Grid View
      return ListView(
        controller: _scrollController,
        padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.paddingOf(context).bottom + 160),
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        children: [
          ...groupedFiles.entries.map((entry) {
            final groupTitle = entry.key;
            final groupItems = entry.value;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 12, bottom: 8, left: 4),
                  child: Row(
                    children: [
                      Text(
                        groupTitle,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: primary,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '(${groupItems.length})',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.5),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.82,
                  ),
                  itemCount: groupItems.length,
                  itemBuilder: (context, index) {
                    final file = groupItems[index];
                    return _buildGridItem(
                      context: context,
                      ref: ref,
                      file: file,
                      driveState: driveState,
                      driveNotifier: driveNotifier,
                      mediaHeaders: mediaHeaders,
                      serverUrl: serverUrl,
                      primary: primary,
                      isDark: isDark,
                      theme: theme,
                    );
                  },
                ),
              ],
            );
          }),
          if (driveState.isLoadingMore)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Center(
                child: CircularProgressIndicator.adaptive(
                  valueColor: AlwaysStoppedAnimation<Color>(primary),
                ),
              ),
            ),
        ],
      );
    }

    // List View
    if (driveState.groupBy == DriveGroupBy.none) {
      return ListView.separated(
        controller: _scrollController,
        padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.paddingOf(context).bottom + 160),
        itemCount: files.length + (driveState.isLoadingMore ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          if (index >= files.length) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Center(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: primary),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      'Loading more files...',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                      ),
                    ),
                  ],
                ),
              ),
            );
          }
          final file = files[index];
          return _buildListItem(
            context: context,
            ref: ref,
            file: file,
            driveState: driveState,
            driveNotifier: driveNotifier,
            mediaHeaders: mediaHeaders,
            serverUrl: serverUrl,
            primary: primary,
            isDark: isDark,
            theme: theme,
          );
        },
      );
    }

    // Grouped List View
    return ListView(
      controller: _scrollController,
      padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.paddingOf(context).bottom + 160),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        ...groupedFiles.entries.map((entry) {
          final groupTitle = entry.key;
          final groupItems = entry.value;

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 12, bottom: 8, left: 4),
                child: Row(
                  children: [
                    Text(
                      groupTitle,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: primary,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '(${groupItems.length})',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.5),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: groupItems.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final file = groupItems[index];
                  return _buildListItem(
                    context: context,
                    ref: ref,
                    file: file,
                    driveState: driveState,
                    driveNotifier: driveNotifier,
                    mediaHeaders: mediaHeaders,
                    serverUrl: serverUrl,
                    primary: primary,
                    isDark: isDark,
                    theme: theme,
                  );
                },
              ),
            ],
          );
        }),
        if (driveState.isLoadingMore)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Center(
              child: CircularProgressIndicator.adaptive(
                valueColor: AlwaysStoppedAnimation<Color>(primary),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildGridItem({
    required BuildContext context,
    required WidgetRef ref,
    required BackupFileItem file,
    required DriveState driveState,
    required DriveNotifier driveNotifier,
    required Map<String, String>? mediaHeaders,
    required String serverUrl,
    required Color primary,
    required bool isDark,
    required ThemeData theme,
  }) {
    final isSelected = driveState.isSelected(file.id);

    return InkWell(
      onLongPress: () => driveNotifier.toggleSelection(file.id),
      onTap: () {
        if (driveState.isSelectionMode) {
          driveNotifier.toggleSelection(file.id);
        } else if (file.isDir) {
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
              serverUrl: serverUrl,
            );
          }
        }
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: isSelected
              ? primary.withValues(alpha: 0.12)
              : (isDark ? Colors.white.withValues(alpha: 0.03) : Colors.black.withValues(alpha: 0.02)),
          border: Border.all(
            color: isSelected ? primary : (isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.06)),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Preview & Selection Checkbox
            Expanded(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: DriveThumbnail(
                      file: file,
                      serverUrl: serverUrl,
                      headers: mediaHeaders,
                      width: double.infinity,
                      height: double.infinity,
                      borderRadius: 12,
                    ),
                  ),
                  if (driveState.isSelectionMode)
                    Positioned(
                      top: 6,
                      right: 6,
                      child: Container(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isSelected ? primary : Colors.black54,
                        ),
                        padding: const EdgeInsets.all(2),
                        child: Icon(
                          isSelected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                          size: 20,
                          color: Colors.white,
                        ),
                      ),
                    ),
                ],
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
                if (!driveState.isSelectionMode)
                  IconButton(
                    icon: const Icon(Icons.more_vert_rounded, size: 18),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () => _showFileActions(
                      context,
                      ref,
                      file,
                      mediaHeaders: mediaHeaders,
                      serverUrl: serverUrl,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildListItem({
    required BuildContext context,
    required WidgetRef ref,
    required BackupFileItem file,
    required DriveState driveState,
    required DriveNotifier driveNotifier,
    required Map<String, String>? mediaHeaders,
    required String serverUrl,
    required Color primary,
    required bool isDark,
    required ThemeData theme,
  }) {
    final isSelected = driveState.isSelected(file.id);

    return GlassCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      borderRadius: 16,
      border: isSelected ? Border.all(color: primary, width: 1.5) : null,
      onLongPress: () => driveNotifier.toggleSelection(file.id),
      onTap: () {
        if (driveState.isSelectionMode) {
          driveNotifier.toggleSelection(file.id);
        } else if (file.isDir) {
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
              serverUrl: serverUrl,
            );
          }
        }
      },
      child: Row(
        children: [
          if (driveState.isSelectionMode) ...[
            Icon(
              isSelected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
              color: isSelected ? primary : theme.textTheme.bodySmall?.color?.withValues(alpha: 0.4),
              size: 22,
            ),
            const SizedBox(width: 10),
          ],
          DriveThumbnail(
            file: file,
            serverUrl: serverUrl,
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

          if (!driveState.isSelectionMode)
            IconButton(
              icon: const Icon(Icons.more_vert_rounded, size: 18),
              onPressed: () => _showFileActions(
                context,
                ref,
                file,
                mediaHeaders: mediaHeaders,
                serverUrl: serverUrl,
              ),
            ),
        ],
      ),
    );
  }
}
