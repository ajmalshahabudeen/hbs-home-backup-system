import 'dart:io';
import 'dart:typed_data';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';
import '../../models/photo_media_item.dart';

class MediaThumb extends StatelessWidget {
  final PhotoMediaItem item;
  final BoxFit fit;
  final Map<String, String>? httpHeaders;

  const MediaThumb({
    super.key,
    required this.item,
    this.fit = BoxFit.cover,
    this.httpHeaders,
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
      return _AssetThumb(assetId: item.assetId!, fit: fit, placeholder: placeholder, broken: broken);
    }

    final url = (item.thumbUrl != null && item.thumbUrl!.isNotEmpty) ? item.thumbUrl! : item.url;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return CachedNetworkImage(
        imageUrl: url,
        fit: fit,
        httpHeaders: httpHeaders,
        placeholder: (context, _) => placeholder,
        errorWidget: (context, _, __) => broken,
      );
    }

    if (url.isNotEmpty) {
      return Image.file(
        File(url),
        fit: fit,
        cacheWidth: 320,
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

  const _AssetThumb({
    required this.assetId,
    required this.fit,
    required this.placeholder,
    required this.broken,
  });

  @override
  State<_AssetThumb> createState() => _AssetThumbState();
}

class _AssetThumbState extends State<_AssetThumb> {
  Uint8List? _bytes;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final entity = await AssetEntity.fromId(widget.assetId);
      final data = await entity?.thumbnailDataWithSize(
        const ThumbnailSize.square(400),
        quality: 80,
      );
      if (!mounted) return;
      setState(() {
        _bytes = data;
        _failed = data == null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) return widget.broken;
    if (_bytes == null) return widget.placeholder;
    return Image.memory(_bytes!, fit: widget.fit, gaplessPlayback: true);
  }
}
