class PhotoMediaItem {
  final String id;
  final String userId;
  final String path;
  final String name;
  final String parentPath;
  final String? mimeType;
  final int size;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final bool isVideo;
  final String url;
  final String? thumbUrl;
  final bool isLocalOnly;
  final bool isBackedUp;
  final String? localUri;
  final int? duration;

  const PhotoMediaItem({
    required this.id,
    this.userId = '',
    required this.path,
    required this.name,
    this.parentPath = '',
    this.mimeType,
    required this.size,
    this.createdAt,
    this.updatedAt,
    required this.isVideo,
    required this.url,
    this.thumbUrl,
    this.isLocalOnly = false,
    this.isBackedUp = false,
    this.localUri,
    this.duration,
  });

  factory PhotoMediaItem.fromJson(Map<String, dynamic> json) {
    final mime = json['mimeType']?.toString();
    final isVid = json['isVideo'] == true || (mime != null && mime.startsWith('video/'));
    return PhotoMediaItem(
      id: json['id']?.toString() ?? '',
      userId: json['userId']?.toString() ?? '',
      path: json['path']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      parentPath: json['parentPath']?.toString() ?? '',
      mimeType: mime,
      size: (json['size'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
      updatedAt: json['updatedAt'] != null ? DateTime.tryParse(json['updatedAt'].toString()) : null,
      isVideo: isVid,
      url: json['url']?.toString() ?? '',
      thumbUrl: json['thumbUrl']?.toString(),
      isLocalOnly: json['isLocalOnly'] == true,
      isBackedUp: json['isBackedUp'] == true,
      localUri: json['localUri']?.toString(),
      duration: (json['duration'] as num?)?.toInt(),
    );
  }

  PhotoMediaItem copyWith({
    String? id,
    String? userId,
    String? path,
    String? name,
    String? parentPath,
    String? mimeType,
    int? size,
    DateTime? createdAt,
    DateTime? updatedAt,
    bool? isVideo,
    String? url,
    String? thumbUrl,
    bool? isLocalOnly,
    bool? isBackedUp,
    String? localUri,
    int? duration,
  }) {
    return PhotoMediaItem(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      path: path ?? this.path,
      name: name ?? this.name,
      parentPath: parentPath ?? this.parentPath,
      mimeType: mimeType ?? this.mimeType,
      size: size ?? this.size,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isVideo: isVideo ?? this.isVideo,
      url: url ?? this.url,
      thumbUrl: thumbUrl ?? this.thumbUrl,
      isLocalOnly: isLocalOnly ?? this.isLocalOnly,
      isBackedUp: isBackedUp ?? this.isBackedUp,
      localUri: localUri ?? this.localUri,
      duration: duration ?? this.duration,
    );
  }
}
