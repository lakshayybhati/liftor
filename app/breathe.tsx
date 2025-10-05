import React from 'react';
import { Stack, router } from 'expo-router';
import BreatheOverlay from '@/components/BreatheOverlay';

export default function BreatheScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Just Breathe', headerShown: true }} />
      <BreatheOverlay visible={true} onClose={() => router.back()} />
    </>
  );
}





