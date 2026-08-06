import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useServer, DiscoveredServer } from '../context/ServerContext';

interface LanScannerModalProps {
  visible: boolean;
  onClose: () => void;
}

export const LanScannerModal: React.FC<LanScannerModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors } = useAppTheme();
  const {
    serverUrl,
    setServerUrl,
    testConnection,
    scanLanSubnet,
    isScanning,
    scanProgress,
    discoveredServers,
    isConnected,
  } = useServer();

  const [inputUrl, setInputUrl] = useState<string>(serverUrl);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  const handleTestInputUrl = async () => {
    setIsTesting(true);
    setTestResult(null);
    const valid = await setServerUrl(inputUrl);
    setIsTesting(false);
    if (valid) {
      setTestResult('Success! Connected to server.');
    } else {
      setTestResult('Connection failed. Verify IP and port 38480.');
    }
  };

  const handleSelectDiscovered = async (server: DiscoveredServer) => {
    setInputUrl(server.url);
    const valid = await setServerUrl(server.url);
    if (valid) {
      setTestResult(`Connected to ${server.ip}!`);
      setTimeout(onClose, 800);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header Bar */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>

            <Text style={[styles.title, { color: colors.text }]}>LAN Server Scanner</Text>

            <View style={{ width: 40 }} />
          </View>

          <View style={styles.content}>
            {/* Status Card */}
            <View
              style={[
                styles.statusCard,
                {
                  backgroundColor: isConnected
                    ? colors.primaryContainer
                    : colors.surfaceVariant,
                  borderColor: isConnected ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons
                name={isConnected ? 'checkmark-circle' : 'alert-circle'}
                size={28}
                color={isConnected ? colors.success : colors.error}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.statusTitle, { color: colors.text }]}>
                  {isConnected ? 'Server Connected' : 'Server Disconnected'}
                </Text>
                <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
                  {serverUrl}
                </Text>
              </View>
            </View>

            {/* Manual IP Editor */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Server Address / IP
            </Text>

            <View style={[styles.inputRow, { backgroundColor: colors.searchBg }]}>
              <Ionicons name="wifi-outline" size={20} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="http://192.168.1.100:38480"
                placeholderTextColor={colors.textSecondary}
                value={inputUrl}
                onChangeText={setInputUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.testBtn, { backgroundColor: colors.primary }]}
                onPress={handleTestInputUrl}
                disabled={isTesting}
              >
                {isTesting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.testBtnText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>

            {testResult && (
              <Text
                style={[
                  styles.resultText,
                  { color: isConnected ? colors.success : colors.error },
                ]}
              >
                {testResult}
              </Text>
            )}

            {/* Subnet Auto-Scanner */}
            <View style={styles.scanHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
                Discovered Servers on LAN
              </Text>

              <TouchableOpacity
                style={[
                  styles.scanBtn,
                  { backgroundColor: isScanning ? colors.surfaceVariant : colors.primaryContainer },
                ]}
                onPress={() => scanLanSubnet()}
                disabled={isScanning}
              >
                {isScanning ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="scan-outline" size={16} color={colors.primary} />
                    <Text style={[styles.scanBtnText, { color: colors.primary }]}>
                      Scan LAN
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Progress bar when scanning */}
            {isScanning && (
              <View style={styles.progressContainer}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${(scanProgress.scanned / (scanProgress.total || 1)) * 100}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
                <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                  Scanning local subnet... ({scanProgress.scanned}/{scanProgress.total})
                </Text>
              </View>
            )}

            {/* Discovered List */}
            <FlatList
              data={discoveredServers}
              keyExtractor={(item) => item.url}
              style={{ marginTop: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.serverRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: item.url === serverUrl ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => handleSelectDiscovered(item)}
                >
                  <View style={[styles.serverIcon, { backgroundColor: colors.primaryContainer }]}>
                    <Ionicons name="server-outline" size={20} color={colors.primary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.serverHost, { color: colors.text }]}>{item.url}</Text>
                    <Text style={[styles.serverPing, { color: colors.textSecondary }]}>
                      Ping: {item.responseTimeMs}ms • Port 38480
                    </Text>
                  </View>

                  {item.url === serverUrl && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !isScanning ? (
                  <View style={styles.emptyScanContainer}>
                    <Ionicons name="search-outline" size={36} color={colors.textSecondary} />
                    <Text style={[styles.emptyScanText, { color: colors.textSecondary }]}>
                      Tap 'Scan LAN' to discover HBS servers on your Wi-Fi network.
                    </Text>
                  </View>
                ) : null
              }
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    marginBottom: 24,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusSub: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
    height: 48,
    borderRadius: 24,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
  testBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  testBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  resultText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 12,
  },
  scanHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 8,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  scanBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressContainer: {
    marginVertical: 10,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 6,
  },
  progressText: {
    fontSize: 12,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  serverIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serverHost: {
    fontSize: 15,
    fontWeight: '600',
  },
  serverPing: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyScanContainer: {
    alignItems: 'center',
    padding: 30,
  },
  emptyScanText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
});
