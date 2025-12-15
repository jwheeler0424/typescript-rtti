import { createHash } from "crypto";
import fs from "fs";
import lz4 from "lz4js";
import path from "path";
import ts from "typescript";
import { extractTypeRTTI, RTTIExtractContext } from "./extractor";
import { OpCode, Primitive } from "./protocol";
import { RTTISerializer } from "./serializer";
import type {
  MetadataCache,
  PrimitiveType,
  RTTIClassMetadata,
  RTTIDecorator,
  RTTIEnumMetadata,
  RTTIFunctionMetadata,
  RTTIGenericParam,
  RTTIMetadata,
  RTTIMethodOverload,
  RTTIParameter,
  RTTIPropInfo,
} from "./types";

const CACHE_PATH = path.join(process.cwd(), "metadata.cache");
const PROTOCOL_VERSION = 1;

function hashType(meta: RTTIMetadata): string {
  // For highest fidelity, sort & stringify the type shape
  return createHash("sha1").update(JSON.stringify(meta)).digest("hex");
}

function getPrimitive(type: ts.Type): PrimitiveType {
  if (type.flags & ts.TypeFlags.Number) return Primitive.Number;
  if (type.flags & ts.TypeFlags.String) return Primitive.String;
  if (type.flags & ts.TypeFlags.Boolean) return Primitive.Boolean;
  if (type.flags & ts.TypeFlags.BigInt) return Primitive.BigInt;
  if (type.flags & ts.TypeFlags.Null) return Primitive.Null;
  if (type.flags & ts.TypeFlags.Undefined) return Primitive.Undefined;
  if (type.flags & ts.TypeFlags.Any) return Primitive.Any;
  if (type.flags & ts.TypeFlags.Unknown) return Primitive.Unknown;
  return Primitive.Unknown;
}

function getCanonicalFqName(node: ts.Node, checker: ts.TypeChecker): string {
  // Works on symbols from declarations as well as on types
  let symbol: ts.Symbol | undefined = (node as any).symbol;
  if (!symbol && ts.isTypeAliasDeclaration(node)) {
    symbol = checker.getSymbolAtLocation(node.name);
  }
  if (!symbol && (node as any).name) {
    symbol = checker.getSymbolAtLocation((node as any).name);
  }
  if (symbol) {
    return checker.getFullyQualifiedName(symbol).replace(/^".*"\./, "");
  }
  // Fall back to old strategy
  return (node as any).name?.getText?.() ?? "anonymous";
}

function extractInterfaceMetadata(
  node: ts.InterfaceDeclaration,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  context: RTTIExtractContext
): RTTIClassMetadata {
  const fqName = getCanonicalFqName(node, typeChecker);

  // Extract 'extends' (heritage)
  const bases: string[] = [];
  if (node.heritageClauses) {
    for (const hc of node.heritageClauses) {
      if (hc.token === ts.SyntaxKind.ExtendsKeyword) {
        hc.types.forEach((h) => {
          bases.push(h.expression.getText(sourceFile));
        });
      }
    }
  }

  const props: RTTIPropInfo[] = [
    ...extractNonMethodProps(node.members, typeChecker, sourceFile, context),
    ...extractMethodGroups(node.members, typeChecker, sourceFile, context),
  ];

  // Generics
  const generics: RTTIGenericParam[] = node.typeParameters
    ? node.typeParameters.map((tp) => ({
        name: getCanonicalFqName(tp, typeChecker),
        constraint: tp.constraint
          ? extractTypeRTTI(
              typeChecker.getTypeFromTypeNode(tp.constraint),
              context
            )
          : undefined,
      }))
    : [];

  // Decorators (rare on interfaces, but possible with TS plugin support)
  const decorators: RTTIDecorator[] = [];
  node.forEachChild((child) => {
    if (ts.isDecorator(child)) {
      const decorator = extractDecorator(child, sourceFile);
      if (decorator) decorators.push(decorator);
    }
  });

  return {
    fqName,
    kind: OpCode.REF_OBJECT, // Still using REF_OBJECT for interfaces
    data: { props, generics, decorators, bases },
  };
}

