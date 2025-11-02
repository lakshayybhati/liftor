import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CancelRetentionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Logo at top */}
      <View style={[styles.logoContainer, { paddingTop: insets.top + 20 }]}>
        <Image 
          source={require('@/assets/images/liftorlogo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      
      <View style={styles.center}>
        <Text style={styles.headline}>You're Closer Than You Think.</Text>
        <Text style={styles.body}>
          Your next transformation isn't luck—it's consistency. Liftor keeps your plan evolving, your nutrition precise, and your results visible.
        </Text>
        <View style={{ gap: 12, width: '100%' }}>
          <Button title="Keep Going" onPress={() => router.back()} />
          <Button title="I'll Pause for Now" variant="secondary" onPress={() => router.push('/cancel-reasons')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  logoContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 120,
    height: 40,
    tintColor: '#fff',
  },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  headline: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  body: { color: '#9CA3AF', fontSize: 16, lineHeight: 22, textAlign: 'center' },
});

