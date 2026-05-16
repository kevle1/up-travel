export function dailyAllowance(remainingCents: number, daysLeft: number): number {
  if (daysLeft <= 0 || remainingCents <= 0) return 0;
  return Math.round(remainingCents / daysLeft);
}

export interface PaceInput {
  spent: number;
  daysElapsed: number;
  totalDays: number;
  budgetAudCents: number;
}

export function paceDelta({ spent, daysElapsed, totalDays, budgetAudCents }: PaceInput): number {
  if (daysElapsed <= 0 || totalDays <= 0) return 0;
  const targetDaily = budgetAudCents / totalDays;
  const actualDaily = spent / daysElapsed;
  return actualDaily - targetDaily;
}
