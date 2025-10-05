import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/colors';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}

export function Chip({ label, selected = false, onPress, color = theme.color.accent.primary }: ChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        selected && { backgroundColor: color },
        !selected && { borderColor: theme.color.line },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.text,
          selected ? { color: theme.color.bg } : { color: theme.color.ink },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.card,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
  },
});