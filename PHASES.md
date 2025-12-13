# TypeScript RTTI System — Phased Guide for Advanced Features

This document provides a **step-by-step, extensible plan** for advancing your TypeScript runtime type reflection (RTTI)
system. It is designed for both maintainers and LLMs, emphasizing robust extraction, serialization, CLI/daemon
introspection, and extensibility.

---

## **Phase 1: Advanced Type System Extraction**

**Goals:**

- Support mapped types, conditional types, intersections/unions, and more.
- Accurately represent complex/derived shapes in RTTI.

**Action Steps:**

- **Type Extraction:**

  - In `extractClassMetadata` and `extractFunctionMetadata`:
    - Detect if a type is an alias for a mapped/conditional type (i.e., `TypeAliasDeclaration` and `TypeFlags` refs).
    - For mapped/conditional/intersection/union types, extract member types/constraints as RTTI nodes:
      - Use TypeScript's `typeChecker.getTypeAtLocation()` to resolve aliases and underlying types.
    - Store kind as `REF_UNION`, `REF_INTERSECTION`, `REF_OBJECT`, etc. in RTTI, include alias name and member shape.
    - Expand `RTTIMetadata` structure to represent mapped/conditional types and their constraints.

- **Protocol Extension for Complex Types:**
  - Add new `OpCode` values for mapped/conditional types (e.g., `REF_MAPPED`, `REF_CONDITIONAL`).
  - Extend serialization/decoding to store constraints, keys, value types, etc.

**Test Cases:**

Example:

```typescript
type Keys = "a" | "b";
type Mapped = { [K in Keys]: number };
type Maybe<T> = T extends string ? string[] : never;
```

- CLI should inspect and output correct RTTI structure for mapped/conditional types.

---

## **Phase 2: Method Decorators, Overloads, Nested Generics**

**Goals:**

- Correctly extract and serialize/deserialize method decorators and their parameters (**where allowed by TS!**).
- Extract overload signatures for functions/methods/classes.
- Deeply track nested generics (e.g., `Box<Box<T, U>, string>`).

**Action Steps:**

### **Step 1: Method Decorators Extraction**

- For each method (`MethodDeclaration` in classes, `MethodSignature` in interfaces):
  - Extract method-level decorators.
  - (If allowed) For each parameter, extract parameter-level decorators.
- Serialize/deserialize RTTI for both method-level and param-level decorators.

#### **Basic Extraction Example:**

```typescript
if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) {
  const methodDecorators = extractDecorators(
    (member as any).decorators,
    sourceFile
  );
  const parameters = member.parameters.map((param) => ({
    name: param.name.getText(sourceFile),
    type: param.type
      ? getPrimitiveType(typeChecker.getTypeFromTypeNode(param.type))
      : PrimitiveType.Unknown,
    decorators: extractDecorators((param as any).decorators, sourceFile),
  }));
  // Add method RTTI entry
}
```

- RTTIMetadata/Serializer/Decoder: For `props` of kind `"method"`, always add top-level `decorators` and a nested array
- for parameter decorators.

---

### **Step 2: Method/Function Overloads Extraction**

**Overload Discovery:**

- In classes and interfaces, a method can have multiple signatures:

  ```typescript
  foo(a: string): number;
  foo(a: number): string;
  foo(a: any): any { ... }
  ```

- For functions: multiple `FunctionDeclaration`s with the same name and no body, plus one with implementation.

**Extraction Strategy:**

- Group all declarations with the same name.
- Store all overload signatures distinctly (as `overloads` within RTTIMetadata), also store implementation signature.

**Example RTTIMetadata:**

```typescript
data: {
  overloads: Array<{
    params: [...],
    returnType: ...
  }>,
  implementation: { ... } // optional for methods/functions
}
```

**Serializer/Decoder:**

- Serialize overloads block before/after the main method/fn metadata.
- In the decoder, reconstruct signatures and flag the implementation.

---

### **Step 3: Nested Generics Extraction**

**Deep Dive:**

- For every property, method, parameter, recursively extract type args (e.g., `Box<Foo<Bar<T>, Baz<U>>>`).
- Use TypeScript’s typeChecker to walk type nodes and collect all contained generics.

**Implementation Sketch:**

```typescript
function extractTypeGenerics(
  nodeOrType: ts.Node | ts.Type,
  acc: Set<string> = new Set()
) {
  // Recursively add type params/type arguments
}
```

- Add collected generic parameter info to metadata (flattened or as a tree/graph).
- Serialize/deserialize recursively.

---

### **Step 4: CLI & Consumer Features**

- Enhance CLI/inspector:
  - Show all overloads for a method/function.
  - Show all decorators at method and param level.
  - Visualize nested generics.
- Add queries: "methods with overloads", "types using decorator X", etc.

---

### **Step 5: Robustness & Testing**

- Unit test RTTI for method/function/class overloads, decorators, and deep generics.
- Practice incremental compilation: only extract RTTI for changed files.
- Add assertion tests for every scenario above.

---

## **API/Implementation Guidance**

- Refactor RTTIMetadata to support:
  - For class/function/interface methods:
    - `overloads`: array of param/return signature objects
    - `decorators` (method and parameter-level)
    - `nestedGenerics` (optional; as recursive/flattened list/tree)
- Update serializer/decoder:
  - Add new blocks for these arrays/structures.
  - Ensure offsets and formats sync and are versioned.

---

## **Performance & Scalability Tips**

- Batch extraction for all methods/functions before serialization.
- Cache signatures for identical methods/functions/generated RTTI.
- Lazy CLI decoding: decode nested/overloads/decorators only when needed.
- Incremental build: re-extract only changed files.

---

## **Documentation & CLI**

- Document the RTTI schema (fields/structures for overloads/decorators/nested generics).
- Add CLI help: commands for introspecting overloads and decorators.

---

## **Summary of Next Steps**

1. **Method/parameter decorators extraction** (`props`, methods, signatures).
2. **Overload extraction/grouping** for methods/functions.
3. **Deep/Nested generics extraction.**
4. **Update RTTIMetadata, serializer, decoder, CLI for new RTTI structures.**
5. **Incremental and test-driven refactoring.**
6. **CLI/consumer/documentation improvements.**

---

> Use this phased roadmap as modular documentation and a blueprint for feature implementation, LLM coding sessions, and
> robust TypeScript reflection infrastructure.
