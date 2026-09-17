import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSyntaxHighlightRanges } from '../syntaxHighlighting';

function texts(
  source: string,
  ranges: ReturnType<
    typeof collectSyntaxHighlightRanges
  >[keyof ReturnType<typeof collectSyntaxHighlightRanges>]
): string[] {
  const lines = source.split(/\r?\n/);
  return ranges.map((range) => lines[range.line].slice(range.start, range.end));
}

test('separates instructions from integer, float, vector, and CSR registers', () => {
  const source = [
    'start: addi t0, a0, 1',
    '  fadd.s ft0, fa1, fa2',
    '  vadd.vv v1, v2, v3',
    '  csrr a0, mstatus'
  ].join('\n');
  const ranges = collectSyntaxHighlightRanges(source);

  assert.deepEqual(texts(source, ranges.instructions), [
    'addi', 'fadd.s', 'vadd.vv', 'csrr'
  ]);
  assert.deepEqual(texts(source, ranges.registers), [
    't0', 'a0', 'ft0', 'fa1', 'fa2', 'v1', 'v2', 'v3', 'a0', 'mstatus'
  ]);
});

test('ignores comments, strings, directives, assignments, and label-only lines', () => {
  const source = [
    '#define a0 addi',
    '.string "addi a0"',
    'VALUE = a0',
    'a0:',
    '/* addi a0, a1, 1',
    '   lw t0, 0(sp) */',
    'real: lw t0, 0(sp) # addi a0, a1, 1',
    '  // addi a0, a1, 1'
  ].join('\n');
  const ranges = collectSyntaxHighlightRanges(source);

  assert.deepEqual(texts(source, ranges.instructions), ['lw']);
  assert.deepEqual(texts(source, ranges.registers), ['t0', 'sp']);
});

test('treats macro invocations as instruction-like mnemonics', () => {
  const source = '  SAVE_CONTEXT sp, s0';
  const ranges = collectSyntaxHighlightRanges(source);

  assert.deepEqual(texts(source, ranges.instructions), ['SAVE_CONTEXT']);
  assert.deepEqual(texts(source, ranges.registers), ['sp', 's0']);
});
