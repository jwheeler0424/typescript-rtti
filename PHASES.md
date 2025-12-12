To move your system forward to support complex TypeScript features, extended decorators, method overloads, nested generics, and richer CLIs/daemon workflows, here's a phased, performant, and extensible plan.

Phase 1: Advanced Type System Extraction
Goals
Support mapped types, conditional types, intersections/unions, and more.
Accurately represent complex/derived shapes in RTTI.
Action Steps
Expand Type Extraction

In extractClassMetadata and extractFunctionMetadata:
Detect if a type is an alias for a mapped/conditional type (TypeAliasDeclaration and TypeFlags refs).
For mapped/conditional/intersection/union, extract member types/constraints as RTTI unions/intersections/objects.
Use TypeScript's typeChecker.getTypeAtLocation() to get resolved alias/type for each declaration.
Store kind as REF_UNION, REF_INTERSECTION, REF_OBJECT, etc. in RTTI, including alias name and member shape (for mapped/conditional types).
Expand your RTTIMetadata structure to allow conditional/mapped type representation and constraints.
Design Protocol Extension for Complex Types

Add new OpCode values for mapped/conditional types, if needed (e.g., REF_MAPPED, REF_CONDITIONAL).
Extend serialization/decoding regions for these types: store constraints, keys, value types, etc., per the shape of the mapped/conditional type.
Test Cases

Produce and round-trip RTTI for example files like:
TypeScript
type Keys = 'a' | 'b';
type Mapped = { [K in Keys]: number };
type Maybe<T> = T extends string ? string[] : never;
CLI can then inspect and output correct RTTI structure for mapped/conditional shapes.
Phase 2: Method Decorators, Overloads, Nested Generics
Goals
Correctly extract and serialize/deserialize method decorators and their parameters.
Extract overload signatures for functions/methods/classes.
Deeply track nested generics (Box<Box<T, U>, string>).
Action Steps
Method Decorator Extraction

In member extraction:
For MethodDeclaration, collect decorators on the method and on each parameter.
Serialize/deserialize RMETA for both method-level and param-level decorators.
Overloads Handling

For functions and methods:
Detect and collect all overloads (using ts.getOverloads() or inspecting AST sibling nodes).
Store each overload signature distinctly in RTTI (perhaps as a list within RTTIMetadata under a new key overloads).
Extend serialization/decoder to support overload blocks.
Deep/Nested Generics

When extracting generics, also collect type argument instantiations in parameter and property types, not just top-level.
Serialize the nested types as graphs (e.g., Box<Box<T, string>, boolean>).
Tests

Unit test RTTI for methods/functions/classes with all of the above (decorators, overloads, deep generics).
CLI demo for method extraction reporting full decorator/overload signature info.
Phase 3: CLI/Daemon Extension
Goals
Offer live RTTI introspection, file watch/rebuild, and interactive inspection.
CLI can report on generics, function/class/enum signatures, decorators, inheritance, overloads, mapped/conditional types.
Action Steps
CLI Command Expansion

Extend CLI to support:
list-types
show-type <fqName>
show-methods <fqName>
find-decorators <fqName>
find-overloads <fqName>
show-mapped <fqName>
watch --daemon for live updates
Format output for each in rich tables or structured JSON/yaml.
Daemon Mode

Use a library like Chokidar for file watching.
On .ts file changes, re-run RTTI extraction and rebuild .bin, push live update to CLI.
Serve a local API or socket for introspecting RTTI (optional).
Performance

Extract only changed files on each build (mtime/cache-based incremental).
Debounce rebuilds in daemon, batch file change events.
Only reload and deserialize .bin sidecar as needed.
Phase 4: Optimization & Extensibility
Goals
Keep binary protocol extensible and efficient.
Build plugin hooks for project-specific RTTI extraction/customization.
Add documentation, CLI options, and ergonomic error handling for CLI/daemon.
High Level: Overall Guidance
Keep code modular: Write new extractors/serializers/decoders for complex types separate from primitive/base logic.
Protocol version up: Bump version whenever binary structure expands.
Cache discipline: Always clear or auto-invalidate cache on incompatibility.
Testing discipline: Build example .ts files for all scenarios above, and write CLI test harnesses/output validator.
🚀 Next Steps Summary
Phase 1: Extend RTTI extraction and serialization for mapped/conditional/intersection/union/alias types.
Phase 2: Add overload, decorator, and nested generics support.
Phase 3: Expand CLI and build daemon/file watcher if desired.
Iterate, test, and document.

