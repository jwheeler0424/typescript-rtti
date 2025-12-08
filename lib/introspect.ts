import { OpCode, PrimitiveType } from "../tools/protocol.js";
import { MetadataStore } from "./reader.js";

export class Introspector {
  private store: MetadataStore;

  constructor(store: MetadataStore) {
    this.store = store;
  }

  listAllTypes(): string[] {
    return this.store.listTypes();
  }

  getTypeProperties(
    typeName: string
  ): { name: string; type: number }[] | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    if (buf.readUInt8(0) !== OpCode.REF_CLASS) return undefined;
    const propCount = buf.readUInt8(2);
    let props: { name: string; type: number }[] = [];
    let offset = 3;
    for (let i = 0; i < propCount; i++) {
      const nameIdx = buf.readUInt8(offset);
      const typeCode = buf.readUInt8(offset + 1);
      const propName = this.store.getStrings()[nameIdx];
      props.push({ name: propName, type: typeCode });
      offset += 2;
    }
    return props;
  }

  getFunctionParams(
    funcName: string
  ): { name: string; type: number }[] | undefined {
    const entry = this.store.getEntryByName(funcName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    if (buf.readUInt8(0) !== OpCode.REF_FUNCTION) return undefined;
    const paramCount = buf.readUInt8(2);
    let params: { name: string; type: number }[] = [];
    let offset = 3;
    for (let i = 0; i < paramCount; i++) {
      const nameIdx = buf.readUInt8(offset);
      const typeCode = buf.readUInt8(offset + 1);
      const paramName = this.store.getStrings()[nameIdx];
      params.push({ name: paramName, type: typeCode });
      offset += 2;
    }
    return params;
  }

  getTypeOpCode(typeName: string): OpCode | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    return buf.readUInt8(0) as OpCode;
  }

  getRawMetadata(typeName: string): Buffer | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    return this.store.getMetadataBuffer(entry);
  }

  getEnumMembers(
    enumName: string
  ): { name: string; value: string | number }[] | undefined {
    const entry = this.store.getEntryByName(enumName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    if (buf.readUInt8(0) !== OpCode.REF_ENUM) return undefined;
    const memberCount = buf.readUInt8(2);
    let offset = 3;
    const result: { name: string; value: string | number }[] = [];
    for (let i = 0; i < memberCount; i++) {
      const nameIdx = buf.readUInt8(offset);
      offset += 1;
      // Determine if value is number (4 bytes) or string (len + bytes)
      // Check next byte as string length max 127, number likely used otherwise
      let value: string | number;
      const nextByte = buf.readUInt8(offset);
      // Heuristic: if next byte matches expected string length, treat as string
      if (nextByte >= 0 && nextByte <= 32) {
        const strLen = buf.readUInt8(offset);
        offset += 1;
        value = buf.subarray(offset, offset + strLen).toString("utf8");
        offset += strLen;
      } else {
        value = buf.readInt32LE(offset);
        offset += 4;
      }
      result.push({ name: this.store.getStrings()[nameIdx], value });
    }
    return result;
  }

  getGenerics(typeName: string): string[] | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);

    let offset = 3; // After OpCode and fqName
    let count = 0;
    if (buf.readUInt8(0) === OpCode.REF_CLASS) {
      const propCount = buf.readUInt8(2);
      offset += propCount * 2; // Skip props
      count = buf.readUInt8(offset);
      offset += 1;
    } else if (buf.readUInt8(0) === OpCode.REF_FUNCTION) {
      const paramCount = buf.readUInt8(2);
      offset += paramCount * 2 + 1; // Skip params + return
      count = buf.readUInt8(offset);
      offset += 1;
    } else {
      return undefined;
    }

    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      const nameIdx = buf.readUInt8(offset);
      offset += 1;
      result.push(this.store.getStrings()[nameIdx]);
    }
    return result;
  }

  getUnionMembers(unionName: string): string[] | undefined {
    const entry = this.store.getEntryByName(unionName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    if (buf.readUInt8(0) !== OpCode.REF_UNION) return undefined;
    const count = buf.readUInt8(2);
    let offset = 3;
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      const nameIdx = buf.readUInt8(offset++);
      result.push(this.store.getStrings()[nameIdx]);
    }
    return result;
  }

  getIntersectionMembers(interName: string): string[] | undefined {
    const entry = this.store.getEntryByName(interName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    if (buf.readUInt8(0) !== OpCode.REF_INTERSECTION) return undefined;
    const count = buf.readUInt8(2);
    let offset = 3;
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      const nameIdx = buf.readUInt8(offset++);
      result.push(this.store.getStrings()[nameIdx]);
    }
    return result;
  }

  getTypePropertiesWithFlags(
    typeName: string
  ): { name: string; type: number; flags: number }[] | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    if (buf.readUInt8(0) !== OpCode.REF_CLASS) return undefined;
    const propCount = buf.readUInt8(2);
    let props: { name: string; type: number; flags: number }[] = [];
    let offset = 3;
    for (let i = 0; i < propCount; i++) {
      const nameIdx = buf.readUInt8(offset);
      const typeCode = buf.readUInt8(offset + 1);
      const flags = buf.readUInt8(offset + 2);
      const propName = this.store.getStrings()[nameIdx];
      props.push({ name: propName, type: typeCode, flags });
      offset += 3;
    }
    return props;
  }

  getDecorators(
    typeName: string
  ): { name: string; args: string[] }[] | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    const op = buf.readUInt8(0);

    // locate decorators offset:
    let offset = 3;
    if (op === OpCode.REF_CLASS) {
      const propCount = buf.readUInt8(2);
      offset += propCount * 3; // name, type, flags per property
      const genericCount = buf.readUInt8(offset);
      offset += 1 + genericCount; // 1 for count, N for indices
    } else if (op === OpCode.REF_FUNCTION) {
      const paramCount = buf.readUInt8(2);
      offset += paramCount * 2 + 1; // params + returnType
      const genericCount = buf.readUInt8(offset);
      offset += 1 + genericCount;
    } else {
      return undefined;
    }

    // Now at the decorators block:
    const decoCount = buf.readUInt8(offset++); // N
    const result: { name: string; args: string[] }[] = [];
    for (let i = 0; i < decoCount; i++) {
      const nameIdx = buf.readUInt8(offset++);
      const name = this.store.getStrings()[nameIdx];
      const argCount = buf.readUInt8(offset++);
      const args: string[] = [];
      for (let j = 0; j < argCount; j++) {
        const argIdx = buf.readUInt8(offset++);
        args.push(this.store.getStrings()[argIdx]);
      }
      result.push({ name, args });
    }
    return result;
  }

  getFunctionParamsWithDecorators(funcName: string):
    | {
        name: string;
        type: number;
        decorators: { name: string; args: string[] }[];
      }[]
    | undefined {
    const entry = this.store.getEntryByName(funcName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    if (buf.readUInt8(0) !== OpCode.REF_FUNCTION) return undefined;
    const paramCount = buf.readUInt8(2);
    let offset = 3;
    const params: {
      name: string;
      type: number;
      decorators: { name: string; args: string[] }[];
    }[] = [];
    for (let i = 0; i < paramCount; i++) {
      const nameIdx = buf.readUInt8(offset++);
      const typeCode = buf.readUInt8(offset++);
      // --- PARAM DECORATORS ---
      const decoCount = buf.readUInt8(offset++);
      const decorators: { name: string; args: string[] }[] = [];
      for (let j = 0; j < decoCount; j++) {
        const decoNameIdx = buf.readUInt8(offset++);
        const decoName = this.store.getStrings()[decoNameIdx];
        const argCount = buf.readUInt8(offset++);
        const args: string[] = [];
        for (let k = 0; k < argCount; k++) {
          const argIdx = buf.readUInt8(offset++);
          args.push(this.store.getStrings()[argIdx]);
        }
        decorators.push({ name: decoName, args });
      }
      params.push({
        name: this.store.getStrings()[nameIdx],
        type: typeCode,
        decorators,
      });
    }
    // leave 'offset' for further parsing if needed (returnType, generics, decorators ...)
    return params;
  }

  getBaseTypes(typeName: string): string[] | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    // Adjust offset: must skip props/fields, generics, decorators according to your layout.
    // We'll use a simplified offset here assuming just bases are present after props, generics, and decorators.
    let offset = 3;
    if (buf.readUInt8(0) === OpCode.REF_CLASS) {
      // Skip class fields as you do with getTypeProperties etc.
      const propCount = buf.readUInt8(2);
      offset += propCount * 3;
      const genericCount = buf.readUInt8(offset);
      offset += 1 + genericCount;
      const decoCount = buf.readUInt8(offset);
      // skip over all class-level decorators
      offset += 1;
      for (let i = 0; i < decoCount; i++) {
        offset++; // nameIdx
        const argCount = buf.readUInt8(offset);
        offset++;
        offset += argCount; // argument indices
      }
    } else if (buf.readUInt8(0) === OpCode.REF_OBJECT /* or REF_INTERFACE */) {
      // e.g. interface with only bases
      // nothing to skip except op/fqNameIndex
      // adjust if you serialize interface properties, etc.
    }
    const baseCount = buf.readUInt8(offset++);
    const bases: string[] = [];
    for (let i = 0; i < baseCount; i++) {
      const baseIdx = buf.readUInt8(offset++);
      bases.push(this.store.getStrings()[baseIdx]);
    }
    return bases;
  }

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

