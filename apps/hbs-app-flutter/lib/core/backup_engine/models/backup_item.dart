class IndexedBackupItem {
  final String id;
  final String fileName;
  final String filePath;
  final int fileSize;
  final String checksum;
  final String? mimeType;
  final String uploadedAt;

  const IndexedBackupItem({
    required this.id,
    required this.fileName,
    required this.filePath,
    required this.fileSize,
    required this.checksum,
    this.mimeType,
    required this.uploadedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'file_name': fileName,
      'file_path': filePath,
      'file_size': fileSize,
      'checksum': checksum,
      'mime_type': mimeType,
      'uploaded_at': uploadedAt,
    };
  }

  factory IndexedBackupItem.fromMap(Map<String, dynamic> map) {
    return IndexedBackupItem(
      id: map['id']?.toString() ?? '',
      fileName: map['file_name']?.toString() ?? '',
      filePath: map['file_path']?.toString() ?? '',
      fileSize: (map['file_size'] as num?)?.toInt() ?? 0,
      checksum: map['checksum']?.toString() ?? '',
      mimeType: map['mime_type']?.toString(),
      uploadedAt: map['uploaded_at']?.toString() ?? '',
    );
  }
}

enum QueueItemStatus {
  pending,
  uploading,
  done,
  failed,
  skipped,
}

class QueueUploadItem {
  final String id;
  final String? assetId;
  final String filePath;
  final String fileName;
  final int fileSize;
  final String? mimeType;
  final String parentPath;
  final QueueItemStatus status;
  final String createdAt;
  final String? uploadId;

  const QueueUploadItem({
    required this.id,
    this.assetId,
    required this.filePath,
    required this.fileName,
    required this.fileSize,
    this.mimeType,
    this.parentPath = 'MobileBackups',
    this.status = QueueItemStatus.pending,
    required this.createdAt,
    this.uploadId,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'asset_id': assetId,
      'file_path': filePath,
      'file_name': fileName,
      'file_size': fileSize,
      'mime_type': mimeType,
      'parent_path': parentPath,
      'status': status.name,
      'created_at': createdAt,
      'upload_id': uploadId,
    };
  }

  factory QueueUploadItem.fromMap(Map<String, dynamic> map) {
    final statusStr = map['status']?.toString() ?? 'pending';
    final status = QueueItemStatus.values.firstWhere(
      (e) => e.name == statusStr,
      orElse: () => QueueItemStatus.pending,
    );
    return QueueUploadItem(
      id: map['id']?.toString() ?? '',
      assetId: map['asset_id']?.toString(),
      filePath: map['file_path']?.toString() ?? '',
      fileName: map['file_name']?.toString() ?? '',
      fileSize: (map['file_size'] as num?)?.toInt() ?? 0,
      mimeType: map['mime_type']?.toString(),
      parentPath: map['parent_path']?.toString() ?? 'MobileBackups',
      status: status,
      createdAt: map['created_at']?.toString() ?? '',
      uploadId: map['upload_id']?.toString(),
    );
  }
}
