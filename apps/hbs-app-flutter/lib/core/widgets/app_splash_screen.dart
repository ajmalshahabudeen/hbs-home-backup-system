import 'package:flutter/material.dart';
import 'app_logo.dart';

/// Centered logo + uppercase wordmark on the cream field.
class AppSplashScreen extends StatelessWidget {
  static const background = Color(0xFFF2EDE5);
  static const wordmark = Color(0xFF3F2A1D);

  const AppSplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: background,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppLogo(size: 112, borderRadius: 32),
              SizedBox(height: 20),
              Text(
                'HBS CLOUD',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 2.4,
                  color: wordmark,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
