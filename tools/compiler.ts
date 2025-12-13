import { createHash } from "crypto";
import fs from "fs";
import lz4 from "lz4js";
import path from "path";
import ts from "typescript";
import { OpCode, PrimitiveType } from "./protocol";
import { RTTISerializer } from "./serializer";
import type { MetadataCache, RTTIMetadata } from "./types";

const CACHE_PATH = path.join(process.cwd(), "metadata.cache");
const PROTOCOL_VERSION = 1;

function hashType(meta: RTTIMetadata): string {
  // For highest fidelity, sort & stringify the type shape
  return createHash("sha1").update(JSON.stringify(meta)).digest("hex");
}

function getPrimitiveType(type: ts.Type): PrimitiveType {
  if (type.flags & ts.TypeFlags.Number) return PrimitiveType.Number;
  if (type.flags & ts.TypeFlags.String) return PrimitiveType.String;
  if (type.flags & ts.TypeFlags.Boolean) return PrimitiveType.Boolean;
  if (type.flags & ts.TypeFlags.BigInt) return PrimitiveType.BigInt;
  if (type.flags & ts.TypeFlags.Null) return PrimitiveType.Null;
  if (type.flags & ts.TypeFlags.Undefined) return PrimitiveType.Undefined;
  if (type.flags & ts.TypeFlags.Any) return PrimitiveType.Any;
  if (type.flags & ts.TypeFlags.Unknown) return PrimitiveType.Unknown;
  return PrimitiveType.Unknown;
}

function fqNameFromNode(node: ts.Node, sourceFile: ts.SourceFile): string {
  const name =
    (
      node as
        | ts.ClassDeclaration
        | ts.FunctionDeclaration
        | ts.InterfaceDeclaration
        | ts.EnumDeclaration
    ).name?.getText(sourceFile) ?? "anonymous";
  return name;
}

