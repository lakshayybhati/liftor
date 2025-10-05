import React from 'react';
import { View, Text, StyleSheet, PanResponder, Animated, TouchableOpacity, Alert } from 'react-native';
import { theme } from '@/constants/colors';
import { Info } from 'lucide-react-native';

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  label?: string;
  infoText?: string;
  required?: boolean;
}

export function Slider({
  value,
  onValueChange,
  minimumValue = 1,
  maximumValue = 10,
  step = 1,
  label,
  infoText,
  required,
}: SliderProps) {
  const animatedValue = React.useRef(new Animated.Value(value)).current;
  const sliderWidth = 280;
  const thumbSize = 24;

  const getPosition = (val: number) => {
    const range = maximumValue - minimumValue;
    const position = ((val - minimumValue) / range) * (sliderWidth - thumbSize);
    return Math.max(0, Math.min(position, sliderWidth - thumbSize));
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gestureState) => {
      const newPosition = Math.max(0, Math.min(gestureState.moveX - 40, sliderWidth - thumbSize));
      const range = maximumValue - minimumValue;
      const newValue = minimumValue + (newPosition / (sliderWidth - thumbSize)) * range;
      const steppedValue = Math.round(newValue / step) * step;
      
      if (steppedValue !== value) {
        onValueChange(Math.max(minimumValue, Math.min(maximumValue, steppedValue)));
      }
    },
  });

  React.useEffect(() => {
    Animated.spring(animatedValue, {
      toValue: getPosition(value),
      useNativeDriver: false,
    }).start();
  }, [value]);

  return (
    <View style={styles.container}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>
            {label}
            {required ? <Text style={styles.required}> *</Text> : null}
          </Text>
          {infoText ? (
            <TouchableOpacity
              onPress={() => Alert.alert(label || 'Info', infoText, [{ text: 'OK' }])}
              accessibilityRole="button"
              accessibilityLabel={`About ${label}`}
              style={{ padding: 4 }}
            >
              <Info color={theme.color.muted} size={16} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}
      <View style={styles.sliderContainer}>
        <View style={styles.track} />
        <View style={[styles.activeTrack, { width: getPosition(value) + thumbSize / 2 }]} />
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [{ translateX: animatedValue }],
            },
          ]}
          {...panResponder.panHandlers}
        />
      </View>
      <View style={styles.valueContainer}>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: theme.color.ink,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  required: {
    color: theme.color.accent.primary,
  },
  sliderContainer: {
    width: 280,
    height: 24,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: 4,
    backgroundColor: theme.color.line,
    borderRadius: 2,
  },
  activeTrack: {
    height: 4,
    backgroundColor: theme.color.accent.primary,
    borderRadius: 2,
    position: 'absolute',
  },
  thumb: {
    width: 24,
    height: 24,
    backgroundColor: theme.color.ink,
    borderRadius: 12,
    position: 'absolute',
    shadowColor: theme.color.accent.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 2,
    borderColor: theme.color.accent.primary,
  },
  valueContainer: {
    marginTop: 8,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.accent.primary,
  },
});