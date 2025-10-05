import { Tabs } from "expo-router";
import { Home, History, Settings } from "lucide-react-native";
import React from "react";

import { theme } from "@/constants/colors";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.color.accent.primary,
        tabBarInactiveTintColor: theme.color.muted,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.color.card,
          borderTopWidth: 1,
          borderTopColor: theme.color.line,
          shadowColor: theme.color.bg,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Home color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => <History color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Settings color={color} size={24} />,
        }}
      />
    </Tabs>
  );
}