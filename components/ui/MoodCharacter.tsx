import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';

export interface MoodCharacterProps {
  mood: {
    id: string;
    label: string;
    color: string;
    shape: 'circle' | 'flower' | 'rounded-square' | 'square' | 'hexagon' | 'triangle';
    eyes: 'happy' | 'sleepy' | 'normal' | 'wide' | 'dizzy' | 'stressed' | 'angry' | 'side' | 'cloud' | 'worried' | 
          'excited' | 'joyful' | 'energized' | 'confused' | 'sensitive' | 'bored';
    mouth?: 'smile' | 'neutral' | 'frown' | 'tongue' | 'line' | 'none' | 
           'bigSmile' | 'softSmile' | 'upbeat' | 'slightFrown' | 'flat' | 'wavy';
  };
  selected: boolean;
  onPress: () => void;
  size?: number;
}

export function MoodCharacter({ mood, selected, onPress, size = 80 }: MoodCharacterProps) {
  // Animation values
  const animatedScale = React.useRef(new Animated.Value(1)).current;
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // Pulse animation for selected state
  useEffect(() => {
    if (selected) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [selected]);

  const handlePressIn = () => {
    Animated.spring(animatedScale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(animatedScale, {
      toValue: 1,
      friction: 3,
      tension: 40,
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
    
    const getEyeStyle = () => ({
      width: eyeSize,
      height: eyeSize,
      backgroundColor: '#000',
      borderRadius: eyeSize,
    });

    const basicEye = getEyeStyle();

    switch (mood.eyes) {
      case 'excited':
        // Happy eyes with raised eyebrows
        return (
           <View style={styles.eyesContainer}>
            <View style={[styles.eyeColumn, { marginRight: eyeSpacing }]}>
              <View style={[styles.eyebrow, { marginBottom: 2 }]} />
              <View style={[basicEye, { height: eyeSize * 0.6, transform: [{ scaleY: 0.5 }] }]} />
            </View>
            <View style={styles.eyeColumn}>
              <View style={[styles.eyebrow, { marginBottom: 2 }]} />
              <View style={[basicEye, { height: eyeSize * 0.6, transform: [{ scaleY: 0.5 }] }]} />
            </View>
          </View>
        );
      
      case 'joyful':
        // Soft rounded eyes
        return (
          <View style={styles.eyesContainer}>
            <View style={[basicEye, { height: eyeSize * 0.8, width: eyeSize * 1.1, marginRight: eyeSpacing }]} />
            <View style={[basicEye, { height: eyeSize * 0.8, width: eyeSize * 1.1 }]} />
          </View>
        );

      case 'energized':
        // Wide open eyes
        return (
          <View style={styles.eyesContainer}>
            <View style={[basicEye, { 
              width: eyeSize * 1.4, 
              height: eyeSize * 1.4, 
              backgroundColor: '#fff', 
              marginRight: eyeSpacing,
              alignItems: 'center',
              justifyContent: 'center'
            }]}>
              <View style={{ width: eyeSize * 0.5, height: eyeSize * 0.5, backgroundColor: '#000', borderRadius: 10 }} />
            </View>
            <View style={[basicEye, { 
              width: eyeSize * 1.4, 
              height: eyeSize * 1.4, 
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center'
            }]}>
              <View style={{ width: eyeSize * 0.5, height: eyeSize * 0.5, backgroundColor: '#000', borderRadius: 10 }} />
            </View>
          </View>
        );

      case 'confused':
        // Tilted eyebrows / different eyes
        return (
          <View style={styles.eyesContainer}>
            <View style={[styles.eyeColumn, { marginRight: eyeSpacing }]}>
              <View style={[styles.eyebrow, { transform: [{ rotate: '-15deg' }], marginBottom: 4 }]} />
              <View style={basicEye} />
            </View>
            <View style={styles.eyeColumn}>
              <View style={[styles.eyebrow, { transform: [{ rotate: '15deg' }], marginBottom: 4 }]} />
              <View style={[basicEye, { height: eyeSize * 0.8 }]} />
            </View>
          </View>
        );

      case 'sensitive':
        // Tear drop or soft eyes
        return (
          <View style={styles.eyesContainer}>
            <View style={[basicEye, { marginRight: eyeSpacing, height: eyeSize * 0.6, borderRadius: 5 }]} />
            <View style={styles.eyeColumn}>
              <View style={[basicEye, { height: eyeSize * 0.6, borderRadius: 5 }]} />
              <View style={{ 
                position: 'absolute', 
                bottom: -6, 
                right: -2,
                width: 6, 
                height: 6, 
                backgroundColor: '#E0F7FA', 
                borderRadius: 3 
              }} />
            </View>
          </View>
        );
      
      case 'stressed':
         // Tight eyes + sweat drop
         return (
          <View style={styles.eyesContainer}>
            <View style={[basicEye, { 
              marginRight: eyeSpacing, 
              height: 3, 
              width: eyeSize,
              transform: [{ rotate: '15deg' }]
            }]} />
            <View style={styles.eyeColumn}>
              <View style={[basicEye, { 
                height: 3, 
                width: eyeSize,
                transform: [{ rotate: '-15deg' }]
              }]} />
               <View style={{ 
                position: 'absolute', 
                top: -10, 
                right: -8,
                width: 8, 
                height: 10, 
                backgroundColor: '#E0F7FA', 
                borderRadius: 4,
                borderTopLeftRadius: 0
              }} />
            </View>
          </View>
        );

      case 'bored':
        // Half closed eyelids
        return (
          <View style={styles.eyesContainer}>
            <View style={[basicEye, { marginRight: eyeSpacing }]}>
               <View style={{ 
                 position: 'absolute', 
                 top: 0, 
                 width: '100%', 
                 height: '60%', 
                 backgroundColor: mood.color, 
                 opacity: 0.8,
                 zIndex: 1
               }} />
            </View>
            <View style={basicEye}>
               <View style={{ 
                 position: 'absolute', 
                 top: 0, 
                 width: '100%', 
                 height: '60%', 
                 backgroundColor: mood.color, 
                 opacity: 0.8,
                 zIndex: 1
               }} />
            </View>
          </View>
        );
        
      case 'happy':
        return (
          <View style={styles.eyesContainer}>
             <View style={[basicEye, { marginRight: eyeSpacing, height: eyeSize * 0.6, transform: [{ scaleY: 0.5 }] }]} />
             <View style={[basicEye, { height: eyeSize * 0.6, transform: [{ scaleY: 0.5 }] }]} />
          </View>
        );

      case 'sleepy':
        return (
          <View style={styles.eyesContainer}>
            <View style={[basicEye, { width: eyeSize * 1.2, height: eyeSize * 0.4, marginRight: eyeSpacing }]} />
            <View style={[basicEye, { width: eyeSize * 1.2, height: eyeSize * 0.4 }]} />
          </View>
        );

      case 'dizzy':
        return (
          <View style={styles.eyesContainer}>
            <Text style={{ fontSize: eyeSize * 0.8, color: '#000', marginRight: eyeSpacing }}>@</Text>
            <Text style={{ fontSize: eyeSize * 0.8, color: '#000' }}>@</Text>
          </View>
        );
        
      case 'angry':
          return (
            <View style={styles.eyesContainer}>
              <View style={[basicEye, { marginRight: eyeSpacing, borderRadius: 0, height: eyeSize * 0.7, transform: [{ rotate: '15deg' }] }]} />
              <View style={[basicEye, { borderRadius: 0, height: eyeSize * 0.7, transform: [{ rotate: '-15deg' }] }]} />
            </View>
          );

      default:
        return (
          <View style={styles.eyesContainer}>
            <View style={[basicEye, { marginRight: eyeSpacing }]} />
            <View style={basicEye} />
          </View>
        );
    }
  };

  const renderMouth = () => {
    if (!mood.mouth || mood.mouth === 'none') return null;
    const mouthSize = size * 0.15;
    const marginTop = size * 0.1;

    switch (mood.mouth) {
      case 'bigSmile':
         return (
          <View style={{
            width: mouthSize * 2,
            height: mouthSize * 1.2,
            borderBottomWidth: 3,
            borderColor: '#000',
            borderRadius: mouthSize,
            marginTop,
          }} />
        );
        
      case 'smile':
        return (
          <View style={{
            width: mouthSize * 1.5,
            height: mouthSize * 0.8,
            borderBottomWidth: 2,
            borderColor: '#000',
            borderRadius: mouthSize,
            marginTop,
          }} />
        );
        
      case 'softSmile':
         return (
          <View style={{
            width: mouthSize * 1.2,
            height: mouthSize * 0.5,
            borderBottomWidth: 2,
            borderColor: '#000',
            borderRadius: mouthSize,
            marginTop,
          }} />
        );

      case 'upbeat':
        // D shape mouth
        return (
           <View style={{
            width: mouthSize * 1.4,
            height: mouthSize,
            backgroundColor: '#000',
            borderBottomLeftRadius: mouthSize,
            borderBottomRightRadius: mouthSize,
            marginTop,
          }}>
             <View style={{
                position: 'absolute',
                bottom: 2,
                left: '20%',
                width: '60%',
                height: 4,
                backgroundColor: '#FF69B4',
                borderRadius: 2
             }}/>
          </View>
        );

      case 'frown':
        return (
          <View style={{
            width: mouthSize * 1.5,
            height: mouthSize * 0.8,
            borderTopWidth: 2,
            borderColor: '#000',
            borderRadius: mouthSize,
            marginTop,
            transform: [{ rotate: '180deg' }],
          }} />
        );

      case 'slightFrown':
        return (
          <View style={{
            width: mouthSize * 1.0,
            height: mouthSize * 0.4,
            borderTopWidth: 2,
            borderColor: '#000',
            borderRadius: mouthSize,
            marginTop,
          }} />
        );

      case 'tongue':
        return (
          <View style={{ marginTop, alignItems: 'center' }}>
            <View style={{ width: mouthSize, height: mouthSize * 0.6, backgroundColor: '#000', borderRadius: mouthSize }} />
            <View style={{ width: mouthSize * 0.6, height: mouthSize * 0.4, backgroundColor: '#ff69b4', borderRadius: mouthSize, marginTop: -2 }} />
          </View>
        );

      case 'line':
      case 'flat':
        return (
          <View style={{ width: mouthSize, height: 2, backgroundColor: '#000', marginTop }} />
        );

      case 'wavy':
        return (
           <View style={{ width: mouthSize * 1.5, height: 4, marginTop, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: 4, height: 4, backgroundColor: 'black', borderRadius: 2, marginHorizontal: 1 }} />
              <View style={{ width: 4, height: 4, backgroundColor: 'black', borderRadius: 2, marginHorizontal: 1, marginTop: 4 }} />
              <View style={{ width: 4, height: 4, backgroundColor: 'black', borderRadius: 2, marginHorizontal: 1 }} />
              <View style={{ width: 4, height: 4, backgroundColor: 'black', borderRadius: 2, marginHorizontal: 1, marginTop: 4 }} />
           </View>
        );

      default:
        return (
          <View style={{ width: mouthSize, height: mouthSize, backgroundColor: '#000', borderRadius: mouthSize, marginTop }} />
        );
    }
  };

  const combinedScale = Animated.multiply(animatedScale, pulseAnim);

  const contentRotation = (() => {
    if (mood.shape === 'flower') return '-45deg';
    if (mood.shape === 'hexagon') return '-30deg';
    if (mood.shape === 'triangle') return '-45deg';
    return '0deg';
  })();

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ scale: combinedScale }] }}>
        <TouchableOpacity
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[
            styles.characterContainer,
            selected && styles.selectedContainer,
          ]}
          activeOpacity={1}
        >
          <View style={getShapeStyle()}>
            <View style={{ transform: [{ rotate: contentRotation }] }}>
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
  },
  characterContainer: {
    padding: 4,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedContainer: {
    borderColor: '#FF4444',
    backgroundColor: '#fff', 
    borderRadius: 100, // Ensure circular highlight around the shape
    shadowColor: '#FF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  eyesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeColumn: {
    alignItems: 'center',
  },
  eyebrow: {
    width: 10,
    height: 2,
    backgroundColor: '#000',
    borderRadius: 1,
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
