import JSON5 from 'json5';

/**
 * Extracts and parses JSON from AI response text with multiple fallback strategies
 */
export function extractAndParseJSON(text: string): any {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: text must be a non-empty string');
  }

  console.log('🔍 Attempting to parse JSON, input length:', text.length);

  // Strategy 1: Try to parse as-is (if already clean JSON)
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // Continue to next strategy
  }

  // Strategy 2: Remove markdown code fences and try again
  let cleaned = text
    .replace(/^```[a-z]*\s*\n?/gim, '') // Remove opening fence
    .replace(/\n?```\s*$/gim, '') // Remove closing fence
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue to next strategy
  }

  // Strategy 3: Extract JSON object using braces matching
  const jsonObject = extractFirstJSONObject(cleaned);
  if (jsonObject) {
    try {
      return JSON.parse(jsonObject);
    } catch (e) {
      console.log('⚠️ Standard JSON parse failed, trying JSON5');
      // Try with JSON5
      try {
        return JSON5.parse(jsonObject);
      } catch (e2) {
        console.log('⚠️ JSON5 parse failed, trying to fix truncation');
        // Try to fix truncated JSON
        const fixedJson = attemptToFixTruncatedJSON(jsonObject);
        if (fixedJson) {
          try {
            return JSON5.parse(fixedJson);
          } catch (e3) {
            console.log('⚠️ Could not fix truncated JSON');
          }
        }
      }
    }
  }

  // Strategy 4: Try to find JSON array
  const jsonArray = extractFirstJSONArray(cleaned);
  if (jsonArray) {
    try {
      return JSON.parse(jsonArray);
    } catch (e) {
      // Try with JSON5
      try {
        return JSON5.parse(jsonArray);
      } catch (e2) {
        // Continue to next strategy
      }
    }
  }

  // Strategy 5: Clean common JSON issues and try JSON5
  let fixed = cleaned
    // Fix RIR values
    .replace(/"RIR":\s*"?(\d+)(?:-\d+)?"?/g, '"RIR": $1')
    // Remove trailing commas
    .replace(/,\s*([}\]])/g, '$1')
    // Quote unquoted keys
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    // Fix double quotes
    .replace(/""([^"]+)"":/g, '"$1":')
    // Replace single quotes with double quotes (carefully)
    .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)\1\s*:\s*'([^']*)'/g, '"$2": "$3"')
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ');

  try {
    return JSON5.parse(fixed);
  } catch (e) {
    // Last resort: try to extract any valid JSON structure
    const patterns = [
      /\{[\s\S]*\}/,  // Any object
      /\[[\s\S]*\]/,  // Any array
    ];

    for (const pattern of patterns) {
      const match = fixed.match(pattern);
      if (match) {
        try {
          return JSON5.parse(match[0]);
        } catch (e) {
          continue;
        }
      }
    }
  }

  throw new Error('Failed to parse JSON from response. No valid JSON structure found.');
}

/**
 * Attempts to fix truncated JSON by closing open structures
 */
function attemptToFixTruncatedJSON(json: string): string | null {
  if (!json) return null;
  
  let text = json.trim();
  
  // If it already ends properly, return as-is
  if (text.endsWith('}') || text.endsWith(']')) {
    return text;
  }
  
  console.log('🔧 Attempting to fix truncated JSON...');
  
  // Count open brackets and braces
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    
    if (ch === '"') {
      inString = true;
      continue;
    }
    
    if (ch === '{') openBraces++;
    else if (ch === '}') openBraces--;
    else if (ch === '[') openBrackets++;
    else if (ch === ']') openBrackets--;
  }
  
  // Close any unclosed strings first
  if (inString) {
    // Find the last quote and check if we're in a value or key
    const lastQuoteIndex = text.lastIndexOf('"');
    if (lastQuoteIndex > 0) {
      // Check what comes before to determine context
      const beforeQuote = text.substring(Math.max(0, lastQuoteIndex - 20), lastQuoteIndex);
      if (beforeQuote.includes(':')) {
        // We're likely in a value, close it
        text += '"';
      }
    }
  }
  
  // Remove incomplete items at the end
  // Look for common incomplete patterns
  const patterns = [
    /,\s*"[^"]*$/,  // Incomplete key at end
    /,\s*\{[^}]*$/,  // Incomplete object at end  
    /,\s*\[[^\]]*$/, // Incomplete array at end
    /"[^"]*:\s*"[^"]*$/,  // Incomplete key-value pair
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      text = text.replace(pattern, '');
      break;
    }
  }
  
  // Close open structures
  while (openBrackets > 0) {
    text += ']';
    openBrackets--;
  }
  
  while (openBraces > 0) {
    text += '}';
    openBraces--;
  }
  
  console.log('🔧 Fixed JSON by adding:', text.substring(json.length));
  
  return text;
}

