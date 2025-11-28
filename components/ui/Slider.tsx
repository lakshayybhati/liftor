import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import NativeSlider from '@react-native-community/slider';
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
  minLabel?: string;
  maxLabel?: string;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  helperText?: string;
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
  minLabel,
  maxLabel,
  formatValue,
  disabled = false,
  helperText,
}: SliderProps) {
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
      
      <View style={[styles.sliderContainer, disabled && styles.sliderDisabled]}>
        <Text style={[styles.sliderValue, disabled && styles.sliderValueDisabled]}>
          {formatValue ? formatValue(value) : value}
        </Text>
        
        <NativeSlider
          style={styles.slider}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          step={step}
          value={value}
          onValueChange={onValueChange}
          minimumTrackTintColor={theme.color.accent.primary}
          maximumTrackTintColor={theme.color.line}
          thumbTintColor={theme.color.accent.primary}
          disabled={disabled}
        />
        
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabelText}>{minLabel || minimumValue}</Text>
          <Text style={styles.sliderLabelText}>{maxLabel || maximumValue}</Text>
        </View>

        {helperText ? (
          <Text style={[styles.helperText, disabled && styles.helperTextDisabled]}>
            {helperText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  required: {
    color: theme.color.accent.primary,
  },
  sliderContainer: {
    paddingHorizontal: 8,
  },
  sliderDisabled: {
    opacity: 0.5,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sliderLabelText: {
    fontSize: 12,
    color: theme.color.muted,
    fontWeight: '500',
  },
  sliderValueDisabled: {
    color: theme.color.muted,
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: theme.color.muted,
    textAlign: 'center',
  },
  helperTextDisabled: {
    color: theme.color.muted,
  },
});