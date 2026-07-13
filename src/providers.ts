import * as vscode from 'vscode';
import { formatRiscv } from './formatter';
import {
  getSymbolTokenAt,
  parseRiscvSymbols,
  resolveNumericLocalLabel,
  RiscvSymbol,
  RiscvSymbolKind
} from './symbols';

export const RISCV_LANGUAGE_ID = 'riscv';

interface IndexedDocument {
  document: vscode.TextDocument;
  symbols: readonly RiscvSymbol[];
}

interface CachedDocument {
  version: number;
  symbols: readonly RiscvSymbol[];
}

const ASSEMBLY_FILE_PATTERN = /\.(?:s|asm|riscv|inc|h)$/i;
const INSTRUCTIONS = [
  'add',
  'addi',
  'and',
  'andi',
  'auipc',
  'beq',
  'bge',
  'bgeu',
  'blt',
  'bltu',
  'bne',
  'call',
  'csrr',
  'csrrc',
  'csrrs',
  'csrrw',
  'ecall',
  'fence',
  'jal',
  'jalr',
  'j',
  'la',
  'lb',
  'ld',
  'lh',
  'li',
  'lui',
  'lw',
  'mul',
  'mv',
  'or',
  'ori',
  'ret',
  'sb',
  'sd',
  'sh',
  'sll',
  'slli',
  'slt',
  'slti',
  'sra',
  'srai',
  'srl',
  'srli',
  'sub',
  'sw',
  'xor',
  'xori'
];
const DIRECTIVES = [
  '.align',
  '.ascii',
  '.asciz',
  '.byte',
  '.data',
  '.endm',
  '.equ',
  '.global',
  '.globl',
  '.macro',
  '.option',
  '.rodata',
  '.section',
  '.set',
  '.text',
  '.type',
  '.word'
];

function isAssemblyDocument(document: vscode.TextDocument): boolean {
  return (
    document.languageId === RISCV_LANGUAGE_ID ||
    (document.uri.scheme === 'file' && ASSEMBLY_FILE_PATTERN.test(document.uri.fsPath))
  );
}

function toSymbolKind(kind: RiscvSymbolKind): vscode.SymbolKind {
  switch (kind) {
    case 'define':
    case 'equate':
      return vscode.SymbolKind.Constant;
    case 'label':
      return vscode.SymbolKind.Function;
    case 'macro':
      return vscode.SymbolKind.Method;
    case 'section':
      return vscode.SymbolKind.Namespace;
    case 'variable':
      return vscode.SymbolKind.Variable;
  }
}

function symbolRange(symbol: RiscvSymbol): vscode.Range {
  return new vscode.Range(
    new vscode.Position(symbol.line, symbol.column),
    new vscode.Position(symbol.line, symbol.column + symbol.length)
  );
}

function fullSymbolRange(
  document: vscode.TextDocument,
  symbol: RiscvSymbol
): vscode.Range {
  const endLine = Math.min(symbol.endLine, document.lineCount - 1);
  return new vscode.Range(
    new vscode.Position(symbol.line, 0),
    document.lineAt(endLine).range.end
  );
}

function locationFor(
  document: vscode.TextDocument,
  symbol: RiscvSymbol
): vscode.Location {
  return new vscode.Location(document.uri, symbolRange(symbol));
}

function formatterOptions(document: vscode.TextDocument) {
  const configuration = vscode.workspace.getConfiguration(
    'betterRiscvSupport',
    document.uri
  );
  return {
    indentSize: configuration.get<number>('indentSize', 4),
    alignDefines: configuration.get<boolean>('alignDefines', true),
    alignThreeOperandInstructions: configuration.get<boolean>(
      'alignThreeOperandInstructions',
      true
    )
  };
}

function maxWorkspaceFiles(): number {
  return vscode.workspace
    .getConfiguration('betterRiscvSupport')
    .get<number>('maxWorkspaceFiles', 500);
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_.$]/.test(character);
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[\\^$.*+?()\[\]{}|]/g, '\\$&');
}

function occurrenceRanges(
  document: vscode.TextDocument,
  symbolName: string
): vscode.Range[] {
  const expression = new RegExp(escapeRegularExpression(symbolName), 'g');
  const ranges: vscode.Range[] = [];

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
    const text = document.lineAt(lineNumber).text;
    for (const match of text.matchAll(expression)) {
      const start = match.index ?? 0;
      const end = start + symbolName.length;
      if (isWordCharacter(text[start - 1]) || isWordCharacter(text[end])) {
        continue;
      }
      ranges.push(
        new vscode.Range(
          new vscode.Position(lineNumber, start),
          new vscode.Position(lineNumber, end)
        )
      );
    }
  }

  return ranges;
}

