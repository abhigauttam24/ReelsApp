import React, { useState } from 'react';
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
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { API_KEY, API_HOST, API_ENDPOINT, ALBUM_NAME } from '../../constants/config';

const { width } = Dimensions.get('window');

type DownloadState = 'idle' | 'fetching' | 'ready' | 'downloading' | 'done';

function getFileInfo(url: string): { extension: string; isVideo: boolean } {
  if (url.includes('.mp4') || url.includes('video') || url.includes('mp4')) {
    return { extension: '.mp4', isVideo: true };
  }
  return { extension: '.jpg', isVideo: false };
}

async function fetchAllMediaUrls(url: string): Promise<string[]> {
  const res = await fetch(`${API_ENDPOINT}?url=${encodeURIComponent(url.trim())}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-rapidapi-host': API_HOST,
      'x-rapidapi-key': API_KEY,
    },
  });
  const data = await res.json();

  const allUrls: string[] = [];

  if (Array.isArray(data?.media)) {
    data.media.forEach((m: any) => {
      if (m?.url) allUrls.push(m.url);
    });
  } else if (Array.isArray(data)) {
    data.forEach((item: any) => {
      if (item?.urls && Array.isArray(item.urls)) {
        item.urls.forEach((u: any) => {
          if (u?.url) allUrls.push(u.url);
        });
      }
    });
  } else if (data?.url_list) {
    data.url_list.forEach((u: string) => allUrls.push(u));
  }

  if (allUrls.length === 0) {
    if (data?.video_url) allUrls.push(data.video_url);
    else if (data?.data?.video_url) allUrls.push(data.data.video_url);
    else if (Array.isArray(data) && data[0]?.video_url) allUrls.push(data[0].video_url);
    else if (data?.items?.[0]?.video_versions?.[0]?.url)
      allUrls.push(data.items[0].video_versions[0].url);
    else if (data?.graphql?.shortcode_media?.video_url)
      allUrls.push(data.graphql.shortcode_media.video_url);
  }

  return allUrls;
}

async function appendHistory(entry: object) {
  try {
    const raw = await AsyncStorage.getItem('download_history');
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    await AsyncStorage.setItem('download_history', JSON.stringify(list.slice(0, 100)));
  } catch {}
}

export default function DownloadScreen() {
  const [url, setUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [allMediaUrls, setAllMediaUrls] = useState<string[]>([]);
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setUrl(text);
  };

  const handleFetch = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      Alert.alert('No link', 'Please paste a social media video link');
      return;
    }
    setDownloadState('fetching');
    setVideoUrl(null);
    setAllMediaUrls([]);
    setProgress(0);
    try {
      const urls = await fetchAllMediaUrls(trimmed);
      if (urls.length > 0) {
        setAllMediaUrls(urls);
        setVideoUrl(urls[0]);
        setDownloadState('ready');
      } else {
        Alert.alert('Not found', 'Could not fetch media. Check the link and try again.');
        setDownloadState('idle');
      }
    } catch (e: any) {
      Alert.alert('Error', 'Could not fetch media. Check the link and try again.');
      setDownloadState('idle');
    }
  };

  const downloadAll = async () => {
    const urls = allMediaUrls.length > 0 ? allMediaUrls : videoUrl ? [videoUrl] : [];
    if (urls.length === 0) return;

    let permissionDenied = false;
    try {
      const { status: permStatus } = await MediaLibrary.requestPermissionsAsync();
      permissionDenied = permStatus !== 'granted';
    } catch {
      // Expo Go: permission not declared in manifest — proceed anyway
    }

    if (permissionDenied) {
      Alert.alert('Permission required', 'Please allow gallery access to save media');
      return;
    }

    setDownloadState('downloading');
    setProgress(0);

    let videoCount = 0;
    let imageCount = 0;
    let firstLocalUri = '';
    let firstVideoUrl = urls[0];
    const downloadedAssets: MediaLibrary.Asset[] = [];

    for (let i = 0; i < urls.length; i++) {
      const mediaUrl = urls[i];
      const { extension, isVideo } = getFileInfo(mediaUrl);
      const fileName = 'svd_' + Date.now() + '_' + i + extension;
      const fileUri = FileSystem.documentDirectory + fileName;

      try {
        const result = await FileSystem.downloadAsync(mediaUrl, fileUri);
        if (result.status === 200) {
          try {
            const asset = await MediaLibrary.createAssetAsync(result.uri);
            downloadedAssets.push(asset);
          } catch {}
          if (!firstLocalUri) {
            firstLocalUri = result.uri;
            firstVideoUrl = mediaUrl;
          }
          if (isVideo) videoCount++;
          else imageCount++;
        }
      } catch (e) {
        console.log('Failed to download:', mediaUrl, e);
      }

      setProgress((i + 1) / urls.length);
    }

    // Add all assets to album in one batch — avoids per-file permission dialogs on Android
    if (downloadedAssets.length > 0) {
      try {
        const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
        if (album === null) {
          await MediaLibrary.createAlbumAsync(ALBUM_NAME, downloadedAssets[0], false);
          if (downloadedAssets.length > 1) {
            const newAlbum = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
            if (newAlbum) {
              await MediaLibrary.addAssetsToAlbumAsync(downloadedAssets.slice(1), newAlbum, false);
            }
          }
        } else {
          await MediaLibrary.addAssetsToAlbumAsync(downloadedAssets, album, false);
        }
      } catch {}
    }

    const totalSaved = videoCount + imageCount;

    if (totalSaved > 0) {
      await appendHistory({
        id: Date.now(),
        url: url.trim(),
        videoUrl: firstVideoUrl,
        localUri: firstLocalUri,
        mediaType: videoCount > 0 ? 'video' : 'image',
        fileCount: totalSaved,
        timestamp: new Date().toISOString(),
        caption: '',
      });
    }

    if (videoCount > 0 && imageCount === 0) {
      Alert.alert('Saved to gallery!', `Video saved in '${ALBUM_NAME}' album`);
    } else if (imageCount === 1 && videoCount === 0) {
      Alert.alert('Saved to gallery!', `Image saved in '${ALBUM_NAME}' album`);
    } else if (imageCount > 1 && videoCount === 0) {
      Alert.alert('Saved to gallery!', `${imageCount} images saved in '${ALBUM_NAME}' album`);
    } else if (totalSaved > 0) {
      Alert.alert('Saved to gallery!', `${totalSaved} files saved in '${ALBUM_NAME}' album`);
    } else {
      Alert.alert('Download failed', 'Could not save media. Please try again.');
      setDownloadState('ready');
      return;
    }

    setAllMediaUrls([]);
    setVideoUrl(null);
    setUrl('');
    setDownloadState('done');
  };

  const reset = () => {
    setUrl('');
    setVideoUrl(null);
    setAllMediaUrls([]);
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
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

      {/* URL Input Card */}
      <View style={styles.inputCard}>
        <Feather name="link-2" size={16} color="#555" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Paste social media video link here"
          placeholderTextColor="#555555"
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            if (downloadState !== 'idle') reset();
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          editable={!isBusy}
        />
        {url.length > 0 && (
          <TouchableOpacity onPress={reset} style={styles.clearBtn}>
            <Feather name="x" size={16} color="#555" />
          </TouchableOpacity>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.pasteBtn} onPress={paste} disabled={isBusy}>
          <Feather name="clipboard" size={15} color="#A29BFE" />
          <Text style={styles.pasteTxt}>Paste</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.downloadBtn, isBusy && styles.btnDisabled]}
          onPress={downloadState === 'ready' ? downloadAll : handleFetch}
          disabled={isBusy}
          activeOpacity={0.85}
        >
          {downloadState === 'fetching' ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.downloadTxt}>Fetching media...</Text>
            </>
          ) : downloadState === 'downloading' ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.downloadTxt}>Saving...</Text>
            </>
          ) : downloadState === 'ready' ? (
            <>
              <Feather name="save" size={15} color="#fff" />
              <Text style={styles.downloadTxt}>Save to Gallery</Text>
            </>
          ) : (
            <>
              <Feather name="download" size={15} color="#fff" />
              <Text style={styles.downloadTxt}>Download</Text>
            </>
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

      {/* Ready State Card */}
      {downloadState === 'ready' && (
        <View style={styles.readyCard}>
          <View style={styles.readyIconRow}>
            <View style={styles.readyIconBg}>
              <Feather name="check" size={22} color="#6C63FF" />
            </View>
            <Text style={styles.readyTitle}>
              {allMediaUrls.length > 1 ? `${allMediaUrls.length} files found!` : 'Media Found!'}
            </Text>
          </View>
          <Text style={styles.readySub}>
            Tap "Save to Gallery" above to download{allMediaUrls.length > 1 ? ' all files' : ''}.
          </Text>
        </View>
      )}

      {/* Success Card */}
      {downloadState === 'done' && (
        <View style={styles.successCard}>
          <View style={styles.successIconCircle}>
            <Feather name="check-circle" size={44} color="#4ade80" />
          </View>
          <Text style={styles.successTitle}>Download Complete!</Text>
          <Text style={styles.successSub}>
            Media saved to your gallery in "{ALBUM_NAME}" album.
          </Text>
          <TouchableOpacity style={styles.newDownloadBtn} onPress={reset}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.newDownloadTxt}>New Download</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* How to use */}
      {downloadState === 'idle' && (
        <View style={styles.hintCard}>
          <Text style={styles.hintTitle}>How to use</Text>
          {[
            { icon: 'copy' as const, text: 'Copy any social media video link' },
            { icon: 'clipboard' as const, text: 'Open app and paste the link' },
            { icon: 'download' as const, text: 'Tap Download button' },
            { icon: 'image' as const, text: 'Media will be saved to your gallery' },
          ].map((step, i) => (
            <View key={i} style={styles.hintRow}>
              <View style={styles.hintNum}>
                <Text style={styles.hintNumTxt}>{i + 1}</Text>
              </View>
              <Feather name={step.icon} size={15} color="#6C63FF" style={styles.hintIcon} />
              <Text style={styles.hintText}>{step.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Disclaimer — Rule 5 */}
      <Text style={styles.disclaimer}>
        Not affiliated with any social media platform. For personal use only.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  content: { padding: 16, paddingBottom: 48 },

  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2D2B55',
    paddingHorizontal: 14,
    marginBottom: 12,
    height: 54,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    height: '100%',
  },
  clearBtn: { padding: 4 },

  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    width: width * 0.32,
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: '#2D2B55',
  },
  pasteTxt: { color: '#A29BFE', fontWeight: '700', fontSize: 14 },
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 15,
    elevation: 4,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  downloadTxt: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  btnDisabled: { opacity: 0.65 },

  progressWrap: { marginBottom: 16 },
  progressTrack: {
    height: 6,
    backgroundColor: '#1A1A2E',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 3,
  },
  progressLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },

  readyCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#6C63FF',
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
    backgroundColor: '#2D2B55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  readySub: { color: '#888', fontSize: 13, lineHeight: 20 },

  successCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D2B55',
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
  successTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' },
  successSub: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  newDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginTop: 4,
  },
  newDownloadTxt: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  hintCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2D2B55',
    gap: 14,
    marginBottom: 20,
  },
  hintTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
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
    backgroundColor: '#2D2B55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintNumTxt: { color: '#6C63FF', fontSize: 11, fontWeight: 'bold' },
  hintIcon: { width: 20 },
  hintText: { color: '#888', fontSize: 13, flex: 1 },

  disclaimer: {
    fontSize: 11,
    color: '#555555',
    textAlign: 'center',
    padding: 10,
    lineHeight: 16,
  },
});
