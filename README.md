# Better RISC-V Support for VS Code

An RISC-V assembly extension with modern syntax highlighting, a formatter that
understands assembler layout, and symbol navigation.

## Features

- TextMate highlighting for GNU-style RISC-V assembly, C preprocessor
  directives, macros, labels, ABI/register names, CSRs, relocations, vector
  instructions, compressed instructions, and common Z extensions.
- #define highlighting: the directive is red, its macro name is teal and
  bold, and its value is purple by default. This uses editor decorations, so
  it does not conflict with another extension's token-color customizations.
- Format Document support:
  - C-style #define sections align macro names and value columns across blank
    and comment-only lines;
  - assembler directives such as .macro, .endm, .option norvc, .norvc, and
    .novnc start in column zero;
  - labels start in column zero and normal assembly instructions use four
    spaces by default;
  - all assembly instructions align mnemonic, operand comma, and inline
    comment columns within each assembly section.
- Go to Definition and Find All References for labels, numeric local labels
  (1f/1b), .macro names, #define names, and .equ/.set symbols.
- Document Outline, workspace symbol search, completion for common
  instructions/directives, and document highlights.
- Curated GNU RISC-V snippets for arithmetic, control flow, memory access,
  functions, macros, CSRs, and data definitions.

## Formatting example

Input:

    #define SHORT 1
    #define A_LONGER_NAME 42

      .macro SAVE reg
    addi x1,x0,1
    add x10,x2,x3
      .endm

Output:

    #define SHORT                   1
    #define A_LONGER_NAME           42

    .macro SAVE reg
        addi  x1, x0, 1
        add  x10, x2, x3
    .endm

The formatter keeps comment-only lines and up to the configured number of
consecutive blank lines inside a #define section, so values retain one shared
column like example/iwant_example.S. A directive, instruction, label, other
preprocessor line, or a longer blank-line run starts a new section.

## Settings

- betterRiscvSupport.indentSize: spaces before normal instructions
  (default: 4).
- betterRiscvSupport.alignDefines: align each #define section (default: true).
- betterRiscvSupport.defineNameFieldWidth: minimum #define macro-name field
  width (default: 24, matching example/iwant_example.S).
- betterRiscvSupport.maxBlankLinesWithoutBreak: maximum consecutive blank
  lines that do not split #define or assembly alignment sections
  (default: 2; a run of 3 starts a new section).
- betterRiscvSupport.alignAssemblyColumns: align instruction, comma, and
  inline-comment columns (default: true).
- betterRiscvSupport.instructionOperandSpacing: exact spaces between an
  instruction and its first operand (default: 1).
- betterRiscvSupport.commaOperandSpacing: exact spaces after each operand
  comma (default: 1). Shorter operands receive padding before their comma.
- betterRiscvSupport.commentSpacing: spaces before an inline # or // comment
  after the longest code tail in its section (default: 1).
- betterRiscvSupport.maxWorkspaceFiles: limit workspace scanning for symbol
  navigation (default: 500).

## Define colors

The #define decoration colors are extension-specific and can be overridden
without editing global TextMate rules:

```jsonc
"workbench.colorCustomizations": {
  "betterRiscvSupport.define.directiveForeground": "#E53935",
  "betterRiscvSupport.define.nameForeground": "#00897B",
  "betterRiscvSupport.define.valueForeground": "#7E57C2"
}
```

## Development

Run npm install, then npm test. Press F5 in VS Code to start an Extension
Development Host.
