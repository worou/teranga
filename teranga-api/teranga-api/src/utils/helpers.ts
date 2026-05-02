export function calculateAge(birthDate: Date | string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function orderUserIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Maps a subscription plan to the number of months included.
 */
export function monthsForPlan(plan: 'DISCOVERY' | 'STANDARD' | 'ENGAGEMENT'): number {
  return plan === 'DISCOVERY' ? 1 : plan === 'STANDARD' ? 3 : 6;
}

export function isValidE164(phone: string): boolean {
  return /^\+\d{8,15}$/.test(phone);
}
