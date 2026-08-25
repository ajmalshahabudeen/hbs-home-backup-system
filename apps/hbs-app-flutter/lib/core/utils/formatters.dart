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
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'bmp', 'svg'].contains(ext)) {
        return 'photo';
      }
      if (['mp4', 'mkv', 'mov', 'avi', 'webm', '3gp', 'm4v'].contains(ext)) {
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
}
