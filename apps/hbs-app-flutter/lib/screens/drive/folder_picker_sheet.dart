import 'package:flutter/material.dart';
import '../../models/backup_file_item.dart';
import '../../services/api_service.dart';

class FolderPickerSheet extends StatefulWidget {
  final String title;
  final String actionName; // "Move" or "Copy"
  final String initialPath;
  final List<BackupFileItem> selectedItems;

  const FolderPickerSheet({
    super.key,
    required this.title,
    required this.actionName,
    required this.initialPath,
    required this.selectedItems,
  });

  static Future<String?> show(
    BuildContext context, {
    required String title,
    required String actionName,
    required String initialPath,
    required List<BackupFileItem> selectedItems,
  }) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FolderPickerSheet(
        title: title,
        actionName: actionName,
        initialPath: initialPath,
        selectedItems: selectedItems,
      ),
    );
  }

  @override
  State<FolderPickerSheet> createState() => _FolderPickerSheetState();
}

class _FolderPickerSheetState extends State<FolderPickerSheet> {
  late String _currentPath;
  bool _isLoading = false;
  List<BackupFileItem> _subFolders = [];
  String? _errorMessage;

  late final Set<String> _disallowedFolderPaths;

  @override
  void initState() {
    super.initState();
    _currentPath = '';

    // Calculate all disallowed folder paths (selected folders and anything inside them)
    _disallowedFolderPaths = {};
    for (final item in widget.selectedItems) {
      if (item.isDir) {
        _disallowedFolderPaths.add(item.path.toLowerCase());
      }
    }

    _loadFolders(_currentPath);
  }

  bool _isFolderDisallowed(BackupFileItem folder) {
    final pathLower = folder.path.toLowerCase();
    for (final disallowed in _disallowedFolderPaths) {
      if (pathLower == disallowed || pathLower.startsWith('$disallowed/')) {
        return true;
      }
    }
    return false;
  }

  bool get _isCurrentFolderInvalidForMove {
    if (widget.actionName.toLowerCase() != 'move') return false;
    // Disallow moving items to the same folder they are currently in
    return _currentPath == widget.initialPath;
  }

