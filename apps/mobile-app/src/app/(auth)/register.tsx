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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export default function RegisterScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { signUp, isLoading } = useAuth();

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setErrorMsg('Please fill all fields.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    setErrorMsg(null);
    const res = await signUp(name.trim(), email.trim(), password);
    if (res.success) {
      router.replace('/(tabs)/photos');
    } else {
      setErrorMsg(res.error || 'Registration failed.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            First user will automatically become admin
          </Text>
        </View>

        <View style={styles.form}>
          {errorMsg && (
            <View style={[styles.errorBox, { backgroundColor: colors.error + '20' }]}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{errorMsg}</Text>
            </View>
          )}

          <Text style={[styles.label, { color: colors.text }]}>Full Name</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.searchBg }]}>
            <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="John Doe"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
            />
          </View>

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
            />
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Password</Text>
          <View style={[styles.inputWrapper, { backgroundColor: colors.searchBg }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backBtn: {
    marginBottom: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subTitle: {
    fontSize: 14,
    marginTop: 4,
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
    marginTop: 16,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
