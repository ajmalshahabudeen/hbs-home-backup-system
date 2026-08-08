import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { hbsApi, PhotoMediaItem } from '../services/api';
import { safeMediaLibrary } from '../utils/safeMediaLibrary';
import { useMediaStore } from '../stores/useMediaStore';
import { useDriveStore } from '../stores/useDriveStore';
import { PhotoGrid } from '../components/PhotoGrid';
import { MediaViewerModal } from '../components/MediaViewerModal';
import { asyncTaskQueue } from '../utils/asyncTaskQueue';

export default function SearchScreen() {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();
  const { serverUrl } = useServer();
  const { sessionToken } = useAuth();
  const {
    mediaList,
    setMediaList,
    loading,
    setLoading,
    loadFromCache,
  } = useMediaStore();
  const { files } = useDriveStore();

  const [query, setQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMedia, setSelectedMedia] = useState<PhotoMediaItem | null>(null);

  const inputRef = useRef<TextInput | null>(null);
  const isMounted = useRef<boolean>(true);

  useEffect(() => {
    isMounted.current = true;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
    return () => {
      isMounted.current = false;
      clearTimeout(timer);
      asyncTaskQueue.cancel('fetch_search_media_task');
    };
  }, []);

  const fetchPhotos = useCallback(async () => {
    if (mediaList.length === 0) {
      await loadFromCache();
    }
    setLoading(true);

    asyncTaskQueue.enqueue(
      async (abortSignal) => {
        try {
          let perm = await safeMediaLibrary.getPermissionsAsync();
          if (!perm.granted) {
            const req = await safeMediaLibrary.requestPermissionsAsync();
            perm = req;
          }
          if (abortSignal.isCancelled || !isMounted.current) return;

          if (!perm.granted) {
            setLoading(false);
            return;
          }

          // Device First: Fetch local device photos
          const localAssets = await safeMediaLibrary.getAssetsAsync({ first: 50000 });
          if (abortSignal.isCancelled || !isMounted.current) return;

          const localMediaItems: PhotoMediaItem[] = new Array(localAssets.length);
          for (let i = 0; i < localAssets.length; i++) {
            const asset = localAssets[i];
            localMediaItems[i] = {
              id: `local_${asset.id}`,
              userId: 'local',
              path: asset.filename,
              name: asset.filename,
              parentPath: '',
              mimeType: asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
              size: 0,
              createdAt: new Date(asset.creationTime).toISOString(),
              updatedAt: new Date(asset.creationTime).toISOString(),
              isVideo: asset.mediaType === 'video',
              url: asset.uri,
              localUri: asset.uri,
              isLocalOnly: true,
              isBackedUp: false,
            };
          }

          localMediaItems.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

          if (!abortSignal.isCancelled && isMounted.current) {
            setMediaList(localMediaItems);
            setLoading(false);
          }

          // Asynchronous Cloud Sync: Fetch server photos
          if (serverUrl && sessionToken) {
            try {
              const res = await hbsApi.getPhotos(serverUrl, sessionToken, 'all');
              if (abortSignal.isCancelled || !isMounted.current) return;

              const serverMedia = (res.media || [])
                .filter((m) => !m.name.includes('.hbs-thumb') && !m.path.includes('.hbs-thumb'))
                .map((m) => ({
                  ...m,
                  isBackedUp: true,
                  isLocalOnly: false,
                }));

              const localMap = new Map<string, number>();
              localMediaItems.forEach((m, idx) => {
                localMap.set(m.name.toLowerCase(), idx);
              });

              const mergedList: PhotoMediaItem[] = [...localMediaItems];

              serverMedia.forEach((sItem) => {
                const localIdx = localMap.get(sItem.name.toLowerCase());
                if (localIdx !== undefined) {
                  mergedList[localIdx].isBackedUp = true;
                  mergedList[localIdx].id = sItem.id;
                  mergedList[localIdx].url = sItem.url;
                } else {
                  mergedList.push(sItem);
                }
              });

              mergedList.sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );

              if (!abortSignal.isCancelled && isMounted.current) {
                setMediaList(mergedList);
              }
            } catch {
              // Server offline or unreachable
            }
          }
        } catch {
          // fallback
        } finally {
          if (isMounted.current) {
            setLoading(false);
          }
        }
      },
      { id: 'fetch_search_media_task', priority: 'high' }
    );
  }, [serverUrl, sessionToken, mediaList.length, loadFromCache, setMediaList, setLoading]);

  useEffect(() => {
    if (mediaList.length === 0) {
      fetchPhotos();
    }
  }, [mediaList.length, fetchPhotos]);

  const handleUploadItemToServer = async (item: PhotoMediaItem) => {
    if (!item.url) return;
    try {
      const mime = item.mimeType || (item.isVideo ? 'video/mp4' : 'image/jpeg');
      await hbsApi.uploadFile(serverUrl, sessionToken, item.url, item.name, mime, '');
      Alert.alert('Backed Up', `${item.name} uploaded to server.`);
      setSelectedMedia(null);
      fetchPhotos();
    } catch (e) {
      Alert.alert('Upload Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleSaveToDevice = async (item: PhotoMediaItem) => {
    try {
      await hbsApi.downloadFileToDevice(serverUrl, sessionToken, item.path, item.name);
      Alert.alert('Saved', `${item.name} saved to device.`);
    } catch (e) {
      Alert.alert('Save Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleDeleteMedia = async (item: PhotoMediaItem) => {
    try {
      await hbsApi.deleteFile(serverUrl, sessionToken, item.id);
      fetchPhotos();
    } catch {
      // ignore
    }
  };

  const filteredMedia = mediaList.filter((item) => {
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (selectedCategory === 'image') return !item.isVideo;
    if (selectedCategory === 'video') return item.isVideo;
    if (selectedCategory === 'folder' || selectedCategory === 'document') return false;
    return true;
  });

  const filteredFiles = files.filter((item) => {
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (selectedCategory === 'folder') return item.isDir;
    if (selectedCategory === 'document') return !item.isDir;
    if (selectedCategory === 'image' || selectedCategory === 'video') return false;
    return true;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Search Bar Header */}
      <View style={[styles.searchHeader, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={[styles.searchInputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={17} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search photos, videos, drive files..."
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category Pills Bar */}
      <View style={styles.categoriesBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContent}>
          {[
            { id: 'all', label: 'All Results' },
            { id: 'image', label: 'Photos' },
            { id: 'video', label: 'Videos' },
            { id: 'folder', label: 'Folders' },
            { id: 'document', label: 'Documents' },
          ].map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: selectedCategory === cat.id ? colors.primary : (isDark ? 'rgba(255,255,255,0.08)' : colors.surfaceVariant),
                  borderColor: selectedCategory === cat.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedCategory(cat.id)}
              activeOpacity={0.75}
            >
              <Text style={[styles.categoryChipText, { color: selectedCategory === cat.id ? '#FFFFFF' : colors.text }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {!query ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <Text style={[styles.suggestionHeader, { color: colors.text }]}>Quick Search</Text>
          <View style={styles.suggestionsGrid}>
            {[
              { label: 'Photos', icon: 'image-outline', cat: 'image' },
              { label: 'Videos', icon: 'film-outline', cat: 'video' },
              { label: 'Folders', icon: 'folder-outline', cat: 'folder' },
              { label: 'Documents', icon: 'document-text-outline', cat: 'document' },
            ].map((sug) => (
              <TouchableOpacity
                key={sug.cat}
                style={[styles.suggestionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setSelectedCategory(sug.cat)}
                activeOpacity={0.8}
              >
                <Ionicons name={sug.icon as any} size={22} color={colors.primary} />
                <Text style={[styles.sugLabel, { color: colors.text }]}>{sug.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {filteredFiles.length > 0 && (
            <View style={styles.filesSectionContainer}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Folders & Files ({filteredFiles.length})</Text>
              <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                {filteredFiles.map((file) => (
                  <TouchableOpacity
                    key={file.id}
                    style={[styles.fileRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    activeOpacity={0.75}
                    onPress={() => { if (file.isDir) router.push('/(tabs)/drive'); }}
                  >
                    <Ionicons name={file.isDir ? 'folder' : 'document-text'} size={24} color={file.isDir ? '#FFB703' : colors.primary} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{file.name}</Text>
                      <Text style={[styles.filePath, { color: colors.textSecondary }]} numberOfLines={1}>{file.parentPath || 'Root Folder'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* High-Performance Edge-to-Edge Virtualized Media Grid from photos.tsx */}
          <View style={{ flex: 1 }}>
            <PhotoGrid
              media={filteredMedia}
              onSelectMedia={(item) => setSelectedMedia(item)}
              onRefresh={fetchPhotos}
              refreshing={loading && filteredMedia.length > 0}
              loading={loading && filteredMedia.length === 0}
            />
          </View>
        </View>
      )}

      {/* Media Viewer Modal from photos.tsx with Full Actions */}
      <MediaViewerModal
        visible={!!selectedMedia}
        media={selectedMedia}
        mediaList={filteredMedia}
        onClose={() => setSelectedMedia(null)}
        onDelete={handleDeleteMedia}
        onUploadToServer={handleUploadItemToServer}
        onSaveToDevice={handleSaveToDevice}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12, borderBottomWidth: 1 },
  backBtn: { padding: 6 },
  searchInputBox: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 22, paddingHorizontal: 14, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  categoriesBar: { paddingVertical: 8 },
  categoriesContent: { paddingHorizontal: 16, gap: 8 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, borderWidth: 1 },
  categoryChipText: { fontSize: 12, fontWeight: '600' },
  suggestionHeader: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  suggestionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  suggestionCard: { width: '48%', flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, gap: 12 },
  sugLabel: { fontSize: 13, fontWeight: '600' },
  filesSectionContainer: { marginTop: 4, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8 },
  fileRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 1, marginHorizontal: 16, marginBottom: 6 },
  fileName: { fontSize: 13, fontWeight: '600' },
  filePath: { fontSize: 11, marginTop: 1 },
});

