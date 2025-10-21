import { Alert } from 'react-native';

export type RangeSpec = {
  name: string; // e.g., "Height (cm)"
  min: number;
  max: number;
  hardMin?: number; // absolute impossible min; auto-clamp/deny without confirm
  hardMax?: number; // absolute impossible max; auto-clamp/deny without confirm
};

/**
 * Validate a numeric input against a plausible range and optionally ask the user to confirm outliers.
 * Returns either the numeric value (possibly clamped) or null if the user cancels/invalid.
 */
export async function confirmNumericWithinRange(
  raw: string | number | undefined | null,
  spec: RangeSpec
): Promise<number | null> {
  const value = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
  if (!isFinite(value)) return null;

  const hardMin = spec.hardMin ?? spec.min;
  const hardMax = spec.hardMax ?? spec.max;

  // If way outside absolute bounds → reject immediately
  if (value < hardMin || value > hardMax) {
    Alert.alert(
      'Please check',
      `${spec.name} of ${value} looks invalid. Please enter a real value.`,
      [{ text: 'OK' }]
    );
    return null;
  }

  // Within plausible min/max? Accept silently
  if (value >= spec.min && value <= spec.max) {
    return value;
  }

  // Soft outlier: ask to confirm
  const message = `${spec.name} of ${value} seems unusual. Are you sure?`;
  const confirmed = await new Promise<boolean>((resolve) => {
    Alert.alert('Confirm value', message, [
      { text: 'Edit', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Yes, keep', style: 'default', onPress: () => resolve(true) },
    ], { cancelable: true });
  });

  return confirmed ? value : null;
}

// Common specs used across the app
export const NumberSpecs = {
  age: { name: 'Age', min: 5, max: 100, hardMin: 1, hardMax: 120 } as RangeSpec,
  heightCm: { name: 'Height (cm)', min: 100, max: 220, hardMin: 50, hardMax: 260 } as RangeSpec,
  weightKg: { name: 'Weight (kg)', min: 30, max: 250, hardMin: 20, hardMax: 350 } as RangeSpec,
  calories: { name: 'Calories', min: 800, max: 6000, hardMin: 400, hardMax: 10000 } as RangeSpec,
  waterL: { name: 'Water (L)', min: 0.5, max: 10, hardMin: 0, hardMax: 20 } as RangeSpec,
  steps: { name: 'Steps', min: 0, max: 50000, hardMin: 0, hardMax: 100000 } as RangeSpec,
  travelDaysPerMonth: { name: 'Travel days/month', min: 0, max: 31, hardMin: 0, hardMax: 31 } as RangeSpec,
};


/**
 * Special validator for calories relative to a recommended baseline.
 * - Shows a soft warning if deviation > softPct
 * - Blocks if deviation > hardPct
 */
export async function confirmCaloriesWithBaseline(
  raw: string | number | undefined | null,
  baselineKcal: number | null | undefined,
  softPct: number = 0.25,
  hardPct: number = 0.45
): Promise<number | null> {
  // First pass absolute sanity using global calorie spec
  const abs = await confirmNumericWithinRange(raw, NumberSpecs.calories);
  if (abs === null) return null;

  if (!baselineKcal || !isFinite(baselineKcal)) {
    return abs; // no baseline available
  }

  const diff = Math.abs(abs - baselineKcal) / Math.max(1, baselineKcal);

  if (diff > hardPct) {
    Alert.alert(
      'Too extreme',
      `That target deviates more than ${Math.round(hardPct * 100)}% from the recommended ${Math.round(baselineKcal)} kcal. Please choose a more realistic value.`,
      [{ text: 'OK' }]
    );
    return null;
  }

  if (diff > softPct) {
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Unusual target',
        `Your target is about ${Math.round(diff * 100)}% different from the recommended ${Math.round(baselineKcal)} kcal. Continue?`,
        [
          { text: 'Edit', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Proceed', style: 'default', onPress: () => resolve(true) },
        ],
        { cancelable: true }
      );
    });
    return confirmed ? abs : null;
  }

  return abs;
}



