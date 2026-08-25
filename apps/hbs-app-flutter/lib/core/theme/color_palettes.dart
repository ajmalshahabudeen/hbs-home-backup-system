import 'package:flutter/material.dart';

enum ThemeModeOption { light, dark, amoled, system }

enum PaletteKey { amber, blue, emerald, violet, rose }

class ThemeColors {
  final Color primary;
  final Color primaryContainer;
  final Color onPrimary;
  final Color onPrimaryContainer;
  final Color secondary;
  final Color secondaryContainer;
  final Color background;
  final Color surface;
  final Color surfaceVariant;
  final Color card;
  final Color text;
  final Color textSecondary;
  final Color subtext;
  final Color border;
  final Color error;
  final Color success;
  final Color warning;
  final Color icon;
  final Color tabBar;
  final Color tabBarBorder;
  final Color searchBg;
  final Color modalBg;

  const ThemeColors({
    required this.primary,
    required this.primaryContainer,
    required this.onPrimary,
    required this.onPrimaryContainer,
    required this.secondary,
    required this.secondaryContainer,
    required this.background,
    required this.surface,
    required this.surfaceVariant,
    required this.card,
    required this.text,
    required this.textSecondary,
    required this.subtext,
    required this.border,
    required this.error,
    required this.success,
    required this.warning,
    required this.icon,
    required this.tabBar,
    required this.tabBarBorder,
    required this.searchBg,
    required this.modalBg,
  });
}

class PalettePreset {
  final PaletteKey id;
  final String name;
  final Color previewColor;
  final ThemeColors light;
  final ThemeColors dark;

  const PalettePreset({
    required this.id,
    required this.name,
    required this.previewColor,
    required this.light,
    required this.dark,
  });
}

class AppPalettes {
  static const amberLight = ThemeColors(
    primary: Color(0xFFD97706),
    primaryContainer: Color(0xFFFEF3C7),
    onPrimary: Color(0xFFFFFFFF),
    onPrimaryContainer: Color(0xFF78350F),
    secondary: Color(0xFFB45309),
    secondaryContainer: Color(0xFFFFFBEB),
    background: Color(0xFFFFFCF5),
    surface: Color(0xFFFFF8E7),
    surfaceVariant: Color(0xFFFDE68A),
    card: Color(0xFFFFFFFF),
    text: Color(0xFF1C1917),
    textSecondary: Color(0xFF78350F),
    subtext: Color(0xFF92400E),
    border: Color(0xFFFCD34D),
    error: Color(0xFFDC2626),
    success: Color(0xFF16A34A),
    warning: Color(0xFFF59E0B),
    icon: Color(0xFFB45309),
    tabBar: Color(0xFFFFFFFF),
    tabBarBorder: Color(0xFFFDE68A),
    searchBg: Color(0xFFFEF3C7),
    modalBg: Color(0xFFFFFFFF),
  );

  static const amberDark = ThemeColors(
    primary: Color(0xFFE5A100),
    primaryContainer: Color(0xFF382203),
    onPrimary: Color(0xFF14120E),
    onPrimaryContainer: Color(0xFFFCD34D),
    secondary: Color(0xFFD97706),
    secondaryContainer: Color(0xFF261F13),
    background: Color(0xFF14120E),
    surface: Color(0xFF1C1914),
    surfaceVariant: Color(0xFF26221B),
    card: Color(0xFF1C1914),
    text: Color(0xFFF3F4F6),
    textSecondary: Color(0xFFA1A1AA),
    subtext: Color(0xFF9CA3AF),
    border: Color(0xFF382A13),
    error: Color(0xFFF87171),
    success: Color(0xFF4ADE80),
    warning: Color(0xFFF59E0B),
    icon: Color(0xFFD97706),
    tabBar: Color(0xFF1C1914),
    tabBarBorder: Color(0xFF26221B),
    searchBg: Color(0xFF26221B),
    modalBg: Color(0xFF1C1914),
  );

  static const blueLight = ThemeColors(
    primary: Color(0xFF2563EB),
    primaryContainer: Color(0xFFDBEAFE),
    onPrimary: Color(0xFFFFFFFF),
    onPrimaryContainer: Color(0xFF1E3A8A),
    secondary: Color(0xFF1D4ED8),
    secondaryContainer: Color(0xFFEFF6FF),
    background: Color(0xFFF8FAFC),
    surface: Color(0xFFF1F5F9),
    surfaceVariant: Color(0xFFE2E8F0),
    card: Color(0xFFFFFFFF),
    text: Color(0xFF0F172A),
    textSecondary: Color(0xFF475569),
    subtext: Color(0xFF64748B),
    border: Color(0xFFCBD5E1),
    error: Color(0xFFDC2626),
    success: Color(0xFF16A34A),
    warning: Color(0xFFF59E0B),
    icon: Color(0xFF2563EB),
    tabBar: Color(0xFFFFFFFF),
    tabBarBorder: Color(0xFFE2E8F0),
    searchBg: Color(0xFFEFF6FF),
    modalBg: Color(0xFFFFFFFF),
  );

