import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const ui = readFileSync(new URL('../components/app-shell.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('mobile drawer keeps scrolling separate from fixed header and footer', () => {
  assert.match(ui, /mobile-sidebar/);
  assert.match(ui, /sidebar-scroll min-h-0 flex-1 overflow-y-auto/);
  assert.match(ui, /touch-pan-y/);
  assert.match(ui, /safe-area-inset-bottom/);
});
test('mobile drawer traps focus and closes on Escape and desktop resize', () => {
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(ui, /event\.key !== "Tab"/);
  assert.match(ui, /matchMedia\("\(min-width: 768px\)"\)/);
  assert.match(ui, /document\.body\.style\.overflow = "hidden"/);
});
test('mobile and desktop navigation share a single 768px boundary', () => {
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.doesNotMatch(css, /max-width: 800px/);
  assert.match(ui, /md:hidden/);
  assert.match(ui, /md:flex/);
});
test('responsive source parses as valid TypeScript JSX', () => {
  const sourceFile = ts.createSourceFile('components/app-shell.tsx', ui, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(sourceFile.parseDiagnostics.length, 0);
});