function extractClassMetadata(
  node: ts.ClassDeclaration,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  context: RTTIExtractContext
): RTTIClassMetadata {
  const fqName = getCanonicalFqName(node, typeChecker);

  // Extract Implements
  const bases: string[] = [];
  if (node.heritageClauses) {
    for (const hc of node.heritageClauses) {
      if (
        hc.token === ts.SyntaxKind.ImplementsKeyword ||
        hc.token === ts.SyntaxKind.ExtendsKeyword
      ) {
        hc.types.forEach((h) => {
          bases.push(h.expression.getText(sourceFile));
        });
      }
    }
  }

  const props: RTTIPropInfo[] = [
    ...extractNonMethodProps(node.members, typeChecker, sourceFile, context),
    ...extractMethodGroups(node.members, typeChecker, sourceFile, context),
  ];

  const generics: RTTIGenericParam[] = node.typeParameters
    ? node.typeParameters.map((tp) => ({
        name: getCanonicalFqName(tp, typeChecker),
        constraint: tp.constraint
          ? extractTypeRTTI(
              typeChecker.getTypeFromTypeNode(tp.constraint),
              context
            )
          : undefined,
      }))
    : [];

  const decorators: RTTIDecorator[] = [];
  node.forEachChild((child) => {
    if (ts.isDecorator(child)) {
      const decorator = extractDecorator(child, sourceFile);
      if (decorator) decorators.push(decorator);
    }
  });
  return {
    fqName,
    kind: OpCode.REF_CLASS,
    data: { props, generics, decorators, bases },
  };
}

function extractFunctionMetadata(
  node: ts.FunctionDeclaration,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  context: RTTIExtractContext
): RTTIFunctionMetadata {
  const fqName = getCanonicalFqName(node, typeChecker);
  // Parameters
  const params: RTTIParameter[] = [];
  node.parameters.forEach((param) => {
    const paramName = param.name.getText(sourceFile);
    const paramType = param.type
      ? typeChecker.getTypeFromTypeNode(param.type)
      : typeChecker.getTypeAtLocation(param);
    const typeRef = extractTypeRTTI(paramType, context);
    const paramDecorators: RTTIDecorator[] = [];
    params.push({
      name: paramName,
      type: typeRef,
      decorators: paramDecorators,
    });
  });
  // Return type
  let returnType = node.type
    ? typeChecker.getTypeFromTypeNode(node.type)
    : typeChecker.getTypeAtLocation(node);
  const returnTypeRef = extractTypeRTTI(returnType, context);

  // Generics
  const generics: RTTIGenericParam[] = node.typeParameters
    ? node.typeParameters.map((tp) => ({
        name: getCanonicalFqName(tp, typeChecker),
        constraint: tp.constraint
          ? extractTypeRTTI(
              typeChecker.getTypeFromTypeNode(tp.constraint),
              context
            )
          : undefined,
      }))
    : [];

  return {
    fqName,
    kind: OpCode.REF_FUNCTION,
    data: { params, returnType: returnTypeRef, generics },
  };
}

function extractEnumMetadata(
  node: ts.EnumDeclaration,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile
): RTTIEnumMetadata {
  const fqName = getCanonicalFqName(node, typeChecker);
  const members: { name: string; value: string | number }[] = [];
  node.members.forEach((member) => {
    const name = member.name.getText(sourceFile);
    let value: string | number = members.length;
    if (member.initializer) {
      if (ts.isNumericLiteral(member.initializer)) {
        value = Number(member.initializer.text);
      } else if (ts.isStringLiteral(member.initializer)) {
        value = member.initializer.text;
      } else {
        value = member.initializer.getText(sourceFile);
      }
    }
    members.push({ name, value });
  });
  return {
    fqName,
    kind: OpCode.REF_ENUM,
    data: { members },
  };
}

/**
 * Extracts all methods (including overloads) into a single RTTIPropInfo per method name.
 */
