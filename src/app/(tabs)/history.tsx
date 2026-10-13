import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';

type HistoryItem = {
  id: number;
  url: string;
  videoUrl: string;
  localUri: string;
  timestamp: string;
  caption: string;
  mediaType?: 'video' | 'image';
  fileCount?: number;
};

function formatDate(ts: string): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return ts;
  }
}

function shortenUrl(url: string, max = 44): string {
  try {
    const u = new URL(url);
    const s = u.hostname.replace('www.', '') + u.pathname;
    return s.length > max ? s.slice(0, max) + '…' : s;
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
}

function Thumbnail({ localUri, mediaType }: { localUri?: string; mediaType?: string }) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    if (!localUri) return;
    if (mediaType === 'image') {
      setThumbUri(localUri);
      return;
    }
    VideoThumbnails.getThumbnailAsync(localUri, { time: 0 })
      .then(({ uri }) => setThumbUri(uri))
      .catch(() => {});
  }, [localUri, mediaType]);

  if (thumbUri) {
    return (
      <View style={styles.thumb}>
        <Image source={{ uri: thumbUri }} style={styles.thumbImage} resizeMode="cover" />
        {mediaType !== 'image' && (
          <View style={styles.thumbPlayOverlay}>
            <Feather name="play" size={14} color="#FFFFFF" />
          </View>
        )}
        {mediaType === 'image' && (
          <View style={styles.thumbPlayOverlay}>
            <Feather name="image" size={12} color="#FFFFFF" />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.thumb}>
      <View style={styles.thumbPlayBg}>
        <Feather name={mediaType === 'image' ? 'image' : 'video'} size={22} color="#6C63FF" />
      </View>
    </View>
  );
}

function HistoryCard({
  item,
  onDelete,
}: {
  item: HistoryItem;
  onDelete: (id: number) => void;
}) {
  const showMenu = () => {
    Alert.alert('Options', shortenUrl(item.url), [
      {
        text: 'Delete from History',
        style: 'destructive',
        onPress: () => onDelete(item.id),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.card}>
      <Thumbnail localUri={item.localUri} mediaType={item.mediaType} />

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.author}>Social Media Video</Text>
        <Text style={styles.caption} numberOfLines={2}>
          {item.caption || shortenUrl(item.url)}
        </Text>
        <View style={styles.metaRow}>
          <Feather name="clock" size={11} color="#555" />
          <Text style={styles.dateText}>{formatDate(item.timestamp)}</Text>
        </View>
      </View>

      {/* Three-dot menu */}
      <TouchableOpacity style={styles.menuBtn} onPress={showMenu} hitSlop={8}>
        <Feather name="more-vertical" size={18} color="#555555" />
      </TouchableOpacity>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconCircle}>
        <Feather name="download" size={40} color="#2D2B55" />
      </View>
      <Text style={styles.emptyTitle}>No downloads yet</Text>
      <Text style={styles.emptySub}>
        Media you download will appear here. Go to the Download tab to get started.
      </Text>
    </View>
  );
}

export default function HistoryScreen() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    const raw = await AsyncStorage.getItem('download_history');
    setHistory(raw ? JSON.parse(raw) : []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const deleteItem = useCallback(
    async (id: number) => {
      const updated = history.filter((h) => h.id !== id);
      setHistory(updated);
      await AsyncStorage.setItem('download_history', JSON.stringify(updated));
    },
    [history]
  );

  const clearAll = () => {
    if (history.length === 0) return;
    Alert.alert('Clear All', 'Remove all download history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          setHistory([]);
          await AsyncStorage.removeItem('download_history');
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {history.length > 0 && (
        <View style={styles.topBar}>
          <Text style={styles.countText}>
            {history.length} {history.length === 1 ? 'item' : 'items'}
          </Text>
          <TouchableOpacity onPress={clearAll} style={styles.clearAllBtn}>
            <Feather name="trash-2" size={14} color="#FF6B6B" />
            <Text style={styles.clearAllText}>Clear All</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={history}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <HistoryCard item={item} onDelete={deleteItem} />
        )}
        contentContainerStyle={[
          styles.listContent,
          history.length === 0 && styles.listEmpty,
        ]}
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6C63FF"
            colors={['#6C63FF']}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  countText: { color: '#888', fontSize: 13 },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    padding: 4,
  },
  clearAllText: { color: '#FF6B6B', fontSize: 13, fontWeight: '600' },

  listContent: { padding: 16, paddingBottom: 48 },
  listEmpty: { flexGrow: 1 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2D2B55',
  },

  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#2D2B55',
    overflow: 'hidden',
  },
  thumbPlayBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2D2B55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  thumbPlayOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(108, 99, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  info: { flex: 1, justifyContent: 'center', gap: 4 },
  author: {
    color: '#A29BFE',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  caption: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateText: { color: '#555555', fontSize: 11 },

  menuBtn: {
    padding: 6,
    marginLeft: 4,
  },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2D2B55',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  emptySub: {
    color: '#555555',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
});
