import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';

interface MoodCharacterProps {
  mood: {
    id: string;
    label: string;
    color: string;
    shape: 'circle' | 'flower' | 'rounded-square' | 'square' | 'hexagon' | 'triangle';
    eyes: 'happy' | 'sleepy' | 'normal' | 'wide' | 'dizzy' | 'stressed' | 'angry' | 'side' | 'cloud' | 'worried';
    mouth?: 'smile' | 'neutral' | 'frown' | 'tongue' | 'line' | 'none';
  };
  selected: boolean;
  onPress: () => void;
  size?: number;
}

export function MoodCharacter({ mood, selected, onPress, size = 80 }: MoodCharacterProps) {
  const animatedScale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(animatedScale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(animatedScale, {
      toValue: selected ? 1.05 : 1,
      useNativeDriver: true,
    }).start();
  };

  const getShapeStyle = () => {
    const baseStyle = {
      width: size,
      height: size,
      backgroundColor: mood.color,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    };

    switch (mood.shape) {
      case 'circle':
        return { ...baseStyle, borderRadius: size / 2 };
      case 'flower':
        return {
          ...baseStyle,
          borderRadius: size * 0.3,
          transform: [{ rotate: '45deg' }],
        };
      case 'rounded-square':
        return { ...baseStyle, borderRadius: size * 0.25 };
      case 'square':
        return { ...baseStyle, borderRadius: size * 0.15 };
      case 'hexagon':
        return {
          ...baseStyle,
          borderRadius: size * 0.2,
          transform: [{ rotate: '30deg' }],
        };
      case 'triangle':
        return {
          ...baseStyle,
          borderRadius: size * 0.15,
          transform: [{ rotate: '45deg' }],
          width: size * 0.9,
          height: size * 0.9,
        };
      default:
        return { ...baseStyle, borderRadius: size / 2 };
    }
  };

  const renderEyes = () => {
    const eyeSize = size * 0.12;
    const eyeSpacing = size * 0.2;

    const getEyeStyle = () => {
      switch (mood.eyes) {
        case 'happy':
          return {
            width: eyeSize,
            height: eyeSize * 0.6,
            backgroundColor: '#000',
            borderRadius: eyeSize,
            transform: [{ scaleY: 0.5 }],
          };
        case 'sleepy':
          return {
            width: eyeSize * 1.2,
            height: eyeSize * 0.4,
            backgroundColor: '#000',
            borderRadius: eyeSize,
          };
        case 'wide':
          return {
            width: eyeSize * 1.3,
            height: eyeSize * 1.3,
            backgroundColor: '#fff',
            borderRadius: eyeSize,
            borderWidth: 2,
            borderColor: '#000',
          };
        case 'dizzy':
          return {
            width: eyeSize,
            height: eyeSize,
            backgroundColor: 'transparent',
          };
        case 'stressed':
          return {
            width: eyeSize * 0.8,
            height: eyeSize * 0.8,
            backgroundColor: '#000',
            borderRadius: eyeSize,
            transform: [{ rotate: '45deg' }],
          };
        case 'angry':
          return {
            width: eyeSize,
            height: eyeSize * 0.7,
            backgroundColor: '#000',
            borderRadius: 0,
            transform: [{ rotate: '15deg' }],
          };
        case 'side':
          return {
            width: eyeSize * 0.6,
            height: eyeSize,
            backgroundColor: '#000',
            borderRadius: eyeSize,
          };
        case 'cloud':
          return {
            width: eyeSize * 1.2,
            height: eyeSize,
            backgroundColor: '#fff',
            borderRadius: eyeSize,
            borderWidth: 1,
            borderColor: '#000',
          };
        case 'worried':
          return {
            width: eyeSize,
            height: eyeSize,
            backgroundColor: '#fff',
            borderRadius: eyeSize,
            borderWidth: 2,
            borderColor: '#000',
          };
        default:
          return {
            width: eyeSize,
            height: eyeSize,
            backgroundColor: '#000',
            borderRadius: eyeSize,
          };
      }
    };

    const eyeStyle = getEyeStyle();

    if (mood.eyes === 'dizzy') {
      return (
        <View style={styles.eyesContainer}>
          <View style={[eyeStyle, { marginRight: eyeSpacing }]}>
            <Text style={{ fontSize: eyeSize * 0.8, color: '#000' }}>@</Text>
          </View>
          <View style={eyeStyle}>
            <Text style={{ fontSize: eyeSize * 0.8, color: '#000' }}>@</Text>
          </View>
        </View>
      );
    }

    if (mood.eyes === 'wide' || mood.eyes === 'cloud' || mood.eyes === 'worried') {
      return (
        <View style={styles.eyesContainer}>
          <View style={[eyeStyle, { marginRight: eyeSpacing }]}>
            <View style={{
              width: eyeSize * 0.4,
              height: eyeSize * 0.4,
              backgroundColor: '#000',
              borderRadius: eyeSize,
            }} />
          </View>
          <View style={eyeStyle}>
            <View style={{
              width: eyeSize * 0.4,
              height: eyeSize * 0.4,
              backgroundColor: '#000',
              borderRadius: eyeSize,
            }} />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.eyesContainer}>
        <View style={[eyeStyle, { marginRight: eyeSpacing }]} />
        <View style={eyeStyle} />
      </View>
    );
  };

  const renderMouth = () => {
    if (!mood.mouth || mood.mouth === 'none') return null;

    const mouthSize = size * 0.15;
    
    switch (mood.mouth) {
      case 'smile':
        return (
          <View style={{
            width: mouthSize * 1.5,
            height: mouthSize * 0.8,
            borderBottomWidth: 2,
            borderColor: '#000',
            borderRadius: mouthSize,
            marginTop: size * 0.1,
          }} />
        );
      case 'frown':
        return (
          <View style={{
            width: mouthSize * 1.5,
            height: mouthSize * 0.8,
            borderTopWidth: 2,
            borderColor: '#000',
            borderRadius: mouthSize,
            marginTop: size * 0.1,
            transform: [{ rotate: '180deg' }],
          }} />
        );
      case 'tongue':
        return (
          <View style={{
            marginTop: size * 0.1,
            alignItems: 'center',
          }}>
            <View style={{
              width: mouthSize,
              height: mouthSize * 0.6,
              backgroundColor: '#000',
              borderRadius: mouthSize,
            }} />
            <View style={{
              width: mouthSize * 0.6,
              height: mouthSize * 0.4,
              backgroundColor: '#ff69b4',
              borderRadius: mouthSize,
              marginTop: -2,
            }} />
          </View>
        );
      case 'line':
        return (
          <View style={{
            width: mouthSize,
            height: 2,
            backgroundColor: '#000',
            marginTop: size * 0.1,
          }} />
        );
      default:
        return (
          <View style={{
            width: mouthSize,
            height: mouthSize,
            backgroundColor: '#000',
            borderRadius: mouthSize,
            marginTop: size * 0.1,
          }} />
        );
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ scale: animatedScale }] }}>
        <TouchableOpacity
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[
            styles.characterContainer,
            selected && styles.selectedContainer,
          ]}
          activeOpacity={0.8}
        >
          <View style={getShapeStyle()}>
            <View style={{
              transform: mood.shape === 'flower' || mood.shape === 'hexagon' || mood.shape === 'triangle' 
                ? [{ rotate: mood.shape === 'flower' ? '-45deg' : mood.shape === 'hexagon' ? '-30deg' : '-45deg' }] 
                : undefined
            }}>
              {renderEyes()}
              {renderMouth()}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
      <Text style={[
        styles.label,
        selected && styles.selectedLabel,
      ]}>
        {mood.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    margin: 8,
  },
  characterContainer: {
    padding: 4,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedContainer: {
    borderColor: '#FF6FB2',
    backgroundColor: '#FF6FB2',
    shadowColor: '#FF6FB2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  eyesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A6A6AD',
    marginTop: 8,
    textAlign: 'center',
  },
  selectedLabel: {
    color: '#F7F7F8',
  },
});