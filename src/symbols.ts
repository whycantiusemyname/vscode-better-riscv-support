export type RiscvSymbolKind =
  | 'define'
  | 'equate'
  | 'label'
  | 'macro'
  | 'section'
  | 'variable';

export interface RiscvSymbol {
  name: string;
  kind: RiscvSymbolKind;
  line: number;
  column: number;
  length: number;
  endLine: number;
  containerName?: string;
  detail?: string;
}

export interface ParsedRiscvDocument {
  symbols: RiscvSymbol[];
  includes: string[];
}

const DEFINE_PATTERN =
  /^\s*#\s*define\b[ \t]+([A-Za-z_][A-Za-z0-9_]*)(\([^)]*\))?/i;
const INCLUDE_PATTERN =
  /^\s*#\s*include\s*(?:"([^"]+)"|<([^>]+)>)/i;
const MACRO_PATTERN =
  /^\s*\.macro\s+([A-Za-z_.$][A-Za-z0-9_.$]*)/i;
const ENDM_PATTERN = /^\s*\.endm\b/i;
const LABEL_PATTERN =
  /^\s*((?:[A-Za-z_.$][A-Za-z0-9_.$]*|[0-9]+))\s*:/;
const EQUATE_PATTERN =
  /^\s*\.(?:equ|equiv|set)\s+([A-Za-z_.$][A-Za-z0-9_.$]*)/i;
const ASSIGNMENT_PATTERN =
  /^\s*([A-Za-z_.$][A-Za-z0-9_.$]*)\s*=/;
const SECTION_PATTERN = /^\s*\.section\s+([^,\s]+)/i;
const COMMON_PATTERN =
  /^\s*\.(?:comm|lcomm)\s+([A-Za-z_.$][A-Za-z0-9_.$]*)/i;

function positionOfMatch(line: string, match: RegExpMatchArray, group: string): number {
  const matchIndex = match.index ?? 0;
  const groupIndex = match[0].indexOf(group);
  return matchIndex + Math.max(0, groupIndex);
}

interface CommentScan {
  code: string;
  continuesBlockComment: boolean;
}

function stripComments(
  line: string,
  startsInBlockComment: boolean,
  hashStartsComment = true
): CommentScan {
  let code = '';
  let index = 0;
  let quote = '';
  let escaped = false;
  let insideBlockComment = startsInBlockComment;

  while (index < line.length) {
    if (insideBlockComment) {
      const end = line.indexOf('*/', index);
      if (end < 0) {
        return {
          code: code + ' '.repeat(line.length - index),
          continuesBlockComment: true
        };
      }
      code += ' '.repeat(end + 2 - index);
      index = end + 2;
      insideBlockComment = false;
      continue;
    }

    const character = line[index];
    const next = line[index + 1];

    if (quote) {
      code += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      index += 1;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      code += character;
    } else if (
      (character === '#' && hashStartsComment) ||
      (character === '/' && next === '/')
    ) {
      return { code, continuesBlockComment: false };
    } else if (character === '/' && next === '*') {
      insideBlockComment = true;
      continue;
    } else {
      code += character;
    }
    index += 1;
  }

  return { code, continuesBlockComment: insideBlockComment };
}

function addSymbol(
  symbols: RiscvSymbol[],
  symbol: Omit<RiscvSymbol, 'endLine'> & { endLine?: number }
): number {
  symbols.push({
    ...symbol,
    endLine: symbol.endLine ?? symbol.line
  });
  return symbols.length - 1;
}

