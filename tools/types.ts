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
}

export type PrimitiveType = Brand<PrimitiveTypeFlag, "PrimitiveType">;

export interface RTTIDecorator {
  name: string;
  args: string[];
}

export interface RTTIProperty {
  name: string;
  type: PrimitiveType;
}

export interface RTTIParameter {
  name: string;
  type: PrimitiveType; // PrimitiveType | OtherKind
  decorators: RTTIDecorator[];
}

export interface RTTIFunction {
  params: RTTIParameter[];
  returnType: PrimitiveType;
  generics?: string[];
}

export interface RTTIMethodOverload {
  params: RTTIParameter[];
  returnType: PrimitiveType;
  decorators: RTTIDecorator[];
}

export interface RTTIMethodImplementation {
  params: RTTIParameter[];
  returnType: PrimitiveType;
  decorators: RTTIDecorator[];
}

export interface RTTIPropInfo {
  name: string;
  type: PrimitiveType;
  flags: number;
  decorators: RTTIDecorator[];
  kind?: "property" | "method" | "accessor" | "constructor";
  overloads?: RTTIMethodOverload[];
  implementation?: RTTIMethodImplementation;
  parameters?: RTTIParameter[];
}

// For classes and objects
export interface RTTIClassMetadata {
  fqName: string;
  kind: OpCodes.REF_CLASS | OpCodes.REF_OBJECT;
  data: {
    props: Array<RTTIPropInfo>;
    generics: string[];
    decorators: RTTIDecorator[];
    bases: string[];
  };
}

export interface RTTIMethodOverload {
  params: RTTIParameter[];
  returnType: PrimitiveType;
  decorators: RTTIDecorator[];
}

export interface RTTIClassMethodProp {
  name: string;
  kind: "method";
  type: PrimitiveType; // main implementation's return type (optional)
  flags: number;
  overloads: RTTIMethodOverload[];
  implementation?: RTTIMethodOverload;
  decorators: RTTIDecorator[];
  parameters?: RTTIParameter[];
}

// For functions
export interface RTTIFunctionMetadata {
  fqName: string;
  kind: OpCodes.REF_FUNCTION;
  data: RTTIFunction;
}

// For primitive type
export interface RTTIPrimitiveMetadata {
  fqName: string;
  kind: OpCodes.REF_PRIMITIVE;
  data: PrimitiveType;
}

// For enums
export interface RTTIEnumMetadata {
  fqName: string;
  kind: OpCodes.REF_ENUM;
  data: {
    members: Array<{ name: string; value: string | number }>;
  };
}

// For unions
export interface RTTIUnionMetadata {
  fqName: string;
  kind: OpCodes.REF_UNION;
  data: {
    members: string[];
  };
}

// For intersections
export interface RTTIIntersectionMetadata {
  fqName: string;
  kind: OpCodes.REF_INTERSECTION;
  data: {
    members: string[];
  };
}

// For mapped types
export interface RTTIMappedMetadata {
  fqName: string;
  kind: OpCodes.REF_MAPPED;
  data: {
    keyName: string;
    keyConstraint: string;
    valueType: string;
  };
}

// For conditional types
export interface RTTIConditionalMetadata {
  fqName: string;
  kind: OpCodes.REF_CONDITIONAL;
  data: {
    checkType: string;
    extendsType: string;
    trueType: string;
    falseType: string;
  };
}

export type TypeCacheEntry = {
  fqName: string;
  hash: string;
  meta: RTTIMetadata;
};

export type FileCacheEntry = {
  mtimeMs: number;
  typeHashes: Record<string, string>; // fqName -> hash
  types: RTTIMetadata[];
};

export type MetadataCache = {
  version: number;
  files: Record<string, FileCacheEntry>;
  types: Record<string, TypeCacheEntry>; // fqName -> { hash, meta }
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
