import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:photo_view/photo_view.dart';
import 'package:video_player/video_player.dart';
import '../../core/utils/formatters.dart';
import '../../models/photo_media_item.dart';
import '../../services/api_service.dart';

class MediaViewerModal extends StatefulWidget {
  final PhotoMediaItem item;

  const MediaViewerModal({super.key, required this.item});

  static void show(BuildContext context, PhotoMediaItem item) {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => MediaViewerModal(item: item),
      ),
    );
  }

  @override
  State<MediaViewerModal> createState() => _MediaViewerModalState();
}

class _MediaViewerModalState extends State<MediaViewerModal> {
  VideoPlayerController? _videoController;
  ChewieController? _chewieController;
  bool _isVideoInitialized = false;
  Map<String, String> _headers = const {};

  @override
  void initState() {
    super.initState();
    _prepare();
  }

  Future<void> _prepare() async {
    if (widget.item.url.startsWith('http')) {
      _headers = await ApiService().mediaHeaders();
    }
    if (widget.item.isVideo) {
      await _initVideo();
    } else if (mounted) {
      setState(() {});
    }
  }

  Future<void> _initVideo() async {
    final path = widget.item.url;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      _videoController = VideoPlayerController.networkUrl(
        Uri.parse(path),
        httpHeaders: _headers,
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
        autoPlay: true,
        looping: false,
        aspectRatio: _videoController!.value.aspectRatio,
        allowFullScreen: true,
        materialProgressColors: ChewieProgressColors(
          playedColor: primary,
          handleColor: primary,
        ),
      );
      setState(() => _isVideoInitialized = true);
    } catch (_) {}
  }

  @override
  void dispose() {
    _chewieController?.dispose();
    _videoController?.dispose();
    super.dispose();
  }

  void _showInfoSheet() {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

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
            _infoRow('Name', widget.item.name),
            _infoRow('Size', Formatters.formatBytes(widget.item.size)),
            _infoRow('Date', Formatters.formatDate(widget.item.createdAt)),
            _infoRow('Type', widget.item.isVideo ? 'Video' : 'Photo'),
            _infoRow('Status', widget.item.isBackedUp ? 'Backed up to HBS' : (widget.item.isLocalOnly ? 'Device Only' : 'Cloud Stored')),
            if (widget.item.path.isNotEmpty) _infoRow('Location', widget.item.path),
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Center Media Content
          Center(
            child: widget.item.isVideo
                ? (_isVideoInitialized && _chewieController != null
                    ? Chewie(controller: _chewieController!)
                    : const CircularProgressIndicator(color: Colors.white))
                : (widget.item.url.isEmpty
                    ? const Icon(Icons.broken_image_rounded, color: Colors.white54, size: 48)
                    : (widget.item.url.startsWith('http')
                        ? PhotoView(
                            imageProvider: CachedNetworkImageProvider(widget.item.url, headers: _headers),
                            minScale: PhotoViewComputedScale.contained,
                            maxScale: PhotoViewComputedScale.covered * 3.0,
                          )
                        : PhotoView(
                            imageProvider: FileImage(File(widget.item.url)),
                            minScale: PhotoViewComputedScale.contained,
                            maxScale: PhotoViewComputedScale.covered * 3.0,
                          ))),
          ),

          // Top Action Bar
          Positioned(
            top: 0,
            left: 0,
            right: 0,
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
                            widget.item.name,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            Formatters.formatDate(widget.item.createdAt),
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    if (widget.item.isBackedUp)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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

          // Bottom Action Bar
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
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
                    if (!widget.item.isBackedUp)
                      IconButton(
                        icon: Icon(Icons.cloud_upload_rounded, color: primary),
                        onPressed: () async {
                          final messenger = ScaffoldMessenger.of(context);
                          messenger.showSnackBar(
                            const SnackBar(content: Text('Uploading to HBS Server...')),
                          );
                          await ApiService().uploadFile(
                            filePath: widget.item.path,
                            fileName: widget.item.name,
                            mimeType: widget.item.mimeType,
                            parentPath: 'MobileBackups',
                          );
                          messenger.showSnackBar(
                            const SnackBar(content: Text('Uploaded successfully!')),
                          );
                        },
                        tooltip: 'Upload to Server',
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
        ],
      ),
    );
  }
}
