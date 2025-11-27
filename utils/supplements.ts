/**
 * Reference list of common supplements with dosage and timing guidance.
 * The AI can use this as a reference but is not strictly limited to this list.
 * Each entry includes dosage guidance and optimal timing.
 */
export const COMMON_SUPPLEMENTS_GUIDE: Record<string, { dosage: string; timing: string; purpose: string }> = {
  // === PROTEIN & AMINO ACIDS ===
  'Whey Protein': { dosage: '20-40g', timing: 'Post-workout or to hit protein target', purpose: 'Muscle protein synthesis, recovery' },
  'Casein Protein': { dosage: '20-40g', timing: 'Before bed for slow-release protein', purpose: 'Overnight muscle recovery' },
  'Plant Protein': { dosage: '25-40g', timing: 'Post-workout or with meals', purpose: 'Vegan/vegetarian protein source' },
  'BCAAs': { dosage: '5-10g', timing: 'During or after workout', purpose: 'Reduce muscle breakdown, recovery' },
  'EAAs': { dosage: '10-15g', timing: 'During or after workout', purpose: 'Complete amino acid profile for recovery' },
  'L-Glutamine': { dosage: '5-10g', timing: 'Post-workout or before bed', purpose: 'Gut health, immune support, recovery' },
  
  // === PERFORMANCE & STRENGTH ===
  'Creatine': { dosage: '3-5g daily', timing: 'Any time; with carbs optional', purpose: 'Strength, power, muscle hydration' },
  'Beta-Alanine': { dosage: '3-6g daily', timing: 'Split doses to reduce tingling', purpose: 'Muscular endurance, buffer lactic acid' },
  'Citrulline': { dosage: '6-8g', timing: '30-60 min pre-workout', purpose: 'Blood flow, pump, endurance' },
  'Pre-workout': { dosage: 'As directed', timing: '20-30 min before training', purpose: 'Energy, focus, performance' },
  'Caffeine': { dosage: '100-200mg', timing: '30-60 min pre-workout', purpose: 'Energy, focus, fat oxidation' },
  
  // === VITAMINS ===
  'Multivitamin': { dosage: 'As directed', timing: 'With breakfast', purpose: 'Fill nutritional gaps' },
  'Vitamin D': { dosage: '1000-4000 IU', timing: 'With a fatty meal', purpose: 'Bone health, immune function, mood' },
  'Vitamin D3': { dosage: '1000-4000 IU', timing: 'With a fatty meal', purpose: 'Bone health, immune function, mood' },
  'Vitamin C': { dosage: '500-1000mg', timing: 'With meals', purpose: 'Immune support, antioxidant' },
  'Vitamin B Complex': { dosage: 'As directed', timing: 'Morning with food', purpose: 'Energy metabolism, nervous system' },
  'Vitamin B12': { dosage: '500-1000mcg', timing: 'Morning', purpose: 'Energy, nerve function (especially for vegetarians)' },
  'Vitamin K2': { dosage: '100-200mcg', timing: 'With Vitamin D', purpose: 'Calcium metabolism, bone health' },
  
  // === MINERALS ===
  'Magnesium': { dosage: '200-400mg', timing: 'Evening to support sleep', purpose: 'Sleep, muscle relaxation, recovery' },
  'Magnesium Glycinate': { dosage: '200-400mg', timing: 'Evening', purpose: 'Sleep quality, relaxation, less GI upset' },
  'Magnesium Citrate': { dosage: '200-400mg', timing: 'Evening', purpose: 'Sleep, muscle cramps' },
  'Zinc': { dosage: '15-30mg', timing: 'With dinner, away from calcium', purpose: 'Immune function, testosterone support' },
  'Iron': { dosage: 'As directed by doctor', timing: 'Empty stomach or with vitamin C', purpose: 'Oxygen transport (if deficient)' },
  'Calcium': { dosage: '500-1000mg', timing: 'Split doses with meals', purpose: 'Bone health' },
  'Potassium': { dosage: '99-500mg', timing: 'With meals', purpose: 'Electrolyte balance, muscle function' },
  'Sodium': { dosage: 'As needed', timing: 'Pre/during workout if sweating heavily', purpose: 'Electrolyte balance, hydration' },
  
  // === OMEGA FATTY ACIDS ===
  'Omega-3': { dosage: '1-3g EPA/DHA', timing: 'With meals', purpose: 'Inflammation, heart health, brain function' },
  'Fish Oil': { dosage: '1-3g EPA/DHA', timing: 'With meals', purpose: 'Anti-inflammatory, joint health' },
  'Krill Oil': { dosage: '1-2g', timing: 'With meals', purpose: 'Omega-3s with better absorption' },
  'Algae Oil': { dosage: '1-2g DHA', timing: 'With meals', purpose: 'Vegan omega-3 source' },
  
  // === JOINT & RECOVERY ===
  'Glucosamine': { dosage: '1500mg', timing: 'With meals', purpose: 'Joint health, cartilage support' },
  'Chondroitin': { dosage: '800-1200mg', timing: 'With meals', purpose: 'Joint health, often paired with glucosamine' },
  'Collagen': { dosage: '10-15g', timing: 'Any time, often morning', purpose: 'Skin, joint, and connective tissue health' },
  'MSM': { dosage: '1-3g', timing: 'With meals', purpose: 'Joint health, inflammation' },
  'Turmeric': { dosage: '500-1000mg curcumin', timing: 'With meals containing fat', purpose: 'Anti-inflammatory, recovery' },
  'Curcumin': { dosage: '500-1000mg', timing: 'With meals containing fat and black pepper', purpose: 'Anti-inflammatory' },
  'Tart Cherry': { dosage: '480-960mg or 8oz juice', timing: 'Post-workout or before bed', purpose: 'Recovery, sleep, inflammation' },
  
  // === SLEEP & RELAXATION ===
  'Melatonin': { dosage: '0.5-3mg', timing: '30-60 min before bed', purpose: 'Sleep onset, jet lag' },
  'Ashwagandha': { dosage: '300-600mg', timing: 'Evening or split doses', purpose: 'Stress reduction, cortisol management, sleep' },
  'L-Theanine': { dosage: '100-200mg', timing: 'Evening or with caffeine', purpose: 'Relaxation without drowsiness, focus' },
  'Valerian Root': { dosage: '300-600mg', timing: '30-60 min before bed', purpose: 'Sleep support' },
  'Glycine': { dosage: '3-5g', timing: 'Before bed', purpose: 'Sleep quality, recovery' },
  'GABA': { dosage: '250-500mg', timing: 'Evening', purpose: 'Relaxation, sleep' },
  
  // === GUT HEALTH ===
  'Probiotics': { dosage: '10-50 billion CFU', timing: 'Morning on empty stomach or with food', purpose: 'Gut health, immune function, digestion' },
  'Digestive Enzymes': { dosage: 'As directed', timing: 'With meals', purpose: 'Improve digestion and nutrient absorption' },
  'Psyllium Husk': { dosage: '5-10g', timing: 'With plenty of water', purpose: 'Fiber, digestive regularity' },
  
  // === IMMUNE SUPPORT ===
  'Elderberry': { dosage: 'As directed', timing: 'Daily or at onset of illness', purpose: 'Immune support' },
  'Echinacea': { dosage: 'As directed', timing: 'At first sign of cold', purpose: 'Immune support' },
  'Quercetin': { dosage: '500-1000mg', timing: 'With meals', purpose: 'Antioxidant, immune support, allergy relief' },
  
  // === ENERGY & ADAPTOGENS ===
  'Rhodiola Rosea': { dosage: '200-400mg', timing: 'Morning, before meals', purpose: 'Energy, stress adaptation, mental performance' },
  'Ginseng': { dosage: '200-400mg', timing: 'Morning', purpose: 'Energy, cognitive function' },
  'Maca': { dosage: '1.5-3g', timing: 'Morning', purpose: 'Energy, hormone balance' },
  'CoQ10': { dosage: '100-200mg', timing: 'With fatty meal', purpose: 'Cellular energy, heart health' },
  
  // === ELECTROLYTES ===
  'Electrolytes': { dosage: 'As needed', timing: 'During/after exercise or in heat', purpose: 'Hydration, muscle function, cramping prevention' },
  'LMNT': { dosage: '1 packet', timing: 'Morning or during workout', purpose: 'Sodium-focused electrolyte balance' },
  'Nuun': { dosage: '1 tablet in water', timing: 'During activity', purpose: 'Light electrolyte replenishment' },
};

