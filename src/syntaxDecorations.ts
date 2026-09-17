import * as vscode from 'vscode';
import {
  collectSyntaxHighlightRanges,
  SyntaxHighlightRange
} from './syntaxHighlighting';
import { RISCV_LANGUAGE_ID } from './providers';

const REFRESH_DELAY_MS = 75;

function toEditorRanges(ranges: readonly SyntaxHighlightRange[]): vscode.Range[] {
  return ranges.map(
    (range) =>
      new vscode.Range(
        new vscode.Position(range.line, range.start),
        new vscode.Position(range.line, range.end)
      )
  );
}

/** Keeps instructions and registers visually distinct across editor themes. */
export class RiscvSyntaxDecorationController implements vscode.Disposable {
  private readonly instructionDecoration = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('betterRiscvSupport.instructionForeground'),
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });

  private readonly registerDecoration = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('betterRiscvSupport.registerForeground'),
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });

  private readonly subscriptions: vscode.Disposable[];
  private readonly pendingRefreshes = new Map<string, ReturnType<typeof setTimeout>>();

  public constructor() {
    this.subscriptions = [
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (
          event.document.languageId === RISCV_LANGUAGE_ID &&
          event.contentChanges.length > 0
        ) {
          this.scheduleRefresh(event.document.uri);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.cancelRefresh(document.uri);
      }),
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        this.refreshEditors(editors);
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.refreshEditor(editor);
        }
      })
    ];

    this.refreshEditors(vscode.window.visibleTextEditors);
  }

  public refreshEditors(editors: readonly vscode.TextEditor[]): void {
    for (const editor of editors) {
      this.refreshEditor(editor);
    }
  }

  public refreshEditor(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== RISCV_LANGUAGE_ID) {
      this.clearEditor(editor);
      return;
    }

    const ranges = collectSyntaxHighlightRanges(editor.document.getText());
    editor.setDecorations(
      this.instructionDecoration,
      toEditorRanges(ranges.instructions)
    );
    editor.setDecorations(
      this.registerDecoration,
      toEditorRanges(ranges.registers)
    );
  }

  public dispose(): void {
    for (const timeout of this.pendingRefreshes.values()) {
      clearTimeout(timeout);
    }
    this.pendingRefreshes.clear();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.instructionDecoration.dispose();
    this.registerDecoration.dispose();
  }

  private clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.instructionDecoration, []);
    editor.setDecorations(this.registerDecoration, []);
  }

  private scheduleRefresh(uri: vscode.Uri): void {
    const key = uri.toString();
    this.cancelRefresh(uri);
    this.pendingRefreshes.set(
      key,
      setTimeout(() => {
        this.pendingRefreshes.delete(key);
        this.refreshEditors(
          vscode.window.visibleTextEditors.filter(
            (editor) => editor.document.uri.toString() === key
          )
        );
      }, REFRESH_DELAY_MS)
    );
  }

  private cancelRefresh(uri: vscode.Uri): void {
    const key = uri.toString();
    const pending = this.pendingRefreshes.get(key);
    if (pending !== undefined) {
      clearTimeout(pending);
      this.pendingRefreshes.delete(key);
    }
  }
}
