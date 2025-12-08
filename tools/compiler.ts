import fs from "fs";
import lz4 from "lz4js";
import path from "path";
import ts from "typescript";
import { OpCode, PrimitiveType } from "./protocol.js";
import { RTTIMetadata, RTTISerializer } from "./serializer.js";

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
    }
  }

  // ...extract generics and class decorators as previously

  const generics: string[] = [];
  if (node.typeParameters) {
    node.typeParameters.forEach((tp) => {
      generics.push(tp.name.text);
    });
  }
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
  const generics: string[] = [];
  if (node.typeParameters) {
    node.typeParameters.forEach((tp) => {
      generics.push(tp.name.text);
    });
  }

  const decorators = extractDecorators(
    "decorators" in node ? (node as any).decorators : undefined,
    sourceFile
  );
  return {
    fqName,
    kind: OpCode.REF_FUNCTION,
    data: { params, returnType, generics, decorators },
  };
}

function extractTypeNode(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
  serializer: RTTISerializer
) {
  if (ts.isUnionTypeNode(typeNode)) {
    // For union in top-level type alias, emit as named union
    const fqName = fqNameFromNode(typeNode.parent, sourceFile);
    const memberNames: string[] = typeNode.types.map((t) =>
      t.getText(sourceFile)
    );
    serializer.addType({
      fqName,
      kind: OpCode.REF_UNION,
      data: { members: memberNames },
    });
  }
  if (ts.isIntersectionTypeNode(typeNode)) {
    const fqName = fqNameFromNode(typeNode.parent, sourceFile);
    const memberNames: string[] = typeNode.types.map((t) =>
      t.getText(sourceFile)
    );
    serializer.addType({
      fqName,
      kind: OpCode.REF_INTERSECTION,
      data: { members: memberNames },
    });
  }
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
  const serializer = new RTTISerializer();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.fileName.includes("node_modules")) continue;
    ts.forEachChild(sourceFile, (node) => {
      // === INTERFACE EXTRACTION ===
      if (ts.isInterfaceDeclaration(node) && node.name) {
        const fqName = fqNameFromNode(node, sourceFile);

        // Extract "extends" interfaces
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

        // You may want to extract properties/methods/decorators here as well.

        serializer.addType({
          fqName,
          kind: OpCode.REF_OBJECT, // Or REF_INTERFACE if you have a separate OpCode
          data: { bases },
        });
      }

      // === CLASS EXTRACTION ===
      if (ts.isClassDeclaration(node) && node.name) {
        const meta = extractClassMetadata(node, typeChecker, sourceFile);
        serializer.addType(meta);
      }

      // === FUNCTION EXTRACTION ===
      if (ts.isFunctionDeclaration(node) && node.name) {
        const meta = extractFunctionMetadata(node, typeChecker, sourceFile);
        serializer.addType(meta);
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
        serializer.addType({
          fqName,
          kind: OpCode.REF_ENUM,
          data: { members },
        });
      }

      if (ts.isTypeAliasDeclaration(node)) {
        // This handles cases like: type Foo = Bar | Baz;
        if (
          ts.isUnionTypeNode(node.type) ||
          ts.isIntersectionTypeNode(node.type)
        ) {
          extractTypeNode(node.type, sourceFile, serializer);
        }
      }
    });
  }

  const { stringTableBuffer, indexBuffer, heapBuffer } =
    serializer.buildBinarySections();

  // Compress the heap buffer using lz4js (pure JS, cross platform)
  const compressedHeapBuffer = Buffer.from(
    lz4.compress(Uint8Array.from(heapBuffer))
  );

  const headerBuffer = Buffer.alloc(32);
  headerBuffer.writeUInt32LE(0x4d455441, 0);
  headerBuffer.writeUInt16LE(1, 4);
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
  await fs.promises.writeFile(path.join(process.cwd(), "metadata.bin"), out);
  console.log(
    `metadata.bin written. Entries: ${serializer.index.length}, Compressed heap bytes: ${compressedHeapBuffer.length}`
  );
}

main();
