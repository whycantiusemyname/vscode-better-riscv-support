export interface FormatterOptions {
  indentSize?: number;
  alignDefines?: boolean;
  alignThreeOperandInstructions?: boolean;
}

interface EffectiveFormatterOptions {
  indentSize: number;
  alignDefines: boolean;
  alignThreeOperandInstructions: boolean;
}

type LineKind =
  | 'assembly'
  | 'blank'
  | 'comment'
  | 'define'
  | 'directive'
  | 'label'
  | 'preprocessor'
  | 'verbatim';

interface InstructionParts {
  mnemonic: string;
  operands: string[];
  comment: string;
}

interface FormattedLine {
  kind: LineKind;
  text: string;
  instruction?: InstructionParts;
}

interface CommentSplit {
  code: string;
  comment: string;
  continuesBlockComment: boolean;
}

interface DefineLine {
  name: string;
  value?: string;
}

const PREPROCESSOR_PATTERN =
  /^\s*#\s*(?:define|include|import|if|ifdef|ifndef|elif|else|endif|undef|pragma|error|warning|line)\b/i;
const DEFINE_PATTERN =
  /^\s*#\s*define\b[ \t]+([A-Za-z_][A-Za-z0-9_]*)(\([^)]*\))?(?:[ \t]+(.*))?$/i;
const LABEL_PATTERN =
  /^\s*((?:[A-Za-z_.$][A-Za-z0-9_.$]*|[0-9]+))\s*:\s*(.*)$/;
const DIRECTIVE_PATTERN = /^\s*(\.[A-Za-z][A-Za-z0-9_.]*)(?:[ \t]+(.*))?$/;
const ASSIGNMENT_PATTERN =
  /^\s*([A-Za-z_.$][A-Za-z0-9_.$]*)\s*=\s*(.+?)\s*$/;
const INSTRUCTION_PATTERN =
  /^([A-Za-z_.$][A-Za-z0-9_.$]*)(?:[ \t]+(.*))?$/;

const TOP_LEVEL_DIRECTIVES = new Set([
  '.align',
  '.attribute',
  '.balign',
  '.bss',
  '.cfi_endproc',
  '.cfi_startproc',
  '.data',
  '.else',
  '.elseif',
  '.endm',
  '.endr',
  '.endif',
  '.equ',
  '.equiv',
  '.error',
  '.extern',
  '.file',
  '.globl',
  '.global',
  '.hidden',
  '.ident',
  '.if',
  '.ifdef',
  '.ifndef',
  '.ifeq',
  '.ifne',
  '.include',
  '.internal',
  '.irp',
  '.irpc',
  '.local',
  '.loc',
  '.macro',
  '.noalias',
  '.norelax',
  '.norvc',
  '.novnc',
  '.option',
  '.p2align',
  '.popsection',
  '.previous',
  '.protected',
  '.pushsection',
  '.rept',
  '.rodata',
  '.section',
  '.set',
  '.size',
  '.subsection',
  '.text',
  '.type',
  '.variant_cc',
  '.warning',
  '.weak'
]);

const DATA_DIRECTIVES = new Set([
  '.2byte',
  '.4byte',
  '.8byte',
  '.ascii',
  '.asciz',
  '.byte',
  '.double',
  '.dword',
  '.fill',
  '.float',
  '.half',
  '.incbin',
  '.octa',
  '.quad',
  '.sleb128',
  '.skip',
  '.space',
  '.string',
  '.uleb128',
  '.word',
  '.zero'
]);

function resolveOptions(options: FormatterOptions): EffectiveFormatterOptions {
  const candidate = options.indentSize ?? 4;
  const indentSize = Number.isFinite(candidate)
    ? Math.min(16, Math.max(1, Math.floor(candidate)))
    : 4;

  return {
    indentSize,
    alignDefines: options.alignDefines ?? true,
    alignThreeOperandInstructions:
      options.alignThreeOperandInstructions ?? true
  };
}

function isContinuationLine(line: string): boolean {
  return /\\[ \t]*$/.test(line);
}

function parseDefine(line: string): DefineLine | undefined {
  if (isContinuationLine(line)) {
    return undefined;
  }

  const match = line.match(DEFINE_PATTERN);
  if (!match) {
    return undefined;
  }

  const name = match[1] + (match[2] ?? '');
  const rawValue = match[3]?.trim();
  return {
    name,
    value: rawValue === '' ? undefined : rawValue
  };
}

function splitCodeAndComment(
  line: string,
  insideBlockComment: boolean
): CommentSplit {
  if (insideBlockComment) {
    const end = line.indexOf('*/');
    return {
      code: '',
      comment: line,
      continuesBlockComment: end < 0
    };
  }

  let quote = '';
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '#') {
      return {
        code: line.slice(0, index),
        comment: line.slice(index),
        continuesBlockComment: false
      };
    }

    if (character === '/' && next === '/') {
      return {
        code: line.slice(0, index),
        comment: line.slice(index),
        continuesBlockComment: false
      };
    }

    if (character === '/' && next === '*') {
      return {
        code: line.slice(0, index),
        comment: line.slice(index),
        continuesBlockComment: line.indexOf('*/', index + 2) < 0
      };
    }
  }

  return {
    code: line,
    comment: '',
    continuesBlockComment: false
  };
}

