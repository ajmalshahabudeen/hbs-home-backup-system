import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
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

class PhotosScreen extends ConsumerStatefulWidget {
  const PhotosScreen({super.key});

  @override
  ConsumerState<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends ConsumerState<PhotosScreen> {
  late final ScrollController _scrollController;
  bool _isFilterVisible = true;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _scrollController.addListener(_handleScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_handleScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _handleScroll() {
    if (_scrollController.hasClients && _scrollController.offset <= 10) {
      if (!_isFilterVisible) {
        setState(() => _isFilterVisible = true);
      }
    }
  }

  Map<String, List<PhotoMediaItem>> _groupByDate(List<PhotoMediaItem> items) {
    final sorted = List<PhotoMediaItem>.from(items)
      ..sort((a, b) {
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

  Widget _buildQuickActionChip(
    BuildContext context, {
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Material(
          color: (isDark ? theme.cardColor : Colors.white).withValues(alpha: 0.75),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.06),
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.04),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 14, color: primary),
                  const SizedBox(width: 5),
                  Text(
                    label,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      fontSize: 11,
                      color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.85),
                    ),
                  ),
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
    final theme = Theme.of(context);
    final primary = theme.primaryColor;

    final mediaState = ref.watch(mediaProvider);
    final mediaNotifier = ref.read(mediaProvider.notifier);
    final serverInfo = ref.watch(serverProvider);
    final user = ref.watch(authProvider).user;

    final items = mediaState.filteredItems;
    final groups = _groupByDate(items);

    final safeAreaTop = MediaQuery.paddingOf(context).top;
    final bottomPadding = MediaQuery.paddingOf(context).bottom + 90;
    // Top overlay contains FloatingHeader (safeAreaTop + 74) + FilterSortBar (42) + gap (6) + action chips (28) + margin (12)
    final topOverlayHeight = safeAreaTop + 162.0;

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Full-Height Media Timeline / Grid Layer (Scrolls behind frosted header & filter overlay)
          if (!mediaState.hasPermission)
            ListView(
              padding: EdgeInsets.fromLTRB(24, topOverlayHeight + 20, 24, bottomPadding),
              children: [
                Center(
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
              ],
            )
          else if (mediaState.isLoading && items.isEmpty)
            SkeletonPhotoGrid(
              columns: mediaState.density,
              padding: EdgeInsets.fromLTRB(0, topOverlayHeight, 0, bottomPadding),
            )
          else
            NotificationListener<UserScrollNotification>(
              onNotification: (notification) {
                if (notification.direction == ScrollDirection.reverse) {
                  // User scrolling down into photos list (content moving up) -> hide filter bar for maximum height
                  if (_isFilterVisible && _scrollController.hasClients && _scrollController.offset > 20) {
                    setState(() => _isFilterVisible = false);
                  }
                } else if (notification.direction == ScrollDirection.forward) {
                  // User scrolling up towards top (content moving down) -> reveal filter bar
                  if (!_isFilterVisible) {
                    setState(() => _isFilterVisible = true);
                  }
                }
                return false;
              },
              child: RefreshIndicator(
                edgeOffset: topOverlayHeight,
                color: primary,
                onRefresh: () => mediaNotifier.loadMedia(),
                child: items.isEmpty
                    ? ListView(
                        padding: EdgeInsets.fromLTRB(24, topOverlayHeight + 40, 24, bottomPadding),
                        children: [
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
                        controller: _scrollController,
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        slivers: [
                          // Top Spacer: Ensures the first date header sits cleanly below the filter overlay initially
                          SliverToBoxAdapter(
                            child: SizedBox(height: topOverlayHeight),
                          ),

                          // Date Group Sections
                          ...groups.entries.map((group) {
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
                                          if (item.assetId != null &&
                                              item.assetId!.isNotEmpty &&
                                              !item.url.startsWith('http')) {
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
                                                  child: const Text('LIVE',
                                                      style: TextStyle(
                                                          color: Colors.white,
                                                          fontSize: 9,
                                                          fontWeight: FontWeight.w800)),
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
                                                        style: TextStyle(
                                                            color: Colors.white,
                                                            fontSize: 9,
                                                            fontWeight: FontWeight.w700),
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
                          }),

                          // Bottom Spacer to prevent bottom navigation overlap
                          SliverToBoxAdapter(
                            child: SizedBox(height: bottomPadding),
                          ),
                        ],
                      ),
              ),
            ),

          // 2. Floating Frosted Glass Overlay (Header + Collapsible Filter Section)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
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

                // Collapsible Filter & Actions Section
                ClipRect(
                  child: AnimatedAlign(
                    alignment: Alignment.topCenter,
                    duration: const Duration(milliseconds: 260),
                    curve: Curves.easeInOutCubic,
                    heightFactor: _isFilterVisible ? 1.0 : 0.0,
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 200),
                      opacity: _isFilterVisible ? 1.0 : 0.0,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16.0),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            FilterSortBar(
                              category: mediaState.category,
                              density: mediaState.density,
                              totalCount: items.length,
                              onCategoryChanged: mediaNotifier.setCategory,
                              onDensityChanged: mediaNotifier.setDensity,
                            ),
                            const SizedBox(height: 6),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                _buildQuickActionChip(
                                  context,
                                  icon: Icons.auto_awesome_rounded,
                                  label: 'On this day',
                                  onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute(builder: (_) => const MemoriesScreen()),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                _buildQuickActionChip(
                                  context,
                                  icon: Icons.photo_album_outlined,
                                  label: 'Albums',
                                  onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute(builder: (_) => const AlbumsScreen()),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