function extractMethodGroups(
  members: ReadonlyArray<ts.ClassElement | ts.TypeElement>,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  context: RTTIExtractContext
): RTTIPropInfo[] {
  // Group methods by their simple name
  const methodGroups: Map<
    string,
    {
      flags: number;
      decorators: RTTIDecorator[];
      overloads: RTTIMethodOverload[];
      implementation?: RTTIMethodOverload;
    }
  > = new Map();

  for (const member of members) {
    const isMethod =
      (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) &&
      member.name &&
      ts.isIdentifier(member.name);

    if (!isMethod) continue;
    const name = (member.name as ts.Identifier).text; // SIMPLE name

    // Flags (handle static, etc.)
    let flags = 0;
    if (member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword))
      flags |= 1 << 0;
    if (member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword))
      flags |= 1 << 1;
    if ("questionToken" in member && member.questionToken) flags |= 1 << 2;
    if (member.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword))
      flags |= 1 << 3;
    else if (
      member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)
    )
      flags |= 1 << 4;

    // Method decorators (for the declaration)
    const methodDecorators: RTTIDecorator[] = [];
    member.forEachChild((child) => {
      if (ts.isDecorator(child)) {
        const decor = extractDecorator(child, sourceFile);
        if (decor) methodDecorators.push(decor);
      }
    });

    // Parameters (with param-level decorators)
    const parameters: RTTIParameter[] = (member.parameters ?? []).map(
      (param) => {
        const pname = param.name.getText(sourceFile);
        const pType = param.type
          ? typeChecker.getTypeFromTypeNode(param.type)
          : typeChecker.getTypeAtLocation(param);
        const typeRef = extractTypeRTTI(pType, context);
        const paramDecorators: RTTIDecorator[] = [];
        param.forEachChild((child) => {
          if (ts.isDecorator(child)) {
            const d = extractDecorator(child, sourceFile);
            if (d) paramDecorators.push(d);
          }
        });
        return { name: pname, type: typeRef, decorators: paramDecorators };
      }
    );

    // Return type
    const returnType = member.type
      ? typeChecker.getTypeFromTypeNode(member.type)
      : typeChecker.getTypeAtLocation(member);
    const returnTypeRef = extractTypeRTTI(returnType, context);

    // The overload signature for this declaration
    const overload: RTTIMethodOverload = {
      params: parameters,
      returnType: returnTypeRef,
      decorators: methodDecorators,
    };

    // Group by name
    if (!methodGroups.has(name)) {
      methodGroups.set(name, {
        flags,
        decorators: [],
        overloads: [],
      });
    }
    const g = methodGroups.get(name)!;
    g.flags |= flags; // combine all flags seen on any overload

    // Save method-level decorators found
    g.decorators.push(...methodDecorators);

    // Implementation = has a body (class), else signature/overload
    if (ts.isMethodDeclaration(member) && member.body) {
      g.implementation = overload; // only ever one implementation
    } else {
      g.overloads.push(overload);
    }
  }

  // Emit as props
  const rttiProps: RTTIPropInfo[] = [];
  for (const [name, group] of methodGroups) {
    rttiProps.push({
      name, // SIMPLE name only!
      kind: "method",
      // Use implementation returnType for quick reference,
      // or use the first overload's returnType as fallback.
      type: group.implementation?.returnType ??
        group.overloads[0]?.returnType ?? { kind: "primitive", type: 0 },
      flags: group.flags,
      decorators: group.decorators,
      overloads: group.overloads.length > 0 ? group.overloads : undefined,
      implementation: group.implementation,
      parameters: group.implementation?.params ?? group.overloads[0]?.params,
    });
  }
  return rttiProps;
}

/**
 * Extracts non-method members into RTTIPropInfo: properties, accessors, constructors.
 */
