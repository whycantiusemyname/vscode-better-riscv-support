export interface FormatterOptions {
  indentSize?: number;
  alignDefines?: boolean;
  defineNameFieldWidth?: number;
  maxBlankLinesWithoutBreak?: number;
  alignAssemblyColumns?: boolean;
  instructionOperandSpacing?: number;
  commaOperandSpacing?: number;
  commentSpacing?: number;
  /** @deprecated Use alignAssemblyColumns. */
  alignThreeOperandInstructions?: boolean;
}

interface EffectiveFormatterOptions {
  indentSize: number;
  alignDefines: boolean;
  defineNameFieldWidth: number;
  maxBlankLinesWithoutBreak: number;
  alignAssemblyColumns: boolean;
  instructionOperandSpacing: number;
  commaOperandSpacing: number;
  commentSpacing: number;
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
  const indentCandidate = options.indentSize ?? 4;
  const indentSize = Number.isFinite(indentCandidate)
    ? Math.min(16, Math.max(1, Math.floor(indentCandidate)))
    : 4;
  const defineWidthCandidate = options.defineNameFieldWidth ?? 24;
  const defineNameFieldWidth = Number.isFinite(defineWidthCandidate)
    ? Math.min(200, Math.max(1, Math.floor(defineWidthCandidate)))
    : 24;
  const blankLineCandidate = options.maxBlankLinesWithoutBreak ?? 2;
  const maxBlankLinesWithoutBreak = Number.isFinite(blankLineCandidate)
    ? Math.min(100, Math.max(0, Math.floor(blankLineCandidate)))
    : 2;
  const instructionSpacingCandidate = options.instructionOperandSpacing ?? 1;
  const instructionOperandSpacing = Number.isFinite(instructionSpacingCandidate)
    ? Math.min(16, Math.max(1, Math.floor(instructionSpacingCandidate)))
    : 1;
  const commaSpacingCandidate = options.commaOperandSpacing ?? 1;
  const commaOperandSpacing = Number.isFinite(commaSpacingCandidate)
    ? Math.min(16, Math.max(0, Math.floor(commaSpacingCandidate)))
    : 1;
  const commentSpacingCandidate = options.commentSpacing ?? 1;
  const commentSpacing = Number.isFinite(commentSpacingCandidate)
    ? Math.min(100, Math.max(0, Math.floor(commentSpacingCandidate)))
    : 1;

  return {
    indentSize,
    alignDefines: options.alignDefines ?? true,
    defineNameFieldWidth,
    maxBlankLinesWithoutBreak,
    alignAssemblyColumns:
      options.alignAssemblyColumns ??
      options.alignThreeOperandInstructions ??
      true,
    instructionOperandSpacing,
    commaOperandSpacing,
    commentSpacing
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

  const formatted: FormattedLine = {
    kind: 'assembly',
    text: attachComment(normalizedCode, comment),
  };
  if (operands.every((operand) => operand.length > 0)) {
    formatted.instruction = {
      mnemonic,
      operands,
      comment
    };
  }
  return formatted;
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
  indexes: number[],
  align: boolean,
  minimumNameFieldWidth: number
): void {
  const parsed = indexes.map((index) => parseDefine(lines[index].text));
  if (parsed.some((entry) => !entry)) {
    return;
  }

  const definitions = parsed as DefineLine[];
  const maxNameLength = Math.max(
    ...definitions.map((definition) => definition.name.length)
  );
  const nameFieldWidth = align
    ? Math.max(minimumNameFieldWidth, maxNameLength + 1)
    : 0;

  for (let entryIndex = 0; entryIndex < indexes.length; entryIndex += 1) {
    const index = indexes[entryIndex];
    const definition = definitions[entryIndex];
    const name = align && definition.value
      ? definition.name.padEnd(nameFieldWidth)
      : definition.name;
    lines[index].text =
      '#define ' +
      name +
      (definition.value ? (align ? '' : ' ') + definition.value : '');
  }
}

function formatDefineBlocks(
  lines: FormattedLine[],
  align: boolean,
  minimumNameFieldWidth: number,
  maxBlankLinesWithoutBreak: number
): void {
  let indexes: number[] = [];
  let blankLineCount = 0;
  const flush = () => {
    if (indexes.length > 0) {
      formatDefineBlock(lines, indexes, align, minimumNameFieldWidth);
      indexes = [];
    }
    blankLineCount = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.kind === 'define') {
      indexes.push(index);
      blankLineCount = 0;
      continue;
    }

    if (line.kind === 'blank') {
      blankLineCount += 1;
      if (indexes.length > 0 && blankLineCount > maxBlankLinesWithoutBreak) {
        flush();
      }
      continue;
    }

    if (indexes.length > 0 && line.kind === 'comment') {
      blankLineCount = 0;
      continue;
    }

    blankLineCount = 0;
    flush();
  }
  flush();
}

