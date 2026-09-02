import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/widgets/filter_sort_bar.dart';
import '../../core/widgets/floating_header.dart';
import '../../core/widgets/media_thumb.dart';
import '../../core/widgets/live_motion_overlay.dart';
import '../../core/widgets/skeleton_loader.dart';
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
  final ValueNotifier<bool> _isFilterVisible = ValueNotifier<bool>(true);

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
    _isFilterVisible.dispose();
    super.dispose();
  }

  void _handleScroll() {
    if (_scrollController.hasClients && _scrollController.offset <= 10) {
      if (!_isFilterVisible.value) {
        _isFilterVisible.value = true;
      }
    }
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

    return Material(
      color: isDark ? const Color(0xDD1E1E1E) : const Color(0xEEFFFFFF),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isDark ? Colors.white.withValues(alpha: 0.12) : Colors.black.withValues(alpha: 0.08),
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.05),
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
    final groups = mediaState.dateGroups;

    final safeAreaTop = MediaQuery.paddingOf(context).top;
    final bottomPadding = MediaQuery.paddingOf(context).bottom + 90;
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
                  // Scrolling down into media -> smoothly hide filter overlay
                  if (_isFilterVisible.value && _scrollController.hasClients && _scrollController.offset > 20) {
                    _isFilterVisible.value = false;
                  }
                } else if (notification.direction == ScrollDirection.forward) {
                  // Scrolling up towards top -> restore filter overlay
                  if (!_isFilterVisible.value) {
                    _isFilterVisible.value = true;
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
                    : RepaintBoundary(
                        child: CustomScrollView(
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
            ),

          // 2. Floating Frosted Glass Overlay (Header + Collapsible Filter Section)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _FloatingFilterOverlay(
              isVisible: _isFilterVisible,
              header: FloatingHeader(
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
              filterBar: FilterSortBar(
                category: mediaState.category,
                density: mediaState.density,
                totalCount: items.length,
                onCategoryChanged: mediaNotifier.setCategory,
                onDensityChanged: mediaNotifier.setDensity,
              ),
              quickActions: Row(
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
            ),
          ),
        ],
      ),
    );
  }
}

class _FloatingFilterOverlay extends StatefulWidget {
  final ValueNotifier<bool> isVisible;
  final Widget header;
  final Widget filterBar;
  final Widget quickActions;

  const _FloatingFilterOverlay({
    required this.isVisible,
    required this.header,
    required this.filterBar,
    required this.quickActions,
  });

  @override
  State<_FloatingFilterOverlay> createState() => _FloatingFilterOverlayState();
}

class _FloatingFilterOverlayState extends State<_FloatingFilterOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<Offset> _slideAnimation;
  late final Animation<double> _fadeAnimation;
  late final Animation<double> _sizeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
      value: widget.isVisible.value ? 1.0 : 0.0,
    );

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0.0, -0.45),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    ));

    _fadeAnimation = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.15, 1.0, curve: Curves.easeOut),
      reverseCurve: const Interval(0.0, 0.75, curve: Curves.easeIn),
    );

    _sizeAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.fastOutSlowIn,
      reverseCurve: Curves.fastOutSlowIn,
    );

    widget.isVisible.addListener(_onVisibilityChanged);
  }

  @override
  void didUpdateWidget(covariant _FloatingFilterOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isVisible != widget.isVisible) {
      oldWidget.isVisible.removeListener(_onVisibilityChanged);
      widget.isVisible.addListener(_onVisibilityChanged);
    }
  }

  void _onVisibilityChanged() {
    if (widget.isVisible.value) {
      _controller.forward();
    } else {
      _controller.reverse();
    }
  }

  @override
  void dispose() {
    widget.isVisible.removeListener(_onVisibilityChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header (always visible & composited in RepaintBoundary)
          widget.header,

          // Smooth hardware-accelerated animated filter section
          SizeTransition(
            sizeFactor: _sizeAnimation,
            alignment: Alignment.topCenter,
            child: SlideTransition(
              position: _slideAnimation,
              child: FadeTransition(
                opacity: _fadeAnimation,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      widget.filterBar,
                      const SizedBox(height: 6),
                      widget.quickActions,
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
