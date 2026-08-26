import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/glass_card.dart';
import '../../models/backup_file_item.dart';
import '../../models/photo_media_item.dart';
import '../../providers/media_provider.dart';
import '../../services/api_service.dart';
import '../drive/drive_preview_screen.dart';
import '../photos/media_viewer_modal.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  int _tabIndex = 0;
  bool _searching = false;
  List<BackupFileItem> _serverFiles = [];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _runServerSearch(String query) async {
    if (query.length < 2) {
      setState(() => _serverFiles = []);
      return;
    }
    setState(() => _searching = true);
    try {
      final files = await ApiService().searchFiles(query);
      if (!mounted) return;
      setState(() => _serverFiles = files);
    } catch (_) {
      if (!mounted) return;
      setState(() => _serverFiles = []);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;

    final mediaItems = ref.watch(mediaProvider).items;
    final filteredPhotos = _query.isEmpty
        ? <PhotoMediaItem>[]
        : mediaItems.where((p) => p.name.toLowerCase().contains(_query.toLowerCase())).toList();
    final filteredFiles = _serverFiles;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _searchController,
          autofocus: true,
          onChanged: (val) {
            final q = val.trim();
            setState(() => _query = q);
            _runServerSearch(q);
          },
          decoration: InputDecoration(
            hintText: 'Search photos, videos, files...',
            border: InputBorder.none,
            suffixIcon: _query.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear_rounded, size: 20),
                    onPressed: () {
                      _searchController.clear();
                      setState(() {
                        _query = '';
                        _serverFiles = [];
                      });
                    },
                  )
                : null,
          ),
        ),
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _chip('All', 0),
                const SizedBox(width: 8),
                _chip('Photos (${filteredPhotos.length})', 1),
                const SizedBox(width: 8),
                _chip('Files (${filteredFiles.length})', 2),
              ],
            ),
          ),
          Expanded(
            child: _query.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.search_rounded, size: 56, color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.3)),
                        const SizedBox(height: 12),
                        Text(
                          'Type to search across your HBS cloud',
                          style: TextStyle(color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6)),
                        ),
                      ],
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (_searching) const LinearProgressIndicator(),
                      if ((_tabIndex == 0 || _tabIndex == 1) && filteredPhotos.isNotEmpty) ...[
                        Text('Photos & Media', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        ...filteredPhotos.map((photo) => Padding(
                              padding: const EdgeInsets.only(bottom: 8.0),
                              child: GlassCard(
                                padding: const EdgeInsets.all(12),
                                borderRadius: 14,
                                onTap: () => MediaViewerModal.show(context, photo),
                                child: Row(
                                  children: [
                                    Icon(photo.isVideo ? Icons.videocam_rounded : Icons.photo_rounded, color: primary),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(photo.name, style: const TextStyle(fontWeight: FontWeight.w700), maxLines: 1),
                                          Text(Formatters.formatDate(photo.createdAt), style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            )),
                        const SizedBox(height: 16),
                      ],
                      if ((_tabIndex == 0 || _tabIndex == 2) && filteredFiles.isNotEmpty) ...[
                        Text('Drive Files', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        ...filteredFiles.map((file) => Padding(
                              padding: const EdgeInsets.only(bottom: 8.0),
                              child: GlassCard(
                                padding: const EdgeInsets.all(12),
                                borderRadius: 14,
                                onTap: () {
                                  final cat = Formatters.getMimeTypeCategory(file.mimeType, file.name);
                                  if (cat == 'photo' || cat == 'video' || cat == 'audio') {
                                    DrivePreviewScreen.open(context, file);
                                  }
                                },
                                child: Row(
                                  children: [
                                    Icon(file.isDir ? Icons.folder_rounded : Icons.insert_drive_file_rounded, color: const Color(0xFFF59E0B)),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(file.name, style: const TextStyle(fontWeight: FontWeight.w700), maxLines: 1),
                                          Text(Formatters.formatBytes(file.size), style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            )),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, int index) {
    final isSelected = _tabIndex == index;
    final primary = Theme.of(context).primaryColor;

    return GestureDetector(
      onTap: () => setState(() => _tabIndex = index),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? primary : (Theme.of(context).brightness == Brightness.dark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.05)),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: isSelected ? Colors.white : Theme.of(context).textTheme.bodyMedium?.color,
          ),
        ),
      ),
    );
  }
}
