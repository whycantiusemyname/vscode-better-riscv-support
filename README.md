# Better RISC-V Support for VS Code

An RISC-V assembly extension with modern syntax highlighting, a formatter that
understands assembler layout, and symbol navigation.

## Features

- TextMate highlighting for GNU-style RISC-V assembly, C preprocessor
  directives, macros, labels, ABI/register names, CSRs, relocations, vector
  instructions, compressed instructions, and common Z extensions.
- Format Document support:
  - contiguous C-style #define blocks align macro names and value columns;
  - assembler directives such as .macro, .endm, .option norvc, .norvc, and
    .novnc start in column zero;
  - labels start in column zero and normal assembly instructions use four
    spaces by default;
  - three-operand instructions align the mnemonic and both comma columns in
    each assembly block.
- Go to Definition and Find All References for labels, numeric local labels
  (1f/1b), .macro names, #define names, and .equ/.set symbols.
- Document Outline, workspace symbol search, completion for common
  instructions/directives, and document highlights.

## Formatting example

Input:

    #define SHORT 1
    #define A_LONGER_NAME 42

      .macro SAVE reg
    addi x1,x0,1
    add x10,x2,x3
      .endm

Output:

    #define SHORT         1
    #define A_LONGER_NAME  42

    .macro SAVE reg
        addi  x1, x0, 1
        add  x10, x2, x3
    .endm

The formatter intentionally aligns only contiguous #define blocks. This avoids
unrelated macro groups acquiring excessive whitespace.

## Settings

- betterRiscvSupport.indentSize: spaces before normal instructions
  (default: 4).
- betterRiscvSupport.alignDefines: align each #define block (default: true).
- betterRiscvSupport.alignThreeOperandInstructions: align three-operand
  instructions (default: true).
- betterRiscvSupport.maxWorkspaceFiles: limit workspace scanning for symbol
  navigation (default: 500).

## Development

Run npm install, then npm test. Press F5 in VS Code to start an Extension
Development Host.
