class UserStats {
  final int totalBytes;
  final int fileCount;
  final int photoCount;
  final int videoCount;
  final int docCount;
  final int otherCount;
  final int? diskTotalBytes;
  final int? diskFreeBytes;
  final String? driveName;
  final int? quotaBytes;
  final int? usedBytes;

  const UserStats({
    required this.totalBytes,
    required this.fileCount,
    required this.photoCount,
    required this.videoCount,
    required this.docCount,
    required this.otherCount,
    this.diskTotalBytes,
    this.diskFreeBytes,
    this.driveName,
    this.quotaBytes,
    this.usedBytes,
  });

  factory UserStats.fromJson(Map<String, dynamic> json) {
    return UserStats(
      totalBytes: (json['totalBytes'] as num?)?.toInt() ?? 0,
      fileCount: (json['fileCount'] as num?)?.toInt() ?? 0,
      photoCount: (json['photoCount'] as num?)?.toInt() ?? 0,
      videoCount: (json['videoCount'] as num?)?.toInt() ?? 0,
      docCount: (json['docCount'] as num?)?.toInt() ?? 0,
      otherCount: (json['otherCount'] as num?)?.toInt() ?? 0,
      diskTotalBytes: (json['diskTotalBytes'] as num?)?.toInt(),
      diskFreeBytes: (json['diskFreeBytes'] as num?)?.toInt(),
      quotaBytes: (json['quotaBytes'] as num?)?.toInt(),
      usedBytes: (json['usedBytes'] as num?)?.toInt(),
      driveName: json['driveName']?.toString(),
    );
  }

  static const empty = UserStats(
    totalBytes: 0,
    fileCount: 0,
    photoCount: 0,
    videoCount: 0,
    docCount: 0,
    otherCount: 0,
  );
}

class ServerInfo {
  final String url;
  final bool isConnected;
  final int? pingMs;
  final String? version;
  final String? serverName;

  const ServerInfo({
    required this.url,
    this.isConnected = false,
    this.pingMs,
    this.version,
    this.serverName,
  });

  ServerInfo copyWith({
    String? url,
    bool? isConnected,
    int? pingMs,
    String? version,
    String? serverName,
  }) {
    return ServerInfo(
      url: url ?? this.url,
      isConnected: isConnected ?? this.isConnected,
      pingMs: pingMs ?? this.pingMs,
      version: version ?? this.version,
      serverName: serverName ?? this.serverName,
    );
  }
}
