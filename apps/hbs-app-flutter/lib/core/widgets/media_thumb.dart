import 'dart:io';
import 'dart:typed_data';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';
import '../../models/photo_media_item.dart';
import '../../services/media_discovery_service.dart';

class MediaThumb extends StatelessWidget {
  final PhotoMediaItem item;
  final BoxFit fit;
  final Map<String, String>? httpHeaders;
  final int targetSize;

  const MediaThumb({
    super.key,
    required this.item,
    this.fit = BoxFit.cover,
    this.httpHeaders,
    this.targetSize = 240,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final placeholder = Container(
      color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFE5E7EB),
    );
    final broken = Container(
      color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFE5E7EB),
      child: const Icon(Icons.broken_image_rounded, size: 24),
    );

    if (item.assetId != null && item.assetId!.isNotEmpty) {
      return _AssetThumb(
        assetId: item.assetId!,
        fit: fit,
        placeholder: placeholder,
        broken: broken,
        targetSize: targetSize,
      );
    }

    final url = (item.thumbUrl != null && item.thumbUrl!.isNotEmpty) ? item.thumbUrl! : item.url;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return CachedNetworkImage(
        imageUrl: url,
        fit: fit,
        memCacheWidth: targetSize,
        maxWidthDiskCache: targetSize * 2,
        maxHeightDiskCache: targetSize * 2,
        filterQuality: FilterQuality.low,
        httpHeaders: httpHeaders,
        placeholder: (context, _) => placeholder,
        errorWidget: (context, _, __) => broken,
      );
    }

    if (url.isNotEmpty) {
      return Image.file(
        File(url),
        fit: fit,
        cacheWidth: targetSize,
        filterQuality: FilterQuality.low,
        gaplessPlayback: true,
        errorBuilder: (context, error, stackTrace) => broken,
      );
    }

    return broken;
  }
}

class _AssetThumb extends StatefulWidget {
  final String assetId;
  final BoxFit fit;
  final Widget placeholder;
  final Widget broken;
  final int targetSize;

  const _AssetThumb({
    required this.assetId,
    required this.fit,
    required this.placeholder,
    required this.broken,
    required this.targetSize,
  });

  @override
  State<_AssetThumb> createState() => _AssetThumbState();
}

class _AssetThumbState extends State<_AssetThumb> {
  static final Map<String, Uint8List> _thumbBytesCache = {};
  Uint8List? _bytes;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _loadBytes();
  }

  @override
  void didUpdateWidget(covariant _AssetThumb oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.assetId != widget.assetId) {
      _loadBytes();
    }
  }

  void _loadBytes() {
    final cached = _thumbBytesCache[widget.assetId];
    if (cached != null) {
      _bytes = cached;
      _failed = false;
      return;
    }

    _fetchBytes();
  }

  Future<void> _fetchBytes() async {
    try {
      var entity = MediaDiscoveryService.entityCache[widget.assetId];
      entity ??= await AssetEntity.fromId(widget.assetId);
      if (entity != null) {
        MediaDiscoveryService.entityCache[widget.assetId] = entity;
        final data = await entity.thumbnailDataWithSize(
          ThumbnailSize.square(widget.targetSize),
          quality: 75,
        );
        if (data != null) {
          _thumbBytesCache[widget.assetId] = data;
          if (mounted) {
            setState(() {
              _bytes = data;
              _failed = false;
            });
          }
          return;
        }
      }
      if (mounted) setState(() => _failed = true);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) return widget.broken;
    if (_bytes == null) return widget.placeholder;

    return Image.memory(
      _bytes!,
      fit: widget.fit,
      gaplessPlayback: true,
      filterQuality: FilterQuality.low,
      errorBuilder: (context, error, stackTrace) => widget.broken,
    );
  }
}
