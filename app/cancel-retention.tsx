import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/colors';

export default function CancelRetentionScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.center}>
        <Text style={styles.headline}>You’re Closer Than You Think.</Text>
        <Text style={styles.body}>
          Your next transformation isn’t luck—it’s consistency. Liftor keeps your plan evolving, your nutrition precise, and your results visible.
        </Text>
        <View style={{ gap: 12, width: '100%' }}>
          <Button title="Keep Going" onPress={() => router.back()} />
          <Button title="I’ll Pause for Now" variant="secondary" onPress={() => router.push('/cancel-reasons')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  headline: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  body: { color: '#9CA3AF', fontSize: 16, lineHeight: 22, textAlign: 'center' },
});