export function splitTopLevelCommas(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  let parenthesisDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '(') {
      parenthesisDepth += 1;
    } else if (character === ')' && parenthesisDepth > 0) {
      parenthesisDepth -= 1;
    } else if (character === '[') {
      bracketDepth += 1;
    } else if (character === ']' && bracketDepth > 0) {
      bracketDepth -= 1;
    } else if (character === '{') {
      braceDepth += 1;
    } else if (character === '}' && braceDepth > 0) {
      braceDepth -= 1;
    } else if (
      character === ',' &&
      parenthesisDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      result.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }

  result.push(text.slice(start).trim());
  return result;
}

function attachComment(code: string, comment: string): string {
  if (!comment) {
    return code;
  }
  if (!code) {
    return comment.trimEnd();
  }
  return code + '  ' + comment.trimStart();
}

function formatInstruction(
  code: string,
  comment: string,
  indent: string
): FormattedLine {
  const trimmed = code.trim();
  const match = trimmed.match(INSTRUCTION_PATTERN);
  if (!match) {
    return {
      kind: 'assembly',
      text: attachComment(indent + trimmed, comment)
    };
  }

  const mnemonic = match[1];
  const operandText = match[2]?.trim() ?? '';
  const operands = operandText ? splitTopLevelCommas(operandText) : [];
  const normalizedOperandText = operands.join(', ');
  const normalizedCode =
    indent + mnemonic + (normalizedOperandText ? ' ' + normalizedOperandText : '');

  return {
    kind: 'assembly',
    text: attachComment(normalizedCode, comment),
    instruction: {
      mnemonic,
      operands,
      comment
    }
  };
}

function formatDirective(
  directive: string,
  argument: string | undefined,
  comment: string,
  indent: string
): FormattedLine {
  const normalizedArgument = argument?.trim() ?? '';
  const normalizedCode =
    directive + (normalizedArgument ? ' ' + normalizedArgument : '');
  const lowerDirective = directive.toLowerCase();

  if (
    TOP_LEVEL_DIRECTIVES.has(lowerDirective) ||
    lowerDirective.startsWith('.cfi_')
  ) {
    return {
      kind: 'directive',
      text: attachComment(normalizedCode, comment)
    };
  }

  const formatted = formatInstruction(normalizedCode, comment, indent);
  if (DATA_DIRECTIVES.has(lowerDirective)) {
    return {
      kind: 'directive',
      text: formatted.text
    };
  }
  return formatted;
}

function formatLine(
  line: string,
  indent: string,
  insideBlockComment: boolean
): {
  formatted: FormattedLine;
  continuesBlockComment: boolean;
  continuesPreprocessor: boolean;
} {
  if (insideBlockComment) {
    const split = splitCodeAndComment(line, true);
    return {
      formatted: {
        kind: 'verbatim',
        text: line.trimEnd()
      },
      continuesBlockComment: split.continuesBlockComment,
      continuesPreprocessor: false
    };
  }

  if (!line.trim()) {
    return {
      formatted: { kind: 'blank', text: '' },
      continuesBlockComment: false,
      continuesPreprocessor: false
    };
  }

  if (PREPROCESSOR_PATTERN.test(line)) {
    const define = parseDefine(line);
    if (define) {
      return {
        formatted: {
          kind: 'define',
          text: line
        },
        continuesBlockComment: false,
        continuesPreprocessor: false
      };
    }

    return {
      formatted: {
        kind: isContinuationLine(line) ? 'verbatim' : 'preprocessor',
        text: isContinuationLine(line) ? line.trimEnd() : line.trim()
      },
      continuesBlockComment: false,
      continuesPreprocessor: isContinuationLine(line)
    };
  }

  const split = splitCodeAndComment(line, false);
  const code = split.code.trim();
  if (!code) {
    return {
      formatted: {
        kind: 'comment',
        text: line.trimEnd()
      },
      continuesBlockComment: split.continuesBlockComment,
      continuesPreprocessor: false
    };
  }

  const label = code.match(LABEL_PATTERN);
  if (label) {
    const labelName = label[1];
    const remainder = label[2].trim();
    if (!remainder) {
      return {
        formatted: {
          kind: 'label',
          text: attachComment(labelName + ':', split.comment)
        },
        continuesBlockComment: split.continuesBlockComment,
        continuesPreprocessor: false
      };
    }

    const inlineInstruction = formatInstruction(remainder, '', indent);
    return {
      formatted: {
        kind: 'label',
        text: attachComment(labelName + ':' + inlineInstruction.text, split.comment)
      },
      continuesBlockComment: split.continuesBlockComment,
      continuesPreprocessor: false
    };
  }

  const assignment = code.match(ASSIGNMENT_PATTERN);
  if (assignment) {
    return {
      formatted: {
        kind: 'directive',
        text: attachComment(assignment[1] + ' = ' + assignment[2].trim(), split.comment)
      },
      continuesBlockComment: split.continuesBlockComment,
      continuesPreprocessor: false
    };
  }

  const directive = code.match(DIRECTIVE_PATTERN);
  if (directive) {
    return {
      formatted: formatDirective(directive[1], directive[2], split.comment, indent),
      continuesBlockComment: split.continuesBlockComment,
      continuesPreprocessor: false
    };
  }

  return {
    formatted: formatInstruction(code, split.comment, indent),
    continuesBlockComment: split.continuesBlockComment,
    continuesPreprocessor: false
  };
}

