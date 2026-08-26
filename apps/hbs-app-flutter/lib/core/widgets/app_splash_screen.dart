import 'package:flutter/material.dart';
import 'app_logo.dart';

/// Instagram-style splash: mark in the center, wordmark pinned to the bottom.
class AppSplashScreen extends StatelessWidget {
  static const background = Color(0xFFF2EDE5);
  static const wordmark = Color(0xFF3F2A1D);

  const AppSplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: background,
      body: SafeArea(
        child: Column(
          children: [
            Spacer(),
            AppLogo(size: 112, borderRadius: 32),
            Spacer(),
            Padding(
              padding: EdgeInsets.only(bottom: 28),
              child: Text(
                'HBS Cloud',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.6,
                  color: wordmark,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
