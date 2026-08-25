import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'color_palettes.dart';

class AppTheme {
  static ThemeData getThemeData({
    required ThemeModeOption mode,
    required PaletteKey paletteKey,
    Brightness? systemBrightness,
  }) {
    final preset = AppPalettes.presets[paletteKey] ?? AppPalettes.presets[PaletteKey.amber]!;
    
    final bool isDark;
    final bool isAmoled = mode == ThemeModeOption.amoled;

    switch (mode) {
      case ThemeModeOption.light:
        isDark = false;
        break;
      case ThemeModeOption.dark:
      case ThemeModeOption.amoled:
        isDark = true;
        break;
      case ThemeModeOption.system:
        isDark = (systemBrightness ?? Brightness.dark) == Brightness.dark;
        break;
    }

    ThemeColors colors = isDark ? preset.dark : preset.light;
    if (isAmoled) {
      colors = AppPalettes.createAmoledTheme(preset.dark);
    }

    final baseTextTheme = isDark ? ThemeData.dark().textTheme : ThemeData.light().textTheme;
    final textTheme = GoogleFonts.manropeTextTheme(baseTextTheme).apply(
      bodyColor: colors.text,
      displayColor: colors.text,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: isDark ? Brightness.dark : Brightness.light,
      primaryColor: colors.primary,
      scaffoldBackgroundColor: colors.background,
      canvasColor: colors.surface,
      cardColor: colors.card,
      dividerColor: colors.border,
      textTheme: textTheme,
      colorScheme: ColorScheme(
        brightness: isDark ? Brightness.dark : Brightness.light,
        primary: colors.primary,
        onPrimary: colors.onPrimary,
        primaryContainer: colors.primaryContainer,
        onPrimaryContainer: colors.onPrimaryContainer,
        secondary: colors.secondary,
        onSecondary: Colors.white,
        secondaryContainer: colors.secondaryContainer,
        onSecondaryContainer: colors.text,
        error: colors.error,
        onError: Colors.white,
        surface: colors.surface,
        onSurface: colors.text,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: IconThemeData(color: colors.text),
        titleTextStyle: GoogleFonts.manrope(
          color: colors.text,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: colors.card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: colors.border.withValues(alpha: 0.5), width: 1),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: colors.tabBar,
        selectedItemColor: colors.primary,
        unselectedItemColor: colors.subtext,
        elevation: 0,
      ),
    );
  }
}
