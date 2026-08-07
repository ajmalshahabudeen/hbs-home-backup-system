import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { GlassCard } from './ui/GlassCard';
import { openSystemAppSettings } from '../utils/permissions';

interface PermissionModalProps {
  visible: boolean;
  type: 'media' | 'notification' | 'notifications' | 'background';
  onClose: () => void;
  onRequestPermission: () => void;
  canAskAgain?: boolean;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  visible,
  type,
  onClose,
  onRequestPermission,
  canAskAgain = true,
}) => {
  const { colors, isDark } = useAppTheme();

  const getDetails = () => {
    switch (type) {
      case 'media':
        return {
          icon: 'images-outline' as const,
          title: 'Photo Library Access',
          description:
            'HBS needs access to your photo library so you can select and back up your family photos and videos securely to your personal home server.',
        };
      case 'notification':
      case 'notifications':
        return {
          icon: 'notifications-outline' as const,
          title: 'Push Notifications',
          description:
            'Enable notifications to receive instant alerts when your background photos auto-sync finishes or if a sync requires your attention.',
        };
      case 'background':
        return {
          icon: 'sync-outline' as const,
          title: 'Background Sync',
          description:
            'Allow background fetch so HBS can automatically upload new camera roll photos seamlessly without opening the app.',
        };
    }
  };

  const details = getDetails();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <GlassCard variant="gradient" style={styles.card}>
            <View style={styles.header}>
              <View style={[styles.iconWrapper, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF' }]}>
                <Ionicons name={details.icon} size={32} color="#3B82F6" />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>{details.title}</Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>{details.description}</Text>
            </View>

            <View style={styles.actions}>
              {canAskAgain ? (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    onRequestPermission();
                    onClose();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>Allow Access</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    await openSystemAppSettings();
                    onClose();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>Open System Settings</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.border }]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Not Now</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 400,
  },
  card: {
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  actions: {
    gap: 10,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
