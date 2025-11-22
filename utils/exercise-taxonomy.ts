export type MovementCategory = 'Upper Push' | 'Upper Pull' | 'Legs' | 'Core' | 'Conditioning' | 'Recovery';

export const CATEGORY_SYNONYMS: Record<MovementCategory, string[]> = {
  'Upper Push': ['bench', 'press', 'push-up', 'dip', 'shoulder press', 'overhead'],
  'Upper Pull': ['row', 'pull', 'chin-up', 'lat pulldown', 'face pull'],
  'Legs': ['squat', 'deadlift', 'lunge', 'hinge', 'leg press', 'hamstring curl', 'calf'],
  'Core': ['plank', 'crunch', 'leg raise', 'anti-rotation', 'pallof'],
  'Conditioning': ['sprint', 'bike', 'erg', 'metcon', 'circuit', 'burpee', 'jump rope'],
  'Recovery': ['walk', 'yoga', 'mobility', 'stretch', 'foam roll'],
};

export const EQUIPMENT_KEYWORDS: Record<string, string[]> = {
  Bodyweight: ['push-up', 'squat', 'plank', 'lunge', 'burpee', 'pull-up', 'chin-up'],
  Bands: ['band', 'resistance band', 'pull-apart'],
  Dumbbells: ['dumbbell', 'db'],
  Gym: ['barbell', 'machine', 'cable', 'smith', 'leg press'],
};

export function categorizeExercise(name: string): MovementCategory | null {
  const lower = name.toLowerCase();
  for (const [category, keys] of Object.entries(CATEGORY_SYNONYMS)) {
    if (keys.some(k => lower.includes(k))) return category as MovementCategory;
  }
  return null;
}

export function isExerciseCompatibleWithEquipment(exercise: string, userEquipment: string[]): boolean {
  const lower = exercise.toLowerCase();
  // If user has Gym, assume universal compatibility
  if (userEquipment.includes('Gym')) return true;
  // Check explicit equipment keywords
  for (const eq of userEquipment) {
    const keys = EQUIPMENT_KEYWORDS[eq] || [];
    if (keys.some(k => lower.includes(k))) return true;
  }
  // Bodyweight fallback: if it looks bodyweight and user has Bodyweight
  if (userEquipment.includes('Bodyweight')) {
    const bodyKeys = EQUIPMENT_KEYWORDS['Bodyweight'];
    if (bodyKeys.some(k => lower.includes(k))) return true;
  }
  return false;
}

export function findEquipmentAlternative(category: MovementCategory | null, userEquipment: string[]): string | null {
  // Very small curated alternatives per equipment and category.
  const byEq: Record<string, Record<MovementCategory, string[]>> = {
    Bodyweight: {
      'Upper Push': ['Push-ups', 'Pike Push-ups', 'Decline Push-ups'],
      'Upper Pull': ['Inverted Rows', 'Pull-ups', 'Chin-ups'],
      Legs: ['Bodyweight Squats', 'Reverse Lunges', 'Hip Bridges'],
      Core: ['Plank', 'Dead Bug', 'Hollow Hold'],
      Conditioning: ['Burpees', 'Jumping Jacks', 'Mountain Climbers'],
      Recovery: ['Walking', 'Yoga Flow', 'Stretching'],
    },
    Bands: {
      'Upper Push': ['Band Chest Press', 'Band Shoulder Press'],
      'Upper Pull': ['Band Rows', 'Band Face Pulls', 'Band Pulldowns'],
      Legs: ['Band Squats', 'Band Romanian Deadlifts', 'Band Lunges'],
      Core: ['Band Pallof Press', 'Band Woodchop'],
      Conditioning: ['Band Complex Circuit'],
      Recovery: ['Band Mobility Routine'],
    },
    Dumbbells: {
      'Upper Push': ['DB Bench Press', 'DB Shoulder Press', 'DB Incline Press'],
      'Upper Pull': ['DB Row', 'DB Pullover', 'DB Rear Delt Fly'],
      Legs: ['DB Squat', 'DB Romanian Deadlift', 'DB Lunge'],
      Core: ['DB Russian Twist', 'DB Farmer Carry'],
      Conditioning: ['DB Complex Circuit'],
      Recovery: ['Light DB Mobility'],
    },
    Gym: {
      'Upper Push': ['Barbell Bench Press', 'Machine Chest Press', 'Cable Fly'],
      'Upper Pull': ['Lat Pulldown', 'Seated Cable Row', 'Face Pull'],
      Legs: ['Back Squat', 'Leg Press', 'Hamstring Curl'],
      Core: ['Cable Pallof Press', 'Hanging Leg Raise'],
      Conditioning: ['Assault Bike', 'Row Erg', 'Ski Erg'],
      Recovery: ['Treadmill Walk', 'Mobility Circuit'],
    },
  };

  for (const eq of userEquipment) {
    const pool = byEq[eq];
    if (pool && category && pool[category] && pool[category].length > 0) {
      return pool[category][0];
    }
  }
  return null;
}
