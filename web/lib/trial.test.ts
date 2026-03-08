/**
 * Unit tests for trial end computation (calendar months).
 * Run: npx ts-node -P tsconfig.test.json lib/trial.test.ts
 */

import { trialEndUnixFromMonths } from './trial';

function run() {
  let passed = 0;
  let failed = 0;
  function ok(cond: boolean, msg: string) {
    if (cond) {
      passed++;
      console.log('  OK:', msg);
    } else {
      failed++;
      console.error('  FAIL:', msg);
    }
  }

  console.log('trialEndUnixFromMonths\n');

  const start1 = new Date('2025-01-15T12:00:00Z');
  const end1 = trialEndUnixFromMonths(start1, 6);
  const d1 = new Date(end1 * 1000);
  ok(d1.getUTCFullYear() === 2025 && d1.getUTCMonth() === 6 && d1.getUTCDate() === 15, 'adds 6 calendar months');

  const start2 = new Date('2025-09-01T00:00:00Z');
  const end2 = trialEndUnixFromMonths(start2, 6);
  const d2 = new Date(end2 * 1000);
  ok(d2.getUTCFullYear() === 2026 && d2.getUTCMonth() === 1, 'year rollover (Sep + 6 = Feb next year)');

  const start3 = new Date('2025-03-10T00:00:00Z');
  const end3 = trialEndUnixFromMonths(start3, 0);
  ok(end3 === Math.floor(start3.getTime() / 1000), '0 months returns same day Unix');

  const start4 = new Date('2025-01-01T00:00:00Z');
  const end4 = trialEndUnixFromMonths(start4, 24);
  const d4 = new Date(end4 * 1000);
  ok(d4.getUTCFullYear() === 2027 && d4.getUTCMonth() === 0, '24 months (max)');

  const start5 = new Date('2025-06-01T00:00:00Z');
  const t5 = start5.getTime();
  trialEndUnixFromMonths(start5, 3);
  ok(start5.getTime() === t5, 'does not mutate input date');

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run();
