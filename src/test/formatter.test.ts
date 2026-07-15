import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRiscv, splitTopLevelCommas } from '../formatter';

test('aligns #define sections into the configured macro-name field', () => {
  const source = [
    ' #define A 1',
    '#define LONG_NAME    (A + 1) // keep',
    ' # define MID 3',
    '',
    '#define OTHER 9'
  ].join('\n');

  const expected = [
    '#define A' + ' '.repeat(23) + '1',
    '#define LONG_NAME' + ' '.repeat(15) + '(A + 1) // keep',
    '#define MID' + ' '.repeat(21) + '3',
    '',
    '#define OTHER' + ' '.repeat(19) + '9'
  ].join('\n');

  assert.equal(formatRiscv(source), expected);
});

test('matches the iwant_example.S define alignment across blank lines', () => {
  const source = [
    '#define CSR_SSP 0x011',
    '#define CSR_MSHADOWCFG 0x7c2',
    '',
    '#define ENVCFG_SSE (1 << 3)',
    '',
    '#define MCAUSE_STORE_FAULT 7',
    '#define MCAUSE_ECALL_S 9',
    '#define MCAUSE_SOFTWARE_CHECK 18',
    '#define MTVAL_SHADOW_STACK 3'
  ].join('\n');

  const expected = [
    '#define CSR_SSP                 0x011',
    '#define CSR_MSHADOWCFG          0x7c2',
    '',
    '#define ENVCFG_SSE              (1 << 3)',
    '',
    '#define MCAUSE_STORE_FAULT      7',
    '#define MCAUSE_ECALL_S          9',
    '#define MCAUSE_SOFTWARE_CHECK   18',
    '#define MTVAL_SHADOW_STACK      3'
  ].join('\n');

  const formatted = formatRiscv(source);
  assert.equal(formatted, expected);
  assert.equal(formatRiscv(formatted), formatted);
});

test('keeps comment-only lines inside a #define section', () => {
  const source = [
    '#define FIRST 1',
    '// Keep this macro group together.',
    '#define MCAUSE_SOFTWARE_CHECK 18'
  ].join('\n');

  const expected = [
    '#define FIRST                   1',
    '// Keep this macro group together.',
    '#define MCAUSE_SOFTWARE_CHECK   18'
  ].join('\n');

  assert.equal(formatRiscv(source), expected);
});

test('keeps #define alignment through the configured blank-line threshold', () => {
  const withinThreshold = [
    '#define A 1',
    '',
    '',
    '#define LONG_NAME 2'
  ].join('\n');
  const beyondThreshold = [
    '#define A 1',
    '',
    '',
    '',
    '#define LONG_NAME 2'
  ].join('\n');

  assert.equal(
    formatRiscv(withinThreshold, {
      defineNameFieldWidth: 1,
      maxBlankLinesWithoutBreak: 2
    }),
    [
      '#define A' + ' '.repeat(9) + '1',
      '',
      '',
      '#define LONG_NAME 2'
    ].join('\n')
  );
  assert.equal(
    formatRiscv(beyondThreshold, {
      defineNameFieldWidth: 1,
      maxBlankLinesWithoutBreak: 2
    }),
    [
      '#define A 1',
      '',
      '',
      '',
      '#define LONG_NAME 2'
    ].join('\n')
  );
  assert.equal(
    formatRiscv([
      '#define A 1',
      '',
      '#define LONG_NAME 2'
    ].join('\n'), {
      defineNameFieldWidth: 1,
      maxBlankLinesWithoutBreak: 0
    }),
    [
      '#define A 1',
      '',
      '#define LONG_NAME 2'
    ].join('\n')
  );
});

test('keeps a separator when define alignment is disabled', () => {
  assert.equal(
    formatRiscv('#define VALUE 1', { alignDefines: false }),
    '#define VALUE 1'
  );
});