export function parseRiscvSymbols(text: string): ParsedRiscvDocument {
  const symbols: RiscvSymbol[] = [];
  const includes: string[] = [];
  const lines = text.split(/\r\n|\n/);
  const macroStack: number[] = [];
  let insideBlockComment = false;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const originalLine = lines[lineNumber];
    const startsInBlockComment = insideBlockComment;

    const include = startsInBlockComment
      ? undefined
      : originalLine.match(INCLUDE_PATTERN);
    const define = startsInBlockComment
      ? undefined
      : originalLine.match(DEFINE_PATTERN);
    const commentScan = stripComments(
      originalLine,
      startsInBlockComment,
      !include && !define
    );
    insideBlockComment = commentScan.continuesBlockComment;

    if (include) {
      includes.push(include[1] ?? include[2]);
      continue;
    }

    if (define) {
      const name = define[1];
      const signature = define[2] ?? '';
      addSymbol(symbols, {
        name,
        kind: 'define',
        line: lineNumber,
        column: positionOfMatch(originalLine, define, name),
        length: name.length,
        detail: '#define ' + name + signature
      });
      continue;
    }

    const line = commentScan.code;
    if (!line.trim()) {
      continue;
    }

    const macro = line.match(MACRO_PATTERN);
    if (macro) {
      const name = macro[1];
      const index = addSymbol(symbols, {
        name,
        kind: 'macro',
        line: lineNumber,
        column: positionOfMatch(line, macro, name),
        length: name.length,
        endLine: lineNumber,
        detail: '.macro ' + name
      });
      macroStack.push(index);
      continue;
    }

    if (ENDM_PATTERN.test(line)) {
      const macroIndex = macroStack.pop();
      if (macroIndex !== undefined) {
        symbols[macroIndex].endLine = lineNumber;
      }
      continue;
    }

    const equate = line.match(EQUATE_PATTERN);
    if (equate) {
      const name = equate[1];
      addSymbol(symbols, {
        name,
        kind: 'equate',
        line: lineNumber,
        column: positionOfMatch(line, equate, name),
        length: name.length,
        containerName:
          macroStack.length > 0 ? symbols[macroStack[macroStack.length - 1]].name : undefined,
        detail: line.trim()
      });
      continue;
    }

    const assignment = line.match(ASSIGNMENT_PATTERN);
    if (assignment) {
      const name = assignment[1];
      addSymbol(symbols, {
        name,
        kind: 'equate',
        line: lineNumber,
        column: positionOfMatch(line, assignment, name),
        length: name.length,
        containerName:
          macroStack.length > 0 ? symbols[macroStack[macroStack.length - 1]].name : undefined,
        detail: line.trim()
      });
      continue;
    }

    const section = line.match(SECTION_PATTERN);
    if (section) {
      const name = section[1];
      addSymbol(symbols, {
        name,
        kind: 'section',
        line: lineNumber,
        column: positionOfMatch(line, section, name),
        length: name.length,
        detail: '.section ' + name
      });
      continue;
    }

    const common = line.match(COMMON_PATTERN);
    if (common) {
      const name = common[1];
      addSymbol(symbols, {
        name,
        kind: 'variable',
        line: lineNumber,
        column: positionOfMatch(line, common, name),
        length: name.length,
        detail: line.trim()
      });
      continue;
    }

    const label = line.match(LABEL_PATTERN);
    if (label) {
      const name = label[1];
      addSymbol(symbols, {
        name,
        kind: 'label',
        line: lineNumber,
        column: positionOfMatch(line, label, name),
        length: name.length,
        containerName:
          macroStack.length > 0 ? symbols[macroStack[macroStack.length - 1]].name : undefined,
        detail: name + ':'
      });
    }
  }

  return { symbols, includes };
}

function isIdentifierCharacter(character: string): boolean {
  return /[A-Za-z0-9_.$]/.test(character);
}

export interface SymbolToken {
  text: string;
  start: number;
  end: number;
}

export function getSymbolTokenAt(
  line: string,
  character: number
): SymbolToken | undefined {
  if (character < 0 || character > line.length) {
    return undefined;
  }

  let start = character;
  let end = character;

  if (start === line.length || !isIdentifierCharacter(line[start])) {
    start -= 1;
  }
  if (start < 0 || !isIdentifierCharacter(line[start])) {
    return undefined;
  }

  end = start + 1;
  while (start > 0 && isIdentifierCharacter(line[start - 1])) {
    start -= 1;
  }
  while (end < line.length && isIdentifierCharacter(line[end])) {
    end += 1;
  }

  const text = line.slice(start, end);
  if (
    !/^(?:[A-Za-z_.$][A-Za-z0-9_.$]*|[0-9]+[fb])$/.test(text)
  ) {
    return undefined;
  }

  return { text, start, end };
}

export function resolveNumericLocalLabel(
  symbols: readonly RiscvSymbol[],
  reference: string,
  line: number
): RiscvSymbol | undefined {
  const match = reference.match(/^([0-9]+)([fb])$/);
  if (!match) {
    return undefined;
  }

  const label = match[1];
  const direction = match[2];
  const candidates = symbols.filter(
    (symbol) => symbol.kind === 'label' && symbol.name === label
  );

  if (direction === 'b') {
    return candidates
      .filter((symbol) => symbol.line <= line)
      .sort((left, right) => right.line - left.line)[0];
  }

  return candidates
    .filter((symbol) => symbol.line > line)
    .sort((left, right) => left.line - right.line)[0];
}