function extractClassMetadata(
  node: ts.ClassDeclaration,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile
): RTTIMetadata {
  const fqName = fqNameFromNode(node, sourceFile);
  const props: {
    name: string;
    kind: "property" | "method" | "accessor" | "constructor";
    type: PrimitiveType;
    flags: number;
    decorators: { name: string; args: string[] }[];
    parameters?: {
      name: string;
      type: PrimitiveType;
      decorators: { name: string; args: string[] }[];
    }[];
  }[] = [];

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

  for (const member of node.members) {
    // --- Properties ---
    if (
      ts.isPropertyDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name)
    ) {
      const name = member.name.text;
      const typeObj = member.type
        ? typeChecker.getTypeFromTypeNode(member.type)
        : typeChecker.getTypeAtLocation(member);
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

      props.push({
        name,
        kind: "property",
        type: getPrimitiveType(typeObj),
        flags,
        decorators: extractDecorators(
          "decorators" in member ? (member as any).decorators : undefined,
          sourceFile
        ),
      });
    }

    // --- Methods ---
    if (
      ts.isMethodDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name)
    ) {
      const name = member.name.text;
      let flags = 0;
      if (member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword))
        flags |= 1 << 0;
      if (
        member.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)
      )
        flags |= 1 << 3;
      else if (
        member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)
      )
        flags |= 1 << 4;

      // Extract method parameters
      const parameters = member.parameters.map((param) => {
        const pname = param.name.getText(sourceFile);
        let pType = PrimitiveType.Unknown;
        if (param.type) {
          const typeObj = typeChecker.getTypeFromTypeNode(param.type);
          pType = getPrimitiveType(typeObj);
        }
        return {
          name: pname,
          type: pType,
          decorators: extractDecorators(
            "decorators" in param ? (param as any).decorators : undefined,
            sourceFile
          ),
        };
      });

      // Special: get return type for methods if required. Here just storing params.

      props.push({
        name,
        kind: "method",
        type: PrimitiveType.Unknown, // Optionally use the actual return type
        flags,
        decorators: extractDecorators(
          "decorators" in member ? (member as any).decorators : undefined,
          sourceFile
        ),
        parameters,
      });
    }

    // --- Accessors (get/set) ---
    if (
      (ts.isGetAccessor(member) || ts.isSetAccessor(member)) &&
      member.name &&
      ts.isIdentifier(member.name)
    ) {
      const name = member.name.text;
      let flags = 0;
      if (
        member.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)
      )
        flags |= 1 << 3;
      else if (
        member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)
      )
        flags |= 1 << 4;

      // Accessor params for setters
      const parameters = member.parameters?.map((param) => {
        const pname = param.name.getText(sourceFile);
        let pType = PrimitiveType.Unknown;
        if (param.type) {
          const typeObj = typeChecker.getTypeFromTypeNode(param.type);
          pType = getPrimitiveType(typeObj);
        }
        return {
          name: pname,
          type: pType,
          decorators: extractDecorators(
            "decorators" in param ? (param as any).decorators : undefined,
            sourceFile
          ),
        };
      });

      props.push({
        name,
        kind: "accessor",
        type: PrimitiveType.Unknown,
        flags,
        decorators: extractDecorators(
          "decorators" in member ? (member as any).decorators : undefined,
          sourceFile
        ),
        parameters,
      });
    }

    // --- Constructor parameters with decorators ---
    if (ts.isConstructorDeclaration(member)) {
      const parameters = member.parameters.map((param) => {
        const pname = param.name.getText(sourceFile);
        let pType = PrimitiveType.Unknown;
        if (param.type) {
          const typeObj = typeChecker.getTypeFromTypeNode(param.type);
          pType = getPrimitiveType(typeObj);
        }
        return {
          name: pname,
          type: pType,
          decorators: extractDecorators(
            "decorators" in param ? (param as any).decorators : undefined,
            sourceFile
          ),
        };
      });

      props.push({
        name: "constructor",
        kind: "constructor",
        type: PrimitiveType.Unknown,
        flags: 0,
        decorators: [],
        parameters,
      });

      for (const param of member.parameters) {
        // Check for public/private/protected/readonly etc. modifiers
        const isParameterProperty = param.modifiers?.some(
          (m) =>
            m.kind === ts.SyntaxKind.PrivateKeyword ||
            m.kind === ts.SyntaxKind.ProtectedKeyword ||
            m.kind === ts.SyntaxKind.PublicKeyword ||
            m.kind === ts.SyntaxKind.ReadonlyKeyword
        );
        // Only add if not already present (avoid duplicates)
        const pname = ts.isIdentifier(param.name)
          ? param.name.text
          : param.name.getText(sourceFile);
        if (isParameterProperty && !props.some((p) => p.name === pname)) {
          let flags = 0;
          if (
            param.modifiers?.some(
              (m) => m.kind === ts.SyntaxKind.PrivateKeyword
            )
          )
            flags |= 1 << 3;
          else if (
            param.modifiers?.some(
              (m) => m.kind === ts.SyntaxKind.ProtectedKeyword
            )
          )
            flags |= 1 << 4;
          if (
            param.modifiers?.some(
              (m) => m.kind === ts.SyntaxKind.ReadonlyKeyword
            )
          )
            flags |= 1 << 1;
          let pType = PrimitiveType.Unknown;
          if (param.type) {
            const typeObj = typeChecker.getTypeFromTypeNode(param.type);
            pType = getPrimitiveType(typeObj);
          }
          props.push({
            name: pname,
            kind: "property",
            type: pType,
            flags,
            decorators: extractDecorators(
              "decorators" in param ? (param as any).decorators : undefined,
              sourceFile
            ),
          });
        }
      }
    }
  }

  const generics: string[] = node.typeParameters
    ? node.typeParameters.map((tp) => tp.name.text)
    : [];
  const decorators = extractDecorators(
    "decorators" in node ? (node as any).decorators : undefined,
    sourceFile
  );
  return {
    fqName,
    kind: OpCode.REF_CLASS,
    data: { props, generics, decorators, bases },
  };
}

