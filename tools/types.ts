import { OpCode, PrimitiveType } from "./protocol";

// For classes and objects
export interface RTTIClassMetadata {
  fqName: string;
  kind: OpCode.REF_CLASS | OpCode.REF_OBJECT;
  data: {
    props: Array<{
      name: string;
      kind: "property" | "method" | "accessor" | "constructor";
      type: PrimitiveType;
      flags: number;
      decorators: { name: string; args: string[] }[];
      parameters?: Array<{
        name: string;
        type: PrimitiveType;
        decorators: { name: string; args: string[] }[];
      }>;
    }>;
    generics: string[];
    decorators: { name: string; args: string[] }[];
    bases: string[];
  };
}

// For functions
export interface RTTIFunctionMetadata {
  fqName: string;
  kind: OpCode.REF_FUNCTION;
  data: {
    params: Array<{
      name: string;
      type: PrimitiveType;
      decorators: { name: string; args: string[] }[];
    }>;
    returnType: PrimitiveType;
    generics: string[];
    decorators: { name: string; args: string[] }[];
  };
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