/**
 * Extracts the first complete JSON object from text
 */
function extractFirstJSONObject(text: string): string | null {
  if (!text) return null;
  
  const start = text.indexOf('{');
  if (start === -1) return null;
  
  let depth = 0;
  let inString = false;
  let escape = false;
  
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    
    if (ch === '"') {
      inString = true;
      continue;
    }
    
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.substring(start, i + 1);
      }
    }
  }
  
  return null;
}

/**
 * Extracts the first complete JSON array from text
 */
function extractFirstJSONArray(text: string): string | null {
  if (!text) return null;
  
  const start = text.indexOf('[');
  if (start === -1) return null;
  
  let depth = 0;
  let inString = false;
  let escape = false;
  
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    
    if (ch === '"') {
      inString = true;
      continue;
    }
    
    if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return text.substring(start, i + 1);
      }
    }
  }
  
  return null;
}

/**
 * Validates that a parsed plan has the required structure
 */
export function validatePlanStructure(plan: any, type: 'weekly' | 'daily'): boolean {
  if (!plan || typeof plan !== 'object') return false;

  if (type === 'weekly') {
    // Weekly base plan validation
    if (!plan.days || typeof plan.days !== 'object') return false;
    
    const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of requiredDays) {
      if (!plan.days[day]) return false;
      
      const dayPlan = plan.days[day];
      if (!dayPlan.workout || !dayPlan.nutrition || !dayPlan.recovery) return false;
      
      // Validate workout structure
      if (!dayPlan.workout.focus || !Array.isArray(dayPlan.workout.focus)) return false;
      if (!dayPlan.workout.blocks || !Array.isArray(dayPlan.workout.blocks)) return false;
      
      // Validate nutrition structure
      if (typeof dayPlan.nutrition.total_kcal !== 'number') return false;
      if (typeof dayPlan.nutrition.protein_g !== 'number') return false;
      if (!dayPlan.nutrition.meals || !Array.isArray(dayPlan.nutrition.meals)) return false;
      
      // Validate recovery structure
      if (!dayPlan.recovery.mobility || !Array.isArray(dayPlan.recovery.mobility)) return false;
      if (!dayPlan.recovery.sleep || !Array.isArray(dayPlan.recovery.sleep)) return false;
    }
    
    return true;
  } else {
    // Daily plan validation
    if (!plan.workout || !plan.nutrition || !plan.recovery) return false;
    
    // Validate workout structure
    if (!plan.workout.focus || !Array.isArray(plan.workout.focus)) return false;
    if (!plan.workout.blocks || !Array.isArray(plan.workout.blocks)) return false;
    
    // Validate nutrition structure
    if (typeof plan.nutrition.total_kcal !== 'number') return false;
    if (typeof plan.nutrition.protein_g !== 'number') return false;
    if (!plan.nutrition.meals || !Array.isArray(plan.nutrition.meals)) return false;
    
    // Validate recovery structure
    if (!plan.recovery.mobility || !Array.isArray(plan.recovery.mobility)) return false;
    if (!plan.recovery.sleep || !Array.isArray(plan.recovery.sleep)) return false;
    
    return true;
  }
}

/**
 * Repairs a plan structure by filling in missing fields with defaults
 */
export function repairPlanStructure(plan: any, type: 'weekly' | 'daily', targetCalories: number, targetProtein: number): any {
  if (type === 'weekly') {
    // Ensure we have a days object
    if (!plan.days) plan.days = {};
    
    const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    for (const day of requiredDays) {
      if (!plan.days[day]) {
        // Use Monday as template or create default
        plan.days[day] = plan.days.monday || createDefaultDayPlan(targetCalories, targetProtein, day);
      } else {
        // Repair existing day
        plan.days[day] = repairDayPlan(plan.days[day], targetCalories, targetProtein);
      }
    }
    
    return plan;
  } else {
    // Repair daily plan
    return repairDayPlan(plan, targetCalories, targetProtein);
  }
}