export function extractNonMethodProps(
  members: ReadonlyArray<ts.ClassElement | ts.TypeElement>,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  context: RTTIExtractContext
): RTTIPropInfo[] {
  const props: RTTIPropInfo[] = [];

  for (const member of members) {
    // Properties (exclude methods)
    if (
      ts.isPropertyDeclaration(member) ||
      ts.isPropertySignature(member) // for interfaces
    ) {
      if (!member.name || !ts.isIdentifier(member.name)) continue;
      const name = (member.name as ts.Identifier).text;

      let flags = 0;
      if (member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword))
        flags |= 1 << 0;
      if (
        member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)
      )
        flags |= 1 << 1;
      if ("questionToken" in member && member.questionToken) flags |= 1 << 2;
      if (
        member.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)
      )
        flags |= 1 << 3;
      else if (
        member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)
      )
        flags |= 1 << 4;

      const propDecorators: RTTIDecorator[] = [];
      member.forEachChild((child) => {
        if (ts.isDecorator(child)) {
          const decorator = extractDecorator(child, sourceFile);
          if (decorator) propDecorators.push(decorator);
        }
      });

      const propType = member.type
        ? typeChecker.getTypeFromTypeNode(member.type)
        : typeChecker.getTypeAtLocation(member);
      const typeRef = extractTypeRTTI(propType, context);

      props.push({
        name,
        kind: "property",
        type: typeRef,
        flags,
        decorators: propDecorators,
      });
    }

    // Accessors (get/set)
    if (
      (ts.isGetAccessor(member) || ts.isSetAccessor(member)) &&
      member.name &&
      ts.isIdentifier(member.name)
    ) {
      const accessorName = (member.name as ts.Identifier).text;
      let flags = 0;
      if (
        member.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)
      )
        flags |= 1 << 3;
      else if (
        member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)
      )
        flags |= 1 << 4;

      const parameters: RTTIParameter[] =
        member.parameters?.map((param) => {
          const paramName = param.name.getText(sourceFile);
          const paramType = param.type
            ? typeChecker.getTypeFromTypeNode(param.type)
            : typeChecker.getTypeAtLocation(param);
          const typeRef = extractTypeRTTI(paramType, context);
          const paramDecorators: RTTIDecorator[] = [];
          param.forEachChild((child) => {
            if (ts.isDecorator(child)) {
              const decorator = extractDecorator(child, sourceFile);
              if (decorator) paramDecorators.push(decorator);
            }
          });
          return {
            name: paramName,
            type: typeRef,
            decorators: paramDecorators,
          };
        }) ?? [];

      const accessorDecorators: RTTIDecorator[] = [];
      member.forEachChild((child) => {
        if (ts.isDecorator(child)) {
          const decorator = extractDecorator(child, sourceFile);
          if (decorator) accessorDecorators.push(decorator);
        }
      });

      const accessorType = member.type
        ? typeChecker.getTypeFromTypeNode(member.type)
        : typeChecker.getTypeAtLocation(member);

      const typeRef = extractTypeRTTI(accessorType, context);

      props.push({
        name: accessorName,
        kind: "accessor",
        type: typeRef,
        flags,
        decorators: accessorDecorators,
        parameters,
      });
    }

    // Constructors (classes only)
    if (ts.isConstructorDeclaration(member)) {
      const parameters: RTTIParameter[] = member.parameters.map((param) => {
        const paramName = param.name.getText(sourceFile);
        const paramType = param.type
          ? typeChecker.getTypeFromTypeNode(param.type)
          : typeChecker.getTypeAtLocation(param);
        const typeRef = extractTypeRTTI(paramType, context);
        const paramDecorators: RTTIDecorator[] = [];
        param.forEachChild((child) => {
          if (ts.isDecorator(child)) {
            const decorator = extractDecorator(child, sourceFile);
            if (decorator) paramDecorators.push(decorator);
          }
        });
        return {
          name: paramName,
          type: typeRef,
          decorators: paramDecorators,
        };
      });

      props.push({
        name: "constructor",
        kind: "constructor",
        type: { kind: "primitive", type: 1 as PrimitiveType }, // e.g. "void"
        flags: 0,
        decorators: [],
        parameters,
      });
    }
  }

  return props;
}

// Patch for extracting a decorator from a node
function extractDecorator(
  node: ts.Node | undefined,
  sourceFile: ts.SourceFile
): RTTIDecorator | undefined {
  if (node && ts.isDecorator(node)) {
    let name = "",
      args: string[] = [];
    const expression = (node as ts.Decorator).expression;
    if (ts.isCallExpression(expression)) {
      name = expression.expression.getText(sourceFile);
      args = expression.arguments.map((arg) => arg.getText(sourceFile));
    } else {
      name = expression.getText(sourceFile);
    }
    return { name, args };
  }
  return undefined;
}

