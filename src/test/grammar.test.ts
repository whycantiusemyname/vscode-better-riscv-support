import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

type GrammarRule = {
  name?: string;
  patterns?: GrammarRule[];
};

type Grammar = {
  scopeName: string;
  repository: Record<string, GrammarRule>;
};

type ExtensionManifest = {
  contributes: {
    configurationDefaults?: {
      'files.associations'?: Record<string, string>;
    };
    colors?: Array<{
      id: string;
      defaults: Record<string, string>;
    }>;
  };
};

function loadGrammar(): Grammar {
  const grammarPath = path.resolve(
    __dirname,
    '../../syntaxes/riscv.tmLanguage.json'
  );
  return JSON.parse(readFileSync(grammarPath, 'utf8')) as Grammar;
}

function names(rule: GrammarRule): string[] {
  const current = rule.name ? [rule.name] : [];
  return current.concat((rule.patterns ?? []).flatMap(names));
}

test('preserves semantic TextMate scopes for instructions and registers', () => {
  const grammar = loadGrammar();
  const instructionScopes = names(grammar.repository.instructions);
  const registerScopes = names(grammar.repository.registers);
  const csrScopes = names(grammar.repository.csrs);

  assert.ok(instructionScopes.length > 0);
  assert.ok(
    instructionScopes.every((scope) =>
      scope.startsWith('support.function.instruction')
    ),
    `unexpected instruction scopes: ${instructionScopes.join(', ')}`
  );
  assert.ok(registerScopes.length > 0);
  assert.ok(
    registerScopes.every((scope) =>
      scope.startsWith('variable.other.register')
    ),
    `unexpected register scopes: ${registerScopes.join(', ')}`
  );
  assert.deepEqual(csrScopes, ['variable.other.register.csr.riscv']);
});

test('contributes distinct theme-aware instruction and register colors', () => {
  const manifestPath = path.resolve(__dirname, '../../package.json');
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8')
  ) as ExtensionManifest;
  const colors = new Map(
    (manifest.contributes.colors ?? []).map((color) => [color.id, color.defaults])
  );
  const instruction = colors.get('betterRiscvSupport.instructionForeground');
  const register = colors.get('betterRiscvSupport.registerForeground');

  assert.ok(instruction, 'instruction color contribution is missing');
  assert.ok(register, 'register color contribution is missing');
  assert.notEqual(instruction.dark, register.dark);
  assert.notEqual(instruction.light, register.light);
});

test('keeps the grammar attached to the shared RISC-V language scope', () => {
  assert.equal(loadGrammar().scopeName, 'source.riscv');
});

test('wins generic assembly file associations back from competing extensions', () => {
  const manifestPath = path.resolve(__dirname, '../../package.json');
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8')
  ) as ExtensionManifest;
  const associations =
    manifest.contributes.configurationDefaults?.['files.associations'];

  assert.deepEqual(associations, {
    '*.s': 'riscv',
    '*.S': 'riscv',
    '*.asm': 'riscv',
    '*.riscv': 'riscv'
  });
});