export function decodeVisibility(
  flags: number
): "public" | "private" | "protected" {
  if (flags & (1 << 3)) return "private";
  if (flags & (1 << 4)) return "protected";
  return "public";
}

// ======= Demo & Testing Entry Point =======
async function demoIntrospection() {
  const store = new MetadataStore();
  await store.load("metadata.bin");
  const introspect = new Introspector(store);

  console.log("*** All RTTI Types/Functions:");
  introspect.listAllTypes().forEach((name) => {
    const op = introspect.getTypeOpCode(name);
    console.log(`• ${name}: ${OpCode[op!] ?? op}`);
  });

  // Show properties for all classes
  introspect.listAllTypes().forEach((name) => {
    if (introspect.getTypeOpCode(name) === OpCode.REF_CLASS) {
      const props = introspect.getTypeProperties(name)!;
      console.log(`Class ${name} props:`);
      props.forEach((p) =>
        console.log(`  ${p.name} (${PrimitiveType[p.type] ?? p.type})`)
      );
    }
  });

  // Show params for all functions
  introspect.listAllTypes().forEach((name) => {
    if (introspect.getTypeOpCode(name) === OpCode.REF_FUNCTION) {
      const params = introspect.getFunctionParams(name)!;
      console.log(`Function ${name} params:`);
      params.forEach((p) =>
        console.log(`  ${p.name} (${PrimitiveType[p.type] ?? p.type})`)
      );
    }
  });

  // Advanced: Raw metadata buffer dump
  introspect.listAllTypes().forEach((name) => {
    const raw = introspect.getRawMetadata(name);
    if (raw) {
      console.log(`Raw metadata for ${name}:`, raw);
    }
  });
}

// Uncomment below to run a test after build:
// demoIntrospection();

export default Introspector;