  Future<void> _loadFolders(String path) async {
    setState(() {
      _isLoading = true;
      _currentPath = path;
      _errorMessage = null;
    });

    try {
      final res = await ApiService().getFiles(path: path);
      final allFiles = (res['files'] as List<BackupFileItem>?) ?? [];
      final folders = allFiles.where((f) => f.isDir).toList();
      folders.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

      if (mounted) {
        setState(() {
          _subFolders = folders;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  void _navigateUp() {
    final trimmed = _currentPath.trim().replaceAll(RegExp(r'^/+|/+$'), '');
    if (trimmed.isEmpty) return;
    final parts = trimmed.split('/');
    if (parts.length <= 1) {
      _loadFolders('');
    } else {
      parts.removeLast();
      _loadFolders(parts.join('/'));
    }
  }

  Future<void> _createNewFolder() async {
    final controller = TextEditingController();

    final created = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('New Folder', style: TextStyle(fontWeight: FontWeight.w700)),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(
            hintText: 'Folder name',
            filled: true,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Create'),
          ),
        ],
      ),
    );

    if (created == true && controller.text.trim().isNotEmpty) {
      try {
        await ApiService().createFolder(
          folderName: controller.text.trim(),
          parentPath: _currentPath,
        );
        _loadFolders(_currentPath);
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to create folder: $e')),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;
    final isDark = theme.brightness == Brightness.dark;
    final pathParts = _currentPath.isEmpty ? <String>[] : _currentPath.split('/');

    final isMoveDisabled = _isCurrentFolderInvalidForMove;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.82,
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
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Handle Bar
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

            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.title,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            fontSize: 18,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${widget.selectedItems.length} item${widget.selectedItems.length == 1 ? '' : 's'} selected',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton.filledTonal(
                    icon: const Icon(Icons.create_new_folder_rounded, size: 20),
                    tooltip: 'New Folder',
                    onPressed: _createNewFolder,
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            const Divider(height: 1),

            // Breadcrumb Navigation
            Container(
              color: isDark ? Colors.white.withValues(alpha: 0.02) : Colors.black.withValues(alpha: 0.02),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                child: Row(
                  children: [
                    if (_currentPath.isNotEmpty) ...[
                      InkWell(
                        onTap: _navigateUp,
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.arrow_upward_rounded, size: 14, color: primary),
                              const SizedBox(width: 4),
                              Text('Up', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: primary)),
                            ],
                          ),
                        ),
                      ),
                      Container(width: 1, height: 14, color: theme.dividerColor.withValues(alpha: 0.3), margin: const EdgeInsets.symmetric(horizontal: 6)),
                    ],
                    GestureDetector(
                      onTap: () => _loadFolders(''),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.home_rounded, size: 16, color: primary),
                          const SizedBox(width: 4),
                          Text('My Drive', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: primary)),
                        ],
                      ),
                    ),
                    ...pathParts.asMap().entries.map((entry) {
                      final idx = entry.key;
                      final part = entry.value;
                      final fullPath = pathParts.sublist(0, idx + 1).join('/');

                      return Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.chevron_right_rounded, size: 16, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.4)),
                          GestureDetector(
                            onTap: () => _loadFolders(fullPath),
                            child: Text(
                              part,
                              style: TextStyle(
                                fontWeight: idx == pathParts.length - 1 ? FontWeight.w800 : FontWeight.w500,
                                fontSize: 13,
                                color: idx == pathParts.length - 1 ? theme.textTheme.bodyLarge?.color : primary,
                              ),
                            ),
                          ),
                        ],
                      );
                    }),
                  ],
                ),
              ),
            ),

            const Divider(height: 1),

            // Folder List Body
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _errorMessage != null
                      ? Center(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red)))
                      : _subFolders.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.folder_open_rounded, size: 48, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.3)),
                                  const SizedBox(height: 8),
                                  Text(
                                    'No subfolders here',
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : ListView.separated(
                              physics: const BouncingScrollPhysics(),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              itemCount: _subFolders.length,
                              separatorBuilder: (_, __) => const Divider(height: 1, indent: 56),
                              itemBuilder: (context, index) {
                                final folder = _subFolders[index];
                                final isDisallowed = _isFolderDisallowed(folder);

                                return ListTile(
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                  leading: Container(
                                    width: 40,
                                    height: 40,
                                    decoration: BoxDecoration(
                                      color: isDisallowed
                                          ? Colors.grey.withValues(alpha: 0.15)
                                          : const Color(0xFFF59E0B).withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Icon(
                                      isDisallowed ? Icons.folder_off_rounded : Icons.folder_rounded,
                                      color: isDisallowed ? Colors.grey : const Color(0xFFF59E0B),
                                      size: 22,
                                    ),
                                  ),
                                  title: Text(
                                    folder.name,
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: isDisallowed
                                          ? theme.textTheme.bodyMedium?.color?.withValues(alpha: 0.4)
                                          : theme.textTheme.bodyMedium?.color,
                                    ),
                                  ),
                                  subtitle: isDisallowed
                                      ? const Text(
                                          'Cannot move/copy inside selected folder',
                                          style: TextStyle(fontSize: 11, color: Colors.redAccent),
                                        )
                                      : null,
                                  trailing: isDisallowed
                                      ? const Icon(Icons.block_rounded, size: 18, color: Colors.grey)
                                      : const Icon(Icons.chevron_right_rounded, size: 20),
                                  onTap: isDisallowed ? null : () => _loadFolders(folder.path),
                                );
                              },
                            ),
            ),

            // Bottom Action Bar
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF8F9FA),
                border: Border(top: BorderSide(color: theme.dividerColor.withValues(alpha: 0.15))),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Destination:',
                          style: TextStyle(fontSize: 11, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6)),
                        ),
                        Text(
                          _currentPath.isEmpty ? '📁 My Drive (Root)' : '📁 ${_currentPath.split('/').last}',
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    icon: Icon(
                      widget.actionName.toLowerCase() == 'move'
                          ? Icons.drive_file_move_rounded
                          : Icons.content_copy_rounded,
                      size: 18,
                    ),
                    label: Text(
                      isMoveDisabled
                          ? 'Current Folder'
                          : '${widget.actionName} here',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    onPressed: isMoveDisabled
                        ? null
                        : () => Navigator.of(context).pop(_currentPath),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
