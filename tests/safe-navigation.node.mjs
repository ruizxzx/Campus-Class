import test from 'node:test';
import assert from 'node:assert/strict';
import { safeInternalPath } from '../lib/safe-navigation.ts';

test('accepts only local absolute paths, including legitimate query strings', () => {
  assert.equal(safeInternalPath('/dashboard'), '/dashboard');
  assert.equal(safeInternalPath('/classes?tab=active'), '/classes?tab=active');
  assert.equal(safeInternalPath('/'), '/');
});

test('rejects protocol-relative and encoded open redirects', () => {
  for (const value of [
    '//evil.example', '/\\evil.example', '/%2Fevil.example', '/%5cevil.example',
    '/%252fevil.example', 'https://evil.example', 'javascript:alert(1)',
    'dashboard', '', null, '/dashboard\nlocation:evil',
  ]) {
    assert.equal(safeInternalPath(value), '/dashboard', `value: ${value}`);
  }
  assert.equal(safeInternalPath('//evil.example', '/login'), '/login');
});
