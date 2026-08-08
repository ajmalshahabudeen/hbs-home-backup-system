import React from 'react';
import { Tabs } from 'expo-router';
import { useAppTheme } from '../../context/ThemeContext';
import { CustomTabBar } from '../../components/CustomTabBar';

export default function TabsLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="photos"
        options={{
          title: 'Photos',
        }}
      />
      <Tabs.Screen
        name="drive"
        options={{
          title: 'Drive',
        }}
      />
      <Tabs.Screen
        name="backup"
        options={{
          title: 'Backup',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
        }}
      />
    </Tabs>
  );
}