function extractFunctionMetadata(
  node: ts.FunctionDeclaration,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile
): RTTIMetadata {
  const fqName = fqNameFromNode(node, sourceFile);
  // Parameters
  const params: {
    name: string;
    type: PrimitiveType;
    decorators: { name: string; args: string[] }[];
  }[] = [];
  node.parameters.forEach((param) => {
    const name = param.name.getText(sourceFile);
    let pType = PrimitiveType.Unknown;
    if (param.type) {
      const typeObj = typeChecker.getTypeFromTypeNode(param.type);
      pType = getPrimitiveType(typeObj);
    }
    const paramDecorators = extractDecorators(
      "decorators" in param ? (param as any).decorators : undefined,
      sourceFile
    );
    params.push({ name, type: pType, decorators: paramDecorators });
  });
  // Return type
  let returnType = PrimitiveType.Unknown;
  if (node.type) {
    const typeObj = typeChecker.getTypeFromTypeNode(node.type);
    returnType = getPrimitiveType(typeObj);
  }
  // Generics
  const generics: string[] = node.typeParameters
    ? node.typeParameters.map((tp) => tp.name.text)
    : [];

  const decorators = extractDecorators(
    "decorators" in node ? (node as any).decorators : undefined,
    sourceFile
  );
  return {
    fqName,
    kind: OpCode.REF_FUNCTION,
    data: { params, returnType, generics },
  };
}

