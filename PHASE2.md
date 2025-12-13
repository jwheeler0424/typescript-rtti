# Phase 2 Roadmap — TypeScript RTTI System

**Focus:** Method Decorators, Overloads, & Nested Generics

---

## High-Level Goals

- **Enhance support for decorators:** Extract, serialize, and introspect method and parameter decorators on
  class/interface members. (Exclude function decorators for now, as TypeScript does not support them.)
- **Overload handling:** Accurately capture and expose all method/function overloads.
- **Deep generic support:** Identify and serialize deeply nested generic types (e.g., containers of containers).
- Ensure robustness, extensibility, and strong CLI introspection for all the above.

---

## Task Breakdown

| Task                                       | File(s) to Update         | Status |
| ------------------------------------------ | ------------------------- | ------ |
| Group same-named methods as overloads      | compiler.ts, types.ts     | To Do  |
| Serialize overloads array + implementation | serializer.ts, decoder.ts | To Do  |
| Enhance generics extraction (deep/rec)     | compiler.ts, types.ts     | To Do  |
| Serialize/deserialize nested generics      | serializer.ts, decoder.ts | To Do  |
| Extend RTTIMetadata definitions            | types.ts                  | To Do  |
| Expose and test new entries in CLI/API     | cli.ts, introspect.ts     | To Do  |
| Documentation and README updates           | PHASES.md, NOTES.md, etc. | To Do  |
| Add/expand unit tests                      | (your test suite)         | To Do  |

---

## Implementation Sequence

1. **Overload Extraction**

   - In `compiler.ts`, group all same-named methods (per class/interface) as overloads; mark one as the implementation.
   - In `types.ts`, extend method property shape to allow `overloads: Array<{params, returnType, decorators}>` and
     optional `implementation` field.

2. **Serializer/Decoder Changes**

   - In `serializer.ts`, encode and serialize method overloads and their signatures.
   - In `decoder.ts`, reconstruct overloads and expose them in RTTI results.

3. **Recursive/Nested Generics Extraction**

   - Enhance `compiler.ts` and `types.ts` to traverse, serialize, and store all nested type arguments in generics for
     properties, methods, and parameters.

4. **Metadata API Updates**

   - Update `RTTIMetadata` in `types.ts` for overloads and deep generics.
   - Update CLI (`cli.ts`, `introspect.ts`) to display these structures.

5. **Testing & Documentation**

   - Add/expand tests for multi-overload scenarios, deep generics, and decorator coverage.
   - Update documentation in `PHASES.md`, `NOTES.md`, etc.

6. **Optional/Advanced**
   - Add CLI subcommands to lint, browse, and validate RTTI overloads and generics trees.

---

## Key Design Notes

- **Method decorators**: Extracted already; ensure they’re surfaced consistently for all overloads/implementations where
  present.
- **Function decorators**: Left out for now due to TS limitations.
- **Parameter decorators**: Extracted for class/interface members; surfaced in RTTI and CLI.
- **Overloads**: All signatures stored (for runtime signature validation, help, error reporting, etc.).
- **Generics**: All type arguments, even nested, captured for maximal expressiveness in runtime reflection.
- **Backwards Compatibility**: All additions must be incrementally versioned and optionally toggled in cache/protocol.

---

_After this phase, RTTI will powerfully reflect all TypeScript method signatures (with overloads), class-level
decorators, parameter-level decorators, and generics, ready for runtime schema, validation, and tool automation._

---
