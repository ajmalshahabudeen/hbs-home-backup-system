import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useServer } from '../../context/ServerContext';
import { LanScannerModal } from '../../components/LanScannerModal';

export default function LoginScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { signIn, isLoading } = useAuth();
  const { serverUrl, isConnected } = useServer();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setErrorMsg('Please enter email and password.');
      return;
    }
    setErrorMsg(null);
    const res = await signIn(email.trim(), password);
    if (res.success) {
      router.replace('/(tabs)/photos');
    } else {
      setErrorMsg(res.error || 'Sign in failed. Check credentials.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
      >
        {/* Brand Bar */}
        <View style={styles.brandHeader}>
          <View style={[styles.logoBadge, { backgroundColor: colors.primaryContainer }]}>
            <Ionicons name="cloud-upload" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Sign in to HBS</Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            Access your private home cloud photos & drive
          </Text>
        </View>

        {/* Server Connection Banner */}
        <TouchableOpacity
          style={[
            styles.serverBanner,
            {
              backgroundColor: isConnected ? colors.primaryContainer : colors.error + '15',
              borderColor: isConnected ? colors.primary : colors.error,
            },
          ]}
          onPress={() => setShowScannerModal(true)}
        >
          <Ionicons
            name={isConnected ? 'server-outline' : 'warning-outline'}
            size={18}
            color={isConnected ? colors.primary : colors.error}
          />
          <Text
            style={[
              styles.serverText,
              { color: isConnected ? colors.primary : colors.error },
            ]}
            numberOfLines={1}
          >
            {isConnected ? `Connected: ${serverUrl}` : 'Server Offline - Change IP'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Input Form */}
        <View style={styles.form}>
          {errorMsg && (
            <View style={[styles.errorBox, { backgroundColor: colors.error + '20' }]}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{errorMsg}</Text>
            </View>
          )}

          <Text style={[styles.label, { color: colors.text }]}>Email Address</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.searchBg }]}>
            <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="user@example.com"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Password</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.searchBg }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="••••••••"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            onPress={handleSignIn}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Text style={{ color: colors.textSecondary }}>Don't have an account?</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={[styles.linkText, { color: colors.primary }]}> Create Account</Text>
            </TouchableOpacity>
          </View>
        </View>

        <LanScannerModal
          visible={showScannerModal}
          onClose={() => setShowScannerModal(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
  },
  subTitle: {
    fontSize: 14,
    marginTop: 4,
  },
  serverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginBottom: 24,
  },
  serverText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  form: {
    gap: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  submitBtn: {
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  linkText: {
    fontWeight: '700',
  },
});
