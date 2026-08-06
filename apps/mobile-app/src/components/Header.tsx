import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  title?: string;
  showSearch?: boolean;
  searchQuery?: string;
  onSearchChange?: (text: string) => void;
  onOpenServerScanner?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'HBS Cloud',
  showSearch = false,
  searchQuery = '',
  onSearchChange,
  onOpenServerScanner,
}) => {
  const { colors, isDark, toggleTheme } = useAppTheme();
  const { isConnected, serverUrl } = useServer();
  const { user } = useAuth();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.topRow}>
        <View style={styles.brandContainer}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primaryContainer }]}>
            <Ionicons name="cloud-upload" size={22} color={colors.primary} />
          </View>
          <Text style={[styles.brandTitle, { color: colors.text }]}>{title}</Text>
        </View>

        <View style={styles.rightActions}>
          {/* Server Connection Status Indicator */}
          <TouchableOpacity
            style={[
              styles.serverBadge,
              {
                backgroundColor: isConnected ? colors.primaryContainer : colors.error + '20',
                borderColor: isConnected ? colors.primary : colors.error,
              },
            ]}
            onPress={onOpenServerScanner}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? colors.success : colors.error },
              ]}
            />
            <Text
              style={[
                styles.serverText,
                { color: isConnected ? colors.primary : colors.error },
              ]}
              numberOfLines={1}
            >
              {isConnected ? 'LAN Server' : 'Offline'}
            </Text>
          </TouchableOpacity>

          {/* Light / Dark Theme Toggle Button */}
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={toggleTheme}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isDark ? 'sunny' : 'moon'}
              size={20}
              color={isDark ? '#FDE293' : colors.textSecondary}
            />
          </TouchableOpacity>

          {/* User Profile Avatar */}
          {user && (
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {(user.name || user.email || 'U')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  serverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    maxWidth: 120,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  serverText: {
    fontSize: 12,
    fontWeight: '600',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
