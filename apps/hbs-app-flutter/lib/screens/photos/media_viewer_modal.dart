import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';
import 'package:photo_view/photo_view.dart';
import 'package:video_player/video_player.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/live_motion_overlay.dart';
import '../../models/photo_media_item.dart';
import '../../services/api_service.dart';
import '../../services/heic_service.dart';
import '../../services/media_discovery_service.dart';

class MediaViewerModal extends StatefulWidget {
  final List<PhotoMediaItem> items;
  final int initialIndex;

  const MediaViewerModal({
    super.key,
    required this.items,
    this.initialIndex = 0,
  });

  static void show(
    BuildContext context,
    PhotoMediaItem item, {
    List<PhotoMediaItem>? items,
    int? initialIndex,
  }) {
    final list = (items != null && items.isNotEmpty) ? items : [item];
    int index = initialIndex ?? list.indexWhere((e) => e.id == item.id);
    if (index < 0 || index >= list.length) index = 0;

    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => MediaViewerModal(items: list, initialIndex: index),
      ),
    );
  }

  @override
  State<MediaViewerModal> createState() => _MediaViewerModalState();
}

class _MediaViewerModalState extends State<MediaViewerModal> {
  late final PageController _pageController;
  late int _currentIndex;
  bool _showChrome = true;
  bool _isZoomed = false;
  Map<String, String> _headers = const {};

