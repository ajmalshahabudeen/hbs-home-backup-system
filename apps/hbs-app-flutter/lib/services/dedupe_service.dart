import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'api_service.dart';
import 'backup_index_db.dart';

class DedupeService {
  static final DedupeService _instance = DedupeService._internal();
  factory DedupeService() => _instance;
  DedupeService._internal();

  /// Calculates a fast, deterministic SHA-256 checksum for a file.
  /// For small files (< 4MB), computes full SHA-256.
  /// For large files (> 4MB), computes hash of header (1MB) + middle (1MB) + tail (1MB) + length for maximum I/O speed.
  Future<String> calculateFileChecksum(String filePath) async {
    final file = File(filePath);
    if (!await file.exists()) return '';

    final length = await file.length();
    if (length == 0) return '';

    if (length <= 4 * 1024 * 1024) {
      final bytes = await file.readAsBytes();
      return sha256.convert(bytes).toString();
    }

    // Fast partial sample hash for large 4K videos / RAW images
    final raf = await file.open(mode: FileMode.read);
    try {
      final head = await raf.read(1024 * 1024);
      await raf.setPosition(length ~/ 2);
      final mid = await raf.read(1024 * 1024);
      await raf.setPosition(length - (1024 * 1024));
      final tail = await raf.read(1024 * 1024);

      final combined = <int>[
        ...utf8.encode('size:$length:'),
        ...head,
        ...mid,
        ...tail,
      ];
      return sha256.convert(combined).toString();
    } finally {
      await raf.close();
    }
  }

  /// Checks if file is a duplicate:
  /// 1. Fast local SQLite index check (< 1ms)
  /// 2. Remote server preflight check (/api/user/upload/check)
  Future<bool> isDuplicate({
    required String filePath,
    required String fileName,
    int? fileSize,
    String parentPath = 'MobileBackups',
  }) async {
    final size = fileSize ?? (await File(filePath).length());
    final hash = await calculateFileChecksum(filePath);

    // 1. Fast Local SQLite Check
    final isLocal = await BackupIndexDb().isLocallyUploaded(
      checksum: hash,
      fileName: fileName,
      fileSize: size,
    );
    if (isLocal) return true;

    // 2. Remote Preflight Check
    final targetPath = parentPath.isNotEmpty ? '$parentPath/$fileName' : fileName;
    final serverCheck = await ApiService().checkDuplicate(
      fileName: fileName,
      fileSize: size,
      hash: hash,
      targetFilePath: targetPath,
    );

    if (serverCheck.isDuplicate) {
      // Record to local SQLite index so subsequent checks don't hit network
      await BackupIndexDb().recordUploaded(
        id: serverCheck.existingFile?.id ?? hash,
        fileName: fileName,
        filePath: filePath,
        fileSize: size,
        checksum: hash,
      );
      return true;
    }

    return false;
  }
}
