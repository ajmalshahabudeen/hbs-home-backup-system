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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
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
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
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
        await safeMediaLibrary.requestPermissionsAsync();
      }

      let fetched: AlbumItem[] = await safeMediaLibrary.getAlbumsAsync();
      if (!fetched || fetched.length === 0) {
        fetched = [
          { id: 'camera_roll', title: 'Camera Roll (All Photos)', assetCount: 0 },
          { id: 'screenshots', title: 'Screenshots', assetCount: 0 },
          { id: 'whatsapp', title: 'WhatsApp Media', assetCount: 0 },
        ];
      }

      setAlbums(fetched);

      const map: Record<string, boolean> = {};
      selectedAlbums.forEach((idOrTitle) => {
        map[idOrTitle] = true;
        const matchingAlbum = fetched.find(
          (a) => a.id === idOrTitle || a.title.toLowerCase() === idOrTitle.toLowerCase()
        );
        if (matchingAlbum) {
          map[matchingAlbum.id] = true;
        }
      });

      if (Object.keys(map).length === 0 && fetched.length > 0) {
        map[fetched[0].id] = true;
      }

      setSelectedMap(map);
    } catch {
      // Fallback empty
      setAlbums([]);
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

  // Fixed modal height — avoids flex:1 collapse inside maxHeight-only parents
  const sheetHeight = Math.min(winH * 0.78, 640);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              backgroundColor: colors.card || colors.background,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.title, { color: colors.text }]}>
                Auto-Sync Folders
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary || colors.subtext }]}>
                Select albums to automatically sync to your server
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary || colors.subtext }]}>
                Reading camera roll albums…
              </Text>
            </View>
          ) : (
            <FlatList
              data={albums}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.textSecondary || colors.subtext }]}>
                  No albums found. Grant media permission and try again.
                </Text>
              }
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
                            ? 'rgba(255,255,255,0.04)'
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
                      color={isChecked ? colors.primary : colors.textSecondary || colors.subtext}
                    />
                    <View style={styles.albumInfo}>
                      <Text style={[styles.albumTitle, { color: colors.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text
                        style={[
                          styles.albumCount,
                          { color: colors.textSecondary || colors.subtext },
                        ]}
                      >
                        {item.assetCount} items
                      </Text>
                    </View>
                    <Ionicons
                      name={isChecked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isChecked ? colors.primary : colors.textSecondary || colors.subtext}
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
  sheet: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 40,
    fontSize: 14,
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
    marginTop: 8,
    paddingTop: 4,
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
