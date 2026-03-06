/**
 * Unit tests for Emergency Mode profile helpers (PT60-L commands).
 * Run: npm run test:emergency-mode (or npx ts-node -P tsconfig.test.json lib/emergency-mode.test.ts)
 */

import {
  DEFAULT_NORMAL_PROFILE,
  DEFAULT_EMERGENCY_PROFILE,
  getEmergencyCommandTexts,
  getNormalCommandTexts,
  getEmergencyJobPayloads,
  getNormalJobPayloads,
} from './emergency-mode';

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

  console.log('Emergency Mode profiles\n');

  const emergencyTexts = getEmergencyCommandTexts();
  ok(emergencyTexts.length === 3, 'Emergency: 3 command texts');
  ok(emergencyTexts[0]!.includes('102,30,,60'), 'Emergency: 102 moving 30s, stopped 60s');
  ok(emergencyTexts[1]!.includes('124,0'), 'Emergency: 124 sleep off');
  ok(emergencyTexts[2]!.includes('122,60'), 'Emergency: 122 heartbeat 60 min');
  ok(emergencyTexts.every((t) => t.startsWith('0000,')), 'All commands prefixed with password');

  const normalTexts = getNormalCommandTexts(DEFAULT_NORMAL_PROFILE);
  ok(normalTexts.length === 3, 'Normal: 3 command texts');
  ok(normalTexts[0]!.includes('102,120,,600'), 'Normal: 102 moving 120s, stopped 600s');
  ok(normalTexts[1]!.includes('124,1,180'), 'Normal: 124 sleep after 180s');
  ok(normalTexts[2]!.includes('122,720'), 'Normal: 122 heartbeat 720 min');

  const emergencyPayloads = getEmergencyJobPayloads();
  ok(emergencyPayloads.length === 3, 'Emergency job payloads: 3');
  ok(emergencyPayloads.every((p) => p.command_name && p.command_text), 'Each payload has name and text');
  ok(
    emergencyPayloads[0]!.command_name.includes('102') && emergencyPayloads[1]!.command_name.includes('124') && emergencyPayloads[2]!.command_name.includes('122'),
    'Payload names reference command numbers'
  );

  const normalPayloads = getNormalJobPayloads(DEFAULT_NORMAL_PROFILE);
  ok(normalPayloads.length === 3, 'Normal job payloads: 3');
  ok(normalPayloads.every((p) => p.command_name && p.command_text), 'Each normal payload has name and text');

  ok(DEFAULT_NORMAL_PROFILE.gprs_interval_command_102 === '102,120,,600', 'Default normal 102');
  ok(DEFAULT_EMERGENCY_PROFILE.gprs_interval_command_102 === '102,30,,60', 'Default emergency 102');

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run();
