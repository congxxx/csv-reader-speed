// Adversarial + random differential test: mine vs the reference readCsv.
import { run as mine } from './solve.js';
import { run as ref } from '/home/hatch/workspace/makefun/csv-reader-speed-01-kit/csv-reader-speed-01-run-20261121-kit/baselines/csv-reader/solve.js';

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

// deterministic PRNG
let seed = 123456789;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

const ALPHA = ['a', 'b', ',', '"', '\n', '\r', ' ', 'x', '1', '\uFEFF'];
const TARGETED = [
  '', '\uFEFF', '\uFEFF\uFEFF', '\n', '\r\n', '\r', '\r\r', '\n\n', '\r\n\r\n',
  'a', 'a,', ',a', ',', ',,', 'a,b,c', 'a,b,c\n', 'a,b,c\r\n', 'a,b,c\r',
  'a,b,c\n\n', 'a,b,c\r\n\r\n', 'a,b,c\n\r\n', '\n\na,b', '\r\na,b',
  '"a"', '""', '"""', '""""', '"a', '"a\n', '"a\r\nb"', '"a\rb"',
  '"a""b"', '"a""', '"""a"', '"a"b', '"a" b', '"a"x', '"a"xy,z',
  '"a"\r', '"a"\r\n', '"a"\r\rb', '"a"\n', '"a",b', '"a"\n,b',
  '"a\r', '"a\r\rb', 'a"b', 'a"b,c', 'ab"cd"ef', '"', '""x', '"""',
  'a\rb', 'a\r\rb', 'a\r', 'a\r\nb', 'a\nb', 'a\rb\nc\rd',
  'a,b\nc', 'a,b\nc,d,e', 'a,b\nc,d', 'a,b,c\nd,e', 'a,b,c\nd,e,f,g',
  'a,b\r\nc,d\r\n', 'a,b\rc,d', 'a,b\r\rc,d\r\n',
  'a,,b', ',,', 'a,b,\n', 'a,b,\n,', '\n,', ',\n',
  '"a,b","c\nd",e', '"a""b""c"', '"\n"', '"\r"', '"\r\n"',
  '\uFEFFa,b\nc,d', '\uFEFF"a",b', 'a\uFEFFb', '\uFEFF',
  'a,b\n"unclosed', 'a,b\n"unclosed,x,y', 'a,b\n"unclosed\nx,y\nz',
  '"a\nb\nc', '"a\rb\rc', '"a\r\nb\r\nc', '"a\n\nb"',
  'a,b\nc,d\n"e,f', 'a,b\nc,d\n"e,f\ng,h',
  'x\ry\nz', 'x\r\ny\r\nz\rw', 'a\r\rb\r\nc\nd',
  'a,b,c\n"d,e",f\n"g\nh",i,j',
  'a,b\n\n\nc,d', 'a,b\n\r\nc,d', 'a,b\r\r\nc,d',
  '"a"junk,b', '"a" junk ,b', '"a" ,b', '"a"\t,b',
  'a,"b"c,d', 'a,"b" c,d', 'a,"b""c",d',
  '"a",', '"a"\n', '"a"\r\n', '"a"\r',
  'a,b,c', 'a,b,c\ndef', 'a,b,c\ndef,ghi,jkl,mno',
  '\uFEFF"a,b","c"\r\n"d",e\r\n',
];

let fails = 0, total = 0;
function check(text, header, label) {
  total++;
  const input = { text, header };
  let a, b;
  try { a = mine(input); } catch (e) { console.log('MINE THREW', label, JSON.stringify(text), 'header=' + header, e.message); fails++; return; }
  try { b = ref(input); } catch (e) { console.log('REF THREW', label, JSON.stringify(text), e.message); fails++; return; }
  if (canonical(a) !== canonical(b)) {
    fails++;
    console.log('FAIL', label, 'header=' + header, 'text=' + JSON.stringify(text));
    console.log('  mine:', JSON.stringify(a).slice(0, 500));
    console.log('  ref :', JSON.stringify(b).slice(0, 500));
  }
}

for (const t of TARGETED) { check(t, true, 'targeted'); check(t, false, 'targeted'); }

// random fuzz: short texts over the alphabet
for (let i = 0; i < 4000; i++) {
  const n = Math.floor(rnd() * 40);
  let s = '';
  for (let j = 0; j < n; j++) s += pick(ALPHA);
  check(s, rnd() < 0.5, 'fuzz');
}
// random fuzz: longer texts, biased to realistic CSV
const PIECES = ['ab', 'cd', '12', '"x"', '"a,b"', '"q""q"', '\n', '\r\n', '\r', ',', ' ', 'ef', '"', 'x\ry', '"m\nn"'];
for (let i = 0; i < 1500; i++) {
  const n = 3 + Math.floor(rnd() * 25);
  let s = '';
  for (let j = 0; j < n; j++) s += pick(PIECES);
  check(s, rnd() < 0.5, 'fuzz2');
}
// structured: random records with a header, then mutate
for (let i = 0; i < 500; i++) {
  const w = 1 + Math.floor(rnd() * 5);
  const recs = [];
  const nrec = 1 + Math.floor(rnd() * 6);
  for (let r = 0; r < nrec; r++) {
    const fs = [];
    const nf = Math.max(1, w + Math.floor(rnd() * 3) - 1);
    for (let f = 0; f < nf; f++) {
      const k = rnd();
      if (k < 0.5) fs.push(pick(['a', 'bb', 'ccc', '12', '']));
      else if (k < 0.7) fs.push('"' + pick(['a', 'b,c', 'd"e', 'f\ng', 'h\ri']) + '"');
      else fs.push(pick(['a', 'bb', '']) + pick(['\r', '"', 'x']));
    }
    recs.push(fs.join(','));
  }
  const eol = rnd() < 0.5 ? '\n' : '\r\n';
  let s = recs.join(eol);
  if (rnd() < 0.5) s += eol;
  if (rnd() < 0.2) s = '\uFEFF' + s;
  check(s, rnd() < 0.5, 'structured');
}

console.log(`fuzz done: ${total} cases, ${fails} failures`);
