import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Platform } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { NavigationBar } from 'expo-navigation-bar';
import { appStorage } from '../utils/storage';
import {
  ColorPalettes,
  GooglePalette,
  PaletteKey,
  ThemeColors,
  ThemeMode,
} from '../constants/theme';

interface ThemeContextType {
  themeMode: ThemeMode;
  paletteKey: PaletteKey;
  isDark: boolean;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
  setPaletteKey: (key: PaletteKey) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'hbs_app_theme_mode';
const PALETTE_STORAGE_KEY = 'hbs_app_color_palette';

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  paletteKey: 'amber',
  isDark: false,
  colors: GooglePalette.light,
  setThemeMode: () => {},
  setPaletteKey: () => {},
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [paletteKey, setPaletteKeyState] = useState<PaletteKey>('amber');

  useEffect(() => {
    appStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemeModeState(stored);
      }
    }).catch(() => {});

    appStorage.getItem(PALETTE_STORAGE_KEY).then((stored) => {
      if (stored && stored in ColorPalettes) {
        setPaletteKeyState(stored as PaletteKey);
      }
    }).catch(() => {});
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    appStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  };

  const setPaletteKey = (key: PaletteKey) => {
    setPaletteKeyState(key);
    appStorage.setItem(PALETTE_STORAGE_KEY, key).catch(() => {});
  };

  const toggleTheme = () => {
    if (themeMode === 'light') {
      setThemeMode('dark');
    } else if (themeMode === 'dark') {
      setThemeMode('system');
    } else {
      setThemeMode('light');
    }
  };

  const isDark =
    themeMode === 'dark' || (themeMode === 'system' && systemScheme === 'dark');

  const activePreset = ColorPalettes[paletteKey] || ColorPalettes.amber;
  const colors = isDark ? activePreset.dark : activePreset.light;

  // Dynamically synchronize OS System UI & Android NavigationBar with active theme
  useEffect(() => {
    try {
      SystemUI.setBackgroundColorAsync(colors.background);
    } catch {
      // ignore
    }

    if (Platform.OS === 'android') {
      try {
        NavigationBar.setStyle(isDark ? 'light' : 'dark');
      } catch {
        // ignore
      }
    }
  }, [colors.background, isDark]);

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        paletteKey,
        isDark,
        colors,
        setThemeMode,
        setPaletteKey,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(ThemeContext);
export const useTheme = useAppTheme;
