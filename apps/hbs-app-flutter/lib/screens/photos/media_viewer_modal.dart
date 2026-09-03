import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:chewie/chewie.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
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
  final VoidCallback onTap;

  const _VideoPlayerPage({
    super.key,
    required this.item,
    required this.isActive,
    required this.headers,
    required this.onTap,
  });

  @override
  State<_VideoPlayerPage> createState() => _VideoPlayerPageState();
}

class _VideoPlayerPageState extends State<_VideoPlayerPage> {
  VideoPlayerController? _videoController;
  ChewieController? _chewieController;
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
      final primary = Theme.of(context).primaryColor;
      _chewieController = ChewieController(
        videoPlayerController: _videoController!,
        autoPlay: widget.isActive,
        looping: false,
        aspectRatio: _videoController!.value.aspectRatio == 0 ? 16 / 9 : _videoController!.value.aspectRatio,
        allowFullScreen: true,
        // Lift the video progress bar by 96px to cleanly clear the bottom bar and info icon!
        // Also add top 72px padding to clear the top action bar!
        controlsSafeAreaMinimum: const EdgeInsets.only(bottom: 96, top: 72, left: 16, right: 16),
        materialProgressColors: ChewieProgressColors(
          playedColor: primary,
          handleColor: primary,
        ),
      );
      setState(() => _isInitialized = true);
    } catch (_) {}
  }

  @override
  void dispose() {
    _chewieController?.dispose();
    _videoController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: Center(
        child: _isInitialized && _chewieController != null
            ? Chewie(controller: _chewieController!)
            : const CircularProgressIndicator(color: Colors.white),
      ),
    );
  }
}
