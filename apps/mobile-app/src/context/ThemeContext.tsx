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
  createAmoledTheme,
} from '../constants/theme';

interface ThemeContextType {
  themeMode: ThemeMode;
  paletteKey: PaletteKey;
  isDark: boolean;
  isAmoled: boolean;
  amoledDark: boolean;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
  setPaletteKey: (key: PaletteKey) => void;
  setAmoledDark: (val: boolean) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'hbs_app_theme_mode';
const PALETTE_STORAGE_KEY = 'hbs_app_color_palette';
const AMOLED_STORAGE_KEY = 'hbs_app_amoled_dark';

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  paletteKey: 'amber',
  isDark: false,
  isAmoled: false,
  amoledDark: false,
  colors: GooglePalette.light,
  setThemeMode: () => {},
  setPaletteKey: () => {},
  setAmoledDark: () => {},
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [paletteKey, setPaletteKeyState] = useState<PaletteKey>('amber');
  const [amoledDark, setAmoledDarkState] = useState<boolean>(false);

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

    appStorage.getItem(AMOLED_STORAGE_KEY).then((stored) => {
      if (stored !== null) {
        setAmoledDarkState(JSON.parse(stored));
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

  const setAmoledDark = (val: boolean) => {
    setAmoledDarkState(val);
    appStorage.setItem(AMOLED_STORAGE_KEY, JSON.stringify(val)).catch(() => {});
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

  const isAmoled = isDark && amoledDark;

  const activePreset = ColorPalettes[paletteKey] || ColorPalettes.amber;
  const colors = isDark
    ? isAmoled
      ? createAmoledTheme(activePreset.dark)
      : activePreset.dark
    : activePreset.light;

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
        isAmoled,
        amoledDark,
        colors,
        setThemeMode,
        setPaletteKey,
        setAmoledDark,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(ThemeContext);
export const useTheme = useAppTheme;
