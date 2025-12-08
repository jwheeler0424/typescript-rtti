# TypeScript Binary Sidecar RTTI System — Optimized Architecture \& Implementation Guide

## Purpose \& Vision

Enable TypeScript to retain and rehydrate type and metadata information from source code—including *every class, function, and signature*—by compiling this information into a compressed binary sidecar (`metadata.bin`). At runtime, support fast, zero-copy, random-access metadata reads, introspection, and hydration with minimal footprint, maximum efficiency, and extensibility.

Inspired by PHP’s built-in reflection and type mechanics, this system makes Node.js/TypeScript projects type-aware *post-compilation* for advanced automation, validation, and tooling.

---

## Key Features \& Optimizations

* **Full Coverage:**  
  Automatically extract metadata for **all classes and all functions**.
* **Zero-Bloat:**  
  No JavaScript bundle increase; all metadata stored in a separate binary.
* **Optimized Binary Format:**

  * Fast [zstd](https://facebook.github.io/zstd/) or [LZ4](https://lz4.github.io/lz4/) compression for data heap.
  * Global interned string pool (string table): all text (names, types) deduplicated.
  * Feature bitmap and protocol versioning—future-proof and backwards-compatible.
  * Field presence bitmap, varint encoding for size/count fields (small, packed binary).

* **Indexing \& Lookup:**

  * Two-level index (hash + name string) to avoid hash collisions.
  * Efficient index structure (radix/B+ tree for large registries; simple map for small).

* **Type Expressiveness:**

  * All primitive, complex, generic, union, intersection, function, enum, and literal types supported.
  * Functions: param names/types/defaults, variadic/rest, return types.
  * Generics: store type parameter info and constraints for classes/functions.

* **Scalable Build Process:**

  * Transform only exported members by default (configurable).
  * Parallelizable serialization/emit steps.
  * Incremental build/caching (regenerate only for changed files).

* **Runtime Introspection:**

  * Streaming/lazy reads from compressed binary for large codebases.
  * Hydrator/Reflection API: construct, validate, and inspect objects and function calls at runtime. Supports strict or loose mode.

* **Extensible \& Interoperable:**

  * CLI tools: inspect, validate, and extract JSON from binary file.
  * JSDoc and annotation support; optional decorator merging at runtime.
  * Source map links for tool support and error handling.
  * Designed so other runtimes (WASM, Python, etc.) could ingest metadata.bin.

---

## Project Structure

```plaintext
/typescript-rtti
├── /src
│   ├── User.ts           # Source code: models, functions, etc.
│   └── index.ts          # Entry point; demonstrates runtime hydration
├── /tools
│   ├── compiler.ts       # Build script (see below)
│   ├── protocol.ts       # Protocol definition (constants, opcodes, hash)
│   └── serializer.ts     # Type/function -> binary serialization logic
│   └── cli.ts            # Inspector/validator CLI (optional but recommended)
├── /lib
│   ├── reader.ts         # MetadataStore: compressed/random-access reader
│   └── hydrator.ts       # Hydrator/reflection API for runtime use
│   └── introspect.ts     # Advanced: query/typescript schema browser API
├── tsconfig.json
├── package.json
├── /dist                # Compiled JS output
├── metadata.bin         # Binary sidecar (auto-generated)
```

---

## Phase-by-Phase Implementation Instructions

### **1. Protocol Definition (`tools/protocol.ts`)**

* Define binary constants:

  * Magic number ("META"), protocol version (u16), feature bitmap (u16).
  * Header size, index entry size.

* Define OpCode enum:

  * Primitives, arrays, objects, classes (`REF\_CLASS`), functions (`REF\_FUNCTION`), generics, unions, intersections, enums.

* Implement FNV-1a hash, plus secondary index by string (name/fqName).
* Define methods/structures for string table, varint encoding, field bitmap.

### **2. Serializer Utility (`tools/serializer.ts`)**

* Import protocol and TypeScript APIs.
* Create/serialize:

  * Primitive types.
  * Classes: name, generic params, members (properties/methods, visibility, types).
  * Functions: name, params (name, type, default, rest/optional), return type, generics.
  * Enums, unions, intersections, literals, constraints.

* Build global string table (deduplication), then serialize type data referencing string offsets.
* Output compressed binary heap (using zstd/LZ4).
* Handle edge cases: unknown/any, private/internal, circular references.

### **3. Custom Compiler and Transformer (`tools/compiler.ts`)**

* Load tsconfig, resolve source files.
* Use TypeScript API to traverse all source ASTs:

  * Collect every class and function declaration (optionally: exported only).
  * Generate hash ID + fqName for each.
  * Serialize metadata using serializer, record offset/length.
  * Store in registry with both hash and string index for lookup.
  * Inject static `\_\_metaId` into classes, attach `metaId` property to functions.

* After code emission, build binary:

  * Header (magic, version, bitmap)
  * String table section
  * Index table (hash + string -> offset/length)
  * Compressed data heap (serialized metadata buffers)

* Write metadata.bin atomically to root.
* Optionally, cache index/table for incremental builds.

### **4. CLI Inspector (Optional, recommended) (`tools/cli.ts`)**

* Tool to audit metadata.bin:

  * Dump to JSON or human-readable schema.
  * Validate structure, check for hash/name collisions.
  * Extract/filter metadata by pattern, fqName, etc.

* Validate protocol version/feature bitmap and alert for mismatches.

### **5. Runtime Reader (`lib/reader.ts`)**

* Open metadata.bin using fs/mmap.
* Validate header, protocol version, features.
* Load string table, index map (hash/fqName -> offset/length).
* On lookup, decompress relevant buffer and parse to JS object.
* Expose API: `getMetadataById(hash)`, `getMetadataByName(name/fqName)`, etc.
* Support lazy/streamed reads for large registries.

### **6. Hydrator API (`lib/hydrator.ts`)**

* Singleton instance of MetadataStore; loads metadata.bin at runtime.
* For classes:

  * `hydrate<T>(target: {new(): T}, data: any): T`

    * Create, populate, validate instance using type metadata, apply strict/loose casting.

  * For functions:

    * Provide `getFunctionSignature(fn: Function)` (name/fqName lookup).
    * Optionally, `wrapWithTypeCheck(fn)` returns a runtime signature validator.

* Handles generics, unions, enums, and constraints as described in metadata.
* Optionally allows merging user-provided runtime metadata (decorators).

### **7. Introspection \& Advanced Runtime API (`lib/introspect.ts`)**

* Provide advanced querying, autocomplete, schema validation, and UI hooks for browsing/using metadata.
* Supports tooling, codegen, and runtime schema enforcement.

---

## Configuration \& Extensibility

* **Extraction Rules:**  
  Users can supply config (YAML/JSON) to include/exclude files/namespaces, limit to exported-only, or add custom type mapping.
* **Protocol Upgrades:**  
  Feature bitmap in header signals supported extensions; version upgrades handled gracefully.
* **Cross-language:**  
  The structure allows future readers in other languages (WASM, Python, Rust) to load metadata.bin and mirror type info.

---

## Example Usage Flow (For Developers and LLMs)

1. **Add TypeScript models/functions to `/src` as usual.**
2. **Run build/extract:**

```bash
   ts-node tools/compiler.ts
   ```

   * Compiled JS to `/dist`
   * Metadata binary to `metadata.bin`

3. **Use metadata at runtime:**

```typescript
   import { Hydrator } from '../lib/hydrator';
   
   const user = Hydrator.hydrate(UserClass, payload);
   // or
   const sig = Hydrator.getFunctionSignature(myFunction);
   ```

4. **Inspect/debug:**

```
   ts-node tools/cli.ts inspect metadata.bin
   ```

   * Dumps schema, validates structure, checks for errors/collisions.

5. **Advanced:**

   Use `/lib/introspect.ts` for runtime schema browsing, API validation, or code generation.

   ---

   ## Troubleshooting

* **File not found/empty:** Check your project root path and ensure compiler script ran successfully.
* **Metadata mismatch:** Validate protocol version and string table offsets.
* **Hydration fails:** Ensure hash/fqName index matches runtime objects.
* **Performance:** For large projects, enable lazy/load-only-on-demand reads and tune compression/window size.

  ---

  ## Best Practices

* Always validate metadata.bin after build (using CLI).
* Keep protocol.ts up-to-date if adding new type features.
* Use strict typing/casting in production; loose mode for prototyping.
* Document custom extraction rules/config for your team.
* Consider submitting improvements/upgrades back if using the open-source protocol.

  ---

  ## Summary

  This system provides the **fastest, smallest, most complete runtime type reflection for TypeScript**, with zero bundle bloat and maximized extensibility and performance.

  **LLMs and code assistants:** Use this document as the comprehensive blueprint for phased development.  
  **Developers:** Follow step-by-step; consult each section for expanded capabilities, advanced use-cases, and integration tips.

  ---

