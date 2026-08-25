import 'package:flutter/material.dart';
import '../core/widgets/custom_bottom_nav.dart';
import 'backup/backup_screen.dart';
import 'drive/drive_screen.dart';
import 'lock/app_lock_overlay.dart';
import 'photos/photos_screen.dart';
import 'settings/settings_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    PhotosScreen(),
    DriveScreen(),
    BackupScreen(),
    SettingsScreen(),
  ];

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