export class RiscvSymbolIndex {
  private readonly cache = new Map<string, CachedDocument>();

  public invalidate(uri: vscode.Uri): void {
    this.cache.delete(uri.toString());
  }

  public symbolsFor(document: vscode.TextDocument): readonly RiscvSymbol[] {
    const key = document.uri.toString();
    const cached = this.cache.get(key);
    if (cached?.version === document.version) {
      return cached.symbols;
    }

    const symbols = parseRiscvSymbols(document.getText()).symbols;
    this.cache.set(key, { version: document.version, symbols });
    return symbols;
  }

  public async workspaceDocuments(
    currentDocument?: vscode.TextDocument,
    token?: vscode.CancellationToken
  ): Promise<IndexedDocument[]> {
    const byUri = new Map<string, vscode.TextDocument>();
    const addDocument = (document: vscode.TextDocument) => {
      if (isAssemblyDocument(document)) {
        byUri.set(document.uri.toString(), document);
      }
    };

    for (const document of vscode.workspace.textDocuments) {
      addDocument(document);
    }
    if (currentDocument) {
      byUri.set(currentDocument.uri.toString(), currentDocument);
    }

    let uris: vscode.Uri[] = [];
    try {
      uris = await vscode.workspace.findFiles(
        '**/*.{s,S,asm,riscv,inc,h}',
        '**/{.git,node_modules,dist,build}/**',
        maxWorkspaceFiles()
      );
    } catch {
      uris = [];
    }

    for (const uri of uris) {
      if (token?.isCancellationRequested) {
        break;
      }
      if (byUri.has(uri.toString())) {
        continue;
      }
      try {
        addDocument(await vscode.workspace.openTextDocument(uri));
      } catch {
        // A file can disappear while the workspace is being indexed.
      }
    }

    return [...byUri.values()].map((document) => ({
      document,
      symbols: this.symbolsFor(document)
    }));
  }

  public async definitionsFor(
    document: vscode.TextDocument,
    position: vscode.Position,
    token?: vscode.CancellationToken
  ): Promise<vscode.Location[] | undefined> {
    const word = getSymbolTokenAt(document.lineAt(position.line).text, position.character);
    if (!word) {
      return undefined;
    }

    const localSymbols = this.symbolsFor(document);
    const localLabel = resolveNumericLocalLabel(
      localSymbols,
      word.text,
      position.line
    );
    if (localLabel) {
      return [locationFor(document, localLabel)];
    }

    const inCurrentDocument = localSymbols.filter(
      (symbol) => symbol.name === word.text
    );
    if (inCurrentDocument.length > 0) {
      return inCurrentDocument.map((symbol) => locationFor(document, symbol));
    }

    const matches: vscode.Location[] = [];
    const documents = await this.workspaceDocuments(document, token);
    for (const indexed of documents) {
      if (token?.isCancellationRequested) {
        break;
      }
      for (const symbol of indexed.symbols) {
        if (symbol.name === word.text) {
          matches.push(locationFor(indexed.document, symbol));
        }
      }
    }

    return matches.length > 0 ? matches : undefined;
  }
}

export class RiscvFormattingProvider
  implements vscode.DocumentFormattingEditProvider
{
  public provideDocumentFormattingEdits(
    document: vscode.TextDocument
  ): vscode.TextEdit[] {
    const source = document.getText();
    const formatted = formatRiscv(source, formatterOptions(document));
    if (formatted === source) {
      return [];
    }

    const completeRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(source.length)
    );
    return [vscode.TextEdit.replace(completeRange, formatted)];
  }
}

export class RiscvDefinitionProvider implements vscode.DefinitionProvider {
  public constructor(private readonly index: RiscvSymbolIndex) {}

  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    return this.index.definitionsFor(document, position, token);
  }
}

