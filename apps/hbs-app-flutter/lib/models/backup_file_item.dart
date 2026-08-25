class BackupFileItem {
  final String id;
  final String userId;
  final String path;
  final String name;
  final String parentPath;
  final bool isDir;
  final String? mimeType;
  final int size;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const BackupFileItem({
    required this.id,
    required this.userId,
    required this.path,
    required this.name,
    required this.parentPath,
    required this.isDir,
    this.mimeType,
    required this.size,
    this.createdAt,
    this.updatedAt,
  });

  factory BackupFileItem.fromJson(Map<String, dynamic> json) {
    return BackupFileItem(
      id: json['id']?.toString() ?? '',
      userId: json['userId']?.toString() ?? '',
      path: json['path']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      parentPath: json['parentPath']?.toString() ?? '',
      isDir: json['isDir'] == true || json['isDir'] == 1,
      mimeType: json['mimeType']?.toString(),
      size: (json['size'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
      updatedAt: json['updatedAt'] != null ? DateTime.tryParse(json['updatedAt'].toString()) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'path': path,
      'name': name,
      'parentPath': parentPath,
      'isDir': isDir,
      'mimeType': mimeType,
      'size': size,
      'createdAt': createdAt?.toIso8601String(),
      'updatedAt': updatedAt?.toIso8601String(),
    };
  }
}
