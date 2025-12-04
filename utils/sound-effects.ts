import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

let lastPlayedTime = 0;
const COOLDOWN_MS = 10000; // 10 seconds cooldown

/**
 * Plays the completion sound effect with synchronized haptic feedback.
 * Uses a "fire and forget" approach so it doesn't block the calling code.
 * Includes a debounce mechanism to prevent rapid-fire playback.
 */
export async function playCompletionSound() {
  const now = Date.now();
  
  // Prevent playing if within cooldown period
  if (now - lastPlayedTime < COOLDOWN_MS) {
    console.log('[SoundEffects] Skipping sound due to cooldown');
    return;
  }
  
  lastPlayedTime = now;

  try {
    // Trigger haptic immediately
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Load and play sound
    // Note: We use require directly here to ensure it works with Metro bundler
    const { sound } = await Audio.Sound.createAsync(
      require('../assets/mixkit-software-interface-start-2574.wav')
    );
    
    await sound.playAsync();
    
    // Clean up after playback
    sound.setOnPlaybackStatusUpdate(async (status) => {
      if (status.isLoaded && status.didJustFinish) {
        await sound.unloadAsync();
      }
    });
  } catch (error) {
    console.warn('[SoundEffects] Failed to play completion sound:', error);
  }
}