function formatDefineBlock(
  lines: FormattedLine[],
  start: number,
  end: number,
  align: boolean
): void {
  const parsed = lines.slice(start, end).map((line) => parseDefine(line.text));
  if (parsed.some((entry) => !entry)) {
    return;
  }

  const definitions = parsed as DefineLine[];
  const maxNameLength = align
    ? Math.max(...definitions.map((definition) => definition.name.length))
    : 0;

  for (let index = start; index < end; index += 1) {
    const definition = definitions[index - start];
    const name = align
      ? definition.name.padEnd(maxNameLength)
      : definition.name;
    lines[index].text =
      '#define ' + name + (definition.value ? ' ' + definition.value : '');
  }
}

function formatDefineBlocks(lines: FormattedLine[], align: boolean): void {
  let start = 0;
  while (start < lines.length) {
    if (lines[start].kind !== 'define') {
      start += 1;
      continue;
    }

    let end = start + 1;
    while (end < lines.length && lines[end].kind === 'define') {
      end += 1;
    }
    formatDefineBlock(lines, start, end, align);
    start = end;
  }
}

function alignInstructionGroup(
  lines: FormattedLine[],
  indexes: number[],
  indent: string
): void {
  if (indexes.length === 0) {
    return;
  }

  const instructions = indexes.map((index) => lines[index].instruction as InstructionParts);
  const maxMnemonic = Math.max(...instructions.map((entry) => entry.mnemonic.length));
  const maxFirstOperand = Math.max(...instructions.map((entry) => entry.operands[0].length));
  const maxSecondOperand = Math.max(...instructions.map((entry) => entry.operands[1].length));

  for (const index of indexes) {
    const instruction = lines[index].instruction as InstructionParts;
    const code =
      indent +
      instruction.mnemonic.padEnd(maxMnemonic) +
      ' ' +
      instruction.operands[0].padStart(maxFirstOperand) +
      ', ' +
      instruction.operands[1].padStart(maxSecondOperand) +
      ', ' +
      instruction.operands[2];
    lines[index].text = attachComment(code, instruction.comment);
  }
}

function alignThreeOperandInstructions(
  lines: FormattedLine[],
  enabled: boolean,
  indent: string
): void {
  if (!enabled) {
    return;
  }

  let group: number[] = [];
  const flush = () => {
    alignInstructionGroup(lines, group, indent);
    group = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line.kind === 'blank' ||
      line.kind === 'define' ||
      line.kind === 'directive' ||
      line.kind === 'label' ||
      line.kind === 'preprocessor' ||
      line.kind === 'verbatim'
    ) {
      flush();
      continue;
    }

    if (line.kind === 'assembly' && line.instruction?.operands.length === 3) {
      group.push(index);
    }
  }
  flush();
}

export function formatRiscv(
  text: string,
  options: FormatterOptions = {}
): string {
  const resolved = resolveOptions(options);
  const firstEol = text.match(/\r\n|\n/)?.[0] ?? '\n';
  const hasFinalEol = /\r?\n$/.test(text);
  const sourceLines = text.split(/\r\n|\n/);
  if (hasFinalEol) {
    sourceLines.pop();
  }

  const indent = ' '.repeat(resolved.indentSize);
  const lines: FormattedLine[] = [];
  let insideBlockComment = false;
  let insidePreprocessorContinuation = false;

  for (const sourceLine of sourceLines) {
    if (insidePreprocessorContinuation) {
      lines.push({
        kind: 'verbatim',
        text: sourceLine.trimEnd()
      });
      insidePreprocessorContinuation = isContinuationLine(sourceLine);
      continue;
    }

    const result = formatLine(sourceLine, indent, insideBlockComment);
    lines.push(result.formatted);
    insideBlockComment = result.continuesBlockComment;
    insidePreprocessorContinuation = result.continuesPreprocessor;
  }

  formatDefineBlocks(lines, resolved.alignDefines);
  alignThreeOperandInstructions(
    lines,
    resolved.alignThreeOperandInstructions,
    indent
  );

  const formatted = lines.map((line) => line.text).join(firstEol);
  return hasFinalEol ? formatted + firstEol : formatted;
}