// Legacy guide for backward compatibility
export const SUPPLEMENT_GUIDE: Record<string, { dosage: string; timing: string }> = {
  'Creatine': { dosage: '3-5g daily', timing: 'Any time; with carbs optional' },
  'Whey Protein': { dosage: '20-40g', timing: 'Post-workout or to hit protein target' },
  'Magnesium': { dosage: '200-400mg', timing: 'Evening to support sleep' },
  'Vitamin D': { dosage: '1000-2000 IU', timing: 'With a fatty meal' },
  'Omega-3': { dosage: '1-2g EPA/DHA', timing: 'With meals' },
};

/**
 * Get the list of all common supplement names from the guide
 */
export function getCommonSupplementNames(): string[] {
  return Object.keys(COMMON_SUPPLEMENTS_GUIDE);
}

/**
 * Check if a supplement is in the common guide (case-insensitive)
 */
export function isCommonSupplement(name: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  return Object.keys(COMMON_SUPPLEMENTS_GUIDE).some(
    key => key.toLowerCase() === normalizedName
  );
}

/**
 * Get supplement info if it's in the common guide
 */
export function getSupplementInfo(name: string): { dosage: string; timing: string; purpose: string } | null {
  const entry = Object.entries(COMMON_SUPPLEMENTS_GUIDE).find(
    ([key]) => key.toLowerCase() === name.trim().toLowerCase()
  );
  return entry ? entry[1] : null;
}

