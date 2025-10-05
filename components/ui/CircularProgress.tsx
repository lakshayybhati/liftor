import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '@/constants/colors';

interface CircularProgressProps {
  progress: number; // 0 to 1
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  showPercentage?: boolean;
  centerText?: string;
}

export const CircularProgress = memo<CircularProgressProps>(({ 
  progress, 
  size = 80, 
  strokeWidth = 6, 
  color = theme.color.accent.green,
  backgroundColor = theme.color.line,
  showPercentage = true,
  centerText
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (progress * circumference);

  const displayText = centerText || (showPercentage ? `${Math.round(progress * 100)}%` : '');

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {displayText && (
        <View style={styles.textContainer}>
          <Text style={[styles.text, { fontSize: size * 0.2 }]}>
            {displayText}
          </Text>
        </View>
      )}
    </View>
  );
});

CircularProgress.displayName = 'CircularProgress';

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  svg: {
    position: 'absolute',
  },
  textContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
  },
});