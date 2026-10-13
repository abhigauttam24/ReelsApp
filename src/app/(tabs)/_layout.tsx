import React, { useContext, type ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DrawerContext } from '../_layout';

type FeatherIconName = ComponentProps<typeof Feather>['name'];

const TAB_CONFIG: Record<string, { icon: FeatherIconName; label: string }> = {
  index:   { icon: 'home',   label: 'Home'    },
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
            {/* Purple pill wraps icon + label in COLUMN layout when active */}
            <View style={[styles.tabContent, isFocused && styles.activePill]}>
              <Feather
                name={cfg.icon}
                size={isFocused ? 18 : 20}
                color="#FFFFFF"
              />
              <Text
                style={[
                  styles.tabLabel,
                  isFocused ? styles.activePillLabel : styles.inactiveLabel,
                ]}
              >
                {cfg.label}
              </Text>
            </View>
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
        <Feather name="menu" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

// ── Header right icons ────────────────────────────────────────────────────────
function HeaderRight() {
  return (
    <View style={styles.headerRight}>
      <TouchableOpacity style={styles.headerIconBtn} hitSlop={8}>
        <Feather name="tv" size={20} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerIconBtn} hitSlop={8}>
        <Feather name="camera" size={20} color="#FFFFFF" />
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
          backgroundColor: '#0D0D0D',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerTintColor: '#FFFFFF',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerTitle: '',
          headerLeft: () => <HamburgerButton title="Home" />,
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
    backgroundColor: '#1A1A2E',
    paddingTop: 10,
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
    paddingVertical: 4,
  },

  // Inner wrapper — column layout (icon above label)
  tabContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },

  // Active state: purple pill
  activePill: {
    backgroundColor: '#6C63FF',
  },

  // Label inside active pill
  activePillLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // Inactive label
  tabLabel: {
    fontSize: 10,
  },
  inactiveLabel: {
    color: '#888888',
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
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 4,
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
