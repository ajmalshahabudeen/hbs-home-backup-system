import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAppTheme } from '../context/ThemeContext';
import { useMediaStore } from '../stores/useMediaStore';
import { useDriveStore } from '../stores/useDriveStore';
import { PhotoMediaItem } from '../services/api';
import { MediaViewerModal } from '../components/MediaViewerModal';

const windowWidth = Dimensions.get('window').width;
const GAP = 1;
const COLUMNS = 3;
const ITEM_SIZE = (windowWidth - (COLUMNS - 1) * GAP) / COLUMNS;

export default function SearchScreen() {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();
  const { mediaList } = useMediaStore();
  const { files } = useDriveStore();

  const [query, setQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMedia, setSelectedMedia] = useState<PhotoMediaItem | null>(null);

  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {filteredFiles.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Folders & Files ({filteredFiles.length})</Text>
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
            </View>
          )}

          {filteredMedia.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Media ({filteredMedia.length})</Text>
              <View style={styles.mediaGrid}>
                {filteredMedia.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.mediaCard, { width: ITEM_SIZE, height: ITEM_SIZE, backgroundColor: colors.surfaceVariant }]}
                    activeOpacity={0.85}
                    onPress={() => setSelectedMedia(item)}
                  >
                    <Image source={{ uri: item.localUri || item.thumbUrl || item.url }} style={styles.mediaThumb} contentFit="cover" cachePolicy="memory-disk" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      <MediaViewerModal visible={!!selectedMedia} media={selectedMedia} mediaList={filteredMedia} onClose={() => setSelectedMedia(null)} />
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
  sectionContainer: { marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 16, marginBottom: 10 },
  fileRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, marginHorizontal: 16, marginBottom: 8 },
  fileName: { fontSize: 14, fontWeight: '600' },
  filePath: { fontSize: 11, marginTop: 2 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  mediaCard: { overflow: 'hidden', position: 'relative' },
  mediaThumb: { width: '100%', height: '100%' },
});
