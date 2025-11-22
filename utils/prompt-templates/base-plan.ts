import type { User } from '@/types/user';

type Constraints = {
  trainingDays: number;
  equipment: string[];
  trainingLevel?: string;
  sessionLength?: number;
  goal?: string;
  injuries?: string;
  personalGoals?: string[];
  preferredExercises?: string[];
  avoidExercises?: string[];
  dietaryPrefs?: string[];
  calorieTarget: number;
  proteinTarget: number;
};

export function buildBasePlanPrompts(
  user: User,
  calorieTarget: number,
  proteinTarget: number,
  retryMessage?: string
) {
  const constraints: Constraints = {
    trainingDays: user.trainingDays || 3,
    equipment: user.equipment || [],
    trainingLevel: user.trainingLevel,
    sessionLength: user.sessionLength || 45,
    goal: user.goal,
    injuries: user.injuries || undefined,
    personalGoals: user.personalGoals || undefined,
    preferredExercises: user.preferredExercises || [],
    avoidExercises: user.avoidExercises || [],
    dietaryPrefs: user.dietaryPrefs || [],
    calorieTarget,
    proteinTarget,
  };

  const systemPromptParts = [
    'You are an elite personal trainer and nutritionist. Design a personalized 7-day plan for this user.',
    '',
    'USER PROFILE:',
    `- Goal: ${constraints.goal}`,
    `- Training days: ${constraints.trainingDays} per week`,
    `- Equipment: ${constraints.equipment.join(', ')}`,
    `- Training level: ${constraints.trainingLevel || 'Beginner'}`,
    `- Session length: ${constraints.sessionLength} minutes`,
    `- Dietary prefs: ${(constraints.dietaryPrefs || []).join(', ') || 'None'}`,
    `- Injuries/Avoid: ${constraints.injuries || 'None'}, ${(constraints.avoidExercises || []).join(', ')}`,
    `- Personal goals: ${(constraints.personalGoals || []).join(', ') || 'None'}`,
    `- Preferred exercises: ${(constraints.preferredExercises || []).join(', ') || 'None'}`,
    '',
    'TASK:',
    'Design an optimal weekly training split for this user. Choose the best split pattern based on their training days and goals. Select exercises that match their equipment and training level. Vary exercises across days. Design meals that match their dietary preferences and calorie/protein targets.',
    '',
    'CRITICAL RULES:',
    '- ONLY use exercises possible with their equipment',
    '- ONLY include foods matching their dietary preferences',
    '- Respect their session length',
    '- Avoid exercises/foods they listed to avoid and accommodate injuries',
    '- NO duplicate exercises within a day',
    '- Vary exercises between consecutive training days',
    "- Do NOT copy the JSON example verbatim; synthesize based on THIS user's data",
    "- make sure that every workout has multiple excersices according to the user's data and dont just stick to few make sure the whole week it is a complete workout plan.",
    "- make sure that every day has a complete nutrition plan according to the user's data and dont just stick to few make sure the whole week it is a complete nutrition plan.",
    "- make sure that every day has a complete recovery plan according to the user's data and dont just stick to few make sure the whole week it is a complete recovery plan.",
    "- make sure that every day has a complete motivation plan according to the user's data and dont just stick to few make sure the whole week it is a complete motivation plan.",
    "- make sure that every day has a complete adjustments plan according to the user's data and dont just stick to few make sure the whole week it is a complete adjustments plan.",
    '',
    'OUTPUT CONSTRAINTS:',
    '- Return ONLY valid JSON with a top-level "days" object containing keys: "monday","tuesday","wednesday","thursday","friday","saturday","sunday".',
    '- The structure must match the example below EXACTLY.',
    '- make sure that you give all the days complete plan in the JSON. Do not skip any days.',
  ];

  if (retryMessage) {
    systemPromptParts.push('', `RETRY DIRECTIVE: ${retryMessage}`);
  }

  const systemPrompt = systemPromptParts.join('\n');

  // Minimal JSON example (structure only). Explicit anti-copy instruction above.
  const jsonTemplate = `{
  "days": {
    "monday": {
      "workout": {
        "focus": ["Upper Body"],
        "blocks": [
          {"name": "Main", "items": [{"exercise": "Exercise A", "sets": 3, "reps": "8-12", "RIR": 2}]}
        ],
        "notes": "One helpful note"
      },
      "nutrition": {
        "total_kcal": ${calorieTarget},
        "protein_g": ${proteinTarget},
        "meals": [
          {"name": "Meal 1", "items": [{"food": "Food", "qty": "Amount"}]}
        ],
        "hydration_l": 2.5
      },
      "recovery": {
        "mobility": ["Mobility work"],
        "sleep": ["Sleep tip"]
      },
      "reason": "3-4 sentences, expert rationale tailored to this day"
    },
    "tuesday": {"workout": {"focus": ["Lower Body"], "blocks": [{"name": "Main", "items": [{"exercise": "Exercise B", "sets": 3, "reps": "8-12", "RIR": 2}]}]}, "nutrition": {"total_kcal": ${calorieTarget}, "protein_g": ${proteinTarget}, "meals": [{"name": "Meal 1", "items": [{"food": "Food", "qty": "Amount"}]}], "hydration_l": 2.5}, "recovery": {"mobility": ["Mobility"], "sleep": ["Sleep"]}, "reason": "Expert rationale"},
    "wednesday": {"workout": {"focus": ["Full Body"] , "blocks": [{"name": "Main", "items": [{"exercise": "Exercise C", "sets": 3, "reps": "8-12", "RIR": 2}]}]}, "nutrition": {"total_kcal": ${calorieTarget}, "protein_g": ${proteinTarget}, "meals": [{"name": "Meal 1", "items": [{"food": "Food", "qty": "Amount"}]}], "hydration_l": 2.5}, "recovery": {"mobility": ["Mobility"], "sleep": ["Sleep"]}, "reason": "Expert rationale"},
    "thursday": {"workout": {"focus": ["Upper Pull"], "blocks": [{"name": "Main", "items": [{"exercise": "Exercise D", "sets": 3, "reps": "8-12", "RIR": 2}]}]}, "nutrition": {"total_kcal": ${calorieTarget}, "protein_g": ${proteinTarget}, "meals": [{"name": "Meal 1", "items": [{"food": "Food", "qty": "Amount"}]}], "hydration_l": 2.5}, "recovery": {"mobility": ["Mobility"], "sleep": ["Sleep"]}, "reason": "Expert rationale"},
    "friday": {"workout": {"focus": ["Lower Body"], "blocks": [{"name": "Main", "items": [{"exercise": "Exercise E", "sets": 3, "reps": "8-12", "RIR": 2}]}]}, "nutrition": {"total_kcal": ${calorieTarget}, "protein_g": ${proteinTarget}, "meals": [{"name": "Meal 1", "items": [{"food": "Food", "qty": "Amount"}]}], "hydration_l": 2.5}, "recovery": {"mobility": ["Mobility"], "sleep": ["Sleep"]}, "reason": "Expert rationale"},
    "saturday": {"workout": {"focus": ["Conditioning"], "blocks": [{"name": "Metcon", "items": [{"exercise": "Circuit", "sets": 1, "reps": "15-20 min", "RIR": 0}]}]}, "nutrition": {"total_kcal": ${calorieTarget}, "protein_g": ${proteinTarget}, "meals": [{"name": "Meal 1", "items": [{"food": "Food", "qty": "Amount"}]}], "hydration_l": 2.5}, "recovery": {"mobility": ["Mobility"], "sleep": ["Sleep"]}, "reason": "Expert rationale"},
    "sunday": {"workout": {"focus": ["Recovery"], "blocks": [{"name": "Active Recovery", "items": [{"exercise": "Walk/Yoga", "sets": 1, "reps": "20-30 min", "RIR": 0}]}]}, "nutrition": {"total_kcal": ${calorieTarget}, "protein_g": ${proteinTarget}, "meals": [{"name": "Meal 1", "items": [{"food": "Food", "qty": "Amount"}]}], "hydration_l": 2.5}, "recovery": {"mobility": ["Mobility"], "sleep": ["Sleep"]}, "reason": "Expert rationale"}
  }
}`;

  const responseRules: string[] = [
    'RESPONSE RULES:',
    '1. Return ONLY the JSON object described above with the exact structure shown.',
    '2. The JSON MUST have a top-level "days" object containing all seven day keys: "monday","tuesday","wednesday","thursday","friday","saturday","sunday" (all lowercase).',
    '3. Do NOT include explanations, markdown fences, code blocks, or commentary.',
    '4. If you cannot complete all seven day keys, reply exactly with INCOMPLETE.',
  ];

  if (retryMessage) {
    responseRules.push(`5. Retry Context: ${retryMessage}`);
  }

  const userRequest = `${jsonTemplate}\n${responseRules.join('\n')}`;

  return { systemPrompt, userRequest };
}

export function buildReasonPrompt(dayKey: string, user: User, dayFocus: string[], calorieTarget: number, proteinTarget: number) {
  const systemPrompt = [
    'You are an elite humorfull coach writing a concise expert rationale for a daily plan.',
    'Write 3-4 sentences. PhD-level tone. Reference only relevant user goals.make it look like you care a lot about the user and you are a friend.',
  ].join('\n');

  const userRequest = [
    `Day: ${dayKey}`,
    `Focus: ${dayFocus.join(', ')}`,
    `Goal: ${user.goal}`,
    `Personal goals: ${user.personalGoals || 'None'}`,
    `Calories: ${calorieTarget} kcal, Protein: ${proteinTarget} g`,
    'Return only the paragraph text. No JSON.',
  ].join('\n');

  return { systemPrompt, userRequest };
}
