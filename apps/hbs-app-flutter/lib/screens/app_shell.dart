import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';
import '../core/backup_engine/backup_engine.dart';
import '../core/widgets/custom_bottom_nav.dart';
import '../core/widgets/permission_checker.dart';
import '../providers/backup_provider.dart';
import '../providers/media_provider.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';
import '../services/watch_folder_service.dart';
import 'backup/backup_screen.dart';
import 'drive/drive_screen.dart';
import 'lock/app_lock_overlay.dart';
import 'photos/photos_screen.dart';
import 'settings/settings_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> with WidgetsBindingObserver {
  int _currentIndex = 0;
  Timer? _inboxTimer;
  CancelToken? _inboxStream;

  final List<Widget> _screens = const [
    PhotosScreen(),
    DriveScreen(),
    BackupScreen(),
    SettingsScreen(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        PermissionChecker.checkAndPrompt(context, ref);
      }
    });
    ReceiveSharingIntent.instance.getMediaStream().listen(_handleShared);
    ReceiveSharingIntent.instance.getInitialMedia().then(_handleShared);
    WatchFolderService().start();
    _startLanInbox();
    _initDeviceWakeup();
  }

  void _initDeviceWakeup() {
    DeviceWakeupServer().setWakeCallback((payload) async {
      debugPrint('[AppShell] Server wake received: $payload');
      if (mounted) {
        await ref.read(backupProvider.notifier).autoBackupIfEnabled(force: true);
      }
    });

    NetworkPresenceWatcher().start(onBackupTrigger: (reason) async {
      debugPrint('[AppShell] Network presence wake triggered: $reason');
      if (mounted) {
        await ref.read(backupProvider.notifier).autoBackupIfEnabled();
      }
    });
  }

  void _startLanInbox() {
    _inboxStream?.cancel();
    _inboxStream = CancelToken();
    _pollInbox();
    _inboxTimer?.cancel();
    _inboxTimer = Timer.periodic(const Duration(seconds: 90), (_) => _pollInbox());
    ApiService().listenInbox(
      cancelToken: _inboxStream,
      onEvents: (events) async {
        for (final e in events) {
          await NotificationService().showInboxAlert(
            e['title']?.toString() ?? 'HBS Cloud',
            e['body']?.toString() ?? '',
          );
        }
        if (events.isNotEmpty) await ApiService().markInboxRead();
      },
    ).catchError((_) {});
  }

  @override
  void dispose() {
    NetworkPresenceWatcher().stop();
    DeviceWakeupServer().stop();
    _inboxTimer?.cancel();
    _inboxStream?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(mediaProvider.notifier).loadMedia();
      ref.read(backupProvider.notifier).loadAlbums();
      ref.read(backupProvider.notifier).autoBackupIfEnabled();
      MediaListenerService().processNewMediaChanges();
      _startLanInbox();
      NetworkPresenceWatcher().announcePresenceNow(reason: 'app_resumed');
    }
  }

  Future<void> _pollInbox() async {
    try {
      final events = await ApiService().unreadInbox();
      for (final e in events) {
        await NotificationService().showInboxAlert(
          e['title']?.toString() ?? 'HBS Cloud',
          e['body']?.toString() ?? '',
        );
      }
      if (events.isNotEmpty) await ApiService().markInboxRead();
    } catch (_) {}
  }

  Future<void> _handleShared(List<SharedMediaFile> files) async {
    if (files.isEmpty) return;
    for (final file in files) {
      final path = file.path;
      if (path.isEmpty) continue;
      final name = path.split(RegExp(r'[/\\]')).last;
      try {
        await ApiService().uploadFile(filePath: path, fileName: name, parentPath: 'Shared');
      } catch (_) {}
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Uploaded ${files.length} shared file(s) to Shared/')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppLockOverlay(
      child: Scaffold(
        extendBody: true,
        body: IndexedStack(
          index: _currentIndex,
          children: _screens,
        ),
        bottomNavigationBar: CustomBottomNav(
          currentIndex: _currentIndex,
          onTap: (index) => setState(() => _currentIndex = index),
        ),
      ),
    );
  }
}
