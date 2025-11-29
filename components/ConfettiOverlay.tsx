import React, { useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, Dimensions, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const NUM_CONFETTI = 50;
const COLORS = ['#FFD700', '#FF512F', '#DD2476', '#38ef7d', '#11998e', '#8E2DE2', '#4A00E0'];

interface ConfettiParticleProps {
  delay: number;
  startX: number;
}

const ConfettiParticle = ({ delay, startX }: ConfettiParticleProps) => {
  const anim = useRef(new Animated.Value(0)).current;
  const horizontalAnim = useRef(new Animated.Value(0)).current;
  
  // Random physics
  const color = useMemo(() => COLORS[Math.floor(Math.random() * COLORS.length)], []);
  const size = useMemo(() => Math.random() * 8 + 6, []);
  const rotationOutput = useMemo(() => Math.random() * 360 + 'deg', []);
  const drift = useMemo(() => (Math.random() - 0.5) * 100, []); // Horizontal drift

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(anim, {
          toValue: 1,
          duration: 2000 + Math.random() * 1000,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(horizontalAnim, {
          toValue: 1,
          duration: 2000 + Math.random() * 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ])
    ]).start();
  }, [delay, anim, horizontalAnim]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, SCREEN_HEIGHT + 20],
  });

  const translateX = horizontalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [startX, startX + drift],
  });

  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', rotationOutput],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          backgroundColor: color,
          width: size,
          height: size, // Square or circle
          borderRadius: Math.random() > 0.5 ? size / 2 : 0,
          opacity,
          transform: [
            { translateX },
            { translateY },
            { rotate },
            { rotateX: rotate },
            { rotateY: rotate },
          ],
        },
      ]}
    />
  );
};

interface Props {
  visible: boolean;
}

export default function ConfettiOverlay({ visible }: Props) {
  useEffect(() => {
    if (visible) {
      // Success haptics sequence
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 150);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 300);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {Array.from({ length: NUM_CONFETTI }).map((_, i) => (
        <ConfettiParticle
          key={i}
          delay={Math.random() * 600}
          startX={Math.random() * SCREEN_WIDTH}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999, // Top level
    elevation: 999,
  },
  particle: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});