test('does not leave trailing whitespace on valueless macros', () => {
  const formatted = formatRiscv([
    '#define FEATURE',
    '#define MCAUSE_SOFTWARE_CHECK 18'
  ].join('\n'));

  assert.equal(
    formatted,
    [
      '#define FEATURE',
      '#define MCAUSE_SOFTWARE_CHECK   18'
    ].join('\n')
  );
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

test('aligns every instruction mnemonic and comma column in an assembly section', () => {
  const source = [
    'add x1,x2,x3',
    'li a0, 1',
    '# spacing should not split the code block',
    'addi x10,x11,12',
    'bne x1,zero,done'
  ].join('\n');

  const expected = [
    '    add  x1 , x2  , x3',
    '    li   a0 , 1',
    '# spacing should not split the code block',
    '    addi x10, x11 , 12',
    '    bne  x1 , zero, done'
  ].join('\n');

  assert.equal(formatRiscv(source), expected);
  assert.equal(formatRiscv(source, { commaAlignment: 'aligned' }), expected);
});

test('can keep commas attached to operands while aligning operand columns', () => {
  const source = [
    'asm_puts:',
    'li t0,SIM_CTRL_BASE + SIM_CTRL_OUT',
    '1:',
    'lbu t1,0(a0)',
    'beq t1,zero,2f',
    'sw t1,0(t0)',
    'addi a0,a0,1',
    'jal zero,1b',
    '2:',
    'ret'
  ].join('\n');
  const options = { commaAlignment: 'afterOperand' as const };
  const expected = [
    'asm_puts:',
    '    li   t0,   SIM_CTRL_BASE + SIM_CTRL_OUT',
    '1:',
    '    lbu  t1,   0(a0)',
    '    beq  t1,   zero, 2f',
    '    sw   t1,   0(t0)',
    '    addi a0,   a0,   1',
    '    jal  zero, 1b',
    '2:',
    '    ret'
  ].join('\n');

  const formatted = formatRiscv(source, options);
  assert.equal(formatted, expected);
  assert.equal(formatRiscv(formatted, options), formatted);
});

test('treats comma spacing as a minimum in afterOperand mode', () => {
  const source = [
    'add zero,a0,a1 # alpha',
    'li t0,1 // beta',
    'ret # gamma'
  ].join('\n');
  const options = {
    commaAlignment: 'afterOperand' as const,
    commaOperandSpacing: 2,
    commentSpacing: 2
  };
  const expected = [
    '    add zero,  a0,  a1  # alpha',
    '    li  t0,    1        // beta',
    '    ret                 # gamma'
  ].join('\n');

  const formatted = formatRiscv(source, options);
  assert.equal(formatted, expected);
  const [first, second, third] = formatted.split('\n');
  assert.equal(first.indexOf('#'), second.indexOf('//'));
  assert.equal(first.indexOf('#'), third.indexOf('#'));
});

test('honors configurable assembly gaps and aligns # and // comments', () => {
  const source = [
    'add x1,x2,x3 # alpha',
    'longop x10,x11,100',
    'target:',
    'sub x1,x2,x3 // beta',
    'nop'
  ].join('\n');

  const formatted = formatRiscv(source, {
    instructionOperandSpacing: 2,
    commaOperandSpacing: 3,
    commentSpacing: 4
  });

  assert.equal(
    formatted,
    [
      '    add     x1 ,   x2 ,   x3     # alpha',
      '    longop  x10,   x11,   100',
      'target:',
      '    sub     x1 ,   x2 ,   x3     // beta',
      '    nop'
    ].join('\n')
  );

  const [firstLine, secondLine, , fourthLine] = formatted.split('\n');
  assert.equal(firstLine.indexOf('#'), fourthLine.indexOf('//'));
  assert.equal(firstLine.indexOf('#'), secondLine.length + 4);
});

test('uses the blank-line threshold for assembly alignment', () => {
  const withinThreshold = [
    'add x1,x2,x3',
    '',
    '',
    'addi x10,x11,12'
  ].join('\n');
  const beyondThreshold = [
    'add x1,x2,x3',
    '',
    '',
    '',
    'addi x10,x11,12'
  ].join('\n');

  assert.equal(
    formatRiscv(withinThreshold, { maxBlankLinesWithoutBreak: 2 }),
    [
      '    add  x1 , x2 , x3',
      '',
      '',
      '    addi x10, x11, 12'
    ].join('\n')
  );
  assert.equal(
    formatRiscv(beyondThreshold, { maxBlankLinesWithoutBreak: 2 }),
    [
      '    add x1, x2, x3',
      '',
      '',
      '',
      '    addi x10, x11, 12'
    ].join('\n')
  );
});

test('does not split commas in expressions, strings, or comments', () => {
  const source = 'foo a, %lo(bar(1, 2)), "x,y" # comma, in comment';
  const expected = '    foo a, %lo(bar(1, 2)), "x,y" # comma, in comment';

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
    '  add  x1 , x2 , x3\r\n  addi x10, x11, 12\r\n'
  );
  assert.equal(formatRiscv(formatted, { indentSize: 2 }), formatted);
});
