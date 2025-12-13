import { OpCode, PrimitiveType } from "./protocol";

export interface RTTIDecorator {
  name: string;
  args: string[];
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
}

// For classes and objects
export interface RTTIClassMetadata {
  fqName: string;
  kind: OpCode.REF_CLASS | OpCode.REF_OBJECT;
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
  kind: OpCode.REF_FUNCTION;
  data: RTTIFunction;
}

// For primitive type
export interface RTTIPrimitiveMetadata {
  fqName: string;
  kind: OpCode.REF_PRIMITIVE;
  data: PrimitiveType;
}

// For enums
export interface RTTIEnumMetadata {
  fqName: string;
  kind: OpCode.REF_ENUM;
  data: {
    members: Array<{ name: string; value: string | number }>;
  };
}

// For unions
export interface RTTIUnionMetadata {
  fqName: string;
  kind: OpCode.REF_UNION;
  data: {
    members: string[];
  };
}

// For intersections
export interface RTTIIntersectionMetadata {
  fqName: string;
  kind: OpCode.REF_INTERSECTION;
  data: {
    members: string[];
  };
}

// For mapped types
export interface RTTIMappedMetadata {
  fqName: string;
  kind: OpCode.REF_MAPPED;
  data: {
    keyName: string;
    keyConstraint: string;
    valueType: string;
  };
}

// For conditional types
export interface RTTIConditionalMetadata {
  fqName: string;
  kind: OpCode.REF_CONDITIONAL;
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
