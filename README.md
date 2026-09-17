<p align="center">
  <img src="images/logo.png" width="128" alt="Better RISC-V Support logo">
</p>

# Better RISC-V Support

[![Visual Studio Marketplace version](https://img.shields.io/visual-studio-marketplace/v/Esing.better-riscv-support?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=Esing.better-riscv-support)
[![Visual Studio Marketplace installs](https://img.shields.io/visual-studio-marketplace/i/Esing.better-riscv-support?label=Installs)](https://marketplace.visualstudio.com/items?itemName=Esing.better-riscv-support)
[![License](https://img.shields.io/github/license/Zxis233/vscode-better-riscv-support)](LICENSE)

A focused VS Code extension for GNU-style RISC-V assembly: syntax-aware
highlighting, alignment-aware formatting, navigation, completion, and useful
snippets in one lightweight package.

## Highlights

| Area | What you get |
| --- | --- |
| Syntax | GNU-style RISC-V syntax highlighting for instructions, directives, registers, CSRs, relocations, labels, comments, macros, and common extensions. |
| `#define` | A red directive, a teal bold macro name, and a purple macro value. These editor decorations are independent of global TextMate color customizations. |
| Formatting | Aligned `#define` sections, instruction mnemonics, operand columns, and inline `#` / `//` comments. Choose aligned comma columns or commas attached to operands. Structural directives and labels stay in column zero. |
| Navigation | Go to Definition for labels, numeric local labels (`1f` / `1b`), macros, `#define`s, and `.equ` / `.set` symbols. |
| Productivity | Outline, workspace symbol search, text-boundary references, document highlights, completion, and 29 GNU RISC-V snippets. |

## Install

### From the Marketplace

1. Open the **Extensions** view in VS Code.
2. Search for **Better RISC-V Support**.
3. Select **Install**.

Or install from the command line:

```sh
code --install-extension Esing.better-riscv-support
```

### From a VSIX file

```sh
code --install-extension better-riscv-support-<version>.vsix
```

The extension requires VS Code 1.85 or later.

## Quick start

1. Open a `.s`, `.S`, `.asm`, or `.riscv` file. If another extension selected
   a different language mode, use **Change Language Mode** and choose
   **RISC-V Assembly**.
2. Run **Format Document** (`Shift+Alt+F` on Windows/Linux) or invoke
   **Better RISC-V Support: Format Document** from the Command Palette.
3. Use `F12` for definitions, `Shift+F12` for references, and the Explorer's
   **Outline** view to navigate symbols.
4. Type a snippet prefix such as `r3`, `rfunc`, `rmacro`, `rdefine`, `load`,
   or `branch`, then accept the completion.

## Formatting

Input:

```asm
#define SHORT 1
#define A_LONGER_NAME 42

  .macro SAVE reg
addi x1,x0,1
add x10,x2,x3
  .endm
```

Output:

```asm
#define SHORT                   1
#define A_LONGER_NAME           42

.macro SAVE reg
    addi x1 , x0, 1
    add  x10, x2, x3
.endm
```

Formatting is section-aware rather than file-global:

- `#define` names and values align within a define section. Comment-only lines
  and up to `betterRiscvSupport.maxBlankLinesWithoutBreak` blank lines remain
  in the same section.
- Ordinary assembly lines in one section share mnemonic, operand, and inline
  comment columns. Comma placement is configurable.
- Labels and structural directives such as `.macro`, `.endm`, `.option`,
  `.norvc`, and `.novnc` start in column zero.
- The formatter preserves the document's original line-ending style and final
  newline convention.

Choose the comma style with `betterRiscvSupport.commaAlignment`:

- `"aligned"` (default) pads before commas, so comma columns align.
- `"afterOperand"` keeps each comma adjacent to its operand and puts any
  additional padding after the comma, so subsequent operand columns still
  align. For example: `addi a0,   a0,   1`.

## Settings

All settings are available in Settings UI under **Better RISC-V Support**.

| Setting | Default | Description |
| --- | ---: | --- |
| `betterRiscvSupport.indentSize` | `4` | Spaces before ordinary assembly instructions. |
| `betterRiscvSupport.alignDefines` | `true` | Align macro names and values in each `#define` section. |
| `betterRiscvSupport.defineNameFieldWidth` | `24` | Minimum macro-name field width after `#define`. |
| `betterRiscvSupport.maxBlankLinesWithoutBreak` | `2` | Maximum blank lines that keep a define or assembly alignment section connected. |
| `betterRiscvSupport.alignAssemblyColumns` | `true` | Align instruction, operand, and inline-comment columns. |
| `betterRiscvSupport.commaAlignment` | `"aligned"` | `"aligned"` aligns comma columns; `"afterOperand"` keeps commas next to operands while aligning later operand columns. |
| `betterRiscvSupport.instructionOperandSpacing` | `1` | Spaces between a mnemonic and its first operand. |
| `betterRiscvSupport.commaOperandSpacing` | `1` | Minimum spaces after an operand comma. In `"afterOperand"` mode, more spaces may follow shorter operands to preserve operand columns. |
| `betterRiscvSupport.commentSpacing` | `1` | Spaces before an inline `#` or `//` comment. |
| `betterRiscvSupport.maxWorkspaceFiles` | `500` | Maximum assembly-like files scanned for workspace symbols. |

Example:

```jsonc
{
  "betterRiscvSupport.indentSize": 4,
  "betterRiscvSupport.defineNameFieldWidth": 24,
  "betterRiscvSupport.maxBlankLinesWithoutBreak": 2,
  "betterRiscvSupport.commaAlignment": "afterOperand",
  "betterRiscvSupport.instructionOperandSpacing": 1,
  "betterRiscvSupport.commaOperandSpacing": 1,
  "betterRiscvSupport.commentSpacing": 2
}
```

## `#define` colors

The `#define` highlight uses extension-owned editor decorations, not the
global `editor.tokenColorCustomizations` array. This lets it coexist with
other language extensions that also use TextMate color rules.

Override the three colors through `workbench.colorCustomizations`:

```jsonc
{
  "workbench.colorCustomizations": {
    "betterRiscvSupport.define.directiveForeground": "#E53935",
    "betterRiscvSupport.define.nameForeground": "#00897B",
    "betterRiscvSupport.define.valueForeground": "#7E57C2"
  }
}
```

## Theme compatibility

Instruction mnemonics use the standard `keyword` TextMate scope family and
registers use `variable.language`. These scopes are intentionally conservative:
they remain visibly highlighted in VS Code's built-in themes as well as themes
focused on C/C++, including **Visual Studio 2017 Dark - C++**. Earlier releases
used `support.function` and `variable.other`, which some themes render with the
same foreground as ordinary source text.

The extension also supplies default `files.associations` entries for `.s`,
`.S`, `.asm`, and `.riscv`. This keeps RISC-V source files attached to the
`riscv` language when another installed extension, such as PlatformIO, also
claims generic assembly extensions. An explicit user or workspace association
still takes precedence.

## Language support and limitations

- The extension targets GNU-style RISC-V assembly; it is not an assembler,
  linter, debugger, or complete preprocessor implementation.
- Whole-document formatting is supported. Range formatting is not currently
  provided.
- Backslash-continued preprocessor macros are highlighted, but their layout is
  intentionally preserved by the formatter.
- Reference search and document highlighting are identifier-based text
  matching, not full semantic or include-aware analysis. Numeric local labels
  are supported by Go to Definition.
- If another extension owns the same file suffix or formatting provider, select
  **RISC-V Assembly** as the language mode and choose **Better RISC-V Support**
  in **Format Document With...**.

## Contributing and support

Bug reports and feature requests are welcome in the
[issue tracker](https://github.com/Zxis233/vscode-better-riscv-support/issues).
For local development, run:

```sh
npm install
npm test
```

Press `F5` in VS Code to launch an Extension Development Host.

## License

[MIT](LICENSE)
