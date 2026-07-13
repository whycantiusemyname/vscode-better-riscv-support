import * as vscode from 'vscode';
import {
  collectDefineHighlightRanges,
  DefineHighlightRange
} from './defineHighlighting';
import { RISCV_LANGUAGE_ID } from './providers';

const REFRESH_DELAY_MS = 75;

function toEditorRanges(
  ranges: readonly DefineHighlightRange[]
): vscode.Range[] {
  return ranges.map(
    (range) =>
      new vscode.Range(
        new vscode.Position(range.line, range.start),
        new vscode.Position(range.line, range.end)
      )
  );
}

/** Applies independent, theme-aware #define decorations to RISC-V editors. */
export class RiscvDefineDecorationController implements vscode.Disposable {
  private readonly directiveDecoration = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('betterRiscvSupport.define.directiveForeground'),
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });

  private readonly nameDecoration = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('betterRiscvSupport.define.nameForeground'),
    fontWeight: 'bold',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });

  private readonly valueDecoration = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('betterRiscvSupport.define.valueForeground'),
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

    this.refreshVisibleEditors();
  }

  public refreshVisibleEditors(): void {
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

    const ranges = collectDefineHighlightRanges(editor.document.getText());
    editor.setDecorations(
      this.directiveDecoration,
      toEditorRanges(ranges.directives)
    );
    editor.setDecorations(this.nameDecoration, toEditorRanges(ranges.names));
    editor.setDecorations(this.valueDecoration, toEditorRanges(ranges.values));
  }

  public dispose(): void {
    for (const timeout of this.pendingRefreshes.values()) {
      clearTimeout(timeout);
    }
    this.pendingRefreshes.clear();

    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.directiveDecoration.dispose();
    this.nameDecoration.dispose();
    this.valueDecoration.dispose();
  }

  private clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.directiveDecoration, []);
    editor.setDecorations(this.nameDecoration, []);
    editor.setDecorations(this.valueDecoration, []);
  }

  private scheduleRefresh(uri: vscode.Uri): void {
    const key = uri.toString();
    this.cancelRefresh(uri);
    this.pendingRefreshes.set(
      key,
      setTimeout(() => {
        this.pendingRefreshes.delete(key);
        const editors = vscode.window.visibleTextEditors.filter(
          (editor) => editor.document.uri.toString() === key
        );
        this.refreshEditors(editors);
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
