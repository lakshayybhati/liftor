export const GOALS = [
  { id: 'WEIGHT_LOSS', label: 'Weight Loss', description: 'Lose fat and get lean' },
  { id: 'MUSCLE_GAIN', label: 'Muscle Gain', description: 'Build muscle and strength' },
  { id: 'ENDURANCE', label: 'Endurance', description: 'Improve cardiovascular fitness' },
  { id: 'GENERAL_FITNESS', label: 'General Fitness', description: 'Stay fit and healthy' },
  { id: 'FLEXIBILITY_MOBILITY', label: 'Flexibility & Mobility', description: 'Improve range of motion' },
] as const;

export const EQUIPMENT_OPTIONS = [
  'Dumbbells',
  'Bands',
  'Bodyweight',
  'Gym',
] as const;

export const DIETARY_PREFS = [
  'Vegetarian',
  'Eggitarian', 
  'Non-veg',
] as const;

export const ACTIVITY_LEVELS = [
  { id: 'Sedentary', label: 'Sedentary', description: 'Little or no exercise', multiplier: 1.2 },
  { id: 'Lightly Active', label: 'Lightly Active', description: '1-3 days/week', multiplier: 1.375 },
  { id: 'Moderately Active', label: 'Moderately Active', description: '3-5 days/week', multiplier: 1.55 },
  { id: 'Very Active', label: 'Very Active', description: '6-7 days/week', multiplier: 1.725 },
  { id: 'Extra Active', label: 'Extra Active', description: 'Very hard exercise daily', multiplier: 1.9 },
] as const;

export const COMMON_SUPPLEMENTS = [
  'Whey Protein',
  'Creatine',
  'Multivitamin',
  'Omega-3',
  'Vitamin D',
  'Pre-workout',
  'BCAAs',
  'Magnesium',
  'Zinc',
  'Probiotics',
] as const;

export const PERSONAL_GOALS = [
  'Get a V-taper',
  'Increase PRs',
  'Build stronger arms',
  'Grow a thicker chest',
  'Build wider lats/back',
  'Get round, capped shoulders',
  'Get visible abs',
  'Improve cardio endurance',
  'Enhance mobility & flexibility',
  'Fix posture and everyday aches',
] as const;

export const PERCEIVED_LACKS = [
  'Protein intake',
  'Recovery time',
  'Sleep quality',
  'Energy levels',
  'Motivation',
  'Consistency',
  'Hydration',
  'Flexibility',
] as const;

export const MOOD_CHARACTERS = [
  {
    id: 'excited',
    label: 'Excited',
    color: '#FF69B4',
    shape: 'circle' as const,
    eyes: 'excited' as const,
    mouth: 'bigSmile' as const,
  },
  {
    id: 'joyful',
    label: 'Joyful',
    color: '#FF1493',
    shape: 'flower' as const,
    eyes: 'joyful' as const,
    mouth: 'softSmile' as const,
  },
  {
    id: 'grateful',
    label: 'Grateful',
    color: '#8A2BE2',
    shape: 'rounded-square' as const,
    eyes: 'happy' as const,
    mouth: 'smile' as const,
  },
  {
    id: 'energized',
    label: 'Energized',
    color: '#9370DB',
    shape: 'rounded-square' as const,
    eyes: 'energized' as const,
    mouth: 'upbeat' as const,
  },
  {
    id: 'sensitive',
    label: 'Sensitive',
    color: '#00BFFF',
    shape: 'rounded-square' as const,
    eyes: 'sensitive' as const,
    mouth: 'neutral' as const,
  },
  {
    id: 'confused',
    label: 'Confused',
    color: '#4169E1',
    shape: 'hexagon' as const,
    eyes: 'confused' as const,
    mouth: 'slightFrown' as const,
  },
  {
    id: 'bored',
    label: 'Bored',
    color: '#228B22',
    shape: 'circle' as const,
    eyes: 'bored' as const,
    mouth: 'flat' as const,
  },
  {
    id: 'stressed',
    label: 'Stressed',
    color: '#32CD32',
    shape: 'triangle' as const,
    eyes: 'stressed' as const,
    mouth: 'wavy' as const,
  },
  {
    id: 'angry',
    label: 'Angry',
    color: '#FF4500',
    shape: 'square' as const,
    eyes: 'angry' as const,
    mouth: 'frown' as const,
  },
  {
    id: 'insecure',
    label: 'Insecure',
    color: '#FF8C00',
    shape: 'circle' as const,
    eyes: 'side' as const,
    mouth: 'line' as const,
  },
  {
    id: 'hurt',
    label: 'Hurt',
    color: '#FFA500',
    shape: 'flower' as const,
    eyes: 'sleepy' as const,
    mouth: 'frown' as const,
  },
  {
    id: 'guilty',
    label: 'Guilty',
    color: '#FFD700',
    shape: 'triangle' as const,
    eyes: 'worried' as const,
    mouth: 'none' as const,
  },
] as const;

