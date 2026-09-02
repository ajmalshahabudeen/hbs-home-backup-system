import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/filter_sort_bar.dart';
import '../../core/widgets/floating_header.dart';
import '../../core/widgets/media_thumb.dart';
import '../../core/widgets/live_motion_overlay.dart';
import '../../core/widgets/skeleton_loader.dart';
import '../../models/photo_media_item.dart';
import '../../providers/auth_provider.dart';
import '../../providers/media_provider.dart';
import '../../providers/server_provider.dart';
import '../../services/media_discovery_service.dart';
import '../search/search_screen.dart';
import '../settings/lan_scanner_modal.dart';
import 'media_viewer_modal.dart';
import 'memories_screen.dart';
import 'albums_screen.dart';

class PhotosScreen extends ConsumerWidget {
  const PhotosScreen({super.key});

  Map<String, List<PhotoMediaItem>> _groupByDate(List<PhotoMediaItem> items) {
    final sorted = List<PhotoMediaItem>.from(items)..sort((a, b) {
      final aDate = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final bDate = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return bDate.compareTo(aDate);
    });

    final Map<String, List<PhotoMediaItem>> groups = {};
    for (final item in sorted) {
      final key = Formatters.timelineKey(item.createdAt);
      groups.putIfAbsent(key.isEmpty ? 'Unknown' : key, () => []).add(item);
    }
    return groups;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;

    final mediaState = ref.watch(mediaProvider);
    final mediaNotifier = ref.read(mediaProvider.notifier);
    final serverInfo = ref.watch(serverProvider);
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

          // Compact Filter & Sort Bar
          FilterSortBar(
            category: mediaState.category,
            density: mediaState.density,
            totalCount: items.length,
            onCategoryChanged: mediaNotifier.setCategory,
            onDensityChanged: mediaNotifier.setDensity,
          ),
          Align(
            alignment: Alignment.centerRight,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const MemoriesScreen()),
                  ),
                  icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                  label: const Text('On this day'),
                ),
                TextButton.icon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const AlbumsScreen()),
                  ),
                  icon: const Icon(Icons.photo_album_outlined, size: 18),
                  label: const Text('Albums'),
                ),
              ],
            ),
          ),

          // Main Gallery Grid
          Expanded(
            child: !mediaState.hasPermission
                ? ListView(
                    children: [
                      SizedBox(height: MediaQuery.of(context).size.height * 0.18),
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 32),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 72,
                                height: 72,
                                decoration: BoxDecoration(
                                  color: primary.withValues(alpha: 0.12),
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(
                                  Icons.photo_library_outlined,
                                  size: 36,
                                  color: primary,
                                ),
                              ),
                              const SizedBox(height: 16),
                              Text(
                                'Media Access Required',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Grant permission to access your device photos and videos to view your gallery and back them up.',
                                textAlign: TextAlign.center,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.7),
                                  height: 1.4,
                                ),
                              ),
                              const SizedBox(height: 24),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  ElevatedButton.icon(
                                    onPressed: () async {
                                      await MediaDiscoveryService().requestPermissions(force: true);
                                      await mediaNotifier.loadMedia(force: true);
                                    },
                                    icon: const Icon(Icons.check_circle_outline_rounded, size: 18),
                                    label: const Text('Grant Access'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: primary,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  OutlinedButton.icon(
                                    onPressed: () => MediaDiscoveryService().openSettings(),
                                    icon: const Icon(Icons.settings_outlined, size: 18),
                                    label: const Text('Settings'),
                                    style: OutlinedButton.styleFrom(
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  )
                : mediaState.isLoading && items.isEmpty
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
                                        const SizedBox(height: 16),
                                        TextButton.icon(
                                          onPressed: () => mediaNotifier.loadMedia(force: true),
                                          icon: const Icon(Icons.refresh_rounded),
                                          label: const Text('Refresh'),
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
                                          onTap: () async {
                                            var resolved = item;
                                            if (item.assetId != null && item.assetId!.isNotEmpty && !item.url.startsWith('http')) {
                                              resolved = await MediaDiscoveryService().resolveFile(item);
                                            }
                                            if (!context.mounted) return;
                                            MediaViewerModal.show(context, resolved);
                                          },
                                          onLongPress: item.isLive
                                              ? () => LiveMotionOverlay.play(context, item)
                                              : null,
                                          child: Stack(
                                            fit: StackFit.expand,
                                            children: [
                                              MediaThumb(item: item),
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
                                              if (item.isLive)
                                                Positioned(
                                                  bottom: 4,
                                                  left: 4,
                                                  child: Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                                    decoration: BoxDecoration(
                                                      color: Colors.black.withValues(alpha: 0.65),
                                                      borderRadius: BorderRadius.circular(6),
                                                    ),
                                                    child: const Text('LIVE', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)),
                                                  ),
                                                ),
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
