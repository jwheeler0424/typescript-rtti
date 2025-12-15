import { decodeRTTIEntry } from "./decoder";
import { MetadataStore } from "./reader";
import {
  OpCodes,
  type PrimitiveType,
  type RTTIDecorator,
  type RTTIEnumMetadata,
  type RTTIGenericParam,
  type RTTIMetadata,
  type RTTIMethodOverload,
  type RTTIParameter,
  type RTTIPropInfo,
  type RTTITypeRef,
} from "./types";

/**
 * Full property/member info as given by RTTIPropInfo at runtime.
 */
export type IntrospectedProp = RTTIPropInfo;

export class Introspector {
  private store: MetadataStore;

  constructor(store: MetadataStore) {
    this.store = store;
  }

  /**
   * List all fully-qualified type/function names in the registry.
   */
  listAllTypes(): string[] {
    return this.store.listTypes();
  }

  /**
   * Returns all properties/methods/accessors/etc. for a class/interface,
   * as structured RTTIPropInfo[] (directly matching the TypeScript definition).
   */
  getTypeProperties(typeName: string): RTTIPropInfo[] | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const decoded = this.getEntryDecoded(typeName);
    if (
      !decoded ||
      !(
        decoded.kind === OpCodes.REF_CLASS ||
        decoded.kind === OpCodes.REF_OBJECT
      ) ||
      !decoded.props
    ) {
      return undefined;
    }
    // Each is a RTTIPropInfo structure
    return decoded.props;
  }

  /**
   * Returns the full decoded RTTIMetadata. This is a strongly-typed discriminated union.
   */
  getEntryDecoded(typeName: string): any | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const safeGetString = (idx: number) =>
      this.store.getStrings()[idx] ?? "<unknown>";
    return decodeRTTIEntry(this.store.getMetadataBuffer(entry), safeGetString);
  }

  /**
   * For functions and methods: get params, types, and all param decorators — as RTTIParameter[].
   */
  getFunctionParams(funcName: string): RTTIParameter[] | undefined {
    const info = this.getEntryDecoded(funcName);
    if (
      info &&
      info.kind === OpCodes.REF_FUNCTION &&
      Array.isArray(info.params)
    ) {
      return info.params;
    }
    return undefined;
  }

  /**
   * For functions with generics: returns param names and constraints, as RTTIGenericParam[].
   */
  getGenerics(typeName: string): RTTIGenericParam[] | undefined {
    const info = this.getEntryDecoded(typeName);
    if (!info || !Array.isArray(info.generics)) return undefined;
    return info.generics;
  }

  /**
   * For class types, returns base types (extends/implements), as string array.
   */
  getBaseTypes(typeName: string): string[] | undefined {
    const info = this.getEntryDecoded(typeName);
    if (!info || !Array.isArray(info.bases)) return undefined;
    return info.bases;
  }

  /**
   * Get the enum value/name pairs for an enum.
   */
  getEnumMembers(enumName: string): RTTIEnumMetadata[] | undefined {
    const info = this.getEntryDecoded(enumName);
    if (info && info.kind === OpCodes.REF_ENUM && Array.isArray(info.members)) {
      return info.members;
    }
    return undefined;
  }

  /**
   * Get the OpCode for a registered RTTI entry.
   */
  getTypeOpCode(typeName: string): OpCodes | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    return this.store.getMetadataBuffer(entry)[0] as OpCodes;
  }

  /**
   * Returns all type-level decorators (for classes, interfaces, or functions).
   */
  getDecorators(typeName: string): RTTIDecorator[] | undefined {
    const info = this.getEntryDecoded(typeName);
    if (!info || !Array.isArray(info.decorators)) return undefined;
    return info.decorators;
  }

  /**
   * Returns the raw, unprocessed buffer for any RTTI entry.
   */
  getRawMetadata(typeName: string): Uint8Array | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    return this.store.getMetadataBuffer(entry);
  }

  /**
   * Returns all RTTIPropInfo items of a given kind for a class/interface.
   * kind: 'property' | 'method' | 'accessor' | 'constructor'
   */
  filterPropsOfKind(
    typeName: string,
    kind: "property" | "method" | "accessor" | "constructor"
  ): RTTIPropInfo[] {
    const props = this.getTypeProperties(typeName) ?? [];
    return props.filter((p) => (p.kind ?? "property") === kind);
  }

  /**
   * Returns a single prop/method/accessor by name (and optionally kind) for a class/interface.
   */
  findPropByName(
    typeName: string,
    name: string,
    kind?: "property" | "method" | "accessor" | "constructor"
  ): RTTIPropInfo | undefined {
    const props = this.getTypeProperties(typeName) ?? [];
    return props.find(
      (p) => p.name === name && (kind ? (p.kind ?? "property") === kind : true)
    );
  }

  /**
   * Returns all decorators found on the type and all its props/methods/accessors/parameters.
   */
  getAllDecoratorsRecursive(typeName: string): RTTIDecorator[] {
    const decoded = this.getEntryDecoded(typeName);
    if (!decoded) return [];
    const all: RTTIDecorator[] = [];
    if (Array.isArray(decoded.decorators)) all.push(...decoded.decorators);
    if (Array.isArray(decoded.props)) {
      for (const prop of decoded.props) {
        if (Array.isArray(prop.decorators)) all.push(...prop.decorators);
        if (Array.isArray(prop.parameters)) {
          for (const param of prop.parameters) {
            if (Array.isArray(param.decorators)) all.push(...param.decorators);
          }
        }
        // If method overloads exist:
        if (Array.isArray(prop.overloads)) {
          for (const ovl of prop.overloads) {
            if (Array.isArray(ovl.decorators)) all.push(...ovl.decorators);
            if (Array.isArray(ovl.params)) {
              for (const param of ovl.params) {
                if (Array.isArray(param.decorators))
                  all.push(...param.decorators);
              }
            }
          }
        }
      }
    }
    // Optionally deduplicate by name/args
    return all.filter(
      (d, i) =>
        all.findIndex(
          (x) =>
            x.name === d.name &&
            JSON.stringify(x.args) === JSON.stringify(d.args)
        ) === i
    );
  }

  /**
   * Returns all overloads for a method of a class/interface.
   */
  getMethodOverloads(
    typeName: string,
    methodName: string
  ): RTTIMethodOverload[] | undefined {
    const prop = this.findPropByName(typeName, methodName, "method");
    return prop?.overloads;
  }

  /**
   * Returns all parameters for the primary constructor of a class, if present.
   */
  getConstructorParameters(typeName: string): RTTIParameter[] | undefined {
    const props = this.getTypeProperties(typeName) ?? [];
    const ctor = props.find((p) => (p.kind ?? "property") === "constructor");
    return ctor?.parameters;
  }

  /**
   * Resolves an RTTITypeRef: returns info about the referenced type.
   * Returns RTTIMetadata for "ref" types, or the primitive type value for primitives,
   * or undefined if resolution fails.
   */
  resolveTypeRef(
    typeRef: RTTITypeRef
  ): RTTIMetadata | PrimitiveType | undefined {
    if (!typeRef) return undefined;
    if (typeRef.kind === "primitive") return typeRef.type;
    if (typeRef.kind === "ref") return this.getEntryDecoded(typeRef.fqName);
  }

  /**
   * Returns the return type RTTITypeRef for a function.
   */
  getFunctionReturnType(funcName: string): RTTITypeRef | undefined {
    const info = this.getEntryDecoded(funcName);
    if (info && info.kind === OpCodes.REF_FUNCTION) {
      return info.returnType;
    }
    return undefined;
  }

  /**
   * Returns all type names of a certain RTTI kind (OpCodes.REF_CLASS, REF_ENUM, etc.)
   */
  getAllTypeNamesByKind(kind: OpCodes): string[] {
    return this.listAllTypes().filter(
      (typeName) => this.getTypeOpCode(typeName) === kind
    );
  }

  /**
   * Recursively walk all RTTITypeRefs used in the given type's properties, methods, parameters, and generics.
   * Returns a set of fully-qualified type names referenced (excluding primitives).
   */
  getAllReferencedTypes(typeName: string): Set<string> {
    const visited = new Set<string>();
    const walkTypeRef = (ref: any) => {
      if (!ref) return;
      if (ref.kind === "ref" && typeof ref.fqName === "string") {
        visited.add(ref.fqName);
        // recurse into the referenced type itself
        const refMeta = this.getEntryDecoded(ref.fqName);
        if (refMeta) walkRTTIMetadata(refMeta);
      } else if (ref.kind === "primitive") {
        // skip primitives
      } else if (Array.isArray(ref.members)) {
        ref.members.forEach(walkTypeRef);
      }
      // ... handle other complex RTTITypeRef shapes as needed
    };
    const walkRTTIMetadata = (info: any) => {
      if (info.props)
        info.props.forEach((p: any) => {
          walkTypeRef(p.type);
          if (p.parameters)
            p.parameters.forEach((param: any) => walkTypeRef(param.type));
          if (p.overloads)
            p.overloads.forEach((ovl: any) => {
              if (ovl.params)
                ovl.params.forEach((param: any) => walkTypeRef(param.type));
              walkTypeRef(ovl.returnType);
            });
          if (p.implementation && p.implementation.params)
            p.implementation.params.forEach((param: any) =>
              walkTypeRef(param.type)
            );
        });
      if (info.generics)
        info.generics.forEach((g: any) => {
          if (g.constraint) walkTypeRef(g.constraint);
        });
      if (info.params)
        info.params.forEach((param: any) => walkTypeRef(param.type));
      if (info.returnType) walkTypeRef(info.returnType);
    };
    const info = this.getEntryDecoded(typeName);
    if (info) walkRTTIMetadata(info);
    visited.delete(typeName); // don't include self
    return visited;
  }

  /**
   * Returns a flat, ordered list of all base types (recursively follows extends/implements),
   * most-ancestral first, direct parent last.
   */
  resolveInheritanceTree(typeName: string): string[] {
    const linearized: string[] = [];
    const visit = (name: string) => {
      const bases = this.getBaseTypes(name) ?? [];
      for (const base of bases) {
        visit(base);
      }
      if (!linearized.includes(name)) linearized.push(name);
    };
    visit(typeName);
    return linearized.filter((n) => n !== typeName); // optional: remove self reference
  }

  /**
   * Follows a property path and returns the final RTTITypeRef, or undefined if path is invalid.
   */
  getPropertyTypeByPath(
    typeName: string,
    path: string
  ): RTTITypeRef | undefined {
    let type = typeName;
    let ref: RTTITypeRef | undefined;
    const segments = path.split(".");
    for (const key of segments) {
      const props = this.getTypeProperties(type);
      const prop = props?.find((p) => p.name === key);
      if (!prop) return undefined;
      ref = prop.type;
      if (ref.kind === "ref") {
        type = ref.fqName;
      } else if (ref.kind === "primitive") {
        return ref;
      } else {
        return undefined; // not supported for other types yet
      }
    }
    return ref;
  }

  /**
   * Instantiates an empty/default object matching the schema of the class/interface,
   * with properties filled as undefined/null/empty arrays, etc.
   * (This is a simple blueprint, not hydration with data.)
   */
  instantiateDefaultObject(typeName: string): any {
    const props = this.getTypeProperties(typeName);
    if (!props) return {};
    const res: any = {};
    for (const p of props) {
      if (p.kind === "method" || p.kind === "constructor") continue;
      const t = p.type;
      if (t.kind === "primitive") {
        // customize these mappings as you wish
        switch (t.type) {
          case 1:
            res[p.name] = 0;
            break; // number
          case 2:
            res[p.name] = "";
            break; // string
          case 3 as PrimitiveType:
            res[p.name] = false;
            break; // boolean
          default:
            res[p.name] = null;
            break;
        }
      } else if (t.kind === "ref") {
        res[p.name] = undefined; // or recursively .instantiateDefaultObject(t.fqName)
      }
    }
    return res;
  }

  /**
   * Returns true if `typeName` is a subclass/subinterface (directly or indirectly) of `baseType`.
   */
  isSubclassOf(typeName: string, baseType: string): boolean {
    const allBases = this.resolveInheritanceTree(typeName);
    return allBases.includes(baseType);
  }

  /**
   * Human-friendly single-line type ref summary. Useful for docs, debug, UI.
   */
  prettyPrintTypeRef(ref: RTTITypeRef): string {
    if (ref.kind === "primitive") return String(ref.type);
    if (ref.kind === "ref") return `[${ref.fqName}]`;
    return "<unknown>";
  }

  /**
   * Returns all property names for the given type and all its base types (depth-first, including duplicates).
   */
  getAllPropertiesRecursive(typeName: string): string[] {
    const props: string[] = [];
    const scan = (name: string) => {
      const typeProps = this.getTypeProperties(name);
      if (typeProps)
        props.push(
          ...typeProps.filter((p) => p.kind === "property").map((p) => p.name)
        );
      const bases = this.getBaseTypes(name);
      if (bases) bases.forEach(scan);
    };
    scan(typeName);
    return props;
  }

  // === Primitive Helper Methods ===

  /**
   * Returns true if the type is a class (OpCodes.REF_CLASS).
   */
  isClass(typeName: string): boolean {
    return this.getTypeOpCode(typeName) === OpCodes.REF_CLASS;
  }

  /**
   * Returns true if the type is an interface (OpCodes.REF_OBJECT).
   */
  isInterface(typeName: string): boolean {
    return this.getTypeOpCode(typeName) === OpCodes.REF_OBJECT;
  }

  /**
   * Returns true if the type is an enum (OpCodes.REF_ENUM).
   */
  isEnum(typeName: string): boolean {
    return this.getTypeOpCode(typeName) === OpCodes.REF_ENUM;
  }

  /**
   * Returns true if the given name is a function (OpCodes.REF_FUNCTION).
   */
  isFunction(typeName: string): boolean {
    return this.getTypeOpCode(typeName) === OpCodes.REF_FUNCTION;
  }

  /**
   * Returns true if the type is a union type (OpCodes.REF_UNION).
   */
  isUnion(typeName: string): boolean {
    return this.getTypeOpCode(typeName) === OpCodes.REF_UNION;
  }

  /**
   * Returns true if the type is an intersection type (OpCodes.REF_INTERSECTION).
   */
  isIntersection(typeName: string): boolean {
    return this.getTypeOpCode(typeName) === OpCodes.REF_INTERSECTION;
  }

  /**
   * Returns true if the type is a mapped type (OpCodes.REF_MAPPED).
   */
  isMappedType(typeName: string): boolean {
    return this.getTypeOpCode(typeName) === OpCodes.REF_MAPPED;
  }

  /**
   * Returns true if the type is a conditional type (OpCodes.REF_CONDITIONAL).
   */
  isConditionalType(typeName: string): boolean {
    return this.getTypeOpCode(typeName) === OpCodes.REF_CONDITIONAL;
  }

  /**
   * Returns true if the RTTITypeRef is a primitive.
   */
  isPrimitiveType(typeRef: RTTITypeRef): boolean {
    return !!typeRef && typeRef.kind === "primitive";
  }

  /**
   * Returns true if the RTTITypeRef is a reference type (RTTITypeRef.kind === 'ref').
   */
  isReferenceType(typeRef: RTTITypeRef): boolean {
    return !!typeRef && typeRef.kind === "ref";
  }

  /**
   * Returns true if your RTTI metadata marks this type as exported.
   * (You must collect/export this info during RTTI extraction phase.)
   */
  isExported(typeName: string): boolean {
    const decoded = this.getEntryDecoded(typeName);
    return !!decoded && decoded.exported === true;
  }

  /**
   * Returns a human-friendly kind string for a type.
   */
  getKindString(typeName: string): string {
    const kind = this.getTypeOpCode(typeName);
    switch (kind) {
      case OpCodes.REF_CLASS:
        return "class";
      case OpCodes.REF_OBJECT:
        return "interface";
      case OpCodes.REF_FUNCTION:
        return "function";
      case OpCodes.REF_GENERIC:
        return "generic";
      case OpCodes.REF_UNION:
        return "union";
      case OpCodes.REF_INTERSECTION:
        return "intersection";
      case OpCodes.REF_ENUM:
        return "enum";
      case OpCodes.REF_PRIMITIVE:
        return "primitive";
      case OpCodes.REF_MAPPED:
        return "mapped";
      case OpCodes.REF_CONDITIONAL:
        return "conditional";
      case OpCodes.REF_LITERAL:
        return "literal";
      case OpCodes.REF_ALIAS:
        return "alias";
      case undefined:
        return "<unknown>";
      default:
        return String(kind);
    }
  }

  /**
   * Returns all static method members of a class or interface.
   */
  getStaticMethods(typeName: string): RTTIPropInfo[] {
    return (this.getTypeProperties(typeName) ?? []).filter(
      (p) =>
        (p.kind ?? "property") === "method" &&
        Introspector.isStatic(p.flags ?? 0)
    );
  }

  /**
   * Returns all instance method members of a class or interface.
   */
  getInstanceMethods(typeName: string): RTTIPropInfo[] {
    return (this.getTypeProperties(typeName) ?? []).filter(
      (p) =>
        (p.kind ?? "property") === "method" &&
        !Introspector.isStatic(p.flags ?? 0)
    );
  }

  /**
   * Returns all method names (instance and static) for a type.
   */
  getAllMethodNames(typeName: string): string[] {
    return (this.getTypeProperties(typeName) ?? [])
      .filter((p) => (p.kind ?? "property") === "method")
      .map((p) => p.name);
  }

  /**
   * Returns true if the type has any top-level decorators.
   */
  hasTypeDecorators(typeName: string): boolean {
    const decs = this.getDecorators(typeName);
    return !!(decs && decs.length > 0);
  }

  /**
   * Returns true if a property or method (RTTIPropInfo) has decorators.
   */
  static hasPropDecorators(prop: RTTIPropInfo): boolean {
    return !!(prop.decorators && prop.decorators.length > 0);
  }

  /**
   * Returns all instance properties for a type (excluding static, methods, accessors, etc).
   */
  getAllInstanceProperties(typeName: string): RTTIPropInfo[] {
    return (this.getTypeProperties(typeName) ?? []).filter(
      (p) =>
        (p.kind ?? "property") === "property" &&
        !Introspector.isStatic(p.flags ?? 0)
    );
  }

  /**
   * Returns all static properties for a type.
   */
  getAllStaticProperties(typeName: string): RTTIPropInfo[] {
    return (this.getTypeProperties(typeName) ?? []).filter(
      (p) =>
        (p.kind ?? "property") === "property" &&
        Introspector.isStatic(p.flags ?? 0)
    );
  }

  /**
   * Returns true if the given type has a method with the given name (instance or static).
   */
  hasMethod(typeName: string, methodName: string): boolean {
    return (this.getTypeProperties(typeName) ?? [])
      .filter((p) => (p.kind ?? "property") === "method")
      .some((p) => p.name === methodName);
  }

  /**
   * Returns true if the given type has a property (field, not method/accessor) with the given name.
   */
  hasProperty(typeName: string, propName: string): boolean {
    return (this.getTypeProperties(typeName) ?? [])
      .filter((p) => (p.kind ?? "property") === "property")
      .some((p) => p.name === propName);
  }

  /**
   * Returns the parameter names for a given method of a class/interface.
   */
  getParameterNames(
    typeName: string,
    methodName: string
  ): string[] | undefined {
    const method = (this.getTypeProperties(typeName) ?? []).find(
      (p) => (p.kind ?? "property") === "method" && p.name === methodName
    );
    if (!method) return undefined;
    // Prefer implementation, then overloads, then parameters.
    if (method.implementation && method.implementation.params)
      return method.implementation.params.map((p) => p.name);
    if (method.overloads && method.overloads[0]?.params)
      return method.overloads[0].params.map((p) => p.name);
    if (Array.isArray(method.parameters))
      return method.parameters.map((p) => p.name);
    return [];
  }

  /**
   * Returns true if a particular flag bit is set in a flags word.
   * Example: Introspector.isFlagSet(flags, 3) // is private?
   */
  static isFlagSet(flags: number, bitIndex: number): boolean {
    return (flags & (1 << bitIndex)) !== 0;
  }

  /**
   * Returns all accessors (get/set) for a type.
   */
  getAllAccessors(typeName: string): RTTIPropInfo[] {
    return (this.getTypeProperties(typeName) ?? []).filter(
      (p) => (p.kind ?? "property") === "accessor"
    );
  }

  // === Flag utilities ===

  static decodeVisibility(flags: number): "public" | "private" | "protected" {
    if (flags & (1 << 3)) return "private";
    if (flags & (1 << 4)) return "protected";
    return "public";
  }
  static isStatic(flags: number): boolean {
    return (flags & (1 << 0)) !== 0;
  }
  static isReadonly(flags: number): boolean {
    return (flags & (1 << 1)) !== 0;
  }
  static isOptional(flags: number): boolean {
    return (flags & (1 << 2)) !== 0;
  }
}

export default Introspector;
