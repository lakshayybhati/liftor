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


      <View style={styles.center}>
        <Image
          source={require('../assets/images/liftorlogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.headline}>You're Closer Than You Think.</Text>
        <Text style={styles.body}>
          Your transformation isn't about luck it's about showing up. We're ready to change and adapt for you, evolving your plan as you grow. Take this step towards a beautiful future. Your best self is waiting.
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
  container: { flex: 1, backgroundColor: '#0c0c0e' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  logo: { width: 300, height: 100, marginBottom: 16 },
  headline: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  body: { color: '#fff', fontSize: 16, lineHeight: 22, textAlign: 'center' },
});
