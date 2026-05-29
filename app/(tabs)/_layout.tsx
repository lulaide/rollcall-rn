import * as React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { GlassView } from 'expo-glass-effect';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

/** Liquid Glass tab bar background (real on iOS 26, system blur fallback elsewhere). */
function GlassTabBarBackground() {
  return (
    <GlassView
      glassEffectStyle="regular"
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        ...(Platform.OS === 'web'
          ? ({
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              backgroundColor: 'rgba(11,11,14,0.7)',
            } as any)
          : {}),
      }}
    />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#3478f6',
        tabBarInactiveTintColor: 'rgba(235,235,245,0.6)',
        tabBarButton: HapticTab,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarBackground: () => <GlassTabBarBackground />,
        sceneStyle: { backgroundColor: '#0b0b0e' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '签到',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="checkmark.circle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="curriculum"
        options={{
          title: '课表',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: '账号',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
