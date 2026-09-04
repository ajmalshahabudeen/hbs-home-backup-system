import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/flow/flow.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/app_logo.dart';
import 'core/widgets/app_splash_screen.dart';
import 'core/widgets/app_update_gate.dart';
import 'providers/auth_provider.dart';
import 'providers/theme_provider.dart';
import 'screens/app_shell.dart';
import 'screens/landing/landing_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Bootstrap platform bindings, caches, server connection, update check, and flow engine
  await AppFlowOrchestrator().boot();

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
