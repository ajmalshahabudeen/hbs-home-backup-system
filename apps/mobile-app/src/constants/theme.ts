import { Platform } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';
export type PaletteKey = 'amber' | 'blue' | 'emerald' | 'violet' | 'rose';

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

export interface PalettePreset {
  id: PaletteKey;
  name: string;
  previewColor: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export const GooglePalette: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    primary: '#D97706', // Warm Vibrant Amber Yellow
    primaryContainer: '#FEF3C7',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#78350F',
    secondary: '#B45309',
    secondaryContainer: '#FFFBEB',
    background: '#FFFCF5',
    surface: '#FFF8E7',
    surfaceVariant: '#FDE68A',
    card: '#FFFFFF',
    text: '#1C1917',
    textSecondary: '#78350F',
    subtext: '#92400E',
    border: '#FCD34D',
    error: '#DC2626',
    success: '#16A34A',
    warning: '#F59E0B',
    icon: '#B45309',
    tabBar: '#FFFFFF',
    tabBarBorder: '#FDE68A',
    searchBg: '#FEF3C7',
    modalBg: '#FFFFFF',
  },
  dark: {
    primary: '#E5A100', // Deep Warm Golden Amber
    primaryContainer: '#382203',
    onPrimary: '#14120E',
    onPrimaryContainer: '#FCD34D',
    secondary: '#D97706',
    secondaryContainer: '#261F13',
    background: '#14120E', // Deep Warm Amber Charcoal
    surface: '#1C1914',
    surfaceVariant: '#26221B',
    card: '#1C1914',
    text: '#F3F4F6', // Soft warm white
    textSecondary: '#A1A1AA',
    subtext: '#9CA3AF',
    border: '#382A13',
    error: '#F87171',
    success: '#4ADE80',
    warning: '#F59E0B',
    icon: '#D97706',
    tabBar: '#1C1914',
    tabBarBorder: '#26221B',
    searchBg: '#26221B',
    modalBg: '#1C1914',
  },
};

