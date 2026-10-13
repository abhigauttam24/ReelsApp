import React, {
  useState,
  useRef,
  useEffect,
  createContext,
  useContext,
  type ComponentProps,
} from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Share,
  Linking,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { Stack } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { Feather } from '@expo/vector-icons';

ExpoSplashScreen.preventAutoHideAsync().catch(() => {});
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SplashScreen from './splash';
import { APP_NAME, FEEDBACK_EMAIL } from '../constants/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.75;

type FeatherName = ComponentProps<typeof Feather>['name'];

// ── Drawer Context ──────────────────────────────────────────────────────────
export const DrawerContext = createContext<{ openDrawer: () => void }>({
  openDrawer: () => {},
});

export function useAppDrawer() {
  return useContext(DrawerContext);
}

// ── How To Use Modal ────────────────────────────────────────────────────────
function HowToUseModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const steps: { icon: FeatherName; text: string }[] = [
    { icon: 'copy', text: 'Copy any social media video link' },
    { icon: 'clipboard', text: 'Open app and paste the link' },
    { icon: 'download', text: 'Tap Download button' },
    { icon: 'image', text: 'Media will be saved to your gallery' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={modalStyles.overlay}>
          <TouchableWithoutFeedback>
            <View style={modalStyles.card}>
              <View style={modalStyles.header}>
                <Text style={modalStyles.title}>How to Use</Text>
                <TouchableOpacity onPress={onClose} hitSlop={8}>
                  <Feather name="x" size={20} color="#888" />
                </TouchableOpacity>
              </View>
              {steps.map((step, i) => (
                <View key={i} style={modalStyles.stepRow}>
                  <View style={modalStyles.stepNum}>
                    <Text style={modalStyles.stepNumTxt}>{i + 1}</Text>
                  </View>
                  <Feather name={step.icon} size={16} color="#6C63FF" style={modalStyles.stepIcon} />
                  <Text style={modalStyles.stepText}>{step.text}</Text>
                </View>
              ))}
              <Text style={modalStyles.note}>
                For personal use only. Respect content creators.
              </Text>
              <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose}>
                <Text style={modalStyles.closeBtnTxt}>Got it!</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Privacy Policy Modal ────────────────────────────────────────────────────
function PrivacyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={modalStyles.overlay}>
          <TouchableWithoutFeedback>
            <View style={modalStyles.card}>
              <View style={modalStyles.header}>
                <Text style={modalStyles.title}>Privacy Policy</Text>
                <TouchableOpacity onPress={onClose} hitSlop={8}>
                  <Feather name="x" size={20} color="#888" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
                <Text style={modalStyles.privacyText}>
                  {APP_NAME} is an independent app and is not affiliated with, endorsed by, or connected to any social media platform or company.
                </Text>
                <Text style={modalStyles.privacyText}>
                  Users are solely responsible for ensuring they have permission to download content. Please respect content creators and intellectual property rights.
                </Text>
                <Text style={modalStyles.privacyText}>
                  Downloaded content should only be used for personal, non-commercial purposes.
                </Text>
                <Text style={modalStyles.privacyText}>
                  We do not store any user data or downloaded content. Your download history is stored only on your device and is never uploaded to any server.
                </Text>
                <Text style={[modalStyles.privacyText, { marginTop: 8 }]}>
                  Contact: {FEEDBACK_EMAIL}
                </Text>
              </ScrollView>
              <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose}>
                <Text style={modalStyles.closeBtnTxt}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Drawer Panel Content ────────────────────────────────────────────────────
