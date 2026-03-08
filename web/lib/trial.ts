/**
 * Trial end computation: signup date + N calendar months as Unix timestamp.
 * Used when creating Stripe subscriptions with trial_end.
 */
export function trialEndUnixFromMonths(startDate: Date, months: number): number {
  if (months < 0 || !Number.isFinite(months)) return Math.floor(startDate.getTime() / 1000);
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + months);
  return Math.floor(d.getTime() / 1000);
}
