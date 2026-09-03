import 'package:dio/dio.dart';
import '../../../models/user_stats.dart';
import '../../../services/api_service.dart';

class BackupApiClient {
  static final BackupApiClient _instance = BackupApiClient._internal();
  factory BackupApiClient() => _instance;
  BackupApiClient._internal();

  final ApiService _api = ApiService();

  Future<UserStats> getUserStats() {
    return _api.getUserStats();
  }

  Future<DuplicateCheckResult> checkDuplicate({
    required String fileName,
    required int fileSize,
    required String hash,
    String? targetFilePath,
  }) {
    return _api.checkDuplicate(
      fileName: fileName,
      fileSize: fileSize,
      hash: hash,
      targetFilePath: targetFilePath,
    );
  }

  Future<void> uploadFile({
    required String filePath,
    required String fileName,
    String? mimeType,
    String parentPath = 'MobileBackups',
    String? uploadId,
    CancelToken? cancelToken,
    void Function(int sent, int total)? onSendProgress,
  }) {
    return _api.uploadFile(
      filePath: filePath,
      fileName: fileName,
      mimeType: mimeType,
      parentPath: parentPath,
      uploadId: uploadId,
      cancelToken: cancelToken,
      onSendProgress: onSendProgress,
    );
  }
}
