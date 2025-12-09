import { decodeRTTIEntry } from "./decoder";
import { decodeVarint, OpCode, PrimitiveType } from "./protocol";
import { MetadataStore } from "./reader";

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

    let offset = 0;
    const opCode = buf[offset++];
    if (opCode !== OpCode.REF_CLASS) return undefined;

    // fqName varint
    const fqDecode = decodeVarint(buf, offset);
    offset = fqDecode.next;

    // propCount varint
    const propDecode = decodeVarint(buf, offset);
    const propCount = propDecode.value;
    offset = propDecode.next;

    let props: { name: string; type: number }[] = [];
    for (let i = 0; i < propCount; i++) {
      const nameIdxDecode = decodeVarint(buf, offset);
      const nameIdx = nameIdxDecode.value;
      offset = nameIdxDecode.next;

      const typeDecode = decodeVarint(buf, offset);
      const typeCode = typeDecode.value;
      offset = typeDecode.next;

      const flagsDecode = decodeVarint(buf, offset);
      offset = flagsDecode.next;

      // Skip member decorators
      const decoCountDecode = decodeVarint(buf, offset);
      const decoCount = decoCountDecode.value;
      offset = decoCountDecode.next;
      for (let d = 0; d < decoCount; d++) {
        const decoNameDecode = decodeVarint(buf, offset);
        offset = decoNameDecode.next;
        const argCountDecode = decodeVarint(buf, offset);
        const argCount = argCountDecode.value;
        offset = argCountDecode.next;
        for (let a = 0; a < argCount; a++) {
          const argIdxDecode = decodeVarint(buf, offset);
          offset = argIdxDecode.next;
        }
      }
      // Skip parameters
      const paramCountDecode = decodeVarint(buf, offset);
      const paramCount = paramCountDecode.value;
      offset = paramCountDecode.next;
      for (let p = 0; p < paramCount; p++) {
        const paramNameDecode = decodeVarint(buf, offset);
        offset = paramNameDecode.next;
        const paramTypeDecode = decodeVarint(buf, offset);
        offset = paramTypeDecode.next;
        const paramDecoCountDecode = decodeVarint(buf, offset);
        const paramDecoCount = paramDecoCountDecode.value;
        offset = paramDecoCountDecode.next;
        for (let pd = 0; pd < paramDecoCount; pd++) {
          const paramDecoNameDecode = decodeVarint(buf, offset);
          offset = paramDecoNameDecode.next;
          const paramArgCountDecode = decodeVarint(buf, offset);
          const paramArgCount = paramArgCountDecode.value;
          offset = paramArgCountDecode.next;
          for (let pa = 0; pa < paramArgCount; pa++) {
            const paramArgIdxDecode = decodeVarint(buf, offset);
            offset = paramArgIdxDecode.next;
          }
        }
      }

      const propName = this.store.getStrings()[nameIdx];
      props.push({ name: propName, type: typeCode });
    }
    return props;
  }

  getFunctionParams(
    funcName: string
  ): { name: string; type: number }[] | undefined {
    const entry = this.store.getEntryByName(funcName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    let offset = 0;
    const opCode = buf[offset++];
    if (opCode !== OpCode.REF_FUNCTION) return undefined;

    const fqDecode = decodeVarint(buf, offset);
    offset = fqDecode.next;

    const paramCountDecode = decodeVarint(buf, offset);
    const paramCount = paramCountDecode.value;
    offset = paramCountDecode.next;

    let params: { name: string; type: number }[] = [];
    for (let i = 0; i < paramCount; i++) {
      const nameIdxDecode = decodeVarint(buf, offset);
      const nameIdx = nameIdxDecode.value;
      offset = nameIdxDecode.next;

      const typeDecode = decodeVarint(buf, offset);
      const typeCode = typeDecode.value;
      offset = typeDecode.next;

      // Skip decorators for this basic method
      const paramDeccoDecode = decodeVarint(buf, offset);
      const decos = paramDeccoDecode.value;
      offset = paramDeccoDecode.next;
      for (let d = 0; d < decos; d++) {
        const decoNameDecode = decodeVarint(buf, offset);
        offset = decoNameDecode.next;
        const argCountDecode = decodeVarint(buf, offset);
        const argCount = argCountDecode.value;
        offset = argCountDecode.next;
        for (let a = 0; a < argCount; a++) {
          const argIdxDecode = decodeVarint(buf, offset);
          offset = argIdxDecode.next;
        }
      }
      params.push({ name: this.store.getStrings()[nameIdx], type: typeCode });
    }
    return params;
  }

  getTypeOpCode(typeName: string): OpCode | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    return buf[0] as OpCode;
  }

  getRawMetadata(typeName: string): Uint8Array | undefined {
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

    let offset = 0;
    const opCode = buf[offset++];
    if (opCode !== OpCode.REF_ENUM) return undefined;

    const fqNameDecode = decodeVarint(buf, offset);
    offset = fqNameDecode.next;

    const memberDecode = decodeVarint(buf, offset);
    const memberCount = memberDecode.value;
    offset = memberDecode.next;

    const result: { name: string; value: string | number }[] = [];

    for (let i = 0; i < memberCount; i++) {
      const nameIdxDecode = decodeVarint(buf, offset);
      const nameIdx = nameIdxDecode.value;
      offset = nameIdxDecode.next;

      // Determine if next field is number (4 bytes) or string (varint length + bytes)
      let value: string | number;
      // Check for number optimization: See how you serialized numbers vs strings for enums
      // If you always write number as 4 bytes, handle accordingly:
      if (buf[offset] === 0xff) {
        // Suppose you mark numbers with a 0xFF tag byte (update as per your serializer)
        value =
          buf[offset + 1] |
          (buf[offset + 2] << 8) |
          (buf[offset + 3] << 16) |
          (buf[offset + 4] << 24);
        offset += 5;
      } else {
        // By default, read a varint length then the string
        const strLenDecode = decodeVarint(buf, offset);
        const strLen = strLenDecode.value;
        offset = strLenDecode.next;
        value = new TextDecoder().decode(buf.slice(offset, offset + strLen));
        offset += strLen;
      }
      result.push({ name: this.store.getStrings()[nameIdx], value });
    }
    return result;
  }

  getGenerics(typeName: string): string[] | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);

    let offset = 0;
    const opCode = buf[offset++];

    // fqName varint
    const fqNameDecode = decodeVarint(buf, offset);
    offset = fqNameDecode.next;

    // skip props or params
    if (opCode === OpCode.REF_CLASS) {
      const propDecode = decodeVarint(buf, offset);
      const propCount = propDecode.value;
      offset = propDecode.next;
      for (let i = 0; i < propCount; i++) {
        // skip prop (name/type/flags/decorators/params)
        // see your serializer to determine proper skip logic;
        // for now, skipping 3 varints per property:
        for (let v = 0; v < 3; v++) offset = decodeVarint(buf, offset).next;
        // decorators, params similarly skipped (realistic version would parse/skip those too)
        let decoCount = decodeVarint(buf, offset).value;
        for (let d = 0; d < decoCount; d++) {
          offset = decodeVarint(buf, offset).next; // deco name
          let argsCt = decodeVarint(buf, offset).value;
          for (let a = 0; a < argsCt; a++) {
            offset = decodeVarint(buf, offset).next;
          }
        }
        // skip param section
        const paramCt = decodeVarint(buf, offset).value;
        for (let p = 0; p < paramCt; p++) {
          for (let vv = 0; vv < 2; vv++)
            offset = decodeVarint(buf, offset).next;
          const pdecoCt = decodeVarint(buf, offset).value;
          for (let pd = 0; pd < pdecoCt; pd++) {
            offset = decodeVarint(buf, offset).next;
            let pdecoArgCt = decodeVarint(buf, offset).value;
            for (let pa = 0; pa < pdecoArgCt; pa++) {
              offset = decodeVarint(buf, offset).next;
            }
          }
        }
      }
    } else if (opCode === OpCode.REF_FUNCTION) {
      const paramDecode = decodeVarint(buf, offset);
      const paramCount = paramDecode.value;
      offset = paramDecode.next;
      for (let i = 0; i < paramCount; i++) {
        offset = decodeVarint(buf, offset).next; // param name
        offset = decodeVarint(buf, offset).next; // param type
        let decoCount = decodeVarint(buf, offset).value;
        for (let d = 0; d < decoCount; d++) {
          offset = decodeVarint(buf, offset).next; // deco name
          let argsCt = decodeVarint(buf, offset).value;
          for (let a = 0; a < argsCt; a++) {
            offset = decodeVarint(buf, offset).next;
          }
        }
      }
      offset = decodeVarint(buf, offset).next; // returnType
    } else {
      return undefined;
    }

    // generics varint
    const genDecode = decodeVarint(buf, offset);
    const genCt = genDecode.value;
    offset = genDecode.next;

    const result: string[] = [];
    for (let i = 0; i < genCt; i++) {
      const nameIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      result.push(this.store.getStrings()[nameIdx]);
    }
    return result;
  }

  getUnionMembers(unionName: string): string[] | undefined {
    const entry = this.store.getEntryByName(unionName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    let offset = 0;
    const opCode = buf[offset++];
    if (opCode !== OpCode.REF_UNION) return undefined;

    const fqNameDecode = decodeVarint(buf, offset);
    offset = fqNameDecode.next;
    const ctDecode = decodeVarint(buf, offset);
    const count = ctDecode.value;
    offset = ctDecode.next;

    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      const nameIdxDecode = decodeVarint(buf, offset);
      result.push(this.store.getStrings()[nameIdxDecode.value]);
      offset = nameIdxDecode.next;
    }
    return result;
  }

  getIntersectionMembers(interName: string): string[] | undefined {
    const entry = this.store.getEntryByName(interName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    let offset = 0;
    const opCode = buf[offset++];
    if (opCode !== OpCode.REF_INTERSECTION) return undefined;

    const fqNameDecode = decodeVarint(buf, offset);
    offset = fqNameDecode.next;
    const ctDecode = decodeVarint(buf, offset);
    const count = ctDecode.value;
    offset = ctDecode.next;

    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      const nameIdxDecode = decodeVarint(buf, offset);
      result.push(this.store.getStrings()[nameIdxDecode.value]);
      offset = nameIdxDecode.next;
    }
    return result;
  }

  getTypePropertiesWithFlags(
    typeName: string
  ): { name: string; type: number; flags: number }[] | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);

    let offset = 0;
    const opCode = buf[offset++];
    if (opCode !== OpCode.REF_CLASS) return undefined;

    const fqDecode = decodeVarint(buf, offset);
    offset = fqDecode.next;

    const propDecode = decodeVarint(buf, offset);
    const propCount = propDecode.value;
    offset = propDecode.next;

    let props: { name: string; type: number; flags: number }[] = [];
    for (let i = 0; i < propCount; i++) {
      const nameIdxDecode = decodeVarint(buf, offset);
      const nameIdx = nameIdxDecode.value;
      offset = nameIdxDecode.next;

      const typeDecode = decodeVarint(buf, offset);
      const typeCode = typeDecode.value;
      offset = typeDecode.next;

      const flagsDecode = decodeVarint(buf, offset);
      const flags = flagsDecode.value;
      offset = flagsDecode.next;

      // Skip member decorators
      const decoCountDecode = decodeVarint(buf, offset);
      const decoCount = decoCountDecode.value;
      offset = decoCountDecode.next;
      for (let d = 0; d < decoCount; d++) {
        offset = decodeVarint(buf, offset).next; // deco name
        const argCount = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let a = 0; a < argCount; a++) {
          offset = decodeVarint(buf, offset).next;
        }
      }
      // Skip parameters
      const paramCountDecode = decodeVarint(buf, offset);
      const paramCount = paramCountDecode.value;
      offset = paramCountDecode.next;
      for (let p = 0; p < paramCount; p++) {
        offset = decodeVarint(buf, offset).next; // param name
        offset = decodeVarint(buf, offset).next; // param type
        const paramDecoCount = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let pd = 0; pd < paramDecoCount; pd++) {
          offset = decodeVarint(buf, offset).next;
          const argCt = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          for (let pa = 0; pa < argCt; pa++) {
            offset = decodeVarint(buf, offset).next;
          }
        }
      }

      const propName = this.store.getStrings()[nameIdx];
      props.push({ name: propName, type: typeCode, flags });
    }
    return props;
  }

  getDecorators(
    typeName: string
  ): { name: string; args: string[] }[] | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);

    let offset = 0;
    const op = buf[offset++];

    // fqName
    offset = decodeVarint(buf, offset).next;

    // Skip to decorators block:
    if (op === OpCode.REF_CLASS) {
      const propCt = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      for (let i = 0; i < propCt; i++) {
        // for each property: skip name, type, flags, decorators, parameters (see serializer layout)
        for (let v = 0; v < 3; v++) offset = decodeVarint(buf, offset).next;
        let decoCount = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let d = 0; d < decoCount; d++) {
          offset = decodeVarint(buf, offset).next;
          let argsCt = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          for (let a = 0; a < argsCt; a++) {
            offset = decodeVarint(buf, offset).next;
          }
        }
        const paramCt = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let p = 0; p < paramCt; p++) {
          offset = decodeVarint(buf, offset).next;
          offset = decodeVarint(buf, offset).next;
          let pc = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          for (let pd = 0; pd < pc; pd++) {
            offset = decodeVarint(buf, offset).next;
            let pac = decodeVarint(buf, offset).value;
            offset = decodeVarint(buf, offset).next;
            for (let pda = 0; pda < pac; pda++) {
              offset = decodeVarint(buf, offset).next;
            }
          }
        }
      }
    } else if (op === OpCode.REF_FUNCTION) {
      const paramCt = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      for (let i = 0; i < paramCt; i++) {
        offset = decodeVarint(buf, offset).next;
        offset = decodeVarint(buf, offset).next;
        let pc = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let d = 0; d < pc; d++) {
          offset = decodeVarint(buf, offset).next;
          let argCt = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          for (let k = 0; k < argCt; k++) {
            offset = decodeVarint(buf, offset).next;
          }
        }
      }
      offset = decodeVarint(buf, offset).next; // returnType
    } else {
      return undefined;
    }

    // Generics
    const genCt = decodeVarint(buf, offset).value;
    offset = decodeVarint(buf, offset).next;
    for (let i = 0; i < genCt; i++) offset = decodeVarint(buf, offset).next;

    // Now at decorators block
    const decoCount = decodeVarint(buf, offset).value;
    offset = decodeVarint(buf, offset).next;
    const result: { name: string; args: string[] }[] = [];
    for (let i = 0; i < decoCount; i++) {
      const nameIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const argCount = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const args: string[] = [];
      for (let j = 0; j < argCount; j++) {
        const argIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        args.push(this.store.getStrings()[argIdx]);
      }
      result.push({ name: this.store.getStrings()[nameIdx], args });
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

    let offset = 0;
    const op = buf[offset++];
    if (op !== OpCode.REF_FUNCTION) return undefined;

    offset = decodeVarint(buf, offset).next;

    const paramCtDecode = decodeVarint(buf, offset);
    const paramCount = paramCtDecode.value;
    offset = paramCtDecode.next;

    const params: {
      name: string;
      type: number;
      decorators: { name: string; args: string[] }[];
    }[] = [];
    for (let i = 0; i < paramCount; i++) {
      const nameIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const typeCode = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const decoCount = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const decorators: { name: string; args: string[] }[] = [];
      for (let j = 0; j < decoCount; j++) {
        const decoNameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const argCount = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const args: string[] = [];
        for (let k = 0; k < argCount; k++) {
          const argIdx = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          args.push(this.store.getStrings()[argIdx]);
        }
        decorators.push({ name: this.store.getStrings()[decoNameIdx], args });
      }
      params.push({
        name: this.store.getStrings()[nameIdx],
        type: typeCode,
        decorators,
      });
    }
    return params;
  }

  getBaseTypes(typeName: string): string[] | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);

    let offset = 0;
    const opCode = buf[offset++];

    // fqName
    offset = decodeVarint(buf, offset).next;

    if (opCode === OpCode.REF_CLASS) {
      // skip all type properties, as in getTypePropertiesWithFlags above
      const propDecode = decodeVarint(buf, offset);
      const propCt = propDecode.value;
      offset = propDecode.next;
      for (let i = 0; i < propCt; i++) {
        for (let v = 0; v < 3; v++) offset = decodeVarint(buf, offset).next;
        let decoCount = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let d = 0; d < decoCount; d++) {
          offset = decodeVarint(buf, offset).next;
          let argsCt = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          for (let a = 0; a < argsCt; a++) {
            offset = decodeVarint(buf, offset).next;
          }
        }
        const paramCt = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let p = 0; p < paramCt; p++) {
          offset = decodeVarint(buf, offset).next;
          offset = decodeVarint(buf, offset).next;
          let pc = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          for (let pd = 0; pd < pc; pd++) {
            offset = decodeVarint(buf, offset).next;
            let pac = decodeVarint(buf, offset).value;
            offset = decodeVarint(buf, offset).next;
            for (let pda = 0; pda < pac; pda++) {
              offset = decodeVarint(buf, offset).next;
            }
          }
        }
      }
      // generics
      const genCt = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      for (let i = 0; i < genCt; i++) offset = decodeVarint(buf, offset).next;
      // decorators
      const decoCt = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      for (let d = 0; d < decoCt; d++) {
        offset = decodeVarint(buf, offset).next;
        let argCt = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let a = 0; a < argCt; a++) {
          offset = decodeVarint(buf, offset).next;
        }
      }
    }
    // Now at bases block:
    const baseCount = decodeVarint(buf, offset).value;
    offset = decodeVarint(buf, offset).next;
    const bases: string[] = [];
    for (let i = 0; i < baseCount; i++) {
      const baseIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      bases.push(this.store.getStrings()[baseIdx]);
    }
    return bases;
  }

  getEntryDecoded(typeName: string): any | undefined {
    const entry = this.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = this.store.getMetadataBuffer(entry);
    return decodeRTTIEntry(buf, (idx) => this.store.getStrings()[idx]);
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
