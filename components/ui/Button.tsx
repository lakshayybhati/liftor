import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, Animated, View, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
}

export function Button({ 
  title, 
  onPress, 
  variant = 'primary', 
  size = 'medium',
  disabled = false,
  style,
  textStyle,
  icon
}: ButtonProps) {
  const scaleValue = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: theme.motion.pressScale,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    handlePressOut();
    onPress();
  };

  const buttonStyle = [
    styles.base,
    styles[size],
    disabled && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.text,
    styles[`${size}Text` as keyof typeof styles],
    styles[`${variant}Text` as keyof typeof styles],
    disabled && styles.disabledText,
    textStyle,
  ];

  if (variant === 'primary' && !disabled) {
    return (
      <Animated.View style={[styles.animatedContainer, { transform: [{ scale: scaleValue }] }]}> 
        <TouchableOpacity 
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled} 
          style={[styles.base, styles.primaryOuter, style]}
          activeOpacity={1}
        >
          <LinearGradient
            colors={['#000000', '#000000']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.gradient, styles[size], styles.primaryInner]}
          >
            <View style={styles.content}>
              {icon && <View style={styles.iconContainer}>{icon}</View>}
              <Text style={textStyles} maxFontSizeMultiplier={1.2}>{title}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.animatedContainer, { transform: [{ scale: scaleValue }] }]}> 
      <TouchableOpacity 
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[styles.base, styles[size], styles[variant], disabled && styles.disabled, style]}
        activeOpacity={1}
      >
        <View style={styles.content}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <Text style={textStyles} maxFontSizeMultiplier={1.2}>{title}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
  },
  primaryOuter: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.accent.primary,
    padding: 4,
  },
  small: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    minHeight: 44,
  },
  medium: {
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.md,
    minHeight: 56,
  },
  large: {
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.md,
    minHeight: 56,
  },
  primary: {
    backgroundColor: theme.color.accent.primary,
  },
  secondary: {
    backgroundColor: theme.color.card,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.color.accent.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    maxWidth: '100%',
    minWidth: 0,
    width: '100%',
  },
  primaryInner: {
    // Make inner black body larger for a bolder look
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  text: {
    fontWeight: '600' as const,
    flexShrink: 1,
    textAlign: 'center',
  },
  smallText: {
    fontSize: 14,
    lineHeight: 20,
  },
  mediumText: {
    fontSize: theme.size.body + 1,
    lineHeight: 24,
  },
  largeText: {
    fontSize: 18,
    lineHeight: 26,
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: theme.color.ink,
  },
  outlineText: {
    color: theme.color.accent.primary,
  },
  disabledText: {
    color: theme.color.muted,
  },
  animatedContainer: {
    // Empty style for animated container
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  iconContainer: {
    marginRight: theme.space.xs,
  },
});