import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/colors';

interface CardProps {
  children: React.ReactNode;
  gradient?: boolean;
  gradientColors?: [string, string, ...string[]];
  style?: ViewStyle;
}

export function Card({ children, gradient = false, gradientColors, style }: CardProps) {
  if (gradient) {
    return (
      <LinearGradient
        colors={gradientColors || ['#FF6B9D', '#C147E9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, style]}
      >
        {children}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    shadowColor: theme.color.bg,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
});