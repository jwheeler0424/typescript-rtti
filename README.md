# TypeScript Binary RTTI: Runtime Types & Metadata Sidecar System

## Overview

This project implements an advanced **TypeScript Runtime Type Information (RTTI) system** using a
**zero-bloat, compressed binary sidecar** (`metadata.bin`) that is generated at build time. It extracts
deep static type and metadata information from your TypeScript codebase—covering classes, functions,
generics, enums, mapped and conditional types—and makes this information available at runtime for
**reflection, validation, code generation, and more.**

> **No changes to your distributed JS code are required**. The entire type registry is kept separate,
> and can be safely loaded and queried at runtime using provided APIs, without polluting your bundles
> or affecting compile output.

---

## Motivation

- **Why:** TypeScript type information is erased at compile-time, making both complex reflection and safe runtime
  type validation near impossible. This system bridges that gap by extracting all RTTI from TypeScript code itself,
  serializing it efficiently, and enabling:
  - Runtime instance validation & hydration
  - Automated schema extraction and codegen
  - Flexible introspection, plugin, and tooling support
  - Better interop, testing, and documentation workflows

---

## Features

- **Automatic Extraction:**  
  Traverses your project using the TypeScript Compiler API, extracting:

  - All classes, interfaces, functions, and type aliases
  - All properties, methods, parameter and method decorators
  - Full generic signatures, including deep nesting and constraints
  - Unions, intersections, mapped and conditional types
  - Complete metadata for enums, mapped types, and type relations

- **Fast, Zero-Bloat Format:**

  - Emits a single compressed `metadata.bin` file
  - All type names and text deduplicated via a global string table
  - Binary protocol uses varint encoding and LZ4 compression for minimal size
  - Efficient, random-access two-level index (by both hash and name)

- **Robust Protocol & Versioning:**

  - Protocol version and feature bitmap in header
  - Easily extensible, future-proof

- **CLI Introspection Tool:**

  - Dump, inspect, and pretty-print RTTI metadata from your binary
  - Validate and debug data offline

- **Powerful Runtime API Layer:**

  - `MetadataStore`: Loads and queries type info from binary at runtime
  - `Hydrator`: Validates and constructs JS objects from type schemas
  - `Introspector`: Advanced reflection for properties, signatures, flags, inheritance, decorators

- **Cache & Incremental Build Support:**
  - Caches hashes/signatures to only rebuild changed types
  - Dev-friendly: fast for both small and huge projects

---

## How It Works

1. **Compile Stage** (`tools/compiler.ts`):

   - Loads your `tsconfig.json` and source files
   - Visits every type, class, function, etc. (using TypeScript Compiler API)
   - Extracts detailed metadata into an in-memory registry
   - Serializes metadata:

     - Deduplicates all type strings
     - Compresses type data (with LZ4)
     - Builds a compact binary:

       ```text
       | Header | String Table | Index Table | Compressed Data Heap |
       ```

   - Outputs `metadata.bin` and a JSON cache file

2. **Runtime Stage**:

   - Load `metadata.bin` using `MetadataStore`
   - Perform reflection, validation, or hydrate objects using extracted types
   - Runtime querying and validation can be as strict or relaxed as you require

3. **CLI Tool** (`tools/cli.ts`):
   - Allows offline inspection of RTTI content
   - Dumps and pretty-prints type schemas and relationships

---

## Project Structure

```text
/tools/
  compiler.ts      # Build-extracts metadata from TS source via the compiler API
  cli.ts           # Inspector CLI for auditing metadata.bin
  decoder.ts       # RTTI format decoder routines
  hydrator.ts      # Hydrator/validator for objects/functions at runtime
  introspect.ts    # Advanced runtime schema/query API layer
  printer.ts       # Human friendly pretty-printer for extracted RTTI
  protocol.ts      # Binary protocol, opcodes, header constants
  reader.ts        # MetadataStore: compressed RTTI binary random-access reader
  serializer.ts    # Serializes all RTTI to binary buffers
  types.ts         # Shared type and enum definitions
```

Other files:

- `metadata.bin` – Compressed binary RTTI (output)
- `metadata.cache` – RTTI build cache for incremental rebuilds (output)
- `/src/` – Your own TypeScript models, functions, etc.
- `PHASES.md` / `NOTES.md` – Architectural guides and advanced roadmap

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Extract RTTI metadata (build)

```bash
npx tsx tools/compiler.ts
```

**or**

```bash
ts-node tools/compiler.ts
```

This will create `metadata.bin` and `metadata.cache` in your project root.

### 3. Inspect Metadata

```bash
npx tsx tools/cli.ts metadata.bin
```

See pretty-printed type registry—full class/function signatures, generics, unions, enums, etc.

---

## How to Use in Your App

### Load RTTI Metadata At Runtime

```typescript
import { MetadataStore } from "./tools/reader";
import { Hydrator } from "./tools/hydrator";
import Introspector from "./tools/introspect";

(async () => {
  const store = new MetadataStore();
  await store.load("metadata.bin");

  const introspector = new Introspector(store);

  // List all types
  const allTypes = introspector.listAllTypes();

  // Get class properties with types
  const props = introspector.getTypeProperties("MyClass");

  // Hydrate an object against a class schema
  await Hydrator.init("metadata.bin");
  const hydrated = Hydrator.hydrate(
    "MyClass",
    { foo: 123, bar: "hello" },
    true
  );

  // Get function signatures (params, return type)
  const sig = Hydrator.getFunctionSignature("myFunction");
})();
```

---

## Project Guidelines & Best Practices

### Extraction Scope & File Patterns

- By default, traverses all files included by your `tsconfig.json`
- Skips anything in `node_modules`
- Only types with **identifiers** (no anonymous types) are indexed (class, interface, enum, function, alias, etc.)

### Supported Type Features

- **Primitives:** number, string, boolean, symbol, bigint, null, undefined, any, unknown
- **Class, Interface, Enum:** Full property, method, inheritance, and generic parameter extraction
- **Function/Method Parameters:** Full parameter list, types, decorators, signatures (including method overloads)
- **Generic Parameters:** Deep, nestable generics for classes/functions/methods
- **Unions and Intersections:** Complete representation and linkage to references
- **Mapped and Conditional Types:** Type parameters, keys, constraints, union/discriminated members
- **Decorators:** Type-, property-, and parameter-level decorators (name, args)
- **Flags:** Flags for static, readonly, optional, visibility (`public`, `private`, `protected`)
- **Literal/Enum Values:** Number/string discrimination for enums and literals

### Metaprogramming/Reflection Usage

- Use `Hydrator` to **validate or hydrate** objects at runtime per your metadata schema (with strict/loose option)
- Use `Introspector` or `MetadataStore` to:
  - **Browse types**: list types, get inheritance, method signatures, etc.
  - **Inspect function/class generics** and constraints
  - **Extract decorators** for meta-programming, UI, or DI frameworks
  - **Achieve type-safe deserialization, code generation, and documentation**

### Incremental Build Practice

- **Do NOT commit `metadata.cache`** (it is an optimization artifact only).
- Always rebuild RTTI when types are added/changed—scripts will automatically detect type changes via SHA1 hash.
- After project upgrades, check protocol version and feature bitmap; if mismatched, rebuild.

### Protocol Evolution

- Extend shared enums and protocol constants in `protocol.ts` and `types.ts` for new features
- Use the legacy feature bitmap and protocol version to gracefully manage upgrades/downgrades

---

## Example RTTI Flow

Suppose you have a project:

```typescript
// src/User.ts
export class User {
  id: number;
  name: string;
  roles: string[];
}

// src/helpers.ts
export function isAdmin(user: User): boolean { ... }
```

After running the RTTI build:

- **Class `User`** is indexed with full property types and source order.
- **Function `isAdmin`**: all parameter types, names, and return type are extracted.
- **Generics, inheritance, decorators** (if present) are fully preserved.
- **Unions, intersections, mapped/conditional types** (from aliases, etc.) are also extracted and available.

And at runtime, you can:

```typescript
const props = introspector.getTypeProperties("User");
// => [{ name: "id", type: ... }, { name: "name", ... }, { name: "roles", ... }]

const fnSig = Hydrator.getFunctionSignature("isAdmin");
// => { params: [{ name: "user", type: ... }], returnType: ... }
```

---

## Advanced API: Exploring Introspection & Hydration

### Getting Detailed RTTI

```typescript
const metadataDecoded = introspector.getEntryDecoded("User");
console.log(JSON.stringify(metadataDecoded, null, 2));
```

Yields a decoded, rich structure with methods, properties, generics, inheritance, and decorators.

### Hydrating/Validating Objects

```typescript
await Hydrator.init(); // Ensure metadata is loaded once (singleton)
const obj = Hydrator.hydrate<User>("User", {
  id: 42,
  name: "Alice",
  roles: ["admin"],
});
```

### Listing Decorators & Generics

```typescript
const decorators = introspector.getDecorators("User");
const generics = introspector.getGenerics("MyGenericClass");
```

---

## CLI Usage & Examples

- To pretty-print the entire RTTI registry:

  ```bash
  npx tsx tools/cli.ts metadata.bin
  ```

- To inspect a single type:

  ```bash
  npx tsx tools/cli.ts metadata.bin MyClass
  ```

- To dump raw RTTI JSON:

  ```bash
  npx tsx tools/cli.ts metadata.bin --json
  ```

---

## Advanced Topics & Phases

See [`NOTES.md`](./NOTES.md) and [`PHASES.md`](./PHASES.md) for deep-dive technical guides,
protocol extension instructions, and the roadmap for:

- Supporting mapped types, conditional types, intersection/union improvements
- Complete overload & decorator extraction
- Nested generics, signature caches, performance/scalability enhancements
- Extending CLI and consumer API patterns

---

## Troubleshooting

- **Missing/Invalid Types:**  
  Rebuild RTTI, and ensure all files are present/included in tsconfig.

- **Mismatched Protocol/Feature Bitmap:**  
  The format of `metadata.bin` and the reader API must match version and bitmap constants. If changed, regenerate from scratch.

- **Hydration/Validation Fails:**  
  Check for name mismatches or excluded files. Enable debugging output in CLI for data trace.

---

## Contribution & Extending

- **Extending Protocol:** Add new type opcodes/constants in `protocol.ts` and update serializer/decoder/readers accordingly.
- **Feature Requests:** Open an issue describing use-case and extension proposal.
- **Testing:** Unit test RTTI extraction on complex TS code. Add e2e tests for runtime reading and CLI output.

---

## Acknowledgments

- Inspired by reflection systems in PHP, .NET, C++ (RTTI), and schema-first approaches in modern backends.
- Uses [lz4js](https://github.com/pierrec/node-lz4js) for blazing-fast compression.
- Built for extensibility, efficiency, and platform-agnostic binary schema transfer.

---

## License

<Insert your license here, e.g. MIT>

---

## Author & Contact

<Your name, email, GitHub or team info>

---

_Last updated: December 2025_

## Commands For Testing

```bash
rm metadata.cache metadata.bin
```

```bash
npx tsx tools/compiler.ts
```

```bash
npx tsx tools/cli.ts metadata.bin
```
