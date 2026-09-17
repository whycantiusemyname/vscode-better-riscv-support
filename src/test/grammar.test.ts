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

test('uses theme-compatible scopes for instructions and registers', () => {
  const grammar = loadGrammar();
  const instructionScopes = names(grammar.repository.instructions);
  const registerScopes = names(grammar.repository.registers);
  const csrScopes = names(grammar.repository.csrs);

  assert.ok(instructionScopes.length > 0);
  assert.ok(
    instructionScopes.every((scope) =>
      scope.startsWith('keyword.other.instruction')
    ),
    `unexpected instruction scopes: ${instructionScopes.join(', ')}`
  );
  assert.ok(registerScopes.length > 0);
  assert.ok(
    registerScopes.every((scope) =>
      scope.startsWith('variable.language.register')
    ),
    `unexpected register scopes: ${registerScopes.join(', ')}`
  );
  assert.deepEqual(csrScopes, ['variable.language.register.csr.riscv']);
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
