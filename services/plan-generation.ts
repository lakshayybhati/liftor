import type { User, WeeklyBasePlan } from '@/types/user';
import { generateWeeklyBasePlan as generateFromDocumented } from '@/services/documented-ai-service';

// Facade for single generator entry point
export async function generateWeeklyBasePlan(user: User): Promise<WeeklyBasePlan> {
  return await generateFromDocumented(user);
}