function extractDecorators(
  decorators: ts.NodeArray<ts.Decorator> | undefined,
  sourceFile: ts.SourceFile
): { name: string; args: string[] }[] {
  if (!decorators) return [];
  return decorators.map((deco) => {
    let name = "",
      args: string[] = [];
    if (ts.isCallExpression(deco.expression)) {
      name = deco.expression.expression.getText(sourceFile);
      args = deco.expression.arguments.map((arg) => arg.getText(sourceFile));
    } else {
      name = deco.expression.getText(sourceFile);
    }
    return { name, args };
  });
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

  // --- Track RTTI from all sources for final serialization
  let allTypes: RTTIMetadata[] = [];

  // --- Gather all source files present this run
  const presentFiles = new Set<string>();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.fileName.includes("node_modules")) continue;
    presentFiles.add(sourceFile.fileName);

    const stat = fs.statSync(sourceFile.fileName);
    const prevFileEntry = cache.files[sourceFile.fileName];

    let typesForThisFile: RTTIMetadata[] = [];
    let typeHashes: Record<string, string> = {};
    ts.forEachChild(sourceFile, (node) => {
      let meta: RTTIMetadata | undefined;
      // === INTERFACE EXTRACTION ===
      if (ts.isInterfaceDeclaration(node) && node.name) {
        const fqName = fqNameFromNode(node, sourceFile);

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

        // Extract properties and methods
        const props: {
          name: string;
          kind: "property" | "method";
          type: PrimitiveType;
          flags: number;
          decorators: { name: string; args: string[] }[];
          parameters?: {
            name: string;
            type: PrimitiveType;
            decorators: { name: string; args: string[] }[];
          }[];
        }[] = [];
        for (const member of node.members) {
          // Properties: PropertySignature
          if (
            ts.isPropertySignature(member) &&
            member.name &&
            ts.isIdentifier(member.name)
          ) {
            const name = member.name.text;
            const typeObj = member.type
              ? typeChecker.getTypeFromTypeNode(member.type)
              : typeChecker.getTypeAtLocation(member);
            let flags = 0;
            if ("questionToken" in member && member.questionToken)
              flags |= 1 << 2; // optional
            props.push({
              name,
              kind: "property",
              type: getPrimitiveType(typeObj),
              flags,
              decorators: extractDecorators(
                (member as any).decorators,
                sourceFile
              ),
            });
          }
          // Methods: MethodSignature
          if (
            ts.isMethodSignature(member) &&
            member.name &&
            ts.isIdentifier(member.name)
          ) {
            const name = member.name.text;
            const parameters = member.parameters.map((param) => {
              const pname = param.name.getText(sourceFile);
              let pType = PrimitiveType.Unknown;
              if (param.type) {
                const typeObj = typeChecker.getTypeFromTypeNode(param.type);
                pType = getPrimitiveType(typeObj);
              }
              return {
                name: pname,
                type: pType,
                decorators: extractDecorators(
                  (param as any).decorators,
                  sourceFile
                ),
              };
            });
            props.push({
              name,
              kind: "method",
              type: PrimitiveType.Unknown, // you may enhance to use method return type if desired
              flags: 0,
              decorators: extractDecorators(
                (member as any).decorators,
                sourceFile
              ),
              parameters,
            });
          }
          // (No accessors or constructors in interfaces)
        }

        // Generics
        const generics: string[] = node.typeParameters
          ? node.typeParameters.map((tp) => tp.name.text)
          : [];

        // Decorators (rare on interfaces, but possible with TS plugin support)
        const decorators = extractDecorators(
          (node as any).decorators,
          sourceFile
        );

        meta = {
          fqName,
          kind: OpCode.REF_OBJECT, // Still using REF_OBJECT for interfaces
          data: { props, generics, decorators, bases },
        };
      }

      // === CLASS EXTRACTION ===
      if (ts.isClassDeclaration(node) && node.name) {
        meta = extractClassMetadata(node, typeChecker, sourceFile);
      }

      // === FUNCTION EXTRACTION ===
      if (ts.isFunctionDeclaration(node) && node.name) {
        meta = extractFunctionMetadata(node, typeChecker, sourceFile);
      }

      // === ENUM EXTRACTION ===
      if (ts.isEnumDeclaration(node)) {
        const fqName = fqNameFromNode(node, sourceFile);
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
        meta = {
          fqName,
          kind: OpCode.REF_ENUM,
          data: { members },
        };
      }

      if (ts.isTypeAliasDeclaration(node)) {
        // This handles cases like: type Foo = Bar | Baz;
        if (ts.isUnionTypeNode(node.type)) {
          // For union in top-level type alias, emit as named union
          const fqName = fqNameFromNode(node.type.parent, sourceFile);
          const memberNames: string[] = node.type.types.map((t) =>
            t.getText(sourceFile)
          );
          meta = {
            fqName,
            kind: OpCode.REF_UNION,
            data: { members: memberNames },
          };
        }
        if (ts.isIntersectionTypeNode(node.type)) {
          const fqName = fqNameFromNode(node.type.parent, sourceFile);
          const memberNames: string[] = node.type.types.map((t) =>
            t.getText(sourceFile)
          );
          meta = {
            fqName,
            kind: OpCode.REF_INTERSECTION,
            data: { members: memberNames },
          };
        }

        if (ts.isMappedTypeNode(node.type)) {
          const fqName = node.name.text;
          const typeParameter = node.type.typeParameter;
          const keyName = typeParameter.name.getText(sourceFile);
          const keyConstraint =
            typeParameter.constraint?.getText(sourceFile) ?? ""; // <----- patch!
          const valueType = node.type.type
            ? node.type.type.getText(sourceFile)
            : "";

          meta = {
            fqName,
            kind: OpCode.REF_MAPPED,
            data: {
              keyName,
              keyConstraint,
              valueType,
            },
          };
        }

        if (ts.isConditionalTypeNode(node.type)) {
          const fqName = node.name.text;
          // Example: type Maybe<T> = T extends string ? string[] : never
          const checkType = node.type.checkType.getText(sourceFile);
          const extendsType = node.type.extendsType.getText(sourceFile);
          const trueType = node.type.trueType.getText(sourceFile);
          const falseType = node.type.falseType.getText(sourceFile);
          meta = {
            fqName,
            kind: OpCode.REF_CONDITIONAL,
            data: {
              checkType,
              extendsType,
              trueType,
              falseType,
            },
          };
        }
      }

      if (meta) {
        const fqName = meta.fqName;
        const typeHash = hashType(meta);

        // Compare to cached value (regardless of file mtime):
        const cachedType = cache.types[fqName];
        if (cachedType && cachedType.hash === typeHash) {
          // Use cached RTTIMetadata
          typesForThisFile.push(cachedType.meta);
          typeHashes[fqName] = typeHash;
        } else {
          // New/changed type, update global type cache
          cache.types[fqName] = { fqName, hash: typeHash, meta };
          typesForThisFile.push(meta);
          typeHashes[fqName] = typeHash;
        }
      }
    });

    // Update file cache entry
    cache.files[sourceFile.fileName] = {
      mtimeMs: stat.mtimeMs,
      typeHashes,
      types: typesForThisFile,
    };
    allTypes.push(...typesForThisFile);
  }

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
