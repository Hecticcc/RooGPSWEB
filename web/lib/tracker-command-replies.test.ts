/**
 * Unit tests for tracker reply parsers (800, 802).
 * Run: npx ts-node -P tsconfig.test.json lib/tracker-command-replies.test.ts
 */

import { parseReply800, parseReply802, parseReply } from './tracker-command-replies';

function run() {
  let passed = 0;
  let failed = 0;
  function ok(cond: boolean, msg: string) {
    if (cond) {
      passed++;
      console.log('  OK:', msg);
    } else {
      failed++;
      console.log('  FAIL:', msg);
    }
  }

  console.log('parseReply800');
  const raw800 = 'Fix: A, Speed: 45.2 km/h, CSQ: 18, Battery: 85%, https://maps.google.com/?q=-33.8,151.2';
  const out800 = parseReply800(raw800);
  ok(out800.type === '800', 'type 800');
  ok(out800.gps.fix_flag === 'A', 'fix A');
  ok(out800.gps.speed_kmh === 45.2, 'speed 45.2');
  ok(out800.gsm.csq === 18, 'csq 18');
  ok(out800.battery.percent === 85, 'battery 85');
  ok(!!out800.map.url?.includes('maps.google'), 'map url');

  const min800 = parseReply800('V, 0 km/h');
  ok(min800.type === '800' && min800.gps.speed_kmh === 0 && min800.gps.fix_flag === 'V', 'minimal 800');

  const empty800 = parseReply800('No data here');
  ok(empty800.type === '800' && empty800.gps.fix_flag === null && empty800.battery.percent === null, 'nulls when missing');

  console.log('parseReply802');
  const raw802 = 'CSQ: 20, Satellites: 8, Internal battery: 4.1 V, External: 12.3 V';
  const out802 = parseReply802(raw802);
  ok(out802.type === '802', 'type 802');
  ok(out802.gsm.csq === 20, 'csq 20');
  ok(out802.gps.sats === 8, 'sats 8');
  ok(out802.power.battery_v === 4.1, 'battery_v 4.1');
  ok(out802.power.external_v === 12.3, 'external_v 12.3');

  const alt802 = parseReply802('GSM: 15, GPS: 6, Batt: 3.9 V, Ext: 0 V');
  ok(alt802.gsm.csq === 15 && alt802.gps.sats === 6 && alt802.power.battery_v === 3.9, 'alternate 802 labels');

  console.log('parseReply');
  ok(parseReply('Fix: A, Speed: 10', 'Request Live Location (800)')?.type === '800', 'dispatch 800 by name');
  ok(parseReply('CSQ: 18, Sats: 7', 'Request Work Status (802)')?.type === '802', 'dispatch 802 by name');
  ok(parseReply('https://maps.google.com/?q=-33,151', 'Unknown')?.type === '800', 'infer 800 from map link');
  ok(parseReply('CSQ: 19, Satellites: 9', 'Unknown')?.type === '802', 'infer 802 from content');

  console.log('');
  console.log(`Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
