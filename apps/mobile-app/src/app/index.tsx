import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { LanScannerModal } from '../components/LanScannerModal';

export default function SplashScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isConnected, isChecking, serverUrl, scanLanSubnet, isScanning } = useServer();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [showScanner, setShowScanner] = useState<boolean>(false);

  useEffect(() => {
    if (!isChecking && !isScanning && !isAuthLoading) {
      const timer = setTimeout(() => {
        if (isConnected && isAuthenticated) {
          router.replace('/(tabs)/photos');
        } else if (isConnected && !isAuthenticated) {
          router.replace('/(auth)/login');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isConnected, isAuthenticated, isChecking, isScanning, isAuthLoading, router]);

  const handleAutoScan = async () => {
    setShowScanner(true);
    await scanLanSubnet();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Brand Splash Content */}
      <View style={styles.brandBox}>
        <View style={[styles.logoBadge, { backgroundColor: colors.primaryContainer }]}>
          <Ionicons name="cloud-upload" size={54} color={colors.primary} />
        </View>

        <Text style={[styles.brandTitle, { color: colors.text }]}>HBS Cloud</Text>
        <Text style={[styles.brandSub, { color: colors.textSecondary }]}>
          Home Backup & Media Server
        </Text>

        {(isChecking || isAuthLoading || isScanning) && (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              {isScanning ? 'Scanning LAN for HBS server...' : 'Connecting to home server...'}
            </Text>
          </View>
        )}
      </View>

      {/* Offline / Server Config Section */}
      {!isChecking && !isScanning && !isConnected && (
        <View style={styles.bottomBox}>
          <View
            style={[
              styles.offlineCard,
              { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
            ]}
          >
            <Ionicons name="wifi-outline" size={24} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.offlineTitle, { color: colors.text }]}>
                Server Unreachable
              </Text>
              <Text style={[styles.offlineSub, { color: colors.textSecondary }]}>
                {serverUrl}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleAutoScan}
          >
            <Ionicons name="scan-outline" size={20} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Scan LAN for Server IP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => setShowScanner(true)}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
              Edit Server IP / URL
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* LAN Scanner Modal */}
      <LanScannerModal visible={showScanner} onClose={() => setShowScanner(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
  },
  brandBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBadge: {
    width: 100,
    height: 100,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 15,
    marginTop: 6,
  },
  loaderBox: {
    marginTop: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    marginTop: 12,
  },
  bottomBox: {
    gap: 12,
    marginBottom: 20,
  },
  offlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  offlineTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  offlineSub: {
    fontSize: 12,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
