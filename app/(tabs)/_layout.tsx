import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRootineTheme } from '@/constants/rootine-theme';

export default function TabLayout() {
  const { T, night } = useRootineTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: night ? '#CFE0B0' : '#4B543C',
        tabBarInactiveTintColor: night ? 'rgba(240, 233, 214, 0.55)' : '#988D76',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: T.glassStrong,
          borderTopWidth: 1,
          borderTopColor: T.cardBorder,
          ...(Platform.OS === 'web'
            ? ({ backdropFilter: 'blur(16px) saturate(1.15)' } as any)
            : null),
        },
        tabBarLabelStyle: {
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      }}>
      <Tabs.Screen
        name="flashcards"
        options={{
          title: 'Aventura',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bolt.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="adventure"
        options={{
          title: 'Trilha',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Habitat',
          tabBarIcon: ({ color }) => <IconSymbol size={34} name="leaf.fill" color={color} />,
          tabBarItemStyle: {
            transform: [{ translateY: -8 }],
          },
          tabBarLabelStyle: {
            fontWeight: '700',
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="biosphere"
        options={{
          title: 'Biosfera',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="globe.americas.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          href: null,
          title: 'Admin',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gear" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="missions"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
