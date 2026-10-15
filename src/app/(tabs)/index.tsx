import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Dimensions,
  AppState,
  Modal,
  Pressable,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_KEY, API_HOST, API_ENDPOINT } from '../../constants/config';
import { extractInstagramUrl, fetchPostInfo, type PostInfo } from '../../utils/instagram';

const { width } = Dimensions.get('window');
const TILE_SIZE = Math.floor((width - 32 - 16) / 3);
const LAST_AUTO_LINK_KEY = 'last_auto_link';

type DownloadState = 'idle' | 'fetching' | 'downloading' | 'done';

type MediaItem = { url: string; thumbnail: string; isVideo: boolean };

function guessIsVideo(url: string): boolean {
  return url.includes('.mp4') || url.includes('video') || url.includes('mp4');
}

async function fetchMediaItems(url: string): Promise<MediaItem[]> {
  const res = await fetch(`${API_ENDPOINT}?url=${encodeURIComponent(url.trim())}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-rapidapi-host': API_HOST,
      'x-rapidapi-key': API_KEY,
    },
  });
  const data = await res.json();

  const items: MediaItem[] = [];
  const addUrl = (u: string) =>
    items.push({ url: u, thumbnail: guessIsVideo(u) ? '' : u, isVideo: guessIsVideo(u) });

  if (Array.isArray(data?.media)) {
    data.media.forEach((m: any) => {
      if (!m?.url) return;
      // The API's "type" is reliable; its video URLs don't always contain ".mp4"
      const isVideo = m.type ? m.type === 'video' : guessIsVideo(m.url);
      items.push({ url: m.url, thumbnail: m.thumbnail || (isVideo ? '' : m.url), isVideo });
    });
  } else if (Array.isArray(data)) {
    data.forEach((item: any) => {
      if (item?.urls && Array.isArray(item.urls)) {
        item.urls.forEach((u: any) => {
          if (u?.url) addUrl(u.url);
        });
      }
    });
  } else if (data?.url_list) {
    data.url_list.forEach((u: string) => addUrl(u));
  }

  if (items.length === 0) {
    if (data?.video_url) addUrl(data.video_url);
    else if (data?.data?.video_url) addUrl(data.data.video_url);
    else if (data?.items?.[0]?.video_versions?.[0]?.url) addUrl(data.items[0].video_versions[0].url);
    else if (data?.graphql?.shortcode_media?.video_url) addUrl(data.graphql.shortcode_media.video_url);
  }

  if (items.length === 0 && (data?.error || data?.message)) {
    throw new Error(data.error || data.message);
  }

  return items;
}

async function appendHistory(entry: object) {
  try {
    const raw = await AsyncStorage.getItem('download_history');
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    await AsyncStorage.setItem('download_history', JSON.stringify(list.slice(0, 100)));
  } catch {}
}

// ── "Select media to download" bottom sheet ─────────────────────────────────
function MediaPickerSheet({
  visible,
  items,
  selected,
  onToggle,
  onDownload,
  onCancel,
}: {
  visible: boolean;
  items: MediaItem[];
  selected: number[];
  onToggle: (index: number) => void;
  onDownload: () => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable style={styles.sheetBackdrop} onPress={onCancel} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Select media to download</Text>

        <ScrollView style={styles.sheetGridScroll} contentContainerStyle={styles.sheetGrid}>
          {items.map((item, i) => {
            const isSelected = selected.includes(i);
            return (
              <TouchableOpacity
                key={item.url}
                activeOpacity={0.8}
                onPress={() => onToggle(i)}
                style={[styles.tile, isSelected && styles.tileSelected]}
              >
                {item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={styles.tileImage} />
                ) : (
                  <View style={[styles.tileImage, styles.tilePlaceholder]}>
                    <Feather name="video" size={26} color="#ADC6FF" />
                  </View>
                )}
                {item.isVideo && (
                  <View style={styles.tilePlay}>
                    <Feather name="play" size={14} color="#FFFFFF" />
                  </View>
                )}
                <View style={[styles.tileCheck, isSelected && styles.tileCheckOn]}>
                  {isSelected && <Feather name="check" size={14} color="#002E69" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={[styles.sheetDownloadBtn, selected.length === 0 && styles.btnDisabled]}
          onPress={onDownload}
          disabled={selected.length === 0}
          activeOpacity={0.85}
        >
          <Text style={styles.sheetDownloadTxt}>Download ({selected.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sheetCancelBtn} onPress={onCancel}>
          <Text style={styles.sheetCancelTxt}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function DownloadScreen() {
  const [url, setUrl] = useState('');
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);
  const [pickerItems, setPickerItems] = useState<MediaItem[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);

  const postInfoRef = useRef<Promise<PostInfo> | null>(null);
  const lastAutoLinkRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  busyRef.current =
    downloadState === 'fetching' || downloadState === 'downloading' || pickerVisible;

  // mode 'direct': Download button — save everything right away.
  // mode 'pick':   clipboard / share — show the "Select media" sheet first.
  const startFetch = async (link: string, mode: 'direct' | 'pick') => {
    const trimmed = link.trim();
    if (!trimmed) {
      Alert.alert('No link', 'Please paste an Instagram link');
      return;
    }
    busyRef.current = true;
    setDownloadState('fetching');
    setProgress(0);
    // Caption + username for History, fetched in parallel with the media
    postInfoRef.current = fetchPostInfo(trimmed);

    let items: MediaItem[] = [];
    try {
      items = await fetchMediaItems(trimmed);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not fetch media. Check the link and try again.');
      setDownloadState('idle');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Not found', 'Could not fetch media. Check the link and try again.');
      setDownloadState('idle');
      return;
    }

    if (mode === 'direct') {
      await downloadItems(items, trimmed);
    } else {
      setPickerItems(items);
      setSelected(items.map((_, i) => i));
      setPickerVisible(true);
      setDownloadState('idle');
    }
  };

  const downloadItems = async (items: MediaItem[], sourceLink: string) => {
    if (items.length === 0) return;

    // Write-only access: no photo picker on Android 13+, one-time prompt on older Android
    let permissionDenied = false;
    try {
      const { status: permStatus } = await MediaLibrary.requestPermissionsAsync(true);
      permissionDenied = permStatus !== 'granted';
    } catch {
      // Expo Go: permission not declared in manifest — proceed anyway
    }

    if (permissionDenied) {
      Alert.alert('Permission required', 'Please allow storage access to save media');
      setDownloadState('idle');
      return;
    }

    setDownloadState('downloading');
    setProgress(0);

    let videoCount = 0;
    let imageCount = 0;
    let firstLocalUri = '';
    let firstMediaUrl = items[0].url;

    for (let i = 0; i < items.length; i++) {
      const { url: mediaUrl, isVideo } = items[i];
      const fileName = 'svd_' + Date.now() + '_' + i + (isVideo ? '.mp4' : '.jpg');
      const fileUri = FileSystem.documentDirectory + fileName;

      try {
        const result = await FileSystem.downloadAsync(mediaUrl, fileUri);
        if (result.status === 200) {
          // Saved into the default gallery folder; no album move, so no "modify this" dialog
          await MediaLibrary.createAssetAsync(result.uri);
          if (!firstLocalUri) {
            firstLocalUri = result.uri;
            firstMediaUrl = mediaUrl;
          }
          if (isVideo) videoCount++;
          else imageCount++;
        }
      } catch (e) {
        console.log('Failed to download:', mediaUrl, e);
      }

      setProgress((i + 1) / items.length);
    }

    const totalSaved = videoCount + imageCount;

    if (totalSaved === 0) {
      Alert.alert('Download failed', 'Could not save media. Please try again.');
      setDownloadState('idle');
      return;
    }

    const info = (await postInfoRef.current) ?? { author: '', caption: '' };
    await appendHistory({
      id: Date.now(),
      url: sourceLink,
      videoUrl: firstMediaUrl,
      localUri: firstLocalUri,
      mediaType: videoCount > 0 ? 'video' : 'image',
      fileCount: totalSaved,
      timestamp: new Date().toISOString(),
      caption: info.caption,
      author: info.author,
    });

    // The link stays in the input after downloading
    setDownloadState('done');
  };

  // Link arrived without the user tapping anything (clipboard or Share menu)
  const autoStart = (link: string) => {
    if (busyRef.current) return;
    lastAutoLinkRef.current = link;
    AsyncStorage.setItem(LAST_AUTO_LINK_KEY, link).catch(() => {});
    router.navigate('/');
    setUrl(link);
    startFetch(link, 'pick');
  };
  const autoStartRef = useRef(autoStart);
  autoStartRef.current = autoStart;

  // Instagram link copied before opening the app: pick it up automatically
  useEffect(() => {
    const checkClipboard = async () => {
      if (busyRef.current) return;
      try {
        if (!(await Clipboard.hasStringAsync())) return;
        const link = extractInstagramUrl(await Clipboard.getStringAsync());
        if (!link || link === lastAutoLinkRef.current) return;
        autoStartRef.current(link);
      } catch {}
    };

    // Android only allows clipboard reads once the window has focus, hence the short delay
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleCheck = () => {
      clearTimeout(timer);
      timer = setTimeout(checkClipboard, 500);
    };

    AsyncStorage.getItem(LAST_AUTO_LINK_KEY)
      .then((v) => {
        lastAutoLinkRef.current = v;
      })
      .catch(() => {})
      .finally(scheduleCheck);

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') scheduleCheck();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  // Link shared to this app from Instagram's Share menu
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (!hasShareIntent) return;
    const raw = shareIntent.webUrl || shareIntent.text || '';
    const link = extractInstagramUrl(raw) || raw.trim();
    resetShareIntent();
    if (link) autoStartRef.current(link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent]);

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text) return;
    const link = extractInstagramUrl(text);
    if (link) {
      // Already handled by hand, so don't auto-open the picker for it next time
      lastAutoLinkRef.current = link;
      AsyncStorage.setItem(LAST_AUTO_LINK_KEY, link).catch(() => {});
    }
    setUrl(link || text);
  };

  const togglePick = (i: number) =>
    setSelected((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const downloadPicked = () => {
    const items = pickerItems.filter((_, i) => selected.includes(i));
    setPickerVisible(false);
    downloadItems(items, url.trim());
  };

  const cancelPicker = () => {
    setPickerVisible(false);
    setPickerItems([]);
  };

  const reset = () => {
    setUrl('');
    setDownloadState('idle');
    setProgress(0);
  };

  const isBusy = downloadState === 'fetching' || downloadState === 'downloading';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="light-content" backgroundColor="#111318" />

      {/* URL Input Card */}
      <View style={styles.inputCard}>
        <TextInput
          style={styles.input}
          placeholder="Enter Instagram link"
          placeholderTextColor="#C4C6D0"
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            if (downloadState === 'done') setDownloadState('idle');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          editable={!isBusy}
        />
        {url.length > 0 && !isBusy && (
          <TouchableOpacity onPress={reset} style={styles.clearBtn}>
            <Feather name="x" size={20} color="#C4C6D0" />
          </TouchableOpacity>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.pasteBtn} onPress={paste} disabled={isBusy}>
          <Text style={styles.pasteTxt}>Paste</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.downloadBtn, isBusy && styles.btnDisabled]}
          onPress={() => startFetch(url, 'direct')}
          disabled={isBusy}
          activeOpacity={0.85}
        >
          {downloadState === 'fetching' ? (
            <>
              <ActivityIndicator color="#002E69" size="small" />
              <Text style={styles.downloadTxt}>Fetching media...</Text>
            </>
          ) : downloadState === 'downloading' ? (
            <>
              <ActivityIndicator color="#002E69" size="small" />
              <Text style={styles.downloadTxt}>Saving...</Text>
            </>
          ) : (
            <Text style={styles.downloadTxt}>Download</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      {downloadState === 'downloading' && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{Math.round(progress * 100)}%</Text>
        </View>
      )}

      {/* Success Card */}
      {downloadState === 'done' && (
        <View style={styles.successCard}>
          <View style={styles.successIconCircle}>
            <Feather name="check-circle" size={44} color="#4ade80" />
          </View>
          <Text style={styles.successTitle}>Download Complete!</Text>
          <Text style={styles.successSub}>Saved to your gallery.</Text>
          <TouchableOpacity style={styles.newDownloadBtn} onPress={reset}>
            <Feather name="plus" size={16} color="#002E69" />
            <Text style={styles.newDownloadTxt}>New Download</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* How to use */}
      {downloadState === 'idle' && (
        <View style={styles.hintCard}>
          <Text style={styles.hintTitle}>How to use</Text>
          {[
            { icon: 'copy' as const, text: 'Copy an Instagram link, or tap Share → this app' },
            { icon: 'smartphone' as const, text: 'Open the app — the link is picked up automatically' },
            { icon: 'check-square' as const, text: 'Select the media and tap Download' },
            { icon: 'image' as const, text: 'Media will be saved to your gallery' },
          ].map((step, i) => (
            <View key={i} style={styles.hintRow}>
              <View style={styles.hintNum}>
                <Text style={styles.hintNumTxt}>{i + 1}</Text>
              </View>
              <Feather name={step.icon} size={15} color="#ADC6FF" style={styles.hintIcon} />
              <Text style={styles.hintText}>{step.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Disclaimer — Rule 5 */}
      <Text style={styles.disclaimer}>
        Not affiliated with any social media platform. For personal use only.
      </Text>

      <MediaPickerSheet
        visible={pickerVisible}
        items={pickerItems}
        selected={selected}
        onToggle={togglePick}
        onDownload={downloadPicked}
        onCancel={cancelPicker}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111318' },
  content: { padding: 16, paddingTop: 24, paddingBottom: 48 },

  // Material 3 outlined text field
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8E9099',
    paddingLeft: 16,
    paddingRight: 8,
    marginBottom: 12,
    height: 56,
  },
  input: {
    flex: 1,
    color: '#E2E2E9',
    fontSize: 16,
    height: '100%',
  },
  clearBtn: { padding: 8 },

  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: width * 0.32,
    borderRadius: 16,
    height: 52,
    borderWidth: 1,
    borderColor: '#8E9099',
  },
  pasteTxt: { color: '#ADC6FF', fontWeight: '500', fontSize: 16 },
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    backgroundColor: '#ADC6FF',
    borderRadius: 16,
  },
  downloadTxt: { color: '#002E69', fontWeight: '500', fontSize: 16 },
  btnDisabled: { opacity: 0.65 },

  progressWrap: { marginBottom: 16 },
  progressTrack: {
    height: 6,
    backgroundColor: '#1D2024',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ADC6FF',
    borderRadius: 3,
  },
  progressLabel: {
    color: '#C4C6D0',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },

  readyCard: {
    backgroundColor: '#1D2024',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  readyIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  readyIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3E4759',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyTitle: { color: '#E2E2E9', fontSize: 16, fontWeight: '600' },
  readySub: { color: '#C4C6D0', fontSize: 13, lineHeight: 20 },

  successCard: {
    backgroundColor: '#1D2024',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0D2B1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: { color: '#E2E2E9', fontSize: 20, fontWeight: '600' },
  successSub: {
    color: '#C4C6D0',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  newDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ADC6FF',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginTop: 4,
  },
  newDownloadTxt: { color: '#002E69', fontWeight: '600', fontSize: 14 },

  hintCard: {
    backgroundColor: '#1D2024',
    borderRadius: 16,
    padding: 18,
    gap: 14,
    marginBottom: 20,
  },
  hintTitle: {
    color: '#E2E2E9',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hintNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3E4759',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintNumTxt: { color: '#ADC6FF', fontSize: 11, fontWeight: '600' },
  hintIcon: { width: 20 },
  hintText: { color: '#C4C6D0', fontSize: 13, flex: 1 },

  disclaimer: {
    fontSize: 11,
    color: '#8E9099',
    textAlign: 'center',
    padding: 10,
    lineHeight: 16,
  },

  // Media picker sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: '#1D2024',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C4C6D0',
    marginBottom: 20,
  },
  sheetTitle: { color: '#E2E2E9', fontSize: 18, fontWeight: '500', marginBottom: 16 },
  sheetGridScroll: { flexGrow: 0 },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 24 },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileSelected: { borderColor: '#ADC6FF' },
  tileImage: { width: '100%', height: '100%' },
  tilePlaceholder: { backgroundColor: '#33353A', alignItems: 'center', justifyContent: 'center' },
  tilePlay: { position: 'absolute', left: 6, bottom: 6 },
  tileCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCheckOn: { backgroundColor: '#ADC6FF', borderColor: '#ADC6FF' },
  sheetDownloadBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ADC6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDownloadTxt: { color: '#002E69', fontSize: 16, fontWeight: '500' },
  sheetCancelBtn: { height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  sheetCancelTxt: { color: '#ADC6FF', fontSize: 16, fontWeight: '500' },
});
