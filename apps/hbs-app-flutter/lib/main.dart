import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/app_logo.dart';
import 'providers/auth_provider.dart';
import 'providers/theme_provider.dart';
import 'screens/app_shell.dart';
import 'screens/landing/landing_screen.dart';
import 'services/backup_index_db.dart';
import 'services/notification_service.dart';
import 'services/storage_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Core Services
  await StorageService().init();
  await NotificationService().init();
  await BackupIndexDb().database;

  runApp(
    const ProviderScope(
      child: HBSCloudApp(),
    ),
  );
}

class HBSCloudApp extends ConsumerWidget {
  const HBSCloudApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeState = ref.watch(themeProvider);
    final authState = ref.watch(authProvider);

    return MaterialApp(
      title: 'HBS Cloud',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.getThemeData(
        mode: themeState.mode,
        paletteKey: themeState.paletteKey,
        systemBrightness: MediaQuery.platformBrightnessOf(context),
      ),
      home: authState.isLoading
          ? const Scaffold(
              body: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AppLogo(size: 96, borderRadius: 28),
                    SizedBox(height: 24),
                    CircularProgressIndicator(),
                  ],
                ),
              ),
            )
          : (authState.isAuthenticated ? const AppShell() : const LandingScreen()),
    );
  }
}
