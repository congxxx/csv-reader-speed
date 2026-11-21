// Verify correctness vs the practice reference and benchmark vs baseline.
import fs from 'node:fs';
import { run as mine } from './solve.js';
import { run as base } from '/home/hatch/workspace/makefun/csv-reader-speed-01-kit/csv-reader-speed-01-run-20261121-kit/baselines/csv-reader/solve.js';

const KIT = '/home/hatch/workspace/makefun/csv-reader-speed-01-kit/csv-reader-speed-01-run-20261121-kit';
const cases = JSON.parse(fs.readFileSync(KIT + '/practice/input/cases.json', 'utf8'));
const exp = JSON.parse(fs.readFileSync(KIT + '/practice/reference/expected.json', 'utf8'));

// Canonical JSON (same as the scorer): object keys sorted.
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

function diff(a, b, path, out) {
  if (canonical(a) === canonical(b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    out.push(`${path}: array length ${a.length} vs ${b.length}`);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n && out.length < 6; i++) diff(a[i], b[i], `${path}[${i}]`, out);
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (canonical(a[k]) !== canonical(b[k])) {
        out.push(`${path}.${k}: mine=${JSON.stringify(a[k])?.slice(0, 200)} ref=${JSON.stringify(b[k])?.slice(0, 200)}`);
        if (out.length >= 6) return;
      }
    }
    return;
  }
  out.push(`${path}: mine=${JSON.stringify(a)?.slice(0, 300)} ref=${JSON.stringify(b)?.slice(0, 300)}`);
}

let ok = 0;
for (let i = 0; i < cases.length; i++) {
  const a = mine(cases[i].input);
  const e = exp.cases[i].output;
  if (canonical(a) === canonical(e)) { ok++; continue; }
  console.log('MISMATCH', cases[i].id);
  const out = [];
  diff(a, e, '', out);
  for (const l of out) console.log('  ', l);
}
console.log(`correctness: ${ok}/${cases.length}`);

function timeIt(fn, label, runs) {
  const times = [];
  for (let r = 0; r < runs; r++) {
    const t0 = process.cpuUsage();
    for (const c of cases) fn(c.input);
    const t1 = process.cpuUsage(t0);
    times.push((t1.user + t1.system) / 1000);
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  console.log(`${label}: runs ms=[${times.map((t) => t.toFixed(0)).join(', ')}] median=${med.toFixed(1)}`);
  return med;
}
const mMine = timeIt(mine, 'mine    ', 5);
const mBase = timeIt(base, 'baseline', 5);
console.log(`speedup: ${(mBase / mMine).toFixed(2)}x`);