Let’s break down Phase 2 into detailed, actionable steps for a seamless implementation, focusing on:

Method decorators (including parameter decorators)
Method overloads
Nested/complex generics (e.g., deep type args, generic types within types)
Full reflection/RTTI for all class, interface, and function members
This plan aims for robustness, performance, and extensibility.

Phase 2 Roadmap: Methods, Overloads, Decorators, Nested Generics
Step 1: Method Decorators Extraction
A. Extraction Conference
For each method (MethodDeclaration in classes, MethodSignature in interfaces):
Extract method-level decorators
For each parameter, extract parameter-level decorators
Implementation outline:
TypeScript
if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) {
const methodDecorators = extractDecorators((member as any).decorators, sourceFile);
const parameters = member.parameters.map(param => ({
name: param.name.getText(sourceFile),
type: param.type
? getPrimitiveType(typeChecker.getTypeFromTypeNode(param.type))
: PrimitiveType.Unknown,
decorators: extractDecorators((param as any).decorators, sourceFile)
}));
// Add method RTTI entry with both method and param decorators
}
B. RTTIMetadata/Serializer/Decoder Update
For props members of kind "method", add a top-level decorators for the method and a nested array for parameter decorators.
Step 2: Method/Fn Overloads Extraction
A. Overload Discovery
In classes and interfaces, a method can have multiple signatures:
e.g.
TypeScript
foo(a: string): number;
foo(a: number): string;
foo(a: any): any { ... }
For functions: multiple FunctionDeclaration nodes with the same name and no body, plus one with implementation.
B. Extraction Strategy
Collect all method/function declarations with the same name.
Group overloads into an array; distinguish implementation vs signatures.
Example RTTIMetadata:
TypeScript
data: {
overloads: Array<{
params: [...],
returnType: ...
}>,
implementation: { ... } // optional for methods/functions
}
C. Serializer/Decoder Extension
Serialize overloads block before/after the main method/fn metadata.
In decoder, reconstruct signature arrays and mark which entry is the implementation.
Step 3: Nested Generics Extraction
A. Deep Dive
For every property, method, parameter, record not only direct type params, but recursively find type args, e.g.: Box<Foo<Bar<T>, Baz<U>>>
Use TypeScript’s typeChecker to recursively walk type nodes and extract all nested generics.
Implementation Sketch:
TypeScript
function extractTypeGenerics(nodeOrType: ts.Node | ts.Type, acc: Set<string> = new Set()) {
// If type node or type contains type parameters / type arguments, add them recursively
// For example, for Foo<T>, add T; for Foo<Bar<X>>, add X
}
B. RTTIMetadata/Serializer/Decoder Update
Include deep generic parameter info (can be a flattened list, or a tree/graph if desired).
Serialize/deserialize as generics block or a nested structure (if you want full AST fidelity).
Step 4: CLI & Consumer Features
Add support to CLI/inspector:
Show all overloads for a method/function.
Show all decorators at method and param level.
Visualize nested generics within types.
Provide querying for "methods with overloads", "types using decorator X", etc.
Step 5: Robustness & Testing
Write .ts files that cover:
Methods with multiple overloads, with and without implementation.
Methods and parameters with decorators.
Deeply nested generic types.
Practice incremental compilation: only re-extract RTTI if a source file changed.
Add tests that assert correct RTTIMetadata for all these scenarios.
API/Implementation Guidance
Refactor RTTIMetadata to support:
For class/function/interface methods:
"overloads": Array of param/return signature objects
"decorators": for method and parameter level "nestedGenerics" (optional): recursive or flattened list/tree, as desired
Update serializer/decoder:
Add new blocks for these arrays/structures
Ensure offset math and data blocks remain in sync and versioned
Performance and Scalability
Batch extraction for all methods/functions before serialization
Cache signatures for identical methods/functions/generated RTTI
Lazy CLI decoding: decode overloads/decorators/nested generics only when user requests
Incremental build: re-extract only types affected by changed files
Documentation
Document your data model: what fields/structures will be present for overloads/decorators/nested generics, etc.
CLI help: explain commands for introspecting overloads and decorators
Summary of Next Steps
Method/parameter decorators extraction for props, methods, signatures (step 1).
Overload extraction/grouping for methods/functions (step 2).
Deep/Nested generics extraction (step 3).
Update RTTIMetadata, serializer, decoder, CLI for new RTTI structures (steps 1/2/3).
Incremental/test-driven refactoring (step 5).
CLI/consumer/documentation for user-facing output (step 4/6).
