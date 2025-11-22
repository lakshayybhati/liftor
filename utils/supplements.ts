export const SUPPLEMENT_GUIDE: Record<string, { dosage: string; timing: string }> = {
  'Creatine': { dosage: '3-5g daily', timing: 'Any time; with carbs optional' },
  'Whey Protein': { dosage: '20-40g', timing: 'Post-workout or to hit protein target' },
  'Magnesium': { dosage: '200-400mg', timing: 'Evening to support sleep' },
  'Vitamin D': { dosage: '1000-2000 IU', timing: 'With a fatty meal' },
  'Omega-3': { dosage: '1-2g EPA/DHA', timing: 'With meals' },
};

export function mergeSupplements(current: string[] = [], suggested: string[] = []) {
  const setCurrent = new Set<string>(current);
  const addOns = suggested.filter(s => !setCurrent.has(s));
  const optimizeNotes: string[] = [];

  for (const supp of current) {
    const guide = SUPPLEMENT_GUIDE[supp];
    if (guide) {
      optimizeNotes.push(`${supp}: ${guide.dosage}, ${guide.timing}`);
    }
  }

  return {
    current: Array.from(setCurrent),
    addOns,
    optimizeNotes,
  };
}
