import 'react-native-gesture-handler';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useAppTheme } from '../context/ThemeContext';
import { ServerProvider } from '../context/ServerContext';
import { AuthProvider } from '../context/AuthContext';
import { PermissionChecker } from '../components/PermissionChecker';

SplashScreen.preventAutoHideAsync().catch(() => {});

function AppContent() {
  const { colors, isDark } = useAppTheme();

  return (
    <GestureHandlerRootView style={[styles.flex, { backgroundColor: colors.background }]}>
      <SafeAreaProvider>
        <ServerProvider>
          <AuthProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <PermissionChecker />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)/login" />
              <Stack.Screen name="(auth)/register" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </AuthProvider>
        </ServerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope: Manrope_400Regular,
    Manrope_Regular: Manrope_400Regular,
    Manrope_Medium: Manrope_500Medium,
    Manrope_SemiBold: Manrope_600SemiBold,
    Manrope_Bold: Manrope_700Bold,
    Manrope_ExtraBold: Manrope_800ExtraBold,
  });

  React.useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
