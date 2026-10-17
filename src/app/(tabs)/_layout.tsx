import React, { useContext, type ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DrawerContext } from '../_layout';

type FeatherIconName = ComponentProps<typeof Feather>['name'];

const TAB_CONFIG: Record<string, { icon: FeatherIconName; label: string }> = {
  index:   { icon: 'home',   label: 'Download' },
  browser: { icon: 'search', label: 'Browser' },
  history: { icon: 'check',  label: 'History' },
};

// ── Custom tab bar ────────────────────────────────────────────────────────────
function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const cfg = TAB_CONFIG[route.name] ?? { icon: 'circle' as FeatherIconName, label: route.name };
        const isFocused = state.index === index;

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tabItem}
            activeOpacity={0.8}
            onPress={() => navigation.navigate(route.name)}
          >
            {/* Material 3 style: pill behind the icon only, label below */}
            <View style={[styles.iconPill, isFocused && styles.activePill]}>
              <Feather
                name={cfg.icon}
                size={22}
                color={isFocused ? '#DAE2F9' : '#C4C6D0'}
              />
            </View>
            <Text
              style={[
                styles.tabLabel,
                isFocused ? styles.activePillLabel : styles.inactiveLabel,
              ]}
            >
              {cfg.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Header left: hamburger + screen title ─────────────────────────────────────
function HamburgerButton({ title }: { title: string }) {
  const { openDrawer } = useContext(DrawerContext);

  return (
    <View style={styles.headerLeft}>
      <TouchableOpacity onPress={openDrawer} style={styles.hamburgerBtn} hitSlop={8}>
        <Feather name="menu" size={24} color="#E2E2E9" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

// ── Header right icons ────────────────────────────────────────────────────────
function HeaderRight() {
  const { showHowToUse } = useContext(DrawerContext);

  // https link opens the Instagram app when installed (Android app link), otherwise the browser
  const openInstagram = () => Linking.openURL('https://www.instagram.com/').catch(() => {});

  return (
    <View style={styles.headerRight}>
      <TouchableOpacity style={styles.headerIconBtn} onPress={showHowToUse} hitSlop={8}>
        <Feather name="help-circle" size={22} color="#E2E2E9" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerIconBtn} onPress={openInstagram} hitSlop={8}>
        <Feather name="instagram" size={22} color="#E2E2E9" />
      </TouchableOpacity>
    </View>
  );
}

// ── Tab layout ────────────────────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: '#111318',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerTintColor: '#E2E2E9',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerTitle: '',
          headerLeft: () => <HamburgerButton title="Download" />,
          headerRight: () => <HeaderRight />,
        }}
      />
      <Tabs.Screen
        name="browser"
        options={{
          headerTitle: '',
          headerLeft: () => <HamburgerButton title="Browser" />,
          headerRight: () => <HeaderRight />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          headerTitle: '',
          headerLeft: () => <HamburgerButton title="History" />,
          headerRight: () => <HeaderRight />,
        }}
      />
    </Tabs>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Tab bar container
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1D2024',
    paddingTop: 12,
    paddingHorizontal: 8,
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },

  // Each tab touchable
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  // Pill behind the icon (64x32, Material 3 navigation bar indicator)
  iconPill: {
    width: 64,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Active state
  activePill: {
    backgroundColor: '#3E4759',
  },

  activePillLabel: {
    color: '#E2E2E9',
    fontWeight: '600',
  },

  tabLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
  },
  inactiveLabel: {
    color: '#C4C6D0',
    fontWeight: '500',
  },

  // Header
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Platform.OS === 'android' ? 8 : 4,
  },
  hamburgerBtn: {
    padding: 8,
  },
  headerTitle: {
    color: '#E2E2E9',
    fontSize: 22,
    fontWeight: '400',
    marginLeft: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    gap: 4,
  },
  headerIconBtn: {
    padding: 8,
  },
});
