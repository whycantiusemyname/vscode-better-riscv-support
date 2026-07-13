import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRiscv, splitTopLevelCommas } from '../formatter';

test('aligns each contiguous #define block by its longest name', () => {
  const source = [
    ' #define A 1',
    '#define LONG_NAME    (A + 1) // keep',
    ' # define MID 3',
    '',
    '#define OTHER 9'
  ].join('\n');

  const expected = [
    '#define A' + ' '.repeat(9) + '1',
    '#define LONG_NAME (A + 1) // keep',
    '#define MID' + ' '.repeat(7) + '3',
    '',
    '#define OTHER 9'
  ].join('\n');

  assert.equal(formatRiscv(source), expected);
});

test('keeps multiline preprocessor macros verbatim and formats later code', () => {
  const source = [
    '  #define JOIN(a, b) a ## \\',
    '    b',
    'addi x1,x0,1'
  ].join('\n');

  const expected = [
    '  #define JOIN(a, b) a ## \\',
    '    b',
    '    addi x1, x0, 1'
  ].join('\n');

  assert.equal(formatRiscv(source), expected);
});

test('places structural directives and labels at column zero', () => {
  const source = [
    '  .macro M arg',
    '  addi x1,x0,1',
    '  .endm',
    '  .option   norvc',
    'label:',
    ' .word 1,2,3'
  ].join('\n');

  const expected = [
    '.macro M arg',
    '    addi x1, x0, 1',
    '.endm',
    '.option norvc',
    'label:',
    '    .word 1, 2, 3'
  ].join('\n');

  assert.equal(formatRiscv(source), expected);
});

test('aligns mnemonics and both commas across a three-operand assembly block', () => {
  const source = [
    'add x1,x2,x3',
    'li a0, 1',
    '# spacing should not split the code block',
    'addi x10,x11,12',
    'bne x1,zero,done'
  ].join('\n');

  const expected = [
    '    add   x1,   x2, x3',
    '    li a0, 1',
    '# spacing should not split the code block',
    '    addi x10,  x11, 12',
    '    bne   x1, zero, done'
  ].join('\n');

  assert.equal(formatRiscv(source), expected);
});

test('does not split commas in expressions, strings, or comments', () => {
  const source = 'foo a, %lo(bar(1, 2)), "x,y" # comma, in comment';
  const expected = '    foo a, %lo(bar(1, 2)), "x,y"  # comma, in comment';

  assert.deepEqual(splitTopLevelCommas('a, %lo(bar(1, 2)), "x,y"'), [
    'a',
    '%lo(bar(1, 2))',
    '"x,y"'
  ]);
  assert.equal(formatRiscv(source), expected);
});

test('preserves CRLF, final newline, configured indentation, and idempotence', () => {
  const source = 'add x1,x2,x3\r\naddi x10,x11,12\r\n';
  const formatted = formatRiscv(source, { indentSize: 2 });

  assert.equal(
    formatted,
    '  add   x1,  x2, x3\r\n  addi x10, x11, 12\r\n'
  );
  assert.equal(formatRiscv(formatted, { indentSize: 2 }), formatted);
});
