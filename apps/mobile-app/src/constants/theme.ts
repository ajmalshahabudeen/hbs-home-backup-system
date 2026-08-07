import { Platform } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  primary: string;
  primaryContainer: string;
  onPrimary: string;
  onPrimaryContainer: string;
  secondary: string;
  secondaryContainer: string;
  background: string;
  surface: string;
  surfaceVariant: string;
  card: string;
  text: string;
  textSecondary: string;
  subtext: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  icon: string;
  tabBar: string;
  tabBarBorder: string;
  searchBg: string;
  modalBg: string;
}

export const GooglePalette: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    primary: '#1A73E8', // Google Blue
    primaryContainer: '#E8F0FE',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#174EA6',
    secondary: '#3C4043',
    secondaryContainer: '#F1F3F4',
    background: '#FFFFFF',
    surface: '#F8F9FA',
    surfaceVariant: '#E8EAED',
    card: '#FFFFFF',
    text: '#202124',
    textSecondary: '#5F6368',
    subtext: '#5F6368',
    border: '#DADCE0',
    error: '#D93025',
    success: '#188038',
    warning: '#F9AB00',
    icon: '#5F6368',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E0E0E0',
    searchBg: '#F1F3F4',
    modalBg: '#FFFFFF',
  },
  dark: {
    primary: '#8AB4F8', // Light Google Blue for Dark Mode
    primaryContainer: '#1E3A5F',
    onPrimary: '#202124',
    onPrimaryContainer: '#D2E3FC',
    secondary: '#E8EAED',
    secondaryContainer: '#303134',
    background: '#121212', // Google Dark background
    surface: '#1E1E1E',
    surfaceVariant: '#2D2E30',
    card: '#1E1E1E',
    text: '#E8EAED',
    textSecondary: '#9AA0A6',
    subtext: '#9AA0A6',
    border: '#3C4043',
    error: '#F28B82',
    success: '#81C995',
    warning: '#FDE293',
    icon: '#9AA0A6',
    tabBar: '#1E1E1E',
    tabBarBorder: '#2D2E30',
    searchBg: '#2D2E30',
    modalBg: '#1E1E1E',
  },
};

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'monospace',
  },
});
