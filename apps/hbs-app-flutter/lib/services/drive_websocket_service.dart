import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import '../core/utils/lan_host.dart';
import '../core/utils/session_token_cleaner.dart';

class DriveChangeEvent {
  final String action;
  final String path;
  final Map<String, dynamic>? file;
  final Map<String, dynamic>? meta;
  final DateTime timestamp;

  const DriveChangeEvent({
    required this.action,
    required this.path,
    this.file,
    this.meta,
    required this.timestamp,
  });

  factory DriveChangeEvent.fromJson(Map<String, dynamic> json) {
    DateTime ts = DateTime.now();
    if (json['timestamp'] != null) {
      if (json['timestamp'] is int) {
        ts = DateTime.fromMillisecondsSinceEpoch(json['timestamp'] as int);
      } else if (json['timestamp'] is String) {
        ts = DateTime.tryParse(json['timestamp'] as String) ?? DateTime.now();
      }
    }

    return DriveChangeEvent(
      action: json['action']?.toString() ?? 'change',
      path: json['path']?.toString() ?? '',
      file: json['file'] is Map ? Map<String, dynamic>.from(json['file'] as Map) : null,
      meta: json['meta'] is Map ? Map<String, dynamic>.from(json['meta'] as Map) : null,
      timestamp: ts,
    );
  }
}

class DriveWebSocketService {
  static final DriveWebSocketService _instance = DriveWebSocketService._internal();
  factory DriveWebSocketService() => _instance;
  DriveWebSocketService._internal();

  WebSocket? _socket;
  Timer? _pingTimer;
  Timer? _reconnectTimer;
  bool _isDisposed = false;
  bool _isConnecting = false;
  int _reconnectAttempts = 0;

  String _serverUrl = LanHost.defaultUrl;
  String? _sessionToken;

  final StreamController<DriveChangeEvent> _changeController =
      StreamController<DriveChangeEvent>.broadcast();
  Stream<DriveChangeEvent> get changeStream => _changeController.stream;

  final ValueNotifier<bool> isConnected = ValueNotifier<bool>(false);

  void updateConfig({required String serverUrl, String? sessionToken}) {
    final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
    final cleanToken = sessionToken != null ? SessionTokenCleaner.cleanSessionToken(sessionToken) : _sessionToken;

    final changed = cleanUrl != _serverUrl || cleanToken != _sessionToken;
    _serverUrl = cleanUrl;
    _sessionToken = cleanToken;

    if (changed && !isConnected.value && !_isConnecting) {
      connect();
    }
  }

  String _getWsUrl() {
    final cleanUrl = _serverUrl.endsWith('/') ? _serverUrl.substring(0, _serverUrl.length - 1) : _serverUrl;
    final wsBase = cleanUrl.replaceFirst(RegExp(r'^http://', caseSensitive: false), 'ws://')
        .replaceFirst(RegExp(r'^https://', caseSensitive: false), 'wss://');

    final tokenParam = _sessionToken != null && _sessionToken!.isNotEmpty
        ? '?token=${Uri.encodeComponent(_sessionToken!)}'
        : '';

    return '$wsBase/api/ws$tokenParam';
  }

  void reconnect() {
    disconnect();
    _reconnectAttempts = 0;
    connect();
  }

