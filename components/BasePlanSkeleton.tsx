import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions, Text } from 'react-native';
import { theme } from '@/constants/colors';
import { Calendar } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const SkeletonItem = ({ style }: { style: any }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          backgroundColor: theme.color.line,
          opacity,
        },
        style,
      ]}
    />
  );
};

const TypingText = ({ text, style, delay = 0 }: { text: string, style?: any, delay?: number }) => {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      let index = 0;
      const interval = setInterval(() => {
        if (index < text.length) {
          setDisplayedText(prev => prev + text.charAt(index));
          index++;
        } else {
          clearInterval(interval);
        }
      }, 35); // Typing speed
      
      return () => clearInterval(interval);
    }, delay);
    
    return () => clearTimeout(timeout);
  }, [text, delay]);

  return <Text style={style}>{displayedText}</Text>;
};

export const BasePlanSkeleton = () => {
  return (
    <View style={styles.container}>
      {/* Header Area */}
      <View style={styles.header}>
        <Calendar size={32} color={theme.color.primary} style={{ marginBottom: theme.space.sm }} />
        
        <TypingText 
          text="Your Base Plan" 
          style={styles.realHeaderTitle} 
          delay={100}
        />
        
        <TypingText 
          text="This is your foundation plan that will be adjusted daily based on your check-ins" 
          style={styles.realHeaderSubtitle} 
          delay={800} 
        />
        
        {/* Timeline Badge */}
        <View style={styles.timelineContainer}>
          <SkeletonItem style={styles.timelinePill} />
          <SkeletonItem style={styles.timelineBubble} />
        </View>
      </View>

      {/* Day Selector */}
      <View style={styles.daySelector}>
        {[...Array(5)].map((_, i) => (
          <SkeletonItem key={i} style={styles.dayCard} />
        ))}
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        <SkeletonItem style={styles.sectionTitle} />
        
        {/* Workout Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <SkeletonItem style={styles.iconBox} />
            <SkeletonItem style={styles.cardTitle} />
          </View>
          <SkeletonItem style={styles.textLine} />
          <SkeletonItem style={styles.blockLine} />
          <SkeletonItem style={styles.blockLine} />
          <SkeletonItem style={styles.blockLineShort} />
        </View>

        {/* Nutrition Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <SkeletonItem style={styles.iconBox} />
            <SkeletonItem style={styles.cardTitle} />
          </View>
          <View style={styles.macroRow}>
            <SkeletonItem style={styles.macroCircle} />
            <SkeletonItem style={styles.macroCircle} />
            <SkeletonItem style={styles.macroCircle} />
          </View>
          <SkeletonItem style={styles.textLine} />
          <SkeletonItem style={styles.textLine} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  header: {
    alignItems: 'center',
    padding: theme.space.xl,
    paddingTop: theme.space.lg + 40, // Add some top padding for safe area equivalent
  },
  realHeaderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
    textAlign: 'center',
    height: 32, // Fixed height to prevent layout shift
  },
  realHeaderSubtitle: {
    fontSize: 15,
    color: theme.color.muted,
    textAlign: 'center',
    marginBottom: theme.space.lg,
    lineHeight: 22,
    paddingHorizontal: 20,
    minHeight: 44, // Reserve space for 2 lines
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: theme.space.sm,
  },
  headerTitle: {
    width: 200,
    height: 24,
    borderRadius: 4,
    marginBottom: theme.space.sm,
  },
  headerSubtitle: {
    width: 280,
    height: 14,
    borderRadius: 4,
    marginBottom: 6,
  },
  headerSubtitleShort: {
    width: 180,
    height: 14,
    borderRadius: 4,
    marginBottom: theme.space.lg,
  },
  timelineContainer: {
    alignItems: 'flex-start',
    width: '100%',
    marginTop: theme.space.sm,
  },
  timelinePill: {
    width: 100,
    height: 20,
    borderRadius: 10,
    marginBottom: 6,
  },
  timelineBubble: {
    width: '100%',
    height: 40,
    borderRadius: 14,
  },
  daySelector: {
    flexDirection: 'row',
    paddingHorizontal: theme.space.lg,
    gap: theme.space.sm,
    marginBottom: theme.space.lg,
    overflow: 'hidden',
  },
  dayCard: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.lg,
  },
  content: {
    paddingHorizontal: theme.space.lg,
  },
  sectionTitle: {
    width: 120,
    height: 24,
    borderRadius: 4,
    marginBottom: theme.space.lg,
    alignSelf: 'center',
  },
  card: {
    marginBottom: theme.space.lg,
    padding: theme.space.md,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space.md,
  },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    marginRight: theme.space.sm,
  },
  cardTitle: {
    width: 100,
    height: 18,
    borderRadius: 4,
  },
  textLine: {
    width: '100%',
    height: 14,
    borderRadius: 4,
    marginBottom: 8,
  },
  blockLine: {
    width: '90%',
    height: 40,
    borderRadius: 8,
    marginBottom: 8,
  },
  blockLineShort: {
    width: '40%',
    height: 14,
    borderRadius: 4,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.space.md,
  },
  macroCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
});
