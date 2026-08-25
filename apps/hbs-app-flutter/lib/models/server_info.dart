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
