export interface DefineHighlightRange {
  line: number;
  start: number;
  end: number;
}

export interface DefineHighlightRanges {
  directives: DefineHighlightRange[];
  names: DefineHighlightRange[];
  values: DefineHighlightRange[];
}

interface TextSpan {
  start: number;
  end: number;
}

interface LineScan {
  codeSpans: TextSpan[];
  continuesBlockComment: boolean;
}

interface DefineHead {
  directive: TextSpan;
  name: TextSpan;
  valueStart: number;
}

const DEFINE_HEAD_PATTERN =
  /^([ \t]*)(#[ \t]*define)\b([ \t]+)([A-Za-z_][A-Za-z0-9_]*)/i;

function isHorizontalWhitespace(character: string | undefined): boolean {
  return character === ' ' || character === '\t';
}

function isDefineContinuation(line: string): boolean {
  return /\\[ \t]*$/.test(line);
}

function findClosingParenthesis(line: string, start: number): number | undefined {
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;

  for (let index = start; index < line.length; index += 1) {
    const character = line[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return undefined;
}

function parseDefineHead(line: string): DefineHead | undefined {
  const match = line.match(DEFINE_HEAD_PATTERN);
  if (!match) {
    return undefined;
  }

  const directiveStart = match[1].length;
  const directiveEnd = directiveStart + match[2].length;
  const nameStart = directiveEnd + match[3].length;
  let nameEnd = nameStart + match[4].length;

  if (line[nameEnd] === '(') {
    const closingParenthesis = findClosingParenthesis(line, nameEnd);
    if (closingParenthesis === undefined) {
      return undefined;
    }
    nameEnd = closingParenthesis + 1;
  }

  if (nameEnd < line.length && !isHorizontalWhitespace(line[nameEnd])) {
    return undefined;
  }

  let valueStart = nameEnd;
  while (isHorizontalWhitespace(line[valueStart])) {
    valueStart += 1;
  }

  return {
    directive: { start: directiveStart, end: directiveEnd },
    name: { start: nameStart, end: nameEnd },
    valueStart
  };
}

function scanCodeSpans(
  line: string,
  startsInBlockComment: boolean,
  hashStartsComment: boolean
): LineScan {
  const codeSpans: TextSpan[] = [];
  let insideBlockComment = startsInBlockComment;
  let segmentStart: number | undefined = insideBlockComment ? undefined : 0;
  let quote: string | undefined;
  let escaped = false;
  let index = 0;

  const endSegment = (end: number): void => {
    if (segmentStart !== undefined && segmentStart < end) {
      codeSpans.push({ start: segmentStart, end });
    }
    segmentStart = undefined;
  };

  while (index < line.length) {
    const character = line[index];
    const next = line[index + 1];

    if (insideBlockComment) {
      if (character === '*' && next === '/') {
        insideBlockComment = false;
        index += 2;
        segmentStart = index;
      } else {
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      index += 1;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      index += 1;
      continue;
    }

    if (character === '/' && next === '/') {
      endSegment(index);
      return { codeSpans, continuesBlockComment: false };
    }

    if (hashStartsComment && character === '#') {
      endSegment(index);
      return { codeSpans, continuesBlockComment: false };
    }

    if (character === '/' && next === '*') {
      endSegment(index);
      insideBlockComment = true;
      index += 2;
      continue;
    }

    index += 1;
  }

  endSegment(line.length);
  return { codeSpans, continuesBlockComment: insideBlockComment };
}

function addValueRanges(
  target: DefineHighlightRange[],
  lineNumber: number,
  line: string,
  valueStart: number,
  codeSpans: readonly TextSpan[]
): void {
  for (const span of codeSpans) {
    let start = Math.max(valueStart, span.start);
    let end = span.end;

    while (start < end && isHorizontalWhitespace(line[start])) {
      start += 1;
    }
    while (end > start && isHorizontalWhitespace(line[end - 1])) {
      end -= 1;
    }

    if (start < end) {
      target.push({ line: lineNumber, start, end });
    }
  }
}

/**
 * Finds the three visual parts of C-style #define directives without relying
 * on VS Code APIs, so the parser can be tested independently of the editor.
 */
export function collectDefineHighlightRanges(text: string): DefineHighlightRanges {
  const ranges: DefineHighlightRanges = {
    directives: [],
    names: [],
    values: []
  };
  const lines = text.split(/\r\n|\r|\n/);
  let insideBlockComment = false;
  let insideDefineContinuation = false;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];
    const startsInBlockComment = insideBlockComment;

    if (insideDefineContinuation) {
      const scan = scanCodeSpans(line, startsInBlockComment, false);
      addValueRanges(ranges.values, lineNumber, line, 0, scan.codeSpans);
      insideBlockComment = scan.continuesBlockComment;
      insideDefineContinuation = isDefineContinuation(line);
      continue;
    }

    const definition = startsInBlockComment ? undefined : parseDefineHead(line);
    const scan = scanCodeSpans(
      line,
      startsInBlockComment,
      definition === undefined
    );
    insideBlockComment = scan.continuesBlockComment;

    if (!definition) {
      continue;
    }

    ranges.directives.push({ line: lineNumber, ...definition.directive });
    ranges.names.push({ line: lineNumber, ...definition.name });
    addValueRanges(
      ranges.values,
      lineNumber,
      line,
      definition.valueStart,
      scan.codeSpans
    );
    insideDefineContinuation = isDefineContinuation(line);
  }

  return ranges;
}
