import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import '../../../services/storage_service.dart';

typedef WakeCallback = Future<void> Function(Map<String, dynamic> payload);

/// Lightweight embedded HTTP server running on LAN port 38482.
/// Allows the HBS server to directly ping and wake up the mobile app
/// when connected to home Wi-Fi without third-party push dependencies.
class DeviceWakeupServer {
  static final DeviceWakeupServer _instance = DeviceWakeupServer._internal();
  factory DeviceWakeupServer() => _instance;
  DeviceWakeupServer._internal();

  static const int defaultPort = 38482;

  HttpServer? _server;
  int _activePort = defaultPort;
  WakeCallback? _onWake;

  bool get isRunning => _server != null;
  int get activePort => _activePort;

  void setWakeCallback(WakeCallback? callback) {
    _onWake = callback;
  }

  /// Starts the embedded wakeup listener on the local network.
  Future<bool> start({int port = defaultPort}) async {
    if (_server != null && _activePort == port) {
      return true;
    }

    await stop();

    try {
      _server = await HttpServer.bind(
        InternetAddress.anyIPv4,
        port,
        shared: true,
      );
      _activePort = port;

      _server!.listen(
        _handleRequest,
        onError: (err) {
          debugPrint('[DeviceWakeupServer] Listener error: $err');
        },
        cancelOnError: false,
      );

      debugPrint('[DeviceWakeupServer] Listening on 0.0.0.0:$_activePort');
      return true;
    } catch (e) {
      debugPrint('[DeviceWakeupServer] Failed to bind port $port: $e');
      _server = null;
      return false;
    }
  }

  /// Handles incoming HTTP calls from the HBS server.
  Future<void> _handleRequest(HttpRequest request) async {
    final response = request.response;
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method == 'OPTIONS') {
      response.statusCode = HttpStatus.ok;
      await response.close();
      return;
    }

    final path = request.uri.path;

    try {
      // 1. Health probe from server
      if (request.method == 'GET' && (path == '/ping' || path == '/')) {
        response.statusCode = HttpStatus.ok;
        response.write(jsonEncode({
          'status': 'online',
          'app': 'hbs_flutter',
          'port': _activePort,
          'timestamp': DateTime.now().millisecondsSinceEpoch,
        }));
        await response.close();
        return;
      }

      // 2. Server Wakeup Command
      if (request.method == 'POST' && (path == '/wake' || path == '/wakeup')) {
        if (StorageService().isUserLoggedOut()) {
          response.statusCode = HttpStatus.unauthorized;
          response.write(jsonEncode({'error': 'User is logged out', 'status': 'ignored'}));
          await response.close();
          return;
        }

        final bodyStr = await utf8.decoder.bind(request).join();
        Map<String, dynamic> payload = {};
        if (bodyStr.isNotEmpty) {
          try {
            final decoded = jsonDecode(bodyStr);
            if (decoded is Map<String, dynamic>) {
              payload = decoded;
            }
          } catch (_) {}
        }

        debugPrint('[DeviceWakeupServer] Received /wake from ${request.connectionInfo?.remoteAddress.address}');

        // Reply immediately so server call doesn't hang
        response.statusCode = HttpStatus.ok;
        response.write(jsonEncode({
          'status': 'woken',
          'backupTriggered': true,
          'timestamp': DateTime.now().millisecondsSinceEpoch,
        }));
        await response.close();

        // Asynchronously execute wake callback to start backup pipeline
        if (_onWake != null) {
          unawaited(_onWake!(payload).catchError((err) {
            debugPrint('[DeviceWakeupServer] Wake handler error: $err');
          }));
        }
        return;
      }

      // 404 for any other path
      response.statusCode = HttpStatus.notFound;
      response.write(jsonEncode({'error': 'Not found'}));
      await response.close();
    } catch (e) {
      debugPrint('[DeviceWakeupServer] Request error: $e');
      try {
        response.statusCode = HttpStatus.internalServerError;
        response.write(jsonEncode({'error': e.toString()}));
        await response.close();
      } catch (_) {}
    }
  }

  /// Stops and tears down the embedded server.
  Future<void> stop() async {
    if (_server != null) {
      try {
        await _server!.close(force: true);
      } catch (_) {}
      _server = null;
      debugPrint('[DeviceWakeupServer] Stopped');
    }
  }
}