function DrawerContent({
  onClose,
  onOpenHowToUse,
  onOpenPrivacy,
}: {
  onClose: () => void;
  onOpenHowToUse: () => void;
  onOpenPrivacy: () => void;
}) {
  const insets = useSafeAreaInsets();

  const items: { icon: FeatherName; label: string; onPress: () => void }[] = [
    {
      icon: 'info',
      label: 'How to Use',
      onPress: onOpenHowToUse,
    },
    {
      icon: 'star',
      label: 'Rate Us',
      onPress: () => {
        onClose();
        Linking.openURL('https://play.google.com/store/apps/details?id=com.abhigauttam18.socialvideodownloader');
      },
    },
    {
      icon: 'share-2',
      label: 'Share App',
      onPress: () => {
        onClose();
        Share.share({
          message:
            'Download videos from social media with Social Video Downloader!\nhttps://play.google.com/store',
        });
      },
    },
    {
      icon: 'mail',
      label: 'Feedback',
      onPress: () => {
        onClose();
        Linking.openURL(
          `mailto:${FEEDBACK_EMAIL}?subject=App%20Feedback%20-%20${encodeURIComponent(APP_NAME)}`
        );
      },
    },
    {
      icon: 'shield',
      label: 'Privacy Policy',
      onPress: onOpenPrivacy,
    },
  ];

  return (
    <View style={[styles.drawerInner, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      {/* Header */}
      <View style={styles.drawerHeader}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.drawerLogo}
          resizeMode="contain"
        />
        <View>
          <Text style={styles.drawerAppName}>Social Video</Text>
          <Text style={styles.drawerAppName}>Downloader</Text>
        </View>
      </View>

      <View style={styles.drawerDivider} />

      {/* Menu items */}
      {items.map((item) => (
        <TouchableOpacity
          key={item.label}
          style={styles.drawerItem}
          onPress={item.onPress}
          activeOpacity={0.7}
        >
          <View style={styles.drawerIconBox}>
            <Feather name={item.icon} size={18} color="#6C63FF" />
          </View>
          <Text style={styles.drawerItemLabel}>{item.label}</Text>
          <Feather name="chevron-right" size={14} color="#3D3D5C" />
        </TouchableOpacity>
      ))}

      {/* Footer */}
      <View style={styles.drawerFooter}>
        <Text style={styles.drawerVersion}>v1.0.0</Text>
        <Text style={styles.drawerDisclaimer}>
          Not affiliated with any social media platform.
        </Text>
      </View>
    </View>
  );
}

// ── Root Layout ─────────────────────────────────────────────────────────────
export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [howToUseVisible, setHowToUseVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const drawerX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    ExpoSplashScreen.hideAsync().catch(() => {});
  }, []);

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.spring(drawerX, {
      toValue: 0,
      tension: 65,
      friction: 11,
      useNativeDriver: true,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(drawerX, {
      toValue: -DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setDrawerOpen(false));
  };

  const openHowToUse = () => {
    closeDrawer();
    setTimeout(() => setHowToUseVisible(true), 280);
  };

  const openPrivacy = () => {
    closeDrawer();
    setTimeout(() => setPrivacyVisible(true), 280);
  };

  const overlayOpacity = drawerX.interpolate({
    inputRange: [-DRAWER_WIDTH, 0],
    outputRange: [0, 0.65],
  });

  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />;
  }

  return (
    <DrawerContext.Provider value={{ openDrawer }}>
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

        {/* Main navigation stack */}
        <Stack screenOptions={{ headerShown: false }} />

        {/* How to Use Modal */}
        <HowToUseModal
          visible={howToUseVisible}
          onClose={() => setHowToUseVisible(false)}
        />

        {/* Privacy Policy Modal */}
        <PrivacyModal
          visible={privacyVisible}
          onClose={() => setPrivacyVisible(false)}
        />

        {/* Custom drawer overlay + panel */}
        {drawerOpen && (
          <>
            <TouchableWithoutFeedback onPress={closeDrawer}>
              <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
            </TouchableWithoutFeedback>

            <Animated.View
              style={[styles.drawerPanel, { transform: [{ translateX: drawerX }] }]}
            >
              <DrawerContent
                onClose={closeDrawer}
                onOpenHowToUse={openHowToUse}
                onOpenPrivacy={openPrivacy}
              />
            </Animated.View>
          </>
        )}
      </View>
    </DrawerContext.Provider>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 10,
  },

  drawerPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#1A1A2E',
    zIndex: 11,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  drawerInner: {
    flex: 1,
    backgroundColor: '#1A1A2E',
  },

  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 14,
  },
  drawerLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  drawerAppName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  drawerDivider: {
    height: 1,
    backgroundColor: '#2D2B55',
    marginHorizontal: 20,
    marginBottom: 12,
  },

  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 14,
  },
  drawerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#2D2B55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerItemLabel: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },

  drawerFooter: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingTop: 16,
    gap: 6,
  },
  drawerVersion: {
    color: '#3D3D5C',
    fontSize: 12,
  },
  drawerDisclaimer: {
    color: '#3D3D5C',
    fontSize: 10,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2D2B55',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2D2B55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumTxt: {
    color: '#6C63FF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stepIcon: { width: 22 },
  stepText: {
    color: '#AAAAAA',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  note: {
    color: '#555555',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  closeBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  closeBtnTxt: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  privacyText: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 21,
    marginBottom: 12,
  },
});
