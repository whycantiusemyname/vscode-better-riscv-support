import * as vscode from 'vscode';
import { RiscvDefineDecorationController } from './defineDecorations';
import {
  RISCV_LANGUAGE_ID,
  RiscvCompletionProvider,
  RiscvDefinitionProvider,
  RiscvDocumentHighlightProvider,
  RiscvDocumentSymbolProvider,
  RiscvFormattingProvider,
  RiscvReferenceProvider,
  RiscvSymbolIndex,
  RiscvWorkspaceSymbolProvider
} from './providers';

export function activate(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = { language: RISCV_LANGUAGE_ID };
  const index = new RiscvSymbolIndex();
  const defineDecorations = new RiscvDefineDecorationController();

  context.subscriptions.push(
    defineDecorations,
    vscode.workspace.onDidChangeTextDocument((event) => {
      index.invalidate(event.document.uri);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      index.invalidate(document.uri);
    }),
    vscode.languages.registerDocumentFormattingEditProvider(
      selector,
      new RiscvFormattingProvider()
    ),
    vscode.languages.registerDefinitionProvider(
      selector,
      new RiscvDefinitionProvider(index)
    ),
    vscode.languages.registerDocumentSymbolProvider(
      selector,
      new RiscvDocumentSymbolProvider(index)
    ),
    vscode.languages.registerWorkspaceSymbolProvider(
      new RiscvWorkspaceSymbolProvider(index)
    ),
    vscode.languages.registerReferenceProvider(
      selector,
      new RiscvReferenceProvider(index)
    ),
    vscode.languages.registerDocumentHighlightProvider(
      selector,
      new RiscvDocumentHighlightProvider(index)
    ),
    vscode.languages.registerCompletionItemProvider(
      selector,
      new RiscvCompletionProvider(index),
      '.'
    ),
    vscode.commands.registerCommand(
      'betterRiscvSupport.formatDocument',
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== RISCV_LANGUAGE_ID) {
          await vscode.window.showWarningMessage(
            'Open a RISC-V assembly document before formatting.'
          );
          return;
        }
        await vscode.commands.executeCommand('editor.action.formatDocument');
      }
    )
  );
}

export function deactivate(): void {
  // VS Code disposes registered providers through ExtensionContext subscriptions.
}