export class RiscvDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  public constructor(private readonly index: RiscvSymbolIndex) {}

  public provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.DocumentSymbol[] {
    const rootSymbols: vscode.DocumentSymbol[] = [];
    const macroSymbols = new Map<string, vscode.DocumentSymbol>();

    for (const symbol of this.index.symbolsFor(document)) {
      const documentSymbol = new vscode.DocumentSymbol(
        symbol.name,
        symbol.detail ?? symbol.kind,
        toSymbolKind(symbol.kind),
        fullSymbolRange(document, symbol),
        symbolRange(symbol)
      );

      if (symbol.kind === 'macro') {
        macroSymbols.set(symbol.name, documentSymbol);
        rootSymbols.push(documentSymbol);
      } else if (symbol.containerName && macroSymbols.has(symbol.containerName)) {
        macroSymbols.get(symbol.containerName)?.children.push(documentSymbol);
      } else {
        rootSymbols.push(documentSymbol);
      }
    }

    return rootSymbols;
  }
}

export class RiscvWorkspaceSymbolProvider
  implements vscode.WorkspaceSymbolProvider
{
  public constructor(private readonly index: RiscvSymbolIndex) {}

  public async provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken
  ): Promise<vscode.SymbolInformation[]> {
    const normalizedQuery = query.toLowerCase();
    const results: vscode.SymbolInformation[] = [];
    const documents = await this.index.workspaceDocuments(undefined, token);

    for (const indexed of documents) {
      if (token.isCancellationRequested) {
        break;
      }
      for (const symbol of indexed.symbols) {
        if (
          normalizedQuery &&
          !symbol.name.toLowerCase().includes(normalizedQuery)
        ) {
          continue;
        }
        results.push(
          new vscode.SymbolInformation(
            symbol.name,
            toSymbolKind(symbol.kind),
            symbol.containerName ?? '',
            locationFor(indexed.document, symbol)
          )
        );
      }
    }

    return results;
  }
}

export class RiscvReferenceProvider implements vscode.ReferenceProvider {
  public constructor(private readonly index: RiscvSymbolIndex) {}

  public async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    const word = getSymbolTokenAt(document.lineAt(position.line).text, position.character);
    if (!word || /^[0-9]+[fb]$/.test(word.text)) {
      return [];
    }

    const definitions = await this.index.definitionsFor(document, position, token);
    if (!definitions || definitions.length === 0) {
      return [];
    }

    const declarationLocations = new Set(
      definitions.map(
        (location) =>
          location.uri.toString() +
          ':' +
          location.range.start.line +
          ':' +
          location.range.start.character
      )
    );
    const locations: vscode.Location[] = [];
    const documents = await this.index.workspaceDocuments(document, token);

    for (const indexed of documents) {
      if (token.isCancellationRequested) {
        break;
      }
      for (const range of occurrenceRanges(indexed.document, word.text)) {
        const key =
          indexed.document.uri.toString() +
          ':' +
          range.start.line +
          ':' +
          range.start.character;
        if (!context.includeDeclaration && declarationLocations.has(key)) {
          continue;
        }
        locations.push(new vscode.Location(indexed.document.uri, range));
      }
    }

    return locations;
  }
}

export class RiscvDocumentHighlightProvider
  implements vscode.DocumentHighlightProvider
{
  public constructor(private readonly index: RiscvSymbolIndex) {}

  public provideDocumentHighlights(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.DocumentHighlight[] {
    const word = getSymbolTokenAt(document.lineAt(position.line).text, position.character);
    if (!word || /^[0-9]+[fb]$/.test(word.text)) {
      return [];
    }

    const symbols = this.index.symbolsFor(document);
    if (!symbols.some((symbol) => symbol.name === word.text)) {
      return [];
    }

    return occurrenceRanges(document, word.text).map(
      (range) => new vscode.DocumentHighlight(range)
    );
  }
}

export class RiscvCompletionProvider
  implements vscode.CompletionItemProvider
{
  public constructor(private readonly index: RiscvSymbolIndex) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    for (const instruction of INSTRUCTIONS) {
      const item = new vscode.CompletionItem(
        instruction,
        vscode.CompletionItemKind.Keyword
      );
      item.detail = 'RISC-V instruction';
      items.push(item);
    }
    for (const directive of DIRECTIVES) {
      const item = new vscode.CompletionItem(
        directive,
        vscode.CompletionItemKind.Keyword
      );
      item.detail = 'GNU assembler directive';
      items.push(item);
    }
    for (const symbol of this.index.symbolsFor(document)) {
      const item = new vscode.CompletionItem(
        symbol.name,
        symbol.kind === 'macro'
          ? vscode.CompletionItemKind.Function
          : vscode.CompletionItemKind.Variable
      );
      item.detail = symbol.detail ?? symbol.kind;
      items.push(item);
    }

    return items;
  }
}