export const ColorPalettes: Record<PaletteKey, PalettePreset> = {
  amber: {
    id: 'amber',
    name: 'Amber Gold',
    previewColor: '#D97706',
    light: GooglePalette.light,
    dark: GooglePalette.dark,
  },
  blue: {
    id: 'blue',
    name: 'Ocean Blue',
    previewColor: '#2563EB',
    light: {
      primary: '#2563EB',
      primaryContainer: '#DBEAFE',
      onPrimary: '#FFFFFF',
      onPrimaryContainer: '#1E3A8A',
      secondary: '#1D4ED8',
      secondaryContainer: '#EFF6FF',
      background: '#F8FAFC',
      surface: '#F1F5F9',
      surfaceVariant: '#E2E8F0',
      card: '#FFFFFF',
      text: '#0F172A',
      textSecondary: '#475569',
      subtext: '#64748B',
      border: '#CBD5E1',
      error: '#DC2626',
      success: '#16A34A',
      warning: '#F59E0B',
      icon: '#2563EB',
      tabBar: '#FFFFFF',
      tabBarBorder: '#E2E8F0',
      searchBg: '#EFF6FF',
      modalBg: '#FFFFFF',
    },
    dark: {
      primary: '#3B82F6',
      primaryContainer: '#172554',
      onPrimary: '#0F172A',
      onPrimaryContainer: '#93C5FD',
      secondary: '#60A5FA',
      secondaryContainer: '#1E293B',
      background: '#0F172A',
      surface: '#1E293B',
      surfaceVariant: '#334155',
      card: '#1E293B',
      text: '#F8FAFC',
      textSecondary: '#94A3B8',
      subtext: '#64748B',
      border: '#334155',
      error: '#F87171',
      success: '#4ADE80',
      warning: '#F59E0B',
      icon: '#3B82F6',
      tabBar: '#1E293B',
      tabBarBorder: '#334155',
      searchBg: '#334155',
      modalBg: '#1E293B',
    },
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Mint',
    previewColor: '#059669',
    light: {
      primary: '#059669',
      primaryContainer: '#D1FAE5',
      onPrimary: '#FFFFFF',
      onPrimaryContainer: '#064E3B',
      secondary: '#047857',
      secondaryContainer: '#ECFDF5',
      background: '#F7FDF9',
      surface: '#ECFDF5',
      surfaceVariant: '#A7F3D0',
      card: '#FFFFFF',
      text: '#064E3B',
      textSecondary: '#047857',
      subtext: '#059669',
      border: '#6EE7B7',
      error: '#DC2626',
      success: '#059669',
      warning: '#F59E0B',
      icon: '#059669',
      tabBar: '#FFFFFF',
      tabBarBorder: '#A7F3D0',
      searchBg: '#D1FAE5',
      modalBg: '#FFFFFF',
    },
    dark: {
      primary: '#10B981',
      primaryContainer: '#064E3B',
      onPrimary: '#061814',
      onPrimaryContainer: '#A7F3D0',
      secondary: '#34D399',
      secondaryContainer: '#0F2922',
      background: '#061814',
      surface: '#0F2922',
      surfaceVariant: '#1A3A31',
      card: '#0F2922',
      text: '#F0FDF4',
      textSecondary: '#A7F3D0',
      subtext: '#6EE7B7',
      border: '#1A3A31',
      error: '#F87171',
      success: '#34D399',
      warning: '#F59E0B',
      icon: '#10B981',
      tabBar: '#0F2922',
      tabBarBorder: '#1A3A31',
      searchBg: '#1A3A31',
      modalBg: '#0F2922',
    },
  },
  violet: {
    id: 'violet',
    name: 'Violet Plum',
    previewColor: '#7C3AED',
    light: {
      primary: '#7C3AED',
      primaryContainer: '#EDE9FE',
      onPrimary: '#FFFFFF',
      onPrimaryContainer: '#4C1D95',
      secondary: '#6D28D9',
      secondaryContainer: '#F5F3FF',
      background: '#FAF5FF',
      surface: '#F3E8FF',
      surfaceVariant: '#DDD6FE',
      card: '#FFFFFF',
      text: '#2E1065',
      textSecondary: '#5B21B6',
      subtext: '#7C3AED',
      border: '#C4B5FD',
      error: '#DC2626',
      success: '#16A34A',
      warning: '#F59E0B',
      icon: '#7C3AED',
      tabBar: '#FFFFFF',
      tabBarBorder: '#DDD6FE',
      searchBg: '#EDE9FE',
      modalBg: '#FFFFFF',
    },
    dark: {
      primary: '#8B5CF6',
      primaryContainer: '#2E1065',
      onPrimary: '#120E1E',
      onPrimaryContainer: '#DDD6FE',
      secondary: '#A78BFA',
      secondaryContainer: '#1C162E',
      background: '#120E1E',
      surface: '#1C162E',
      surfaceVariant: '#2A2142',
      card: '#1C162E',
      text: '#F5F3FF',
      textSecondary: '#C4B5FD',
      subtext: '#A78BFA',
      border: '#2A2142',
      error: '#F87171',
      success: '#4ADE80',
      warning: '#F59E0B',
      icon: '#8B5CF6',
      tabBar: '#1C162E',
      tabBarBorder: '#2A2142',
      searchBg: '#2A2142',
      modalBg: '#1C162E',
    },
  },
  rose: {
    id: 'rose',
    name: 'Rose Amber',
    previewColor: '#E11D48',
    light: {
      primary: '#E11D48',
      primaryContainer: '#FFE4E6',
      onPrimary: '#FFFFFF',
      onPrimaryContainer: '#881337',
      secondary: '#BE123C',
      secondaryContainer: '#FFF1F2',
      background: '#FFF5F5',
      surface: '#FFE4E6',
      surfaceVariant: '#FECDD3',
      card: '#FFFFFF',
      text: '#4C0519',
      textSecondary: '#9F1239',
      subtext: '#E11D48',
      border: '#FDA4AF',
      error: '#DC2626',
      success: '#16A34A',
      warning: '#F59E0B',
      icon: '#E11D48',
      tabBar: '#FFFFFF',
      tabBarBorder: '#FECDD3',
      searchBg: '#FFE4E6',
      modalBg: '#FFFFFF',
    },
    dark: {
      primary: '#F43F5E',
      primaryContainer: '#4C0519',
      onPrimary: '#180D11',
      onPrimaryContainer: '#FECDD3',
      secondary: '#FB7185',
      secondaryContainer: '#24141A',
      background: '#180D11',
      surface: '#24141A',
      surfaceVariant: '#361D26',
      card: '#24141A',
      text: '#FFF1F2',
      textSecondary: '#FDA4AF',
      subtext: '#FB7185',
      border: '#361D26',
      error: '#F87171',
      success: '#4ADE80',
      warning: '#F59E0B',
      icon: '#F43F5E',
      tabBar: '#24141A',
      tabBarBorder: '#361D26',
      searchBg: '#361D26',
      modalBg: '#24141A',
    },
  },
};

export const Colors = {
  light: {
    text: '#1C1917',
    background: '#FFFCF5',
    backgroundElement: '#FEF3C7',
    backgroundSelected: '#FDE68A',
    textSecondary: '#78350F',
  },
  dark: {
    text: '#F3F4F6',
    background: '#14120E',
    backgroundElement: '#1C1914',
    backgroundSelected: '#26221B',
    textSecondary: '#A1A1AA',
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
    sans: 'Manrope',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Manrope',
    mono: 'monospace',
  },
  web: {
    sans: 'Manrope, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'monospace',
  },
});
