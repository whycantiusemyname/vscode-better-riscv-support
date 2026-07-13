import assert from 'node:assert/strict';
import test from 'node:test';
import { collectDefineHighlightRanges } from '../defineHighlighting';

function range(line: number, source: string, text: string, from = 0) {
  const start = source.indexOf(text, from);
  if (start < 0) {
    throw new Error(`Expected ${JSON.stringify(text)} in ${JSON.stringify(source)}.`);
  }
  return { line, start, end: start + text.length };
}

test('finds directive, macro name, and value ranges for ordinary defines', () => {
  const first = '  #define VALUE 42';
  const second = '# define APPLY(x, y) ((x) + (y))';
  const third = '#DEFINE EMPTY';
  const ranges = collectDefineHighlightRanges([first, second, third].join('\n'));

  assert.deepEqual(ranges.directives, [
    range(0, first, '#define'),
    range(1, second, '# define'),
    range(2, third, '#DEFINE')
  ]);
  assert.deepEqual(ranges.names, [
    range(0, first, 'VALUE'),
    range(1, second, 'APPLY(x, y)'),
    range(2, third, 'EMPTY')
  ]);
  assert.deepEqual(ranges.values, [
    range(0, first, '42'),
    range(1, second, '((x) + (y))')
  ]);
});

test('colors continuation lines as macro values only', () => {
  const first = '#define JOIN(a, b) a ## \\';
  const second = '    b';
  const third = '#define AFTER 1';
  const ranges = collectDefineHighlightRanges([first, second, third].join('\n'));

  assert.deepEqual(ranges.directives, [
    range(0, first, '#define'),
    range(2, third, '#define')
  ]);
  assert.deepEqual(ranges.names, [
    range(0, first, 'JOIN(a, b)'),
    range(2, third, 'AFTER')
  ]);
  assert.deepEqual(ranges.values, [
    range(0, first, 'a ## \\'),
    range(1, second, 'b'),
    range(2, third, '1')
  ]);
});

test('skips fake defines in block comments and leaves inline comments undecorated', () => {
  const hidden = '#define HIDDEN 1';
  const visible = '#define VISIBLE 1 // explanation';
  const split = '#define SPLIT before /* comment */ after';
  const ranges = collectDefineHighlightRanges([
    '/*',
    hidden,
    '*/',
    visible,
    split
  ].join('\r\n'));

  assert.deepEqual(ranges.directives, [
    range(3, visible, '#define'),
    range(4, split, '#define')
  ]);
  assert.deepEqual(ranges.names, [
    range(3, visible, 'VISIBLE'),
    range(4, split, 'SPLIT')
  ]);
  assert.deepEqual(ranges.values, [
    range(3, visible, '1'),
    range(4, split, 'before'),
    range(4, split, 'after')
  ]);
});
