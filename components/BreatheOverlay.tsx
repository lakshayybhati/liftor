import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '@/constants/colors';

type PatternId = 'breeze' | 'calm' | 'focus';

interface Props {
  visible: boolean;
  onClose: () => void;
  durationSec?: number; // total session length
  pattern?: PatternId;   // initial pattern
  haptics?: boolean;
}

const PATTERNS: Record<PatternId, { inhale: number; hold: number; exhale: number; label: string; title: string; sub: string }> = {
  breeze: { inhale: 4, hold: 4, exhale: 4, label: 'Breeze', title: 'Breeze', sub: '4–4–4' },
  calm:   { inhale: 6, hold: 7, exhale: 8, label: 'Calm',   title: 'Calm',   sub: '6–7–8' },
  focus:  { inhale: 10, hold: 8, exhale: 9, label: 'Focus',  title: 'Focus',  sub: '10–8–9' },
};

export default function BreatheOverlay({ visible, onClose, durationSec = 90, pattern = 'calm', haptics = true }: Props) {
  const [patternId, setPatternId] = useState<PatternId>(pattern);
  const cfg = PATTERNS[patternId];
  const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const ring = useMemo(() => new Animated.Value(0), []);
  const aliveRef = useRef(true);

  // Smooth expand/contract synced to inhale/exhale
  const animatePhase = (nextPhase: 'inhale' | 'hold' | 'exhale') => {
    const duration = nextPhase === 'inhale' ? cfg.inhale : nextPhase === 'hold' ? cfg.hold : cfg.exhale;
    const after = () => { if (!paused) step(nextPhase === 'inhale' ? 'hold' : nextPhase === 'hold' ? 'exhale' : 'inhale'); };
    if (nextPhase === 'inhale') {
      Animated.timing(ring, { toValue: 1, duration: duration * 1000, useNativeDriver: false }).start(after);
    } else if (nextPhase === 'hold') {
      Animated.timing(ring, { toValue: 1, duration: duration * 1000, useNativeDriver: false }).start(after);
    } else {
      Animated.timing(ring, { toValue: 0, duration: duration * 1000, useNativeDriver: false }).start(after);
    }
  };

  const step = (next: 'inhale' | 'hold' | 'exhale') => {
    if (!startTimeRef.current) return;
    const totalElapsed = (Date.now() - startTimeRef.current) / 1000;
    if (totalElapsed >= durationSec) {
      setDone(true);
      return;
    }
    if (haptics && (next === 'hold' || next === 'exhale')) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Defer state update to avoid running during React insertion effects
    setTimeout(() => {
      if (!aliveRef.current) return;
      setPhase(next);
      animatePhase(next);
    }, 0);
  };

  const restart = () => {
    ring.stopAnimation();
    setDone(false);
    setPaused(false);
    setPhase('inhale');
    setElapsed(0);
    startTimeRef.current = Date.now();
    animatePhase('inhale');
  };

  useEffect(() => {
    if (!visible) return;
    restart();
    const tick = setInterval(() => {
      if (!startTimeRef.current) return;
      setElapsed(Math.min(durationSec, Math.floor((Date.now() - startTimeRef.current) / 1000)));
    }, 1000);
    aliveRef.current = true;
    return () => { 
      aliveRef.current = false;
      clearInterval(tick); 
      startTimeRef.current = null; 
      ring.stopAnimation(); 
    };
  }, [visible, durationSec, patternId]);

  const size = ring.interpolate({ inputRange: [0, 1], outputRange: [140, 260] });
  const instruction = phase === 'inhale' ? 'Breathe In' : phase === 'hold' ? 'Hold' : 'Breath Out';
  const timeLeft = Math.max(0, durationSec - elapsed);
  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const seconds = (timeLeft % 60).toString().padStart(2, '0');

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {!done ? (
            <>
              <Text style={styles.title}>Enjoy 5 deep breaths</Text>
              <View style={styles.patternRow}>
                {(['breeze','calm','focus'] as PatternId[]).map(pid => (
                  <TouchableOpacity key={pid} onPress={() => setPatternId(pid)} style={[styles.patternPill, patternId === pid && styles.patternPillActive]}>
                    <Text style={[styles.patternText, patternId === pid && styles.patternTextActive]}>{PATTERNS[pid].label}</Text>
                    <Text style={[styles.patternSub, patternId === pid && styles.patternTextActive]}>{PATTERNS[pid].sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: 9999 }]} />
              <Text style={styles.instruction}>{instruction}</Text>
              <Text style={styles.timer}>{minutes}:{seconds}</Text>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => setPaused(p => { const np = !p; if (!np) step(phase); return np; })} style={styles.actionBtn}><Text style={styles.actionText}>{paused ? 'Resume' : 'Pause'}</Text></TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.actionBtn}><Text style={styles.actionText}>Close</Text></TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Nice work ✨</Text>
              <Text style={styles.subtitle}>You just completed a calming session.</Text>
              <View style={styles.actions}>
                <TouchableOpacity onPress={onClose} style={styles.actionBtn}><Text style={styles.actionText}>Back</Text></TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, backgroundColor: theme.color.bg, borderRadius: 24, borderWidth: 1, borderColor: theme.color.line, padding: 24, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: theme.color.ink, marginBottom: 12 },
  subtitle: { fontSize: 14, color: theme.color.muted, marginBottom: 16 },
  ring: { backgroundColor: theme.color.accent.primary + '20', borderWidth: 2, borderColor: theme.color.accent.primary + '60', marginBottom: 16 },
  instruction: { fontSize: 22, fontWeight: '700', color: theme.color.ink, marginBottom: 6 },
  timer: { fontSize: 14, color: theme.color.muted, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: { borderRadius: 12, borderWidth: 1, borderColor: theme.color.line, backgroundColor: theme.color.card, paddingHorizontal: 16, paddingVertical: 10 },
  actionText: { color: theme.color.ink, fontWeight: '600' },
  patternRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  patternPill: { alignItems: 'center', borderRadius: 20, borderWidth: 1, borderColor: theme.color.line, backgroundColor: theme.color.card, paddingHorizontal: 14, paddingVertical: 8 },
  patternPillActive: { borderColor: theme.color.accent.blue, backgroundColor: theme.color.accent.blue + '20' },
  patternText: { color: theme.color.ink, fontWeight: '700' },
  patternTextActive: { color: theme.color.accent.blue },
  patternSub: { fontSize: 10, color: theme.color.muted },
});


