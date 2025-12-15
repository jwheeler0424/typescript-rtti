import ts from "typescript";
declare const __brand: unique symbol;
type Brand<T, K extends string> = T & { [__brand]: K };

export enum PrimitiveTypes {
  Number = ts.TypeFlags.Number,
  String = ts.TypeFlags.String,
  Boolean = ts.TypeFlags.Boolean,
  Null = ts.TypeFlags.Null,
  Undefined = ts.TypeFlags.Undefined,
  ESSymbol = ts.TypeFlags.ESSymbol,
  BigInt = ts.TypeFlags.BigInt,
  Any = ts.TypeFlags.Any,
  Unknown = ts.TypeFlags.Unknown,
}

type PrimitiveTypeFlag =
  | PrimitiveTypes.Number
  | PrimitiveTypes.String
  | PrimitiveTypes.Boolean
  | PrimitiveTypes.Null
  | PrimitiveTypes.Undefined
  | PrimitiveTypes.ESSymbol
  | PrimitiveTypes.BigInt
  | PrimitiveTypes.Any
  | PrimitiveTypes.Unknown;

export enum OpCodes {
  REF_PRIMITIVE = 1,
  REF_ARRAY = 2,
  REF_OBJECT = 3,
  REF_CLASS = 4,
  REF_FUNCTION = 5,
  REF_GENERIC = 6,
  REF_UNION = 7,
  REF_INTERSECTION = 8,
  REF_ENUM = 9,
  REF_LITERAL = 10,
  REF_MAPPED = 11,
  REF_CONDITIONAL = 12,
  REF_ALIAS = 13,
}

export type PrimitiveType = Brand<PrimitiveTypeFlag, "PrimitiveType">;

export type RTTITypeRef =
  | { kind: "primitive"; type: PrimitiveType }
  | { kind: "ref"; fqName: string };

// --- DECORATOR/GENERIC BASE ---
export interface RTTIDecorator {
  name: string;
  args: string[];
}
export interface RTTIGenericParam {
  name: string;
  constraint?: RTTITypeRef;
}

// --- PARAMS & PROPERTIES ---
export interface RTTIParameter {
  name: string;
  type: RTTITypeRef;
  decorators: RTTIDecorator[];
}

export interface RTTIPropInfo {
  name: string;
  type: RTTITypeRef;
  flags: number;
  decorators: RTTIDecorator[];
  kind?: "property" | "method" | "accessor" | "constructor";
  overloads?: RTTIMethodOverload[];
  implementation?: RTTIMethodOverload;
  parameters?: RTTIParameter[];
}

// --- METHODS (for overloads/impls) ---
export interface RTTIMethodOverload {
  params: RTTIParameter[];
  returnType: RTTITypeRef;
  decorators: RTTIDecorator[];
}

export interface RTTIClassMetadata {
  fqName: string;
  kind: OpCodes.REF_CLASS | OpCodes.REF_OBJECT;
  data: {
    props: Array<RTTIPropInfo>;
    generics: RTTIGenericParam[];
    decorators: RTTIDecorator[];
    bases: string[];
  };
}

export interface RTTIFunctionMetadata {
  fqName: string;
  kind: OpCodes.REF_FUNCTION;
  data: {
    params: RTTIParameter[];
    returnType: RTTITypeRef;
    generics: RTTIGenericParam[];
    decorators?: RTTIDecorator[];
  };
}

export interface RTTIPrimitiveMetadata {
  fqName: string;
  kind: OpCodes.REF_PRIMITIVE;
  data: PrimitiveType;
}

export interface RTTIEnumMetadata {
  fqName: string;
  kind: OpCodes.REF_ENUM;
  data: {
    members: Array<{ name: string; value: string | number }>;
  };
}

export interface RTTIUnionMetadata {
  fqName: string;
  kind: OpCodes.REF_UNION;
  data: {
    members: RTTITypeRef[];
  };
}

export interface RTTIIntersectionMetadata {
  fqName: string;
  kind: OpCodes.REF_INTERSECTION;
  data: {
    members: RTTITypeRef[];
  };
}

export interface RTTIMappedMetadata {
  fqName: string;
  kind: OpCodes.REF_MAPPED;
  data: {
    keyName: string;
    keyConstraint: RTTITypeRef | null;
    valueType: RTTITypeRef;
  };
}

export interface RTTIConditionalMetadata {
  fqName: string;
  kind: OpCodes.REF_CONDITIONAL;
  data: {
    checkType: RTTITypeRef;
    extendsType: RTTITypeRef;
    trueType: RTTITypeRef;
    falseType: RTTITypeRef;
  };
}

// ----- Caching -----
export type TypeCacheEntry = {
  fqName: string;
  hash: string;
  meta: RTTIMetadata;
};
export type FileCacheEntry = {
  mtimeMs: number;
  typeHashes: Record<string, string>;
  types: RTTIMetadata[];
};
export type MetadataCache = {
  version: number;
  files: Record<string, FileCacheEntry>;
  types: Record<string, TypeCacheEntry>;
};

export type RTTIMetadata =
  | RTTIClassMetadata
  | RTTIFunctionMetadata
  | RTTIPrimitiveMetadata
  | RTTIEnumMetadata
  | RTTIUnionMetadata
  | RTTIIntersectionMetadata
  | RTTIMappedMetadata
  | RTTIConditionalMetadata;
