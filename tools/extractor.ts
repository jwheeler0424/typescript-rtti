import ts from "typescript";
import {
  OpCodes,
  PrimitiveType,
  PrimitiveTypes,
  RTTIClassMetadata,
  RTTIConditionalMetadata,
  RTTIIntersectionMetadata,
  RTTIMappedMetadata,
  RTTIMetadata,
  RTTITypeRef,
  RTTIUnionMetadata,
} from "./types";

export interface RTTIExtractContext {
  typeChecker: ts.TypeChecker;
  rttiMap: Map<string, RTTIMetadata>;
  fqPrefix: string;
}

function isPrimitiveType(type: ts.Type): PrimitiveType | undefined {
  if (type.flags & ts.TypeFlags.Number)
    return PrimitiveTypes.Number as PrimitiveType;
  if (type.flags & ts.TypeFlags.String)
    return PrimitiveTypes.String as PrimitiveType;
  if (type.flags & ts.TypeFlags.Boolean)
    return PrimitiveTypes.Boolean as PrimitiveType;
  if (type.flags & ts.TypeFlags.BigInt)
    return PrimitiveTypes.BigInt as PrimitiveType;
  if (type.flags & ts.TypeFlags.Null)
    return PrimitiveTypes.Null as PrimitiveType;
  if (type.flags & ts.TypeFlags.Undefined)
    return PrimitiveTypes.Undefined as PrimitiveType;
  if (type.flags & ts.TypeFlags.Any) return PrimitiveTypes.Any as PrimitiveType;
  if (type.flags & ts.TypeFlags.Unknown)
    return PrimitiveTypes.Unknown as PrimitiveType;
  if (type.flags & ts.TypeFlags.ESSymbol)
    return PrimitiveTypes.ESSymbol as PrimitiveType;
  return undefined;
}

function hasObjectFlags(type: ts.Type): type is ts.ObjectType {
  return typeof (type as any).objectFlags === "number";
}

function isMappedType(type: ts.Type): boolean {
  // The type is an object type and objectFlags has the Mapped bit
  return (
    hasObjectFlags(type) &&
    ((type as any).objectFlags & ts.ObjectFlags.Mapped) !== 0
  );
}

function isConditionalType(type: ts.Type): type is ts.Type & {
  checkType: ts.Type;
  extendsType: ts.Type;
  resolvedTrueType: ts.Type;
  resolvedFalseType: ts.Type;
} {
  return (type.flags & ts.TypeFlags.Conditional) !== 0;
}

function isArrayType(type: ts.Type, checker: ts.TypeChecker): boolean {
  // Prefer checker.isArrayType if present, else fallback to symbol name check
  if (typeof checker.isArrayType === "function") {
    return checker.isArrayType(type);
  }
  return (
    !!type.symbol &&
    type.symbol.getName() === "Array" &&
    !!(type as any).typeArguments
  );
}

function extractArrayElementType(type: ts.Type): ts.Type | undefined {
  // .typeArguments is used for Array<T>
  if (Array.isArray((type as any).typeArguments)) {
    return (type as any).typeArguments[0];
  }
  return undefined;
}

