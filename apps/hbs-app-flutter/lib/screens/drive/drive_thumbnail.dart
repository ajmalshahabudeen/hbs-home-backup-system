import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../core/utils/formatters.dart';
import '../../models/backup_file_item.dart';

class DriveThumbnail extends StatelessWidget {
  final BackupFileItem file;
  final String serverUrl;
  final Map<String, String>? headers;
  final double? size;
  final double? width;
  final double? height;
  final double borderRadius;
  final BoxFit fit;

  const DriveThumbnail({
    super.key,
    required this.file,
    required this.serverUrl,
    this.headers,
    this.size,
    this.width,
    this.height,
    this.borderRadius = 14,
    this.fit = BoxFit.cover,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;
    final isDark = theme.brightness == Brightness.dark;

    final w = width ?? size;
    final h = height ?? size;
    final finiteDim = (w != null && w.isFinite && h != null && h.isFinite)
        ? (w < h ? w : h)
        : ((w != null && w.isFinite) ? w : ((h != null && h.isFinite) ? h : 48.0));
    final iconSize = (finiteDim * 0.45).clamp(22.0, 56.0);
    final memWidth = (w != null && w.isFinite) ? (w * 2.5).toInt().clamp(100, 720) : 360;

    if (file.isDir) {
      return Container(
        width: w,
        height: h,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: const Color(0xFFF59E0B).withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(borderRadius),
        ),
        child: Icon(
          Icons.folder_rounded,
          color: const Color(0xFFF59E0B),
          size: iconSize,
        ),
      );
    }

    final category = Formatters.getMimeTypeCategory(file.mimeType, file.name);

    if (category == 'photo' || category == 'video') {
      final encodedPath = file.path.split('/').map(Uri.encodeComponent).join('/');
      final thumbUrl = '$serverUrl/api/user/media/$encodedPath?thumb=1';

      return SizedBox(
        width: w,
        height: h,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(borderRadius),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Positioned.fill(
                child: Container(
                  color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.05),
                  child: CachedNetworkImage(
                    imageUrl: thumbUrl,
                    fit: fit,
                    memCacheWidth: memWidth,
                    maxHeightDiskCache: 720,
                    maxWidthDiskCache: 720,
                    filterQuality: FilterQuality.low,
                    httpHeaders: headers,
                    placeholder: (_, __) => Container(
                      color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.04),
                      child: Center(
                        child: Icon(
                          category == 'video' ? Icons.videocam_rounded : Icons.photo_rounded,
                          color: category == 'video' ? const Color(0xFF10B981) : primary,
                          size: iconSize,
                        ),
                      ),
                    ),
                    errorWidget: (_, __, ___) => Container(
                      color: (category == 'video' ? const Color(0xFF10B981) : primary).withValues(alpha: 0.12),
                      child: Center(
                        child: Icon(
                          category == 'video' ? Icons.videocam_rounded : Icons.photo_rounded,
                          color: category == 'video' ? const Color(0xFF10B981) : primary,
                          size: iconSize,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              if (category == 'video')
                Positioned(
                  bottom: 6,
                  right: 6,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2.5),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.play_arrow_rounded, color: Colors.white, size: 12),
                        SizedBox(width: 2),
                        Text('VIDEO', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    }

    // Audio, Document, Archive, or Other
    Color iconColor = primary;
    IconData iconData = Icons.insert_drive_file_rounded;

    if (category == 'audio') {
      iconColor = const Color(0xFF8B5CF6);
      iconData = Icons.audiotrack_rounded;
    } else if (category == 'document') {
      iconColor = const Color(0xFFEF4444);
      iconData = Icons.description_rounded;
    } else if (category == 'archive') {
      iconColor = const Color(0xFFEC4899);
      iconData = Icons.folder_zip_rounded;
    }

    return Container(
      width: w,
      height: h,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: iconColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(borderRadius),
      ),
      child: Icon(
        iconData,
        color: iconColor,
        size: iconSize,
      ),
    );
  }
}
