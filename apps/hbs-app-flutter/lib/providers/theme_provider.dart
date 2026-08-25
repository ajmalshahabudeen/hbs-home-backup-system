import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/theme/color_palettes.dart';
import '../services/storage_service.dart';

class ThemeState {
  final ThemeModeOption mode;
  final PaletteKey paletteKey;

  const ThemeState({
    this.mode = ThemeModeOption.dark,
    this.paletteKey = PaletteKey.amber,
  });

  ThemeState copyWith({
    ThemeModeOption? mode,
    PaletteKey? paletteKey,
  }) {
    return ThemeState(
      mode: mode ?? this.mode,
      paletteKey: paletteKey ?? this.paletteKey,
    );
  }
}

class ThemeNotifier extends StateNotifier<ThemeState> {
  ThemeNotifier() : super(const ThemeState()) {
    _loadFromStorage();
  }

  void _loadFromStorage() {
    final storage = StorageService();
    final modeStr = storage.getString('hbs_theme_mode', defaultValue: 'dark');
    final paletteStr = storage.getString('hbs_palette_key', defaultValue: 'amber');

    ThemeModeOption mode = ThemeModeOption.dark;
    if (modeStr == 'light') mode = ThemeModeOption.light;
    if (modeStr == 'amoled') mode = ThemeModeOption.amoled;
    if (modeStr == 'system') mode = ThemeModeOption.system;

    PaletteKey palette = PaletteKey.amber;
    for (final k in PaletteKey.values) {
      if (k.name == paletteStr) {
        palette = k;
        break;
      }
    }

    state = ThemeState(mode: mode, paletteKey: palette);
  }

  Future<void> setMode(ThemeModeOption mode) async {
    state = state.copyWith(mode: mode);
    await StorageService().setString('hbs_theme_mode', mode.name);
  }

  Future<void> toggleMode() async {
    final next = state.mode == ThemeModeOption.dark
        ? ThemeModeOption.light
        : (state.mode == ThemeModeOption.light ? ThemeModeOption.amoled : ThemeModeOption.dark);
    await setMode(next);
  }

  Future<void> setPalette(PaletteKey palette) async {
    state = state.copyWith(paletteKey: palette);
    await StorageService().setString('hbs_palette_key', palette.name);
  }
}

final themeProvider = StateNotifierProvider<ThemeNotifier, ThemeState>((ref) {
  return ThemeNotifier();
});