  Future<void> connect() async {
    if (_isDisposed || _isConnecting) return;
    if (_socket != null && _socket!.readyState == WebSocket.open) return;

    _isConnecting = true;
    _cancelReconnect();

    final wsUrl = _getWsUrl();
    final shouldLog = _reconnectAttempts <= 3 || (_reconnectAttempts % 5 == 0);

    if (shouldLog) {
      debugPrint('[DriveWS] Connecting to $wsUrl ...');
    }

    try {
      final headers = <String, dynamic>{};
      if (_sessionToken != null && _sessionToken!.isNotEmpty) {
        headers.addAll(SessionTokenCleaner.authHeaders(_sessionToken!));
      }

      final connectFuture = WebSocket.connect(
        wsUrl,
        headers: headers.isNotEmpty ? headers : null,
      );

      // Register catch-all on a detached branch to prevent unhandled late errors/leaks after timeout
      unawaited(connectFuture.then((lateSocket) {
        if (lateSocket != _socket) {
          try {
            lateSocket.close();
          } catch (_) {}
        }
      }).catchError((_) {}));

      final socket = await connectFuture.timeout(const Duration(seconds: 10));

      _socket = socket;
      isConnected.value = true;
      final prevAttempts = _reconnectAttempts;
      _reconnectAttempts = 0;
      _isConnecting = false;

      if (prevAttempts > 0) {
        debugPrint('[DriveWS] Connected successfully after $prevAttempts attempt(s)');
      } else {
        debugPrint('[DriveWS] Connected successfully');
      }

      // Send immediate auth message as redundant handshake
      if (_sessionToken != null && _sessionToken!.isNotEmpty) {
        socket.add(jsonEncode({
          'type': 'auth',
          'token': _sessionToken,
        }));
      }

      _startPingTimer();

      socket.listen(
        _onMessage,
        onDone: _onDisconnected,
        onError: (err) {
          if (shouldLog) {
            debugPrint('[DriveWS] Socket error: $err');
          }
          _onDisconnected();
        },
        cancelOnError: true,
      );
    } catch (e) {
      if (shouldLog) {
        String errMsg = e.toString();
        if (e is TimeoutException) {
          errMsg = 'Connection timed out (server unreachable or busy)';
        } else if (e is SocketException) {
          errMsg = 'Socket connection failed: ${e.message}';
        } else if (e is WebSocketException) {
          errMsg = 'WebSocket protocol error: ${e.message}';
        }
        debugPrint('[DriveWS] Connection attempt ${_reconnectAttempts + 1} failed: $errMsg');
      }
      _isConnecting = false;
      isConnected.value = false;
      _scheduleReconnect();
    }
  }

  void _onMessage(dynamic raw) {
    try {
      final data = jsonDecode(raw.toString());
      if (data is! Map) return;

      final event = data['event']?.toString();
      if (event == 'pong') {
        // Heartbeat acknowledged
        return;
      }

      if (event == 'authenticated') {
        debugPrint('[DriveWS] Authenticated for user: ${data['data']?['email'] ?? data['data']?['userId']}');
        return;
      }

      if (event == 'drive:change') {
        final payload = data['data'];
        if (payload is Map) {
          final changeEvent = DriveChangeEvent.fromJson(Map<String, dynamic>.from(payload));
          debugPrint('[DriveWS] Received drive change: ${changeEvent.action} on ${changeEvent.path}');
          _changeController.add(changeEvent);
        }
      }
    } catch (e) {
      debugPrint('[DriveWS] Failed to parse ws message: $e');
    }
  }

  void _onDisconnected() {
    isConnected.value = false;
    _isConnecting = false;
    _pingTimer?.cancel();
    _socket = null;
    final shouldLog = _reconnectAttempts <= 3 || (_reconnectAttempts % 5 == 0);
    if (shouldLog) {
      debugPrint('[DriveWS] Disconnected');
    }
    _scheduleReconnect();
  }

  void _startPingTimer() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 25), (timer) {
      if (_socket != null && _socket!.readyState == WebSocket.open) {
        try {
          _socket!.add(jsonEncode({'type': 'ping', 'timestamp': DateTime.now().millisecondsSinceEpoch}));
        } catch (_) {
          _onDisconnected();
        }
      } else {
        timer.cancel();
      }
    });
  }

  void _scheduleReconnect() {
    if (_isDisposed) return;
    _cancelReconnect();

    _reconnectAttempts++;
    // Progressive backoff: 2s, 4s, 8s, 16s, capped at 30s
    final delaySeconds = (_reconnectAttempts == 1)
        ? 2
        : (_reconnectAttempts == 2)
            ? 4
            : (_reconnectAttempts == 3)
                ? 8
                : (_reconnectAttempts == 4)
                    ? 16
                    : 30;

    final shouldLog = _reconnectAttempts <= 3 || (_reconnectAttempts % 5 == 0);
    if (shouldLog) {
      debugPrint('[DriveWS] Scheduling reconnect attempt $_reconnectAttempts in ${delaySeconds}s');
    }
    _reconnectTimer = Timer(Duration(seconds: delaySeconds), () {
      connect();
    });
  }

  void _cancelReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
  }

  void disconnect() {
    _cancelReconnect();
    _pingTimer?.cancel();
    _pingTimer = null;
    if (_socket != null) {
      try {
        _socket!.close();
      } catch (_) {}
      _socket = null;
    }
    isConnected.value = false;
    _isConnecting = false;
  }

  void dispose() {
    _isDisposed = true;
    disconnect();
    _changeController.close();
  }
}
