'use strict';
// Checks every JavaScript file and the scripts inside the app's pages for syntax errors, and that local references resolve.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const skip = new Set(['node_modules', 'dist', '.git', 'build']);
let files = 0, scripts = 0, problems = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name)) check(p);
  }
}
function syntax(code, where) {
  try { new vm.Script(code, { filename: where }); }
  catch (e) { problems++; console.error(`${where}: ${e.message}`); }
}
function check(p) {
  files++;
  const text = fs.readFileSync(p, 'utf8'), rel = path.relative(root, p);
  if (p.endsWith('.js')) { syntax(text.replace(/^#!.*/, ''), rel); return; }
  for (const m of text.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) { scripts++; syntax(m[1], rel + ' (inline script)'); }
  for (const m of text.matchAll(/\b(?:src|href)="([^"#?:]+\.(?:js|html|css))"/g)) {
    if (!fs.existsSync(path.join(path.dirname(p), m[1]))) { problems++; console.error(`${rel}: missing ${m[1]}`); }
  }
}
walk(root);
console.log(`Checked ${files} files and ${scripts} inline scripts${problems ? `: ${problems} problem(s)` : '.'}`);
process.exitCode = problems ? 1 : 0;