function repairDayPlan(dayPlan: any, targetCalories: number, targetProtein: number): any {
  // Ensure workout exists
  if (!dayPlan.workout) {
    dayPlan.workout = {
      focus: ['Full Body'],
      blocks: [
        {
          name: 'Warm-up',
          items: [{ exercise: 'Dynamic stretching', sets: 1, reps: '5 min', RIR: 0 }]
        },
        {
          name: 'Main',
          items: [
            { exercise: 'Bodyweight Squats', sets: 3, reps: '10-15', RIR: 2 },
            { exercise: 'Push-ups', sets: 3, reps: '8-12', RIR: 2 },
            { exercise: 'Plank', sets: 3, reps: '30-60s', RIR: 1 }
          ]
        }
      ],
      notes: 'Adaptive workout based on your goals'
    };
  } else {
    if (!dayPlan.workout.focus || !Array.isArray(dayPlan.workout.focus)) {
      dayPlan.workout.focus = ['Full Body'];
    }
    if (!dayPlan.workout.blocks || !Array.isArray(dayPlan.workout.blocks)) {
      dayPlan.workout.blocks = [];
    }
  }
  
  // Ensure nutrition exists and has correct values
  if (!dayPlan.nutrition) {
    dayPlan.nutrition = {
      total_kcal: targetCalories,
      protein_g: targetProtein,
      meals: [
        {
          name: 'Breakfast',
          items: [
            { food: 'Oatmeal with protein powder', qty: '1 bowl' },
            { food: 'Banana', qty: '1 medium' }
          ]
        },
        {
          name: 'Lunch',
          items: [
            { food: 'Grilled chicken breast', qty: '150g' },
            { food: 'Brown rice', qty: '1 cup' },
            { food: 'Mixed vegetables', qty: '2 cups' }
          ]
        },
        {
          name: 'Dinner',
          items: [
            { food: 'Salmon fillet', qty: '150g' },
            { food: 'Sweet potato', qty: '1 medium' },
            { food: 'Green salad', qty: '2 cups' }
          ]
        }
      ],
      hydration_l: 2.5
    };
  } else {
    // Force correct calorie and protein values
    dayPlan.nutrition.total_kcal = targetCalories;
    dayPlan.nutrition.protein_g = targetProtein;
    
    if (!dayPlan.nutrition.meals || !Array.isArray(dayPlan.nutrition.meals)) {
      dayPlan.nutrition.meals = [];
    }
    
    if (typeof dayPlan.nutrition.hydration_l !== 'number') {
      dayPlan.nutrition.hydration_l = 2.5;
    }
  }
  
  // Ensure recovery exists
  if (!dayPlan.recovery) {
    dayPlan.recovery = {
      mobility: ['10-minute post-workout stretch', 'Foam rolling if available'],
      sleep: ['Target 7-8 hours', 'Avoid screens 1 hour before bed']
    };
  } else {
    if (!dayPlan.recovery.mobility || !Array.isArray(dayPlan.recovery.mobility)) {
      dayPlan.recovery.mobility = ['Stretching routine'];
    }
    if (!dayPlan.recovery.sleep || !Array.isArray(dayPlan.recovery.sleep)) {
      dayPlan.recovery.sleep = ['7-8 hours recommended'];
    }
  }
  
  return dayPlan;
}

function createDefaultDayPlan(targetCalories: number, targetProtein: number, day: string): any {
  const isWeekend = day === 'saturday' || day === 'sunday';
  const isRestDay = day === 'wednesday' || day === 'sunday';
  
  return {
    workout: {
      focus: isRestDay ? ['Rest/Recovery'] : isWeekend ? ['Full Body/Fun'] : ['Strength Training'],
      blocks: isRestDay ? [
        {
          name: 'Active Recovery',
          items: [{ exercise: 'Light walking or yoga', sets: 1, reps: '20-30 min', RIR: 0 }]
        }
      ] : [
        {
          name: 'Warm-up',
          items: [{ exercise: 'Dynamic stretching', sets: 1, reps: '5-8 min', RIR: 0 }]
        },
        {
          name: 'Main Workout',
          items: [
            { exercise: 'Compound movement 1', sets: 3, reps: '8-12', RIR: 2 },
            { exercise: 'Compound movement 2', sets: 3, reps: '8-12', RIR: 2 },
            { exercise: 'Accessory exercise', sets: 3, reps: '10-15', RIR: 2 }
          ]
        }
      ],
      notes: isRestDay ? 'Rest and recovery day' : 'Focus on form and progressive overload'
    },
    nutrition: {
      total_kcal: targetCalories,
      protein_g: targetProtein,
      meals: [
        {
          name: 'Breakfast',
          items: [
            { food: 'High-protein breakfast', qty: 'As needed' },
            { food: 'Complex carbs', qty: 'As needed' }
          ]
        },
        {
          name: 'Lunch',
          items: [
            { food: 'Lean protein source', qty: 'As needed' },
            { food: 'Whole grains', qty: 'As needed' },
            { food: 'Vegetables', qty: 'As needed' }
          ]
        },
        {
          name: 'Dinner',
          items: [
            { food: 'Quality protein', qty: 'As needed' },
            { food: 'Complex carbs', qty: 'As needed' },
            { food: 'Salad or vegetables', qty: 'As needed' }
          ]
        }
      ],
      hydration_l: 2.5
    },
    recovery: {
      mobility: isRestDay ? 
        ['Gentle stretching', 'Focus on tight areas'] : 
        ['Post-workout stretching', 'Target worked muscles'],
      sleep: ['7-8 hours recommended', isWeekend ? 'Maintain sleep schedule' : 'Consistent bedtime']
    }
  };
}