export const MOOD_OPTIONS = [
  { emoji: '😔', label: 'Sad' },
  { emoji: '😐', label: 'Neutral' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😀', label: 'Great' },
  { emoji: '🤩', label: 'Amazing' },
] as const;

export const SORENESS_AREAS = [
  'Chest',
  'Back', 
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Core',
  'Glutes',
] as const;

export const APPEARANCE_OPTIONS = [
  'Flat',
  'Full',
  'Dry',
  'Smooth',
] as const;

export const DIGESTION_OPTIONS = [
  'Heavy',
  'Normal',
  'Light',
] as const;

export const WOKE_FEELING_OPTIONS = [
  'Tired',
  'Refreshed',
  'Wired',
] as const;

// New constants for specifics step
export const TRAINING_STYLE_PREFERENCES = [
  { id: 'pump_hypertrophy', label: 'Pump & Hypertrophy', description: 'Pump focused, high volume, machines, feeling the burn' },
  { id: 'strength_prs', label: 'Strength & PRs', description: 'Low reps, heavy compound lifts, chasing PRs' },
  { id: 'cardio_endurance', label: 'Cardio & Endurance', description: 'Running, cycling, steps, conditioning, heart health' },
  { id: 'athletic_performance', label: 'Athletic Performance', description: 'Explosive stuff: sprints, jumps, agility, sports performance' },
  { id: 'mobility_recovery', label: 'Mobility & Recovery', description: 'Stretching, yoga-style flows, light movement, joint health' },
  { id: 'quick_minimal', label: 'Quick & Minimal', description: 'Short, time-efficient sessions, minimal equipment' },
] as const;

export const AVOID_EXERCISES = [
  'Squats',
  'Deadlifts',
  'Overhead Press',
  'Burpees',
  'High Impact',
  'Jumping',
  'Heavy Lifting',
  'Cardio',
] as const;

export const TRAINING_TIMES = [
  'Early Morning (5-7 AM)',
  'Morning (7-10 AM)',
  'Late Morning (10-12 PM)',
  'Afternoon (12-4 PM)',
  'Evening (4-7 PM)',
  'Night (7-10 PM)',
  'Late Night (10+ PM)',
] as const;

export const SESSION_LENGTHS = [
  { value: 20, label: '20 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
  { value: 75, label: '1.25 hours' },
  { value: 90, label: '1.5 hours' },
] as const;

export const FASTING_WINDOWS = [
  'No Fasting',
  '12:12',
  '14:10',
  '16:8',
  '18:6',
  '20:4',
  'OMAD (23:1)',
] as const;

export const MEAL_COUNTS = [
  { value: 1, label: '1 meal' },
  { value: 2, label: '2 meals' },
  { value: 3, label: '3 meals' },
  { value: 4, label: '4 meals' },
  { value: 5, label: '5 meals' },
  { value: 6, label: '6 meals' },
  { value: 7, label: '7 meals' },
  { value: 8, label: '8 meals' },
] as const;

export const CAFFEINE_FREQUENCY = [
  'Never',
  'Rarely (1-2/week)',
  'Sometimes (3-4/week)',
  'Daily (1 cup)',
  'Daily (2-3 cups)',
  'Daily (4+ cups)',
] as const;

export const ALCOHOL_FREQUENCY = [
  'Never',
  'Rarely (1-2/month)',
  'Sometimes (1-2/week)',
  'Regularly (3-4/week)',
  'Daily',
] as const;

export const WORKOUT_SPLITS = [
  { days: 2, split: 'Full Body + Pump', label: 'Full Body + Pump (2 days)' },
  { days: 3, split: 'Full Body', label: 'Full Body (3 days)' },
  { days: 4, split: 'Upper/Lower/Upper/Lower', label: 'Upper/Lower Split (4 days)' },
  { days: 5, split: 'Push/Pull/Legs + Upper/Lower', label: 'PPL + UL (5 days)' },
  { days: 6, split: 'Push/Pull/Legs x2', label: 'PPL x2 (6 days)' },
] as const;

export const TRAINING_LEVELS = [
  { id: 'Beginner', label: 'Beginner', description: 'Less than 1 year of training experience' },
  { id: 'Intermediate', label: 'Intermediate', description: '1-3 years of training experience' },
  { id: 'Professional', label: 'Professional', description: 'More than 3 years of training experience' },
] as const;

// Curated exercise pools by equipment type (used for replacements, not prescription)
export const EXERCISES_BY_EQUIPMENT: Record<string, string[]> = {
  Bodyweight: [
    'Push-ups', 'Pike Push-ups', 'Pull-ups', 'Inverted Rows', 'Bodyweight Squats', 'Reverse Lunges',
    'Hip Bridges', 'Plank', 'Hollow Hold', 'Dead Bug', 'Burpees', 'Mountain Climbers', 'Walking', 'Yoga Flow'
  ],
  Bands: [
    'Band Chest Press', 'Band Shoulder Press', 'Band Rows', 'Band Face Pulls', 'Band Pulldowns',
    'Band Squats', 'Band Romanian Deadlifts', 'Band Lunges', 'Band Pallof Press', 'Band Woodchop'
  ],
  Dumbbells: [
    'DB Bench Press', 'DB Incline Press', 'DB Shoulder Press', 'DB Row', 'DB Pullover', 'DB Rear Delt Fly',
    'DB Squat', 'DB Romanian Deadlift', 'DB Lunge', 'DB Farmer Carry', 'DB Russian Twist'
  ],
  Gym: [
    'Barbell Bench Press', 'Incline Bench Press', 'Overhead Press', 'Lat Pulldown', 'Seated Cable Row', 'Face Pull',
    'Back Squat', 'Front Squat', 'Leg Press', 'Hamstring Curl', 'Calf Raise', 'Cable Pallof Press', 'Hanging Leg Raise',
    'Assault Bike', 'Row Erg', 'Ski Erg'
  ],
};

export const EXERCISE_SYNONYMS: Record<string, string[]> = {
  'Upper Push': ['bench press', 'chest press', 'shoulder press', 'overhead press', 'push-up', 'dip'],
  'Upper Pull': ['row', 'pulldown', 'pull-up', 'chin-up', 'face pull', 'rear delt'],
  Legs: ['squat', 'deadlift', 'lunge', 'hinge', 'press', 'curl', 'raise'],
  Core: ['plank', 'crunch', 'leg raise', 'pallof', 'anti-rotation'],
  Conditioning: ['sprint', 'bike', 'erg', 'metcon', 'circuit', 'burpee', 'jump rope'],
  Recovery: ['walk', 'yoga', 'mobility', 'stretch', 'foam roll'],
};