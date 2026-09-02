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
    return LayoutBuilder(
      builder: (context, constraints) {
        final theme = Theme.of(context);
        final primary = theme.primaryColor;
        final isDark = theme.brightness == Brightness.dark;

        // Resolve finite width and height
        double? targetW = width ?? size;
        double? targetH = height ?? size;

        if (targetW == null || !targetW.isFinite) {
          targetW = constraints.maxWidth.isFinite && constraints.maxWidth > 0 ? constraints.maxWidth : null;
        }
        if (targetH == null || !targetH.isFinite) {
          targetH = constraints.maxHeight.isFinite && constraints.maxHeight > 0 ? constraints.maxHeight : null;
        }

        final finiteDim = (targetW != null && targetH != null)
            ? (targetW < targetH ? targetW : targetH)
            : (targetW ?? targetH ?? 48.0);
        final iconSize = (finiteDim * 0.45).clamp(24.0, 56.0);
        final rawMemWidth = targetW != null && targetW.isFinite ? (targetW * 2.5) : 360.0;
        final memWidth = rawMemWidth.isFinite ? rawMemWidth.toInt().clamp(120, 1080) : 360;

        if (file.isDir) {
          return Container(
            width: targetW,
            height: targetH,
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

          return ClipRRect(
            borderRadius: BorderRadius.circular(borderRadius),
            child: Stack(
              alignment: Alignment.center,
              fit: StackFit.expand,
              children: [
                Container(
                  width: targetW,
                  height: targetH,
                  color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.05),
                  child: CachedNetworkImage(
                    imageUrl: thumbUrl,
                    width: targetW,
                    height: targetH,
                    fit: fit,
                    memCacheWidth: memWidth,
                    maxHeightDiskCache: 720,
                    maxWidthDiskCache: 720,
                    filterQuality: FilterQuality.medium,
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
          width: targetW,
          height: targetH,
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
      },
    );
  }
}