// Very small, conservative blacklist of compounds we never want to surface.
// NOTE: string matching is done on a lower-cased version of the supplement name.
const SUPPLEMENT_BLACKLIST = [
  'sarm',
  'rad-140',
  'lgd-4033',
  'mk-677',
  'steroid',
  'anavar',
  'winstrol',
  'trenbolone',
  'dianabol',
  'prohormone',
  'clenbuterol',
  'dmba',
  'dmaa',
];

function normalizeKey(name: string): string {
  return (name || '').trim().toLowerCase();
}

export function filterIllegalSupplements(supplements: string[] = []): string[] {
  if (!supplements || supplements.length === 0) return [];

  return supplements.filter((raw) => {
    const key = normalizeKey(raw);
    if (!key) return false;
    // If any blacklist token is contained in the name, drop it
    return !SUPPLEMENT_BLACKLIST.some((blocked) => key.includes(blocked));
  });
}

/**
 * Merge the user's current supplement stack with AI/heuristic suggestions.
 *
 * - `current` is always based on the user's own list (after de-duping and safety filtering)
 * - `addOns` are safe, non-duplicate extras not already in `current`
 * - `optimizeNotes` describe dosage/timing for items in `current`
 */
export function mergeSupplements(userCurrent: string[] = [], suggested: string[] = []) {
  // 1) Safety filter both sides
  const safeCurrent = filterIllegalSupplements(userCurrent);
  const safeSuggested = filterIllegalSupplements(suggested);

  // 2) De‑dupe current stack (case-insensitive, but preserve first seen casing)
  const currentByKey = new Map<string, string>();
  for (const raw of safeCurrent) {
    const key = normalizeKey(raw);
    if (!key) continue;
    if (!currentByKey.has(key)) {
      currentByKey.set(key, raw);
    }
  }

  // 3) Build add-ons: only safe, non-duplicate suggestions
  const addOns: string[] = [];
  const seenAddOnKeys = new Set<string>();
  for (const raw of safeSuggested) {
    const key = normalizeKey(raw);
    if (!key) continue;
    if (currentByKey.has(key)) continue; // already in user's stack
    if (seenAddOnKeys.has(key)) continue;
    seenAddOnKeys.add(key);
    addOns.push(raw);
  }

  // 4) Optimization notes for the user's stack only
  const optimizeNotes: string[] = [];
  for (const supp of currentByKey.values()) {
    const guide = SUPPLEMENT_GUIDE[supp];
    if (guide) {
      optimizeNotes.push(`${supp}: ${guide.dosage}, ${guide.timing}`);
    }
  }

  const result = {
    current: Array.from(currentByKey.values()),
    addOns,
    optimizeNotes,
  };

  // Lightweight sanity checks to guard against regressions
  const currentKeys = new Set(result.current.map((s) => normalizeKey(s)));
  const leakedDup = result.addOns.find((s) => currentKeys.has(normalizeKey(s)));
  if (leakedDup) {
    // Should never happen, but if it does we strip it defensively
    const cleanedAddOns = result.addOns.filter((s) => !currentKeys.has(normalizeKey(s)));
    result.addOns.splice(0, result.addOns.length, ...cleanedAddOns);
  }

  return result;
}
