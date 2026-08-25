import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/filter_sort_bar.dart';
import '../../core/widgets/floating_header.dart';
import '../../core/widgets/skeleton_loader.dart';
import '../../models/photo_media_item.dart';
import '../../providers/auth_provider.dart';
import '../../providers/media_provider.dart';
import '../../providers/server_provider.dart';
import '../../providers/theme_provider.dart';
import '../search/search_screen.dart';
import '../settings/lan_scanner_modal.dart';
import 'media_viewer_modal.dart';

class PhotosScreen extends ConsumerWidget {
  const PhotosScreen({super.key});

  Map<String, List<PhotoMediaItem>> _groupByDate(List<PhotoMediaItem> items) {
    final Map<String, List<PhotoMediaItem>> groups = {};
    for (final item in items) {
      final key = Formatters.formatDate(item.createdAt);
      groups.putIfAbsent(key.isEmpty ? 'Unknown' : key, () => []).add(item);
    }
    return groups;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;

    final mediaState = ref.watch(mediaProvider);
    final mediaNotifier = ref.read(mediaProvider.notifier);
    final serverInfo = ref.watch(serverProvider);
    final themeState = ref.watch(themeProvider);
    final user = ref.watch(authProvider).user;

    final items = mediaState.filteredItems;
    final groups = _groupByDate(items);

    return Scaffold(
      body: Column(
        children: [
          // Floating Header
          FloatingHeader(
            title: 'HBS Photos',
            serverUrl: serverInfo.url,
            isConnected: serverInfo.isConnected,
            userName: user?.name ?? 'User',
            currentThemeMode: themeState.mode,
            onServerTap: () {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => const LanScannerModal(),
              );
            },
            onThemeToggle: () => ref.read(themeProvider.notifier).toggleMode(),
            onSearchTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SearchScreen()),
              );
            },
          ),

          // Compact Filter & Sort Bar
          FilterSortBar(
            category: mediaState.category,
            density: mediaState.density,
            totalCount: items.length,
            onCategoryChanged: mediaNotifier.setCategory,
            onDensityChanged: mediaNotifier.setDensity,
          ),

          // Main Gallery Grid
          Expanded(
            child: mediaState.isLoading && items.isEmpty
                ? SkeletonPhotoGrid(columns: mediaState.density)
                : RefreshIndicator(
                    onRefresh: () => mediaNotifier.loadMedia(),
                    color: primary,
                    child: items.isEmpty
                        ? ListView(
                            children: [
                              SizedBox(height: MediaQuery.of(context).size.height * 0.25),
                              Center(
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.photo_library_outlined,
                                      size: 56,
                                      color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.3),
                                    ),
                                    const SizedBox(height: 12),
                                    Text(
                                      'No photos found',
                                      style: theme.textTheme.titleMedium?.copyWith(
                                        color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          )
                        : CustomScrollView(
                            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                            slivers: groups.entries.map((group) {
                              return SliverMainAxisGroup(
                                slivers: [
                                  // Date Section Header
                                  SliverToBoxAdapter(
                                    child: Padding(
                                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                                      child: Text(
                                        group.key,
                                        style: theme.textTheme.titleSmall?.copyWith(
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: -0.2,
                                        ),
                                      ),
                                    ),
                                  ),

                                  // Grid for this Date Group
                                  SliverGrid(
                                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: mediaState.density,
                                      crossAxisSpacing: 1.5,
                                      mainAxisSpacing: 1.5,
                                    ),
                                    delegate: SliverChildBuilderDelegate(
                                      (context, index) {
                                        final item = group.value[index];
                                        return GestureDetector(
                                          onTap: () => MediaViewerModal.show(context, item),
                                          child: Stack(
                                            fit: StackFit.expand,
                                            children: [
                                              // Thumbnail Image
                                              item.url.startsWith('http')
                                                  ? CachedNetworkImage(
                                                      imageUrl: item.thumbUrl ?? item.url,
                                                      fit: BoxFit.cover,
                                                      placeholder: (context, url) => Container(
                                                        color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFE5E7EB),
                                                      ),
                                                      errorWidget: (context, url, error) => Container(
                                                        color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFE5E7EB),
                                                        child: const Icon(Icons.broken_image_rounded, size: 24),
                                                      ),
                                                    )
                                                  : Image.file(
                                                      File(item.url),
                                                      fit: BoxFit.cover,
                                                      cacheWidth: 320,
                                                      errorBuilder: (context, error, stackTrace) => Container(
                                                        color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFE5E7EB),
                                                        child: const Icon(Icons.broken_image_rounded, size: 24),
                                                      ),
                                                    ),

                                              // Cloud Sync Badge
                                              if (item.isBackedUp)
                                                Positioned(
                                                  top: 4,
                                                  right: 4,
                                                  child: Container(
                                                    padding: const EdgeInsets.all(3),
                                                    decoration: BoxDecoration(
                                                      color: Colors.black.withValues(alpha: 0.6),
                                                      shape: BoxShape.circle,
                                                    ),
                                                    child: const Icon(
                                                      Icons.cloud_done_rounded,
                                                      color: Color(0xFF10B981),
                                                      size: 13,
                                                    ),
                                                  ),
                                                ),

                                              // Video Badge & Duration
                                              if (item.isVideo)
                                                Positioned(
                                                  bottom: 4,
                                                  right: 4,
                                                  child: Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                                    decoration: BoxDecoration(
                                                      color: Colors.black.withValues(alpha: 0.65),
                                                      borderRadius: BorderRadius.circular(6),
                                                    ),
                                                    child: const Row(
                                                      mainAxisSize: MainAxisSize.min,
                                                      children: [
                                                        Icon(Icons.play_arrow_rounded, color: Colors.white, size: 12),
                                                        SizedBox(width: 2),
                                                        Text(
                                                          'Video',
                                                          style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700),
                                                        ),
                                                      ],
                                                    ),
                                                  ),
                                                ),
                                            ],
                                          ),
                                        );
                                      },
                                      childCount: group.value.length,
                                    ),
                                  ),
                                ],
                              );
                            }).toList(),
                          ),
                  ),
          ),
        ],
      ),
    );
  }
}
