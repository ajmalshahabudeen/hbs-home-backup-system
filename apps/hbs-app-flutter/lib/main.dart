import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/backup_engine/backup_engine.dart';
import 'core/theme/app_theme.dart';
import 'core/utils/high_refresh_rate.dart';
import 'core/widgets/app_logo.dart';
import 'core/widgets/app_splash_screen.dart';
import 'core/widgets/app_update_gate.dart';
import 'providers/auth_provider.dart';
import 'providers/theme_provider.dart';
import 'screens/app_shell.dart';
import 'screens/landing/landing_screen.dart';
import 'services/notification_service.dart';
import 'services/storage_service.dart';
import 'services/watch_folder_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await enableHighestRefreshRate();

  // Boost image cache for 120 FPS high-density gallery scrolling
  PaintingBinding.instance.imageCache.maximumSize = 2500;
  PaintingBinding.instance.imageCache.maximumSizeBytes = 250 * 1024 * 1024; // 250MB

  // Initialize Core Services
  await StorageService().init();
  await NotificationService().init();
  await BackupIndexDb().database;
  await initBackgroundBackup();
  WatchFolderService().start();

  runApp(
    const ProviderScope(
      child: HBSCloudApp(),
    ),
  );
}

class HBSCloudApp extends ConsumerStatefulWidget {
  const HBSCloudApp({super.key});

  @override
  ConsumerState<HBSCloudApp> createState() => _HBSCloudAppState();
}

class _HBSCloudAppState extends ConsumerState<HBSCloudApp> {
  bool _splashFinished = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    precacheImage(const AssetImage(AppLogo.assetPath), context);
  }

  @override
  Widget build(BuildContext context) {
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
      home: AppUpdateGate(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 450),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeInCubic,
          transitionBuilder: (child, animation) {
            return FadeTransition(opacity: animation, child: child);
          },
          child: !_splashFinished
              ? AppSplashScreen(
                  key: const ValueKey('app_splash_screen'),
                  isReady: !authState.isLoading,
                  onFinish: () {
                    if (mounted) {
                      setState(() => _splashFinished = true);
                    }
                  },
                )
              : KeyedSubtree(
                  key: ValueKey(authState.isAuthenticated ? 'app_shell' : 'landing_screen'),
                  child: authState.isAuthenticated ? const AppShell() : const LandingScreen(),
                ),
        ),
      ),
    );
  }
}
