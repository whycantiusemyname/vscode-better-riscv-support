export type SyntaxHighlightRange = {
  line: number;
  start: number;
  end: number;
};

export type SyntaxHighlightRanges = {
  instructions: SyntaxHighlightRange[];
  registers: SyntaxHighlightRange[];
};

const INTEGER_ABI_REGISTERS = [
  'zero', 'ra', 'sp', 'gp', 'tp', 'fp',
  ...Array.from({ length: 7 }, (_, index) => `t${index}`),
  ...Array.from({ length: 12 }, (_, index) => `s${index}`),
  ...Array.from({ length: 8 }, (_, index) => `a${index}`)
];

const FLOAT_ABI_REGISTERS = [
  ...Array.from({ length: 12 }, (_, index) => `ft${index}`),
  ...Array.from({ length: 12 }, (_, index) => `fs${index}`),
  ...Array.from({ length: 8 }, (_, index) => `fa${index}`)
];

const CSRS = [
  'fflags', 'frm', 'fcsr', 'cycle', 'time', 'instret', 'cycleh', 'timeh',
  'instreth', 'ustatus', 'uie', 'utvec', 'uscratch', 'uepc', 'ucause',
  'utval', 'uip', 'sstatus', 'sie', 'stvec', 'sscratch', 'sepc', 'scause',
  'stval', 'sip', 'satp', 'mvendorid', 'marchid', 'mimpid', 'mhartid',
  'mstatus', 'misa', 'medeleg', 'mideleg', 'mie', 'mtvec', 'mcounteren',
  'mscratch', 'mepc', 'mcause', 'mtval', 'mip', 'menvcfg', 'mseccfg',
  'mcycle', 'minstret', 'mcountinhibit', 'dcsr', 'dpc', 'dscratch0',
  'dscratch1', 'vstart', 'vl', 'vtype', 'vlenb',
  ...Array.from({ length: 4 }, (_, index) => `pmpcfg${index}`),
  ...Array.from({ length: 16 }, (_, index) => `pmpaddr${index}`)
];

const REGISTER_NAMES = new Set([
  ...Array.from({ length: 32 }, (_, index) => `x${index}`),
  ...Array.from({ length: 32 }, (_, index) => `f${index}`),
  ...Array.from({ length: 32 }, (_, index) => `v${index}`),
  ...INTEGER_ABI_REGISTERS,
  ...FLOAT_ABI_REGISTERS,
  ...CSRS
]);

const LEADING_INSTRUCTION =
  /^\s*(?:(?:[A-Za-z_.$][A-Za-z0-9_.$]*|[0-9]+)\s*:\s*)?([A-Za-z][A-Za-z0-9_.]*)\b/;
const IDENTIFIER = /[A-Za-z_.$][A-Za-z0-9_.$]*/g;

type MaskState = {
  inBlockComment: boolean;
  inPreprocessorContinuation: boolean;
};

function maskNonCode(line: string, state: MaskState): string {
  if (
    !state.inBlockComment &&
    (state.inPreprocessorContinuation || /^\s*#/.test(line))
  ) {
    state.inPreprocessorContinuation = /\\\s*$/.test(line);
    return ' '.repeat(line.length);
  }

  state.inPreprocessorContinuation = false;
  // split('') preserves UTF-16 offsets, which are the coordinates VS Code uses.
  const masked = line.split('');
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const current = line[index];
    const next = line[index + 1];

    if (state.inBlockComment) {
      masked[index] = ' ';
      if (current === '*' && next === '/') {
        masked[index + 1] = ' ';
        index += 1;
        state.inBlockComment = false;
      }
      continue;
    }

    if (quote !== undefined) {
      masked[index] = ' ';
      if (escaped) {
        escaped = false;
      } else if (current === '\\') {
        escaped = true;
      } else if (current === quote) {
        quote = undefined;
      }
      continue;
    }

    if (current === '/' && next === '*') {
      masked[index] = ' ';
      masked[index + 1] = ' ';
      index += 1;
      state.inBlockComment = true;
      continue;
    }

    if ((current === '/' && next === '/') || current === '#') {
      for (let rest = index; rest < line.length; rest += 1) {
        masked[rest] = ' ';
      }
      break;
    }

    if (current === '"' || current === "'") {
      masked[index] = ' ';
      quote = current;
    }
  }

  return masked.join('');
}

/** Collects ranges whose colors must remain distinct even in C/C++ themes. */
export function collectSyntaxHighlightRanges(text: string): SyntaxHighlightRanges {
  const ranges: SyntaxHighlightRanges = {
    instructions: [],
    registers: []
  };
  const state: MaskState = {
    inBlockComment: false,
    inPreprocessorContinuation: false
  };

  text.split(/\r?\n/).forEach((line, lineNumber) => {
    const code = maskNonCode(line, state);
    const match = LEADING_INSTRUCTION.exec(code);
    if (!match) {
      return;
    }

    const instruction = match[1];
    const start = match.index + match[0].lastIndexOf(instruction);
    const remainder = code.slice(start + instruction.length);
    if (/^\s*=/.test(remainder)) {
      return;
    }

    ranges.instructions.push({
      line: lineNumber,
      start,
      end: start + instruction.length
    });

    IDENTIFIER.lastIndex = start + instruction.length;
    for (
      let identifier = IDENTIFIER.exec(code);
      identifier;
      identifier = IDENTIFIER.exec(code)
    ) {
      if (REGISTER_NAMES.has(identifier[0].toLowerCase())) {
        ranges.registers.push({
          line: lineNumber,
          start: identifier.index,
          end: identifier.index + identifier[0].length
        });
      }
    }
  });

  return ranges;
}
