import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../core/utils/formatters.dart';
import '../../models/backup_file_item.dart';

class DriveThumbnail extends StatelessWidget {
  final BackupFileItem file;
  final String serverUrl;
  final Map<String, String>? headers;
  final double size;
  final double borderRadius;

  const DriveThumbnail({
    super.key,
    required this.file,
    required this.serverUrl,
    this.headers,
    this.size = 44,
    this.borderRadius = 14,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;
    final isDark = theme.brightness == Brightness.dark;

    if (file.isDir) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(borderRadius),
        ),
        child: Icon(
          Icons.folder_rounded,
          color: const Color(0xFFF59E0B),
          size: size * 0.52,
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
          children: [
            Container(
              width: size,
              height: size,
              color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.05),
              child: CachedNetworkImage(
                imageUrl: thumbUrl,
                width: size,
                height: size,
                fit: BoxFit.cover,
                memCacheWidth: (size * 2.5).toInt(),
                maxHeightDiskCache: 360,
                maxWidthDiskCache: 360,
                filterQuality: FilterQuality.low,
                httpHeaders: headers,
                placeholder: (_, __) => Container(
                  color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.04),
                  child: Center(
                    child: Icon(
                      category == 'video' ? Icons.videocam_rounded : Icons.photo_rounded,
                      color: category == 'video' ? const Color(0xFF10B981) : primary,
                      size: size * 0.45,
                    ),
                  ),
                ),
                errorWidget: (_, __, ___) => Container(
                  color: (category == 'video' ? const Color(0xFF10B981) : primary).withValues(alpha: 0.12),
                  child: Center(
                    child: Icon(
                      category == 'video' ? Icons.videocam_rounded : Icons.photo_rounded,
                      color: category == 'video' ? const Color(0xFF10B981) : primary,
                      size: size * 0.45,
                    ),
                  ),
                ),
              ),
            ),
            if (category == 'video')
              Positioned(
                bottom: 3,
                right: 3,
                child: Container(
                  padding: const EdgeInsets.all(2.5),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.65),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Icon(
                    Icons.play_arrow_rounded,
                    color: Colors.white,
                    size: 11,
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
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: iconColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(borderRadius),
      ),
      child: Icon(
        iconData,
        color: iconColor,
        size: size * 0.52,
      ),
    );
  }
}