  PhotoMediaItem get _currentItem =>
      widget.items.isNotEmpty ? widget.items[_currentIndex.clamp(0, widget.items.length - 1)] : widget.items.first;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex.clamp(0, widget.items.isEmpty ? 0 : widget.items.length - 1);
    _pageController = PageController(initialPage: _currentIndex);
    _loadHeaders();
  }

  Future<void> _loadHeaders() async {
    final h = await ApiService().mediaHeaders();
    if (mounted) {
      setState(() => _headers = h);
    }
  }

  @override
  void dispose() {
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    _pageController.dispose();
    super.dispose();
  }

  void _toggleChrome() {
    setState(() => _showChrome = !_showChrome);
  }

  void _onScaleChanged(bool zoomed) {
    if (_isZoomed != zoomed) {
      setState(() => _isZoomed = zoomed);
    }
  }

  void _showInfoSheet() {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final item = _currentItem;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF181818) : Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Media Details', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            _infoRow('Name', item.name),
            _infoRow('Size', Formatters.formatBytes(item.size)),
            _infoRow('Date', Formatters.formatDate(item.createdAt)),
            _infoRow('Type', item.isVideo ? 'Video' : 'Photo'),
            _infoRow('Status', item.isBackedUp ? 'Backed up to HBS' : (item.isLocalOnly ? 'Device Only' : 'Cloud Stored')),
            if (item.path.isNotEmpty) _infoRow('Location', item.path),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Colors.grey)),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13)),
          ),
        ],
      ),
    );
  }

  Future<void> _saveToDevice(PhotoMediaItem item) async {
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(
      const SnackBar(content: Text('Downloading to device gallery...'), duration: Duration(seconds: 1)),
    );

    try {
      String localPath = item.path;
      if (item.url.startsWith('http')) {
        final temp = await getTemporaryDirectory();
        final ext = item.name.contains('.') ? item.name.split('.').last : (item.isVideo ? 'mp4' : 'jpg');
        final target = '${temp.path}/dl_${DateTime.now().millisecondsSinceEpoch}.$ext';
        await Dio().download(item.url, target, options: Options(headers: _headers));
        localPath = target;
      }

      if (item.isVideo) {
        await Gal.putVideo(localPath);
      } else {
        await Gal.putImage(localPath);
      }

      messenger.showSnackBar(
        const SnackBar(content: Text('Saved to device gallery!'), behavior: SnackBarBehavior.floating),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text('Failed to save: $e'), behavior: SnackBarBehavior.floating),
      );
    }
  }

  Future<void> _uploadToServer(PhotoMediaItem item) async {
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(
      const SnackBar(content: Text('Uploading to HBS Server...'), duration: Duration(seconds: 1)),
    );

    try {
      await ApiService().uploadFile(
        filePath: item.path,
        fileName: item.name,
        mimeType: item.mimeType,
        parentPath: 'MobileBackups',
      );
      messenger.showSnackBar(
        const SnackBar(content: Text('Uploaded successfully!'), behavior: SnackBarBehavior.floating),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text('Upload failed: $e'), behavior: SnackBarBehavior.floating),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;
    final current = _currentItem;
    final mediaQuery = MediaQuery.of(context);
    final topInset = mediaQuery.padding.top + 60.0;
    final bottomInset = mediaQuery.padding.bottom + 68.0;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Media Swiper PageView
          PageView.builder(
            controller: _pageController,
            itemCount: widget.items.length,
            physics: _isZoomed ? const NeverScrollableScrollPhysics() : const BouncingScrollPhysics(),
            onPageChanged: (index) {
              setState(() {
                _currentIndex = index;
                _isZoomed = false;
              });
            },
            itemBuilder: (context, index) {
              final item = widget.items[index];
              final isActive = index == _currentIndex;

              if (item.isVideo) {
                return _VideoPlayerPage(
                  key: ValueKey('vid_${item.id}_${item.url}'),
                  item: item,
                  isActive: isActive,
                  headers: _headers,
                  showChrome: _showChrome,
                  topInset: topInset,
                  bottomInset: bottomInset,
                  onTap: _toggleChrome,
                );
              } else {
                return _PhotoPage(
                  key: ValueKey('photo_${item.id}_${item.url}'),
                  item: item,
                  headers: _headers,
                  onTap: _toggleChrome,
                  onScaleChanged: _onScaleChanged,
                );
              }
            },
          ),

          // Top Action Bar Overlay
          AnimatedPositioned(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeInOutCubic,
            top: _showChrome ? 0 : -100,
            left: 0,
            right: 0,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 200),
              opacity: _showChrome ? 1.0 : 0.0,
              child: SafeArea(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.black87, Colors.transparent],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              current.name,
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              '${Formatters.formatDate(current.createdAt)} · ${_currentIndex + 1} of ${widget.items.length}',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                      if (current.isBackedUp)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          margin: const EdgeInsets.only(right: 8),
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFF10B981), width: 1),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.cloud_done_rounded, color: Color(0xFF10B981), size: 14),
                              SizedBox(width: 4),
                              Text('Synced', style: TextStyle(color: Color(0xFF10B981), fontSize: 11, fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ),
                      IconButton(
                        icon: const Icon(Icons.info_outline_rounded, color: Colors.white),
                        onPressed: _showInfoSheet,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Bottom Action Bar Overlay
          AnimatedPositioned(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeInOutCubic,
            bottom: _showChrome ? 0 : -100,
            left: 0,
            right: 0,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 200),
              opacity: _showChrome ? 1.0 : 0.0,
              child: SafeArea(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.transparent, Colors.black87],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      if (!current.isBackedUp)
                        IconButton(
                          icon: Icon(Icons.cloud_upload_rounded, color: primary),
                          onPressed: () => _uploadToServer(current),
                          tooltip: 'Upload to Server',
                        ),
                      IconButton(
                        icon: const Icon(Icons.download_rounded, color: Colors.white),
                        onPressed: () => _saveToDevice(current),
                        tooltip: 'Save to Device Gallery',
                      ),
                      IconButton(
                        icon: const Icon(Icons.info_rounded, color: Colors.white),
                        onPressed: _showInfoSheet,
                        tooltip: 'Details',
                      ),
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

class _PhotoPage extends StatefulWidget {
  final PhotoMediaItem item;
  final Map<String, String> headers;
  final VoidCallback onTap;
  final ValueChanged<bool> onScaleChanged;

  const _PhotoPage({
    super.key,
    required this.item,
    required this.headers,
    required this.onTap,
    required this.onScaleChanged,
  });

  @override
  State<_PhotoPage> createState() => _PhotoPageState();
}

class _PhotoPageState extends State<_PhotoPage> {
  File? _heicJpgFile;
  File? _resolvedLocalFile;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _preparePhoto();
  }

  Future<void> _preparePhoto() async {
    final item = widget.item;

    // Check if it's HEIC
    if (HeicService().isHeicFile(item.mimeType, item.name) ||
        HeicService().isHeicFile(item.mimeType, item.url) ||
        HeicService().isHeicFile(item.mimeType, item.path)) {
      setState(() => _isLoading = true);
      final converted = await HeicService().resolveHeicImage(item, headers: widget.headers);
      if (mounted) {
        setState(() {
          _heicJpgFile = converted;
          _isLoading = false;
        });
      }
      return;
    }

    // Check if it has an assetId but no direct file path yet
    if (item.assetId != null && item.assetId!.isNotEmpty && !item.url.startsWith('http') && item.url.isEmpty) {
      final file = await MediaDiscoveryService().fileForAssetId(item.assetId!);
      if (mounted && file != null) {
        setState(() => _resolvedLocalFile = file);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }

    // 1. Converted HEIC/HEIF
    if (_heicJpgFile != null) {
      return GestureDetector(
        onTap: widget.onTap,
        onLongPress: widget.item.isLive ? () => LiveMotionOverlay.play(context, widget.item) : null,
        child: PhotoView(
          imageProvider: FileImage(_heicJpgFile!),
          minScale: PhotoViewComputedScale.contained,
          maxScale: PhotoViewComputedScale.covered * 3.5,
          scaleStateChangedCallback: (state) {
            final isZoomed = state != PhotoViewScaleState.initial && state != PhotoViewScaleState.covering;
            widget.onScaleChanged(isZoomed);
          },
          errorBuilder: (_, __, ___) => Formatters.heicFallback(),
        ),
      );
    }

    // 2. Network Image
    if (widget.item.url.startsWith('http')) {
      return GestureDetector(
        onTap: widget.onTap,
        onLongPress: widget.item.isLive ? () => LiveMotionOverlay.play(context, widget.item) : null,
        child: PhotoView(
          imageProvider: CachedNetworkImageProvider(widget.item.url, headers: widget.headers),
          minScale: PhotoViewComputedScale.contained,
          maxScale: PhotoViewComputedScale.covered * 3.5,
          scaleStateChangedCallback: (state) {
            final isZoomed = state != PhotoViewScaleState.initial && state != PhotoViewScaleState.covering;
            widget.onScaleChanged(isZoomed);
          },
          errorBuilder: (_, __, ___) => Formatters.heicFallback(),
        ),
      );
    }

    // 3. Resolved Local Asset File
    final localPath = _resolvedLocalFile?.path ?? (widget.item.url.isNotEmpty ? widget.item.url : widget.item.path);
    if (localPath.isNotEmpty && File(localPath).existsSync()) {
      return GestureDetector(
        onTap: widget.onTap,
        onLongPress: widget.item.isLive ? () => LiveMotionOverlay.play(context, widget.item) : null,
        child: PhotoView(
          imageProvider: FileImage(File(localPath)),
          minScale: PhotoViewComputedScale.contained,
          maxScale: PhotoViewComputedScale.covered * 3.5,
          scaleStateChangedCallback: (state) {
            final isZoomed = state != PhotoViewScaleState.initial && state != PhotoViewScaleState.covering;
            widget.onScaleChanged(isZoomed);
          },
          errorBuilder: (_, __, ___) => Formatters.heicFallback(),
        ),
      );
    }

    return const Center(
      child: Icon(Icons.broken_image_rounded, color: Colors.white54, size: 48),
    );
  }
}

class _VideoPlayerPage extends StatefulWidget {
  final PhotoMediaItem item;
  final bool isActive;
  final Map<String, String> headers;
  final bool showChrome;
  final double topInset;
  final double bottomInset;
  final VoidCallback onTap;

  const _VideoPlayerPage({
    super.key,
    required this.item,
    required this.isActive,
    required this.headers,
    required this.showChrome,
    required this.topInset,
    required this.bottomInset,
    required this.onTap,
  });

  @override
  State<_VideoPlayerPage> createState() => _VideoPlayerPageState();
}

class _VideoPlayerPageState extends State<_VideoPlayerPage> {
  VideoPlayerController? _videoController;
  bool _isInitialized = false;

  @override
  void initState() {
    super.initState();
    if (widget.isActive) {
      _initVideo();
    }
  }

  @override
  void didUpdateWidget(covariant _VideoPlayerPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive != oldWidget.isActive) {
      if (widget.isActive) {
        if (_videoController == null) {
          _initVideo();
        } else {
          _videoController?.play();
        }
      } else {
        _videoController?.pause();
      }
    }
  }

  Future<void> _initVideo() async {
    String path = widget.item.url;
    if (path.isEmpty && widget.item.path.isNotEmpty) {
      path = widget.item.path;
    }
    if (path.isEmpty && widget.item.assetId != null) {
      final file = await MediaDiscoveryService().fileForAssetId(widget.item.assetId!);
      if (file != null) path = file.path;
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
      _videoController = VideoPlayerController.networkUrl(
        Uri.parse(path),
        httpHeaders: widget.headers,
      );
    } else if (path.isNotEmpty) {
      _videoController = VideoPlayerController.file(File(path));
    } else {
      return;
    }

    try {
      await _videoController!.initialize();
      if (!mounted) return;
      if (widget.isActive) {
        _videoController!.play();
      }
      setState(() => _isInitialized = true);
    } catch (_) {}
  }

  @override
  void dispose() {
    _videoController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;

    if (!_isInitialized || _videoController == null) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }

    final controller = _videoController!;
    final videoAspect = controller.value.aspectRatio > 0 ? controller.value.aspectRatio : 16 / 9;

    const scrubberHeight = 52.0;
    final activeBottomPadding = widget.showChrome
        ? (widget.bottomInset + scrubberHeight + 12.0)
        : MediaQuery.of(context).padding.bottom;
    final activeTopPadding = widget.showChrome
        ? widget.topInset
        : MediaQuery.of(context).padding.top;

    return Stack(
      fit: StackFit.expand,
      children: [
        // 1. Centered & fitted video player (never under top bar or bottom bar!)
        AnimatedPadding(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeInOutCubic,
          padding: EdgeInsets.only(
            top: activeTopPadding,
            bottom: activeBottomPadding,
          ),
          child: Center(
            child: AspectRatio(
              aspectRatio: videoAspect,
              child: VideoPlayer(controller),
            ),
          ),
        ),

        // 2. Full-screen gesture detector for tap & double-tap to seek
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: widget.onTap,
            onDoubleTapDown: (details) {
              final screenWidth = MediaQuery.of(context).size.width;
              final isLeft = details.globalPosition.dx < screenWidth / 2;
              final current = controller.value.position;
              if (isLeft) {
                final target = current - const Duration(seconds: 10);
                controller.seekTo(target < Duration.zero ? Duration.zero : target);
              } else {
                final target = current + const Duration(seconds: 10);
                final maxDur = controller.value.duration;
                controller.seekTo(target > maxDur ? maxDur : target);
              }
            },
          ),
        ),

        // 3. Center Play / Pause / Replay Button
        ValueListenableBuilder<VideoPlayerValue>(
          valueListenable: controller,
          builder: (context, value, _) {
            final isEnded = value.position >= value.duration && value.duration > Duration.zero;
            final showPlayBtn = widget.showChrome || !value.isPlaying || isEnded;

            if (value.isBuffering) {
              return const Center(
                child: SizedBox(
                  width: 56,
                  height: 56,
                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3),
                ),
              );
            }

            return AnimatedOpacity(
              duration: const Duration(milliseconds: 200),
              opacity: showPlayBtn ? 1.0 : 0.0,
              child: Center(
                child: IgnorePointer(
                  ignoring: !showPlayBtn,
                  child: Material(
                    color: Colors.black54,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: () {
                        if (isEnded) {
                          controller.seekTo(Duration.zero);
                          controller.play();
                        } else if (value.isPlaying) {
                          controller.pause();
                        } else {
                          controller.play();
                        }
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(14.0),
                        child: Icon(
                          isEnded
                              ? Icons.replay_rounded
                              : (value.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded),
                          size: 46,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        ),

        // 4. Video Progress Scrubber (Positioned cleanly ABOVE the bottom action bar!)
        AnimatedPositioned(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeInOutCubic,
          left: 12,
          right: 12,
          bottom: widget.showChrome ? (widget.bottomInset + 8.0) : -100,
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: widget.showChrome ? 1.0 : 0.0,
            child: IgnorePointer(
              ignoring: !widget.showChrome,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E1E1E).withValues(alpha: 0.88),
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.5),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: _VideoScrubber(
                  controller: controller,
                  primaryColor: primary,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _VideoScrubber extends StatefulWidget {
  final VideoPlayerController controller;
  final Color primaryColor;

  const _VideoScrubber({
    required this.controller,
    required this.primaryColor,
  });

  @override
  State<_VideoScrubber> createState() => _VideoScrubberState();
}

class _VideoScrubberState extends State<_VideoScrubber> {
  bool _isDragging = false;
  double _dragValue = 0.0;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<VideoPlayerValue>(
      valueListenable: widget.controller,
      builder: (context, value, _) {
        final durationMs = value.duration.inMilliseconds.toDouble();
        if (durationMs <= 0) return const SizedBox.shrink();

        final currentMs = _isDragging
            ? _dragValue
            : value.position.inMilliseconds.clamp(0, durationMs.toInt()).toDouble();

        final curDuration = Duration(milliseconds: currentMs.toInt());
        final totalDuration = value.duration;

        return Row(
          children: [
            Text(
              _formatDuration(curDuration),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  trackHeight: 3.5,
                  thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                  overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
                  activeTrackColor: widget.primaryColor,
                  inactiveTrackColor: Colors.white24,
                  thumbColor: widget.primaryColor,
                ),
                child: Slider(
                  value: currentMs.clamp(0.0, durationMs),
                  min: 0.0,
                  max: durationMs,
                  onChangeStart: (val) {
                    setState(() {
                      _isDragging = true;
                      _dragValue = val;
                    });
                  },
                  onChanged: (val) {
                    setState(() => _dragValue = val);
                  },
                  onChangeEnd: (val) {
                    widget.controller.seekTo(Duration(milliseconds: val.toInt()));
                    setState(() => _isDragging = false);
                  },
                ),
              ),
            ),
            const SizedBox(width: 4),
            Text(
              _formatDuration(totalDuration),
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.7),
                fontSize: 12,
                fontWeight: FontWeight.w500,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(width: 6),
            IconButton(
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              icon: Icon(
                value.volume == 0 ? Icons.volume_off_rounded : Icons.volume_up_rounded,
                color: Colors.white,
                size: 20,
              ),
              onPressed: () {
                if (value.volume == 0) {
                  widget.controller.setVolume(1.0);
                } else {
                  widget.controller.setVolume(0.0);
                }
              },
            ),
            IconButton(
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              icon: const Icon(Icons.fullscreen_rounded, color: Colors.white, size: 22),
              onPressed: () {
                final orientation = MediaQuery.of(context).orientation;
                if (orientation == Orientation.portrait) {
                  SystemChrome.setPreferredOrientations([
                    DeviceOrientation.landscapeLeft,
                    DeviceOrientation.landscapeRight,
                  ]);
                } else {
                  SystemChrome.setPreferredOrientations([
                    DeviceOrientation.portraitUp,
                  ]);
                }
              },
            ),
          ],
        );
      },
    );
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes;
    final seconds = d.inSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
}
