import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { GlassCard } from './ui/GlassCard';
import { safeMediaLibrary } from '../utils/safeMediaLibrary';

interface FolderSelectorModalProps {
  visible: boolean;
  selectedAlbums?: string[];
  onSave?: (albums: string[]) => void;
  onClose: () => void;
}

interface AlbumItem {
  id: string;
  title: string;
  assetCount: number;
}

export const FolderSelectorModal: React.FC<FolderSelectorModalProps> = ({
  visible,
  selectedAlbums = [],
  onSave,
  onClose,
}) => {
  const { colors, isDark } = useAppTheme();
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadAlbums();
    }
  }, [visible]);

  const loadAlbums = async () => {
    setLoading(true);
    try {
      const { status } = await safeMediaLibrary.getPermissionsAsync();
      if (status !== 'granted') {
        const req = await safeMediaLibrary.requestPermissionsAsync();
        if (req.status !== 'granted') {
          setLoading(false);
          return;
        }
      }

      const formatted: AlbumItem[] = await safeMediaLibrary.getAlbumsAsync();
      setAlbums(formatted);

      const map: Record<string, boolean> = {};
      selectedAlbums.forEach((id) => {
        map[id] = true;
      });
      setSelectedMap(map);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const toggleAlbum = (albumId: string) => {
    setSelectedMap((prev) => ({
      ...prev,
      [albumId]: !prev[albumId],
    }));
  };

  const handleSave = () => {
    const activeIds = Object.keys(selectedMap).filter((id) => selectedMap[id]);
    if (onSave) {
      onSave(activeIds);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <GlassCard variant="gradient" style={styles.card}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]}>Auto-Sync Folder Manager</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Select albums to automatically sync to your server
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                  Reading camera roll albums...
                </Text>
              </View>
            ) : (
              <FlatList
                data={albums}
                keyExtractor={(item) => item.id}
                style={styles.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const isChecked = !!selectedMap[item.id];
                  return (
                    <TouchableOpacity
                      style={[
                        styles.albumRow,
                        {
                          backgroundColor: isChecked
                            ? isDark
                              ? 'rgba(59,130,246,0.15)'
                              : '#EFF6FF'
                            : isDark
                            ? 'rgba(255,255,255,0.03)'
                            : '#F8FAFC',
                          borderColor: isChecked ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => toggleAlbum(item.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isChecked ? 'folder-open' : 'folder-outline'}
                        size={22}
                        color={isChecked ? colors.primary : colors.textSecondary}
                      />
                      <View style={styles.albumInfo}>
                        <Text style={[styles.albumTitle, { color: colors.text }]}>{item.title}</Text>
                        <Text style={[styles.albumCount, { color: colors.textSecondary }]}>
                          {item.assetCount} items
                        </Text>
                      </View>
                      <Ionicons
                        name={isChecked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isChecked ? colors.primary : colors.textSecondary}
                      />
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
              >
                <Text style={styles.saveBtnText}>Save Folder Selection</Text>
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
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
  },
  card: {
    padding: 20,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
  },
  list: {
    marginVertical: 8,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  albumInfo: {
    flex: 1,
    marginLeft: 12,
  },
  albumTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  albumCount: {
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    marginTop: 12,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