async function main(): Promise<void> {
  // --- Load or initialize cache
  let cache: MetadataCache = fs.existsSync(CACHE_PATH)
    ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"))
    : { version: PROTOCOL_VERSION, files: {}, types: {} };

  // Invalidate cache if protocol upgrades
  if (!cache.version || cache.version !== PROTOCOL_VERSION) {
    console.warn(
      `Protocol version mismatch (found ${cache.version}, expected ${PROTOCOL_VERSION}). Rebuilding cache.`
    );
    cache = { version: PROTOCOL_VERSION, files: {}, types: {} };
  }
  const configPath = ts.findConfigFile(
    "./",
    ts.sys.fileExists,
    "tsconfig.json"
  );
  if (!configPath) throw new Error("Could not find tsconfig.json.");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const typeChecker = program.getTypeChecker();

  // === Key Change: shared RTTI context
  const rttiMap: Map<string, RTTIMetadata> = new Map();
  const context: RTTIExtractContext = { typeChecker, rttiMap, fqPrefix: "" };

  // === Track all fqNames seen from exports/top-levels
  const exportedFQNames = new Set<string>();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.fileName.includes("node_modules")) continue;

    const stat = fs.statSync(sourceFile.fileName);
    const prevFileEntry = cache.files[sourceFile.fileName];

    let typeHashes: Record<string, string> = {};
    ts.forEachChild(sourceFile, (node) => {
      let meta: RTTIMetadata | null = null;
      // === INTERFACE EXTRACTION ===
      if (ts.isInterfaceDeclaration(node) && node.name) {
        meta = extractInterfaceMetadata(node, typeChecker, sourceFile, context);
        rttiMap.set(meta.fqName, meta);
      }

      // === CLASS EXTRACTION ===
      if (ts.isClassDeclaration(node) && node.name) {
        meta = extractClassMetadata(node, typeChecker, sourceFile, context);
        rttiMap.set(meta.fqName, meta);
      }

      // === FUNCTION EXTRACTION ===
      if (ts.isFunctionDeclaration(node) && node.name) {
        meta = extractFunctionMetadata(node, typeChecker, sourceFile, context);
        rttiMap.set(meta.fqName, meta);
      }

      // === ENUM EXTRACTION ===
      if (ts.isEnumDeclaration(node)) {
        meta = extractEnumMetadata(node, typeChecker, sourceFile);
        rttiMap.set(meta.fqName, meta);
      }

      // === TYPE ALIAS EXTRACTION ===
      if (ts.isTypeAliasDeclaration(node) && node.name) {
        const fqName = getCanonicalFqName(node, typeChecker);
        const aliasedType = typeChecker.getTypeFromTypeNode(node.type);
        const ref = extractTypeRTTI(aliasedType, context);

        if (ref.kind === "ref") {
          const realMeta = rttiMap.get(ref.fqName);
          if (realMeta && fqName !== ref.fqName) {
            rttiMap.set(fqName, { ...realMeta, fqName });
          }
        } else if (ref.kind === "primitive") {
          rttiMap.set(fqName, {
            fqName,
            kind: OpCode.REF_PRIMITIVE,
            data: ref.type,
          });
        }
      }

      if (meta) {
        const fqName = meta.fqName;
        const typeHash = hashType(meta);

        // Compare to cached value (regardless of file mtime):
        const cachedType = cache.types[fqName];
        if (cachedType && cachedType.hash === typeHash) {
          // Use cached RTTIMetadata
          rttiMap.set(fqName, cachedType.meta);
          typeHashes[fqName] = typeHash;
        } else {
          // New/changed type, update global type cache
          cache.types[fqName] = { fqName, hash: typeHash, meta };
          rttiMap.set(fqName, meta);
          typeHashes[fqName] = typeHash;
        }
      }
    });

    // Update file cache entry
    cache.files[sourceFile.fileName] = {
      mtimeMs: stat.mtimeMs,
      typeHashes,
      types: Array.from(rttiMap.values()),
    };
  }
  const allTypes: RTTIMetadata[] = Array.from(rttiMap.values());

  // Prune orphaned types in cache.types (optional, for deleted types)
  const usedTypes = new Set(allTypes.map((t) => t.fqName));
  for (const fqName of Object.keys(cache.types)) {
    if (!usedTypes.has(fqName)) delete cache.types[fqName];
  }

  // --- Serialize combined RTTI
  const serializer = new RTTISerializer();
  for (const meta of allTypes) {
    console.log(`SERIALIZE: ${meta.fqName}`, (meta.data as any).generics ?? "");
    serializer.addType(meta);
  }
  const { stringTableBuffer, indexBuffer, heapBuffer } =
    serializer.buildBinarySections();
  const compressedHeapBuffer = Buffer.from(
    lz4.compress(Uint8Array.from(heapBuffer))
  );

  const headerBuffer = Buffer.alloc(32);
  headerBuffer.writeUInt32LE(0x4d455441, 0);
  headerBuffer.writeUInt16LE(PROTOCOL_VERSION, 4);
  headerBuffer.writeUInt16LE(0x0001, 6);
  headerBuffer.writeUInt32LE(stringTableBuffer.length, 8);
  headerBuffer.writeUInt32LE(indexBuffer.length, 12);
  headerBuffer.writeUInt32LE(compressedHeapBuffer.length, 16);
  headerBuffer.fill(0, 20, 32);

  const out = Buffer.concat([
    headerBuffer,
    stringTableBuffer,
    indexBuffer,
    compressedHeapBuffer,
  ]);
  cache.version = PROTOCOL_VERSION;
  await fs.promises.writeFile(path.join(process.cwd(), "metadata.bin"), out);
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));

  console.log(
    `Incremental build: metadata.bin written (${serializer.index.length} entries, ${compressedHeapBuffer.length} bytes).`
  );
}

main();
