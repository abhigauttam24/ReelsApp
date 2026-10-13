import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_KEY, API_HOST, API_ENDPOINT, ALBUM_NAME, BROWSER_DEFAULT_URL } from '../../constants/config';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36';

// Detect SPA URL changes: intercept history API + poll every 300ms as fallback.
// Many video platforms use pushState/replaceState for in-feed navigation.
const URL_MONITOR_JS = `
(function() {
  var lastUrl = '';
  function notifyUrl(url) {
    if (url === lastUrl) return;
    lastUrl = url;
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'URL_CHANGE', url: url })); } catch(e) {}
  }
  var _push = history.pushState.bind(history);
  history.pushState = function() { _push.apply(history, arguments); notifyUrl(window.location.href); };
  var _replace = history.replaceState.bind(history);
  history.replaceState = function() { _replace.apply(history, arguments); notifyUrl(window.location.href); };
  window.addEventListener('popstate', function() { notifyUrl(window.location.href); });
  setInterval(function() { notifyUrl(window.location.href); }, 300);
  true;
})();
`;

const CONTENT_ID_RE = /^[A-Za-z0-9_-]{8,}$/;

function isDownloadableUrl(url: string) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts.length >= 2 && parts.some(p => CONTENT_ID_RE.test(p));
  } catch {
    return false;
  }
}

function getFileInfo(url: string): { extension: string; isVideo: boolean } {
  if (url.includes('.mp4') || url.includes('video') || url.includes('mp4')) {
    return { extension: '.mp4', isVideo: true };
  }
  return { extension: '.jpg', isVideo: false };
}

function truncateUrl(url: string, max = 46) {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > max ? display.slice(0, max) + '…' : display;
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
}

