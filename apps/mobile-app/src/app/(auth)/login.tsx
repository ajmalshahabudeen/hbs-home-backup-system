import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useServer } from '../../context/ServerContext';
import { LanScannerModal } from '../../components/LanScannerModal';

export default function LoginScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { signIn, signInWithGoogle, isLoading } = useAuth();
  const { serverUrl, isConnected } = useServer();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);

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

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setGoogleLoading(true);
    const res = await signInWithGoogle();
    setGoogleLoading(false);
    if (res.success) {
      router.replace('/(tabs)/photos');
    } else if (res.error) {
      setErrorMsg(res.error);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
      >
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../../../assets/images/HBS_Logo_transparent.png')}
              style={styles.logoImage}
              contentFit="contain"
              transition={300}
            />
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
            disabled={isLoading || googleLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textSecondary }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Google Sign In Button */}
          <TouchableOpacity
            style={[
              styles.googleBtn,
              { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
            ]}
            onPress={handleGoogleSignIn}
            disabled={isLoading || googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#EA4335" />
                <Text style={[styles.googleBtnText, { color: colors.text }]}>
                  Continue with Google
                </Text>
              </>
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
    marginBottom: 20,
  },
  logoContainer: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoImage: {
    width: 68,
    height: 68,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  subTitle: {
    fontSize: 13,
    marginTop: 2,
  },
  serverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginBottom: 16,
  },
  serverText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  form: {
    gap: 10,
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
    fontSize: 13,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  submitBtn: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '700',
  },
  googleBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  linkText: {
    fontWeight: '700',
  },
});