function alignAssemblySection(
  lines: FormattedLine[],
  indexes: number[],
  indent: string,
  instructionOperandSpacing: number,
  commaOperandSpacing: number,
  commentSpacing: number
): void {
  if (indexes.length === 0) {
    return;
  }

  const instructions = indexes.map((index) => lines[index].instruction as InstructionParts);
  const maxMnemonic = Math.max(...instructions.map((entry) => entry.mnemonic.length));
  const commaFieldWidths: number[] = [];

  for (const instruction of instructions) {
    for (let operandIndex = 0; operandIndex < instruction.operands.length - 1; operandIndex += 1) {
      commaFieldWidths[operandIndex] = Math.max(
        commaFieldWidths[operandIndex] ?? 0,
        instruction.operands[operandIndex].length
      );
    }
  }

  const codes = indexes.map((index) => {
    const instruction = lines[index].instruction as InstructionParts;
    let code =
      indent +
      (instruction.operands.length > 0
        ? instruction.mnemonic.padEnd(maxMnemonic)
        : instruction.mnemonic);

    if (instruction.operands.length > 0) {
      code += ' '.repeat(instructionOperandSpacing);
      for (let operandIndex = 0; operandIndex < instruction.operands.length; operandIndex += 1) {
        const operand = instruction.operands[operandIndex];
        const hasFollowingComma = operandIndex < instruction.operands.length - 1;
        code += hasFollowingComma
          ? operand.padEnd(commaFieldWidths[operandIndex])
          : operand;
        if (hasFollowingComma) {
          code += ',' + ' '.repeat(commaOperandSpacing);
        }
      }
    }

    return code;
  });
  const longestCodeLength = Math.max(...codes.map((code) => code.length));

  for (let entryIndex = 0; entryIndex < indexes.length; entryIndex += 1) {
    const index = indexes[entryIndex];
    const instruction = lines[index].instruction as InstructionParts;
    const code = codes[entryIndex];
    lines[index].text = instruction.comment
      ? code.padEnd(longestCodeLength) +
        ' '.repeat(commentSpacing) +
        instruction.comment.trimStart()
      : code;
  }
}

function alignAssemblyColumns(
  lines: FormattedLine[],
  enabled: boolean,
  indent: string,
  maxBlankLinesWithoutBreak: number,
  instructionOperandSpacing: number,
  commaOperandSpacing: number,
  commentSpacing: number
): void {
  if (!enabled) {
    return;
  }

  let group: number[] = [];
  let blankLineCount = 0;
  const flush = () => {
    alignAssemblySection(
      lines,
      group,
      indent,
      instructionOperandSpacing,
      commaOperandSpacing,
      commentSpacing
    );
    group = [];
    blankLineCount = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.kind === 'blank') {
      blankLineCount += 1;
      if (blankLineCount > maxBlankLinesWithoutBreak) {
        flush();
      }
      continue;
    }

    if (line.kind === 'comment') {
      blankLineCount = 0;
      continue;
    }

    if (line.kind === 'label') {
      blankLineCount = 0;
      continue;
    }

    if (
      line.kind === 'define' ||
      line.kind === 'directive' ||
      line.kind === 'preprocessor' ||
      line.kind === 'verbatim'
    ) {
      flush();
      continue;
    }

    blankLineCount = 0;
    if (line.kind === 'assembly' && line.instruction) {
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

  formatDefineBlocks(
    lines,
    resolved.alignDefines,
    resolved.defineNameFieldWidth,
    resolved.maxBlankLinesWithoutBreak
  );
  alignAssemblyColumns(
    lines,
    resolved.alignAssemblyColumns,
    indent,
    resolved.maxBlankLinesWithoutBreak,
    resolved.instructionOperandSpacing,
    resolved.commaOperandSpacing,
    resolved.commentSpacing
  );

  const formatted = lines.map((line) => line.text).join(firstEol);
  return hasFinalEol ? formatted + firstEol : formatted;
}