async function fetchAllMediaUrls(url: string): Promise<string[]> {
  const res = await fetch(`${API_ENDPOINT}?url=${encodeURIComponent(url)}`, {
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
  }

  return allUrls;
}

export default function BrowserScreen() {
  const webRef = useRef<WebView>(null);
  const [navState, setNavState] = useState<WebViewNavigation | null>(null);
  const [currentUrl, setCurrentUrl] = useState(BROWSER_DEFAULT_URL);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [dlProgress, setDlProgress] = useState({ current: 0, total: 0 });

  const canGoBack = navState?.canGoBack ?? false;
  const canGoForward = navState?.canGoForward ?? false;
  const showFab = isDownloadableUrl(currentUrl);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'URL_CHANGE' && msg.url) {
        setCurrentUrl(msg.url);
      }
    } catch {}
  }, []);

  const downloadCurrentPage = async () => {
    if (downloading) return;
    setDownloading(true);
    setDlProgress({ current: 0, total: 0 });
    try {
      let permissionDenied = false;
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        permissionDenied = status !== 'granted';
      } catch {
        // Expo Go: permission not declared in manifest — proceed anyway
      }

      if (permissionDenied) {
        Alert.alert('Permission required', 'Allow gallery access to save media');
        return;
      }

      const urls = await fetchAllMediaUrls(currentUrl);

      if (urls.length === 0) {
        Alert.alert(
          'Media not found',
          'Could not extract media from this page. Make sure you are on a video or post page.'
        );
        return;
      }

      setDlProgress({ current: 0, total: urls.length });

      let videoCount = 0;
      let imageCount = 0;
      let firstLocalUri = '';
      let firstMediaUrl = urls[0];
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
              firstMediaUrl = mediaUrl;
            }
            if (isVideo) videoCount++;
            else imageCount++;
          }
        } catch (e) {
          console.log('Failed to download:', mediaUrl, e);
        }

        setDlProgress({ current: i + 1, total: urls.length });
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
        const raw = await AsyncStorage.getItem('download_history');
        const list = raw ? JSON.parse(raw) : [];
        list.unshift({
          id: Date.now(),
          url: currentUrl,
          videoUrl: firstMediaUrl,
          localUri: firstLocalUri,
          mediaType: videoCount > 0 ? 'video' : 'image',
          fileCount: totalSaved,
          timestamp: new Date().toISOString(),
          caption: '',
        });
        await AsyncStorage.setItem('download_history', JSON.stringify(list.slice(0, 100)));

        if (videoCount > 0 && imageCount === 0) {
          Alert.alert('Video Saved!', `Video saved to gallery in '${ALBUM_NAME}' album`);
        } else if (imageCount === 1 && videoCount === 0) {
          Alert.alert('Image Saved!', `Image saved to gallery in '${ALBUM_NAME}' album`);
        } else if (imageCount > 1 && videoCount === 0) {
          Alert.alert('Post Saved!', `${imageCount} images saved to gallery in '${ALBUM_NAME}' album`);
        } else {
          Alert.alert('Saved!', `${totalSaved} files saved to gallery in '${ALBUM_NAME}' album`);
        }
      } else {
        Alert.alert('Download failed', 'Could not download media. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setDownloading(false);
      setDlProgress({ current: 0, total: 0 });
    }
  };

  const dlPercent = dlProgress.total > 0
    ? Math.round((dlProgress.current / dlProgress.total) * 100)
    : 0;

  return (
    <View style={styles.container}>
      {/* Browser Controls */}
      <View style={styles.controlBar}>
        <TouchableOpacity
          style={[styles.navBtn, !canGoBack && styles.navBtnDisabled]}
          onPress={() => webRef.current?.goBack()}
          disabled={!canGoBack}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={18} color={canGoBack ? '#FFFFFF' : '#3D3D5C'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navBtn, !canGoForward && styles.navBtnDisabled]}
          onPress={() => webRef.current?.goForward()}
          disabled={!canGoForward}
          hitSlop={8}
        >
          <Feather name="arrow-right" size={18} color={canGoForward ? '#FFFFFF' : '#3D3D5C'} />
        </TouchableOpacity>

        <View style={styles.urlPill}>
          <Feather name="lock" size={11} color="#6C63FF" style={{ marginRight: 5 }} />
          <Text style={styles.urlText} numberOfLines={1}>
            {truncateUrl(currentUrl)}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => webRef.current?.reload()}
          hitSlop={8}
        >
          <Feather name="refresh-cw" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => webRef.current?.injectJavaScript(`window.location.href = '${BROWSER_DEFAULT_URL}'; true;`)}
          hitSlop={8}
        >
          <Feather name="home" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Page load progress */}
      {loading && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.round(loadProgress * 100)}%` }]} />
        </View>
      )}

      {/* Download progress bar */}
      {downloading && dlProgress.total > 0 && (
        <View style={styles.dlProgressWrap}>
          <View style={styles.dlProgressTrack}>
            <View style={[styles.dlProgressFill, { width: `${dlPercent}%` }]} />
          </View>
          <Text style={styles.dlProgressLabel}>
            {dlProgress.total > 1
              ? `Saving ${dlProgress.current}/${dlProgress.total} — ${dlPercent}%`
              : `Saving… ${dlPercent}%`}
          </Text>
        </View>
      )}

      {/* WebView */}
      <WebView
        ref={webRef}
        source={{ uri: BROWSER_DEFAULT_URL }}
        style={styles.webview}
        onNavigationStateChange={(state) => {
          setNavState(state);
          setCurrentUrl(state.url);
        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onLoadProgress={({ nativeEvent }) => setLoadProgress(nativeEvent.progress)}
        injectedJavaScript={URL_MONITOR_JS}
        onMessage={handleMessage}
        userAgent={Platform.OS === 'android' ? ANDROID_UA : undefined}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="large" color="#6C63FF" />
          </View>
        )}
      />

      {/* Download FAB — shows on video/post pages */}
      {showFab && (
        <TouchableOpacity
          style={styles.fab}
          onPress={downloadCurrentPage}
          disabled={downloading}
          activeOpacity={0.85}
        >
          {downloading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Feather name="download" size={24} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      )}

      {/* FAB hint label */}
      {showFab && !downloading && (
        <View style={styles.fabHint}>
          <Text style={styles.fabHintText}>Tap to download</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },

  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  navBtnDisabled: { opacity: 0.35 },
  urlPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#2D2B55',
  },
  urlText: { color: '#888888', fontSize: 12, flex: 1 },

  progressBar: {
    height: 3,
    backgroundColor: '#1A1A2E',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6C63FF',
  },

  dlProgressWrap: {
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  dlProgressTrack: {
    height: 5,
    backgroundColor: '#2D2B55',
    borderRadius: 3,
    overflow: 'hidden',
  },
  dlProgressFill: {
    height: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 3,
  },
  dlProgressLabel: {
    color: '#A29BFE',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
  },

  webview: { flex: 1 },
  webviewLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  fab: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  fabHint: {
    position: 'absolute',
    bottom: 32,
    left: 88,
    backgroundColor: '#1A1A2E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2D2B55',
  },
  fabHintText: { color: '#A29BFE', fontSize: 12, fontWeight: '600' },
});
