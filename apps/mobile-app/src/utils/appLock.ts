import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface DeviceSecurityStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  securityLabel: string;
  biometricType: 'face' | 'fingerprint' | 'iris' | 'pin_passcode' | 'none';
}

/**
 * Inspects device biometric and screen lock capabilities.
 */
export async function getDeviceSecurityStatus(): Promise<DeviceSecurityStatus> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let biometricType: DeviceSecurityStatus['biometricType'] = 'pin_passcode';
    let securityLabel = 'Screen Lock (PIN / Passcode)';

    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometricType = 'face';
      securityLabel = Platform.OS === 'ios' ? 'Face ID' : 'Facial Recognition / PIN';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricType = 'fingerprint';
      securityLabel = Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint / PIN';
    } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      biometricType = 'iris';
      securityLabel = 'Iris Recognition / PIN';
    } else if (!isEnrolled) {
      biometricType = 'none';
      securityLabel = 'No Screen Lock Set';
    }

    return {
      hasHardware,
      isEnrolled,
      supportedTypes,
      securityLabel,
      biometricType,
    };
  } catch (err) {
    console.warn('[appLock] Failed to get device security status:', err);
    return {
      hasHardware: false,
      isEnrolled: false,
      supportedTypes: [],
      securityLabel: 'Screen Lock',
      biometricType: 'pin_passcode',
    };
  }
}

/**
 * Triggers native system screen lock / biometric authentication.
 * Falls back to device passcode / PIN / pattern if biometrics are cancelled or fail.
 */
export async function authenticateWithScreenLock(
  promptMessage: string = 'Unlock HBS Cloud Drive & Photos'
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use Device PIN / Passcode',
      disableDeviceFallback: false,
    });

    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      error: result.error || 'Authentication cancelled or failed',
    };
  } catch (err: any) {
    console.warn('[appLock] Authentication error:', err);
    return {
      success: false,
      error: err?.message || 'Authentication error',
    };
  }
}