  static const blueDark = ThemeColors(
    primary: Color(0xFF3B82F6),
    primaryContainer: Color(0xFF172554),
    onPrimary: Color(0xFF0F172A),
    onPrimaryContainer: Color(0xFF93C5FD),
    secondary: Color(0xFF60A5FA),
    secondaryContainer: Color(0xFF1E293B),
    background: Color(0xFF0F172A),
    surface: Color(0xFF1E293B),
    surfaceVariant: Color(0xFF334155),
    card: Color(0xFF1E293B),
    text: Color(0xFFF8FAFC),
    textSecondary: Color(0xFF94A3B8),
    subtext: Color(0xFF64748B),
    border: Color(0xFF334155),
    error: Color(0xFFF87171),
    success: Color(0xFF4ADE80),
    warning: Color(0xFFF59E0B),
    icon: Color(0xFF3B82F6),
    tabBar: Color(0xFF1E293B),
    tabBarBorder: Color(0xFF334155),
    searchBg: Color(0xFF334155),
    modalBg: Color(0xFF1E293B),
  );

  static const emeraldLight = ThemeColors(
    primary: Color(0xFF059669),
    primaryContainer: Color(0xFFD1FAE5),
    onPrimary: Color(0xFFFFFFFF),
    onPrimaryContainer: Color(0xFF064E3B),
    secondary: Color(0xFF047857),
    secondaryContainer: Color(0xFFECFDF5),
    background: Color(0xFFF7FDF9),
    surface: Color(0xFFECFDF5),
    surfaceVariant: Color(0xFFA7F3D0),
    card: Color(0xFFFFFFFF),
    text: Color(0xFF064E3B),
    textSecondary: Color(0xFF047857),
    subtext: Color(0xFF059669),
    border: Color(0xFF6EE7B7),
    error: Color(0xFFDC2626),
    success: Color(0xFF059669),
    warning: Color(0xFFF59E0B),
    icon: Color(0xFF059669),
    tabBar: Color(0xFFFFFFFF),
    tabBarBorder: Color(0xFFA7F3D0),
    searchBg: Color(0xFFD1FAE5),
    modalBg: Color(0xFFFFFFFF),
  );

  static const emeraldDark = ThemeColors(
    primary: Color(0xFF10B981),
    primaryContainer: Color(0xFF064E3B),
    onPrimary: Color(0xFF061814),
    onPrimaryContainer: Color(0xFFA7F3D0),
    secondary: Color(0xFF34D399),
    secondaryContainer: Color(0xFF0F2922),
    background: Color(0xFF061814),
    surface: Color(0xFF0F2922),
    surfaceVariant: Color(0xFF1A3A31),
    card: Color(0xFF0F2922),
    text: Color(0xFFF0FDF4),
    textSecondary: Color(0xFFA7F3D0),
    subtext: Color(0xFF6EE7B7),
    border: Color(0xFF1A3A31),
    error: Color(0xFFF87171),
    success: Color(0xFF34D399),
    warning: Color(0xFFF59E0B),
    icon: Color(0xFF10B981),
    tabBar: Color(0xFF0F2922),
    tabBarBorder: Color(0xFF1A3A31),
    searchBg: Color(0xFF1A3A31),
    modalBg: Color(0xFF0F2922),
  );

  static const violetLight = ThemeColors(
    primary: Color(0xFF7C3AED),
    primaryContainer: Color(0xFFEDE9FE),
    onPrimary: Color(0xFFFFFFFF),
    onPrimaryContainer: Color(0xFF4C1D95),
    secondary: Color(0xFF6D28D9),
    secondaryContainer: Color(0xFFF5F3FF),
    background: Color(0xFFFAF5FF),
    surface: Color(0xFFF3E8FF),
    surfaceVariant: Color(0xFFDDD6FE),
    card: Color(0xFFFFFFFF),
    text: Color(0xFF2E1065),
    textSecondary: Color(0xFF5B21B6),
    subtext: Color(0xFF7C3AED),
    border: Color(0xFFC4B5FD),
    error: Color(0xFFDC2626),
    success: Color(0xFF16A34A),
    warning: Color(0xFFF59E0B),
    icon: Color(0xFF7C3AED),
    tabBar: Color(0xFFFFFFFF),
    tabBarBorder: Color(0xFFDDD6FE),
    searchBg: Color(0xFFEDE9FE),
    modalBg: Color(0xFFFFFFFF),
  );

