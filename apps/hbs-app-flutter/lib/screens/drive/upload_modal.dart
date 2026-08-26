import 'dart:ui';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/widgets/input_dialog.dart';
import '../../providers/drive_provider.dart';
import '../../services/api_service.dart';

class UploadModal extends ConsumerWidget {
  const UploadModal({super.key});

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => const UploadModal(),
    );
  }

  Future<void> _pickAndUploadFiles(BuildContext context, WidgetRef ref) async {
    final result = await FilePicker.platform.pickFiles(allowMultiple: true);
    if (result == null || result.files.isEmpty) return;

    final driveState = ref.read(driveProvider);
    final driveNotifier = ref.read(driveProvider.notifier);

    if (context.mounted) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Uploading ${result.files.length} file(s)...')),
      );
    }

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
        const SnackBar(content: Text('Upload complete!')),
      );
    }
  }

  Future<void> _handleNewFolder(BuildContext context, WidgetRef ref) async {
    Navigator.of(context).pop();
    final folderName = await InputDialog.show(
      context,
      title: 'New Folder',
      placeholder: 'Folder name',
      confirmText: 'Create',
    );

    if (folderName != null && folderName.isNotEmpty) {
      await ref.read(driveProvider.notifier).createFolder(folderName);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        decoration: BoxDecoration(
          color: (isDark ? theme.cardColor : Colors.white).withValues(alpha: 0.9),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(
            top: BorderSide(
              color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.08),
            ),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
            Text(
              'Add to HBS Drive',
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 16),

            _optionTile(
              context,
              icon: Icons.upload_file_rounded,
              title: 'Upload Files',
              subtitle: 'Select documents, archives or any files',
              color: primary,
              onTap: () => _pickAndUploadFiles(context, ref),
            ),
            const SizedBox(height: 8),

            _optionTile(
              context,
              icon: Icons.add_photo_alternate_rounded,
              title: 'Upload Media',
              subtitle: 'Select photos and videos from gallery',
              color: const Color(0xFF10B981),
              onTap: () => _pickAndUploadFiles(context, ref),
            ),
            const SizedBox(height: 8),

            _optionTile(
              context,
              icon: Icons.create_new_folder_rounded,
              title: 'Create Folder',
              subtitle: 'Organize files into a new subfolder',
              color: const Color(0xFF8B5CF6),
              onTap: () => _handleNewFolder(context, ref),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _optionTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: isDark ? Colors.white.withValues(alpha: 0.04) : Colors.black.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  Text(
                    subtitle,
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
    );
  }
}
