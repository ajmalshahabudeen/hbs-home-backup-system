import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class Formatters {
  static String formatBytes(num bytes, [int decimals = 1]) {
    if (bytes <= 0) return '0 B';
    const suffixes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    int i = 0;
    double size = bytes.toDouble();
    while (size >= 1024 && i < suffixes.length - 1) {
      size /= 1024;
      i++;
    }
    return '${size.toStringAsFixed(decimals)} ${suffixes[i]}';
  }

  static String formatDate(DateTime? date) {
    if (date == null) return '';
    final now = DateTime.now();
    final difference = now.difference(date);

    if (difference.inDays == 0 && now.day == date.day) {
      return 'Today, ${DateFormat.jm().format(date)}';
    } else if (difference.inDays == 1 || (difference.inDays == 0 && now.day != date.day)) {
      return 'Yesterday, ${DateFormat.jm().format(date)}';
    } else if (difference.inDays < 7) {
      return DateFormat('EEEE, MMM d').format(date);
    } else if (now.year == date.year) {
      return DateFormat('MMMM d').format(date);
    } else {
      return DateFormat('MMM d, yyyy').format(date);
    }
  }

  static String formatShortDate(DateTime? date) {
    if (date == null) return '';
    return DateFormat('MMM d, yyyy').format(date);
  }

  static String getMimeTypeCategory(String? mimeType, String? fileName) {
    if (mimeType != null && mimeType.isNotEmpty) {
      if (mimeType.startsWith('image/')) return 'photo';
      if (mimeType.startsWith('video/')) return 'video';
      if (mimeType.startsWith('audio/')) return 'audio';
      if (mimeType.contains('pdf') ||
          mimeType.contains('word') ||
          mimeType.contains('excel') ||
          mimeType.contains('powerpoint') ||
          mimeType.contains('document') ||
          mimeType.contains('sheet') ||
          mimeType.contains('text/')) {
        return 'doc';
      }
    }

    if (fileName != null) {
      final ext = fileName.split('.').last.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'svg', 'dng', 'raw', 'cr2', 'nef', 'arw', 'raf', 'orf', 'rw2'].contains(ext)) {
        return 'photo';
      }
      if (['mp4', 'mkv', 'mov', 'avi', 'webm', '3gp', 'm4v', 'hevc'].contains(ext)) {
        return 'video';
      }
      if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].contains(ext)) {
        return 'audio';
      }
      if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'json', 'csv'].contains(ext)) {
        return 'doc';
      }
    }

    return 'other';
  }

  static final Map<int, String> _timelineCache = {};
  static final DateFormat _timelineFormatter = DateFormat('yyyy · MMMM');

  static String timelineKey(DateTime? date) {
    if (date == null) return 'Unknown date';
    final key = date.year * 100 + date.month;
    return _timelineCache.putIfAbsent(key, () => _timelineFormatter.format(date));
  }

  static bool isHeic(String? mimeType, String? fileName) {
    final mime = (mimeType ?? '').toLowerCase();
    if (mime.contains('heic') || mime.contains('heif')) return true;
    final ext = (fileName ?? '').split('.').last.toLowerCase();
    return ext == 'heic' || ext == 'heif';
  }

  static bool isRaw(String? mimeType, String? fileName) {
    final mime = (mimeType ?? '').toLowerCase();
    if (mime.contains('dng') || mime.contains('raw')) return true;
    const raw = {'dng', 'raw', 'cr2', 'nef', 'arw', 'raf', 'orf', 'rw2'};
    return raw.contains((fileName ?? '').split('.').last.toLowerCase());
  }

  static Widget rawFallback() {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.camera_outlined, color: Colors.white54, size: 48),
            SizedBox(height: 12),
            Text(
              'RAW/DNG preview is not available on this device.\nDownload the original from Drive.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  static Widget heicFallback() {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.image_not_supported_outlined, color: Colors.white54, size: 48),
            SizedBox(height: 12),
            Text(
              'This HEIC/HEIF file cannot be previewed on this device.\nDownload it or open it in another app.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}