  static const violetDark = ThemeColors(
    primary: Color(0xFF8B5CF6),
    primaryContainer: Color(0xFF2E1065),
    onPrimary: Color(0xFF120E1E),
    onPrimaryContainer: Color(0xFFDDD6FE),
    secondary: Color(0xFFA78BFA),
    secondaryContainer: Color(0xFF1C162E),
    background: Color(0xFF120E1E),
    surface: Color(0xFF1C162E),
    surfaceVariant: Color(0xFF2A2142),
    card: Color(0xFF1C162E),
    text: Color(0xFFF5F3FF),
    textSecondary: Color(0xFFC4B5FD),
    subtext: Color(0xFFA78BFA),
    border: Color(0xFF2A2142),
    error: Color(0xFFF87171),
    success: Color(0xFF4ADE80),
    warning: Color(0xFFF59E0B),
    icon: Color(0xFF8B5CF6),
    tabBar: Color(0xFF1C162E),
    tabBarBorder: Color(0xFF2A2142),
    searchBg: Color(0xFF2A2142),
    modalBg: Color(0xFF1C162E),
  );

  static const roseLight = ThemeColors(
    primary: Color(0xFFE11D48),
    primaryContainer: Color(0xFFFFE4E6),
    onPrimary: Color(0xFFFFFFFF),
    onPrimaryContainer: Color(0xFF881337),
    secondary: Color(0xFFBE123C),
    secondaryContainer: Color(0xFFFFF1F2),
    background: Color(0xFFFFF5F5),
    surface: Color(0xFFFFE4E6),
    surfaceVariant: Color(0xFFFECDD3),
    card: Color(0xFFFFFFFF),
    text: Color(0xFF4C0519),
    textSecondary: Color(0xFF9F1239),
    subtext: Color(0xFFE11D48),
    border: Color(0xFFFDA4AF),
    error: Color(0xFFDC2626),
    success: Color(0xFF16A34A),
    warning: Color(0xFFF59E0B),
    icon: Color(0xFFE11D48),
    tabBar: Color(0xFFFFFFFF),
    tabBarBorder: Color(0xFFFECDD3),
    searchBg: Color(0xFFFFE4E6),
    modalBg: Color(0xFFFFFFFF),
  );

  static const roseDark = ThemeColors(
    primary: Color(0xFFF43F5E),
    primaryContainer: Color(0xFF4C0519),
    onPrimary: Color(0xFF180D11),
    onPrimaryContainer: Color(0xFFFECDD3),
    secondary: Color(0xFFFB7185),
    secondaryContainer: Color(0xFF24141A),
    background: Color(0xFF180D11),
    surface: Color(0xFF24141A),
    surfaceVariant: Color(0xFF361D26),
    card: Color(0xFF24141A),
    text: Color(0xFFFFF1F2),
    textSecondary: Color(0xFFFDA4AF),
    subtext: Color(0xFFFB7185),
    border: Color(0xFF361D26),
    error: Color(0xFFF87171),
    success: Color(0xFF4ADE80),
    warning: Color(0xFFF59E0B),
    icon: Color(0xFFF43F5E),
    tabBar: Color(0xFF24141A),
    tabBarBorder: Color(0xFF361D26),
    searchBg: Color(0xFF361D26),
    modalBg: Color(0xFF24141A),
  );

  static const Map<PaletteKey, PalettePreset> presets = {
    PaletteKey.amber: PalettePreset(
      id: PaletteKey.amber,
      name: 'Amber Gold',
      previewColor: Color(0xFFD97706),
      light: amberLight,
      dark: amberDark,
    ),
    PaletteKey.blue: PalettePreset(
      id: PaletteKey.blue,
      name: 'Ocean Blue',
      previewColor: Color(0xFF2563EB),
      light: blueLight,
      dark: blueDark,
    ),
    PaletteKey.emerald: PalettePreset(
      id: PaletteKey.emerald,
      name: 'Emerald Mint',
      previewColor: Color(0xFF059669),
      light: emeraldLight,
      dark: emeraldDark,
    ),
    PaletteKey.violet: PalettePreset(
      id: PaletteKey.violet,
      name: 'Violet Plum',
      previewColor: Color(0xFF7C3AED),
      light: violetLight,
      dark: violetDark,
    ),
    PaletteKey.rose: PalettePreset(
      id: PaletteKey.rose,
      name: 'Rose Amber',
      previewColor: Color(0xFFE11D48),
      light: roseLight,
      dark: roseDark,
    ),
  };

  static ThemeColors createAmoledTheme(ThemeColors darkTheme) {
    return ThemeColors(
      primary: darkTheme.primary,
      primaryContainer: const Color(0xFF141414),
      onPrimary: darkTheme.onPrimary,
      onPrimaryContainer: darkTheme.onPrimaryContainer,
      secondary: darkTheme.secondary,
      secondaryContainer: const Color(0xFF0F0F0F),
      background: Colors.black,
      surface: const Color(0xFF080808),
      surfaceVariant: const Color(0xFF121212),
      card: const Color(0xFF080808),
      text: darkTheme.text,
      textSecondary: darkTheme.textSecondary,
      subtext: darkTheme.subtext,
      border: const Color(0xFF1E1E1E),
      error: darkTheme.error,
      success: darkTheme.success,
      warning: darkTheme.warning,
      icon: darkTheme.icon,
      tabBar: Colors.black,
      tabBarBorder: const Color(0xFF181818),
      searchBg: const Color(0xFF101010),
      modalBg: const Color(0xFF080808),
    );
  }
}
