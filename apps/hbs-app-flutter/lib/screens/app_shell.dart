import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';
import '../core/flow/flow.dart';
import '../core/widgets/custom_bottom_nav.dart';
import '../core/widgets/permission_checker.dart';
import '../providers/backup_provider.dart';
import '../providers/media_provider.dart';
import '../providers/server_provider.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';
import 'backup/backup_screen.dart';
import 'drive/drive_screen.dart';
import 'lock/app_lock_overlay.dart';
import 'photos/photos_screen.dart';
import 'settings/settings_screen.dart';

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> with WidgetsBindingObserver {
  int _currentIndex = 0;
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
        _startMiddleSession();
      }
    });
    ReceiveSharingIntent.instance.getMediaStream().listen(_handleShared);
    ReceiveSharingIntent.instance.getInitialMedia().then(_handleShared);
  }

  void _startMiddleSession() {
    final serverUrl = ref.read(serverProvider).url;
    final token = StorageService().getString('hbs_session_token');
    final backupState = ref.read(backupProvider);

    AppFlowOrchestrator().onUserLogin(
      serverUrl: serverUrl,
      sessionToken: token,
      autoBackupEnabled: backupState.autoBackup,
      hasMediaPermission: backupState.hasPermission,
      onTriggerAutoBackup: ({bool force = false}) =>
          ref.read(backupProvider.notifier).autoBackupIfEnabled(force: force),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      AppFlowOrchestrator().onAppForegrounded(
        onRefreshMedia: () => ref.read(mediaProvider.notifier).loadMedia(),
        onRefreshAlbums: () => ref.read(backupProvider.notifier).loadAlbums(),
        onTriggerAutoBackup: () => ref.read(backupProvider.notifier).autoBackupIfEnabled(),
      );
    }
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