export function extractTypeRTTI(
  type: ts.Type,
  context: RTTIExtractContext
): RTTITypeRef {
  const { typeChecker, rttiMap, fqPrefix } = context;

  // ----- 1. Primitive -----
  const prim = isPrimitiveType(type);
  if (prim !== undefined) return { kind: "primitive", type: prim };

  // ----- 2. Union / Intersection -----
  if (type.isUnionOrIntersection && type.isUnionOrIntersection()) {
    const refs: RTTITypeRef[] = type.types.map((t) =>
      extractTypeRTTI(t, { ...context, fqPrefix: fqPrefix + "_" })
    );
    const fqNameRoot =
      fqPrefix +
      (type.isUnion() ? "union" : "inter") +
      "_" +
      refs.map((ref) => rttiTypeRefToString(ref)).join("_");

    // Prefer alias name, fallback to hash of member strings
    const fqName = type.aliasSymbol
      ? (type.aliasSymbol.escapedName as string)
      : fqNameRoot;

    // Only register once!
    if (!rttiMap.has(fqName)) {
      rttiMap.set(fqName, {
        fqName,
        kind: type.isUnion() ? OpCodes.REF_UNION : OpCodes.REF_INTERSECTION,
        data: { members: refs },
      } as RTTIUnionMetadata | RTTIIntersectionMetadata);
    }
    return { kind: "ref", fqName };
  }

  // ----- 3. Array -----
  if (isArrayType(type, typeChecker)) {
    const elemType = extractArrayElementType(type) || typeChecker.getAnyType();
    const elemRef = extractTypeRTTI(elemType, {
      ...context,
      fqPrefix: fqPrefix + "_array",
    });
    const fqName = `${fqPrefix}Array<${rttiTypeRefToString(elemRef)}>`;
    if (!rttiMap.has(fqName)) {
      rttiMap.set(fqName, {
        fqName,
        kind: OpCodes.REF_GENERIC,
        data: { base: "Array", args: [elemRef] },
      } as any);
    }
    return { kind: "ref", fqName };
  }

  // ----- 4. Tuple -----
  if (typeChecker.isTupleType && typeChecker.isTupleType(type)) {
    const elemTypes = (type as any).typeArguments || [];
    const elemRefs = elemTypes.map((t: ts.Type) => extractTypeRTTI(t, context));
    const fqName = `${fqPrefix}Tuple<${elemRefs
      .map(rttiTypeRefToString)
      .join(",")}>`;
    if (!rttiMap.has(fqName)) {
      rttiMap.set(fqName, {
        fqName,
        kind: OpCodes.REF_GENERIC,
        data: { base: "Tuple", args: elemRefs },
      } as any);
    }
    return { kind: "ref", fqName };
  }

  // ----- 5. TypeReference: Class, Interface, Object -----
  if (
    type.symbol &&
    type.symbol.name &&
    hasObjectFlags(type) &&
    (type as any).objectFlags & ts.ObjectFlags.Reference
  ) {
    const fqName = typeChecker.getFullyQualifiedName(type.symbol);

    if (!rttiMap.has(fqName)) {
      const props: any[] = [];
      for (const prop of type.getProperties()) {
        if (
          !prop.valueDeclaration &&
          (!prop.declarations || !prop.declarations[0])
        )
          continue;
        const propType = typeChecker.getTypeOfSymbolAtLocation(
          prop,
          prop.valueDeclaration ?? prop.declarations![0]
        );
        props.push({
          name: prop.getName(),
          type: extractTypeRTTI(propType, {
            ...context,
            fqPrefix: fqName + "." + prop.getName(),
          }),
          flags: 0,
          decorators: [],
        });
      }

      rttiMap.set(fqName, {
        fqName,
        kind: OpCodes.REF_OBJECT,
        data: {
          props,
          generics: [],
          decorators: [],
          bases: [],
        },
      } as RTTIClassMetadata);
    }
    return { kind: "ref", fqName };
  }

  // ----- 6. Mapped Types -----
  if (isMappedType(type)) {
    const mappedType = type as any;
    const keyType = mappedType.constraint ?? typeChecker.getAnyType();
    const valueType = mappedType.templateType ?? typeChecker.getAnyType();
    const keyRef = extractTypeRTTI(keyType, context);
    const valueRef = extractTypeRTTI(valueType, context);
    const fqName = `${fqPrefix}Mapped<${rttiTypeRefToString(
      keyRef
    )},${rttiTypeRefToString(valueRef)}>`;
    if (!rttiMap.has(fqName)) {
      rttiMap.set(fqName, {
        fqName,
        kind: OpCodes.REF_MAPPED,
        data: {
          keyName: "K",
          keyConstraint: keyRef,
          valueType: valueRef,
        },
      } as RTTIMappedMetadata);
    }
    return { kind: "ref", fqName };
  }

  // ----- 7. Conditional Types -----
  if (isConditionalType(type)) {
    // .checkType, .extendsType, .resolvedTrueType, .resolvedFalseType
    const fqName = `${fqPrefix}Conditional<${rttiTypeRefToString(
      extractTypeRTTI((type as any).checkType, context)
    )},${rttiTypeRefToString(
      extractTypeRTTI((type as any).extendsType, context)
    )}>`;
    if (!rttiMap.has(fqName)) {
      rttiMap.set(fqName, {
        fqName,
        kind: OpCodes.REF_CONDITIONAL,
        data: {
          checkType: extractTypeRTTI((type as any).checkType, context),
          extendsType: extractTypeRTTI((type as any).extendsType, context),
          trueType: extractTypeRTTI(
            (type as any).resolvedTrueType ?? typeChecker.getAnyType(),
            context
          ),
          falseType: extractTypeRTTI(
            (type as any).resolvedFalseType ?? typeChecker.getAnyType(),
            context
          ),
        },
      } as RTTIConditionalMetadata);
    }
    return { kind: "ref", fqName };
  }

  // ----- 8. Fallback: Unknown -----
  return { kind: "primitive", type: PrimitiveTypes.Unknown as PrimitiveType };
}

export function rttiTypeRefToString(ref: RTTITypeRef): string {
  return ref.kind === "primitive" ? String(ref.type) : ref.fqName;
}
