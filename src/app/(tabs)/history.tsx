import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
  Animated,
  Share,
  ToastAndroid,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  author?: string;
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
            <Feather name="play" size={14} color="#E2E2E9" />
          </View>
        )}
        {mediaType === 'image' && (
          <View style={styles.thumbPlayOverlay}>
            <Feather name="image" size={12} color="#E2E2E9" />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.thumb}>
      <View style={styles.thumbPlayBg}>
        <Feather name={mediaType === 'image' ? 'image' : 'video'} size={22} color="#ADC6FF" />
      </View>
    </View>
  );
}

function notify(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}

function OptionsSheet({
  item,
  onClose,
  onDelete,
}: {
  item: HistoryItem | null;
  onClose: () => void;
  onDelete: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (item) {
      translateY.setValue(400);
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }
  }, [item, translateY]);

  if (!item) return null;

  const copyLink = async () => {
    onClose();
    await Clipboard.setStringAsync(item.url);
    notify('Link copied');
  };

  const shareLink = async () => {
    onClose();
    try {
      await Share.share({ message: item.url });
    } catch {}
  };

  const copyText = async () => {
    onClose();
    if (!item.caption) {
      notify('No text available');
      return;
    }
    await Clipboard.setStringAsync(item.caption);
    notify('Text copied');
  };

  const remove = () => {
    onClose();
    onDelete(item.id);
  };

  const options = [
    { icon: 'copy', label: 'Copy Link', onPress: copyLink },
    { icon: 'share-2', label: 'Share Link', onPress: shareLink },
    { icon: 'copy', label: 'Copy Text', onPress: copyText },
    { icon: 'trash-2', label: 'Delete', onPress: remove, danger: true },
  ] as const;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.sheetHandle} />
        {options.map((opt) => (
          <TouchableOpacity key={opt.label} style={styles.sheetRow} onPress={opt.onPress}>
            <Feather
              name={opt.icon}
              size={24}
              color={'danger' in opt ? '#FFB4AB' : '#E2E2E9'}
            />
            <Text style={styles.sheetLabel}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </Modal>
  );
}

function HistoryCard({
  item,
  onMenu,
}: {
  item: HistoryItem;
  onMenu: (item: HistoryItem) => void;
}) {
  const showMenu = () => onMenu(item);

  return (
    <View style={styles.card}>
      <Thumbnail localUri={item.localUri} mediaType={item.mediaType} />

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.author} numberOfLines={1}>{item.author || 'Instagram'}</Text>
        <Text style={styles.caption} numberOfLines={2}>
          {item.caption || shortenUrl(item.url)}
        </Text>
        <View style={styles.metaRow}>
          <Feather name="clock" size={11} color="#8E9099" />
          <Text style={styles.dateText}>{formatDate(item.timestamp)}</Text>
        </View>
      </View>

      {/* Three-dot menu */}
      <TouchableOpacity style={styles.menuBtn} onPress={showMenu} hitSlop={8}>
        <Feather name="more-vertical" size={18} color="#8E9099" />
      </TouchableOpacity>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconCircle}>
        <Feather name="download" size={40} color="#33353A" />
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
  const [menuItem, setMenuItem] = useState<HistoryItem | null>(null);

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
            <Feather name="trash-2" size={14} color="#FFB4AB" />
            <Text style={styles.clearAllText}>Clear All</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={history}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <HistoryCard item={item} onMenu={setMenuItem} />
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
            tintColor="#ADC6FF"
            colors={['#ADC6FF']}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      <OptionsSheet item={menuItem} onClose={() => setMenuItem(null)} onDelete={deleteItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111318' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1D2024',
  },
  countText: { color: '#C4C6D0', fontSize: 13 },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    padding: 4,
  },
  clearAllText: { color: '#FFB4AB', fontSize: 13, fontWeight: '600' },

  listContent: { padding: 16, paddingBottom: 48 },
  listEmpty: { flexGrow: 1 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282A2F',
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },

  thumb: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: '#111318',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  thumbPlayBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#33353A',
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  info: { flex: 1, justifyContent: 'center', gap: 4 },
  author: {
    color: '#C4C6D0',
    fontSize: 15,
    fontWeight: '500',
  },
  caption: {
    color: '#E2E2E9',
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateText: { color: '#8E9099', fontSize: 11 },

  menuBtn: {
    padding: 6,
    marginLeft: 4,
  },

  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1D2024',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8E9099',
    marginBottom: 12,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  sheetLabel: { color: '#E2E2E9', fontSize: 16 },

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
    backgroundColor: '#1D2024',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#33353A',
  },
  emptyTitle: {
    color: '#E2E2E9',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  emptySub: {
    color: '#8E9099',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
});
