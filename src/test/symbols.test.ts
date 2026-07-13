import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSymbolTokenAt,
  parseRiscvSymbols,
  resolveNumericLocalLabel
} from '../symbols';

test('indexes defines, macros, labels, equates, sections, and includes', () => {
  const source = [
    '#include "registers.h"',
    '#define FLAG(x) (x)',
    '.macro SAVE reg',
    'inside:',
    '.endm',
    '.equ VALUE, 2',
    'OTHER = 3',
    '.section .text',
    '1:',
    'beq x1, x2, 1b',
    'target:'
  ].join('\n');

  const parsed = parseRiscvSymbols(source);
  const byName = new Map(parsed.symbols.map((symbol) => [symbol.name, symbol]));

  assert.deepEqual(parsed.includes, ['registers.h']);
  assert.equal(byName.get('FLAG')?.kind, 'define');
  assert.equal(byName.get('SAVE')?.kind, 'macro');
  assert.equal(byName.get('SAVE')?.endLine, 4);
  assert.equal(byName.get('inside')?.containerName, 'SAVE');
  assert.equal(byName.get('VALUE')?.kind, 'equate');
  assert.equal(byName.get('OTHER')?.kind, 'equate');
  assert.equal(byName.get('.text')?.kind, 'section');
  assert.equal(byName.get('target')?.kind, 'label');
});

test('extracts identifiers and resolves backward and forward numeric labels', () => {
  const source = [
    '1:',
    '  beq x1, x2, 1f',
    '2:',
    '  beq x1, x2, 2b',
    '1:'
  ].join('\n');
  const symbols = parseRiscvSymbols(source).symbols;

  assert.deepEqual(getSymbolTokenAt('  beq x1, x2, target', 16), {
    text: 'target',
    start: 14,
    end: 20
  });
  assert.equal(resolveNumericLocalLabel(symbols, '1f', 1)?.line, 4);
  assert.equal(resolveNumericLocalLabel(symbols, '2b', 3)?.line, 2);
  assert.equal(getSymbolTokenAt('addi x1, x2, 1f', 14)?.text, '1f');
});

test('does not index commented-out definitions', () => {
  const parsed = parseRiscvSymbols([
    '# ignored: no',
    '// fake_label:',
    '/*',
    '.macro hidden',
    '*/',
    'real_label:'
  ].join('\n'));

  assert.deepEqual(
    parsed.symbols.map((symbol) => symbol.name),
    ['real_label']
  );
});

test('does not mistake comment markers in strings or # comments for block comments', () => {
  const parsed = parseRiscvSymbols([
    '.ascii "/* not a comment */"',
    'real_after_string:',
    '# note: /* still a line comment',
    'real_after_hash_comment:'
  ].join('\n'));

  assert.deepEqual(
    parsed.symbols.map((symbol) => symbol.name),
    ['real_after_string', 'real_after_hash_comment']
  );
});
