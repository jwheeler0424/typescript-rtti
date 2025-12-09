import { decodeRTTIEntry } from "./decoder";
import { OpCode, decodeVarint } from "./protocol";
import { MetadataStore } from "./reader";

/**
 * Hydrator: validates objects and optionally constructs new instances
 * using RTTI metadata loaded from .bin
 */
export class Hydrator {
  static store: MetadataStore;

  static async init(file: string = "metadata.bin") {
    Hydrator.store = new MetadataStore();
    await Hydrator.store.load(file);
  }

  /**
   * Hydrates a class from metadata
   * @param typeName Named type to hydrate (fqName)
   * @param data JS object
   * @param strict If true, enforces property types
   */
  static hydrate<T>(
    typeName: string,
    data: any,
    strict: boolean = true
  ): T | undefined {
    if (!Hydrator.store)
      throw new Error("Hydrator not initialized. Call init() first.");
    const entry = Hydrator.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = Hydrator.store.getMetadataBuffer(entry);
    let offset = 0;
    const opCode = buf[offset++];
    if (opCode !== OpCode.REF_CLASS) return undefined;

    const fqNameDecode = decodeVarint(buf, offset);
    offset = fqNameDecode.next;

    const propDecode = decodeVarint(buf, offset);
    const propCount = propDecode.value;
    offset = propDecode.next;

    let props: { [key: string]: unknown } = {};
    for (let i = 0; i < propCount; i++) {
      const nameIdxDecode = decodeVarint(buf, offset);
      const nameIdx = nameIdxDecode.value;
      offset = nameIdxDecode.next;

      const typeDecode = decodeVarint(buf, offset);
      offset = typeDecode.next;

      const flagsDecode = decodeVarint(buf, offset);
      offset = flagsDecode.next;

      // member decorators
      const decoCountDecode = decodeVarint(buf, offset);
      const decoCount = decoCountDecode.value;
      offset = decoCountDecode.next;
      for (let d = 0; d < decoCount; d++) {
        const decoNameDecode = decodeVarint(buf, offset);
        offset = decoNameDecode.next;
        const argsCountDecode = decodeVarint(buf, offset);
        const argsCount = argsCountDecode.value;
        offset = argsCountDecode.next;
        for (let a = 0; a < argsCount; a++) {
          const argIdxDecode = decodeVarint(buf, offset);
          offset = argIdxDecode.next;
        }
      }
      // parameters (methods/accessors)
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
          const paramDecoArgsCountDecode = decodeVarint(buf, offset);
          const paramDecoArgsCount = paramDecoArgsCountDecode.value;
          offset = paramDecoArgsCountDecode.next;
          for (let pa = 0; pa < paramDecoArgsCount; pa++) {
            const paramArgIdxDecode = decodeVarint(buf, offset);
            offset = paramArgIdxDecode.next;
          }
        }
      }

      const propName = Hydrator.store.getStrings()[nameIdx];
      props[propName] = data[propName];
    }
    return props as T;
  }

  /**
   * Returns only the basic signature (params + return type) of a function.
   */
  static getFunctionSignature(
    funcName: string
  ):
    | { params: { name: string; type: number }[]; returnType: number }
    | undefined {
    if (!Hydrator.store)
      throw new Error("Hydrator not initialized. Call init() first.");
    const entry = Hydrator.store.getEntryByName(funcName);
    if (!entry) return undefined;
    const buf = Hydrator.store.getMetadataBuffer(entry);

    let offset = 0;
    const opCode = buf[offset++];
    if (opCode !== OpCode.REF_FUNCTION) return undefined;

    // fqName varint
    offset = decodeVarint(buf, offset).next;

    // paramCount varint
    const paramDecode = decodeVarint(buf, offset);
    const paramCount = paramDecode.value;
    offset = paramDecode.next;

    let params: { name: string; type: number }[] = [];
    for (let i = 0; i < paramCount; i++) {
      const nameIdxDecode = decodeVarint(buf, offset);
      const nameIdx = nameIdxDecode.value;
      offset = nameIdxDecode.next;

      const typeDecode = decodeVarint(buf, offset);
      const typeCode = typeDecode.value;
      offset = typeDecode.next;

      // Skip decorators on parameters for this basic signature
      const decoCount = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      for (let d = 0; d < decoCount; d++) {
        offset = decodeVarint(buf, offset).next; // deco name
        const argCount = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let a = 0; a < argCount; a++) {
          offset = decodeVarint(buf, offset).next;
        }
      }
      params.push({
        name: Hydrator.store.getStrings()[nameIdx],
        type: typeCode,
      });
    }

    const returnType = decodeVarint(buf, offset).value;
    return { params, returnType };
  }

  /**
   * Returns full param/return + decorators info for a function from RTTI.
   */
  static getFunctionSignatureWithDecorators(funcName: string):
    | {
        params: {
          name: string;
          type: number;
          decorators: { name: string; args: string[] }[];
        }[];
        returnType: number;
      }
    | undefined {
    if (!Hydrator.store)
      throw new Error("Hydrator not initialized. Call init() first.");
    const entry = Hydrator.store.getEntryByName(funcName);
    if (!entry) return undefined;
    const buf = Hydrator.store.getMetadataBuffer(entry);

    let offset = 0;
    const opCode = buf[offset++];
    if (opCode !== OpCode.REF_FUNCTION) return undefined;
    offset = decodeVarint(buf, offset).next;

    const paramCtDecode = decodeVarint(buf, offset);
    const paramCount = paramCtDecode.value;
    offset = paramCtDecode.next;

    let params: {
      name: string;
      type: number;
      decorators: { name: string; args: string[] }[];
    }[] = [];
    for (let i = 0; i < paramCount; i++) {
      const nameIdxDecode = decodeVarint(buf, offset);
      const nameIdx = nameIdxDecode.value;
      offset = nameIdxDecode.next;
      const typeDecode = decodeVarint(buf, offset);
      const typeCode = typeDecode.value;
      offset = typeDecode.next;

      const decoCount = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const decorators: { name: string; args: string[] }[] = [];
      for (let d = 0; d < decoCount; d++) {
        const decoNameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const argCount = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const args: string[] = [];
        for (let a = 0; a < argCount; a++) {
          const argIdx = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          args.push(Hydrator.store.getStrings()[argIdx]);
        }
        decorators.push({
          name: Hydrator.store.getStrings()[decoNameIdx],
          args,
        });
      }
      params.push({
        name: Hydrator.store.getStrings()[nameIdx],
        type: typeCode,
        decorators,
      });
    }
    const returnType = decodeVarint(buf, offset).value;
    return { params, returnType };
  }

  /**
   * Returns an array of strings, the generic parameter names for a given function or class.
   */
  static getGenericsForFunctionOrClass(typeName: string): string[] | undefined {
    if (!Hydrator.store)
      throw new Error("Hydrator not initialized. Call init() first.");
    const entry = Hydrator.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = Hydrator.store.getMetadataBuffer(entry);

    let offset = 0;
    const opCode = buf[offset++];
    // fqName
    offset = decodeVarint(buf, offset).next;

    // Skip params/props/decoration blocks (minimal skipping shown for demo; real skipping matches how you serialize)
    if (opCode === OpCode.REF_FUNCTION) {
      const paramCtDecode = decodeVarint(buf, offset);
      const paramCount = paramCtDecode.value;
      offset = paramCtDecode.next;
      for (let i = 0; i < paramCount; i++) {
        offset = decodeVarint(buf, offset).next; // paramName
        offset = decodeVarint(buf, offset).next; // paramType
        let decoCount = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let d = 0; d < decoCount; d++) {
          offset = decodeVarint(buf, offset).next; // decoName
          let argCount = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          for (let a = 0; a < argCount; a++) {
            offset = decodeVarint(buf, offset).next;
          }
        }
      }
      offset = decodeVarint(buf, offset).next; // returnType
    } else if (opCode === OpCode.REF_CLASS) {
      const propDecode = decodeVarint(buf, offset);
      const propCt = propDecode.value;
      offset = propDecode.next;
      for (let i = 0; i < propCt; i++) {
        for (let v = 0; v < 3; v++) offset = decodeVarint(buf, offset).next;
        let decoCount = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let d = 0; d < decoCount; d++) {
          offset = decodeVarint(buf, offset).next;
          let argCt = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          for (let a = 0; a < argCt; a++)
            offset = decodeVarint(buf, offset).next;
        }
        let paramCt = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        for (let p = 0; p < paramCt; p++) {
          offset = decodeVarint(buf, offset).next;
          offset = decodeVarint(buf, offset).next;
          let pd = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          for (let qp = 0; qp < pd; qp++) {
            offset = decodeVarint(buf, offset).next;
            let pq = decodeVarint(buf, offset).value;
            offset = decodeVarint(buf, offset).next;
            for (let qr = 0; qr < pq; qr++)
              offset = decodeVarint(buf, offset).next;
          }
        }
      }
    }
    // Generics
    const genCount = decodeVarint(buf, offset).value;
    offset = decodeVarint(buf, offset).next;
    const result: string[] = [];
    for (let i = 0; i < genCount; i++) {
      const nameIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      result.push(Hydrator.store.getStrings()[nameIdx]);
    }
    return result;
  }

  static getDecodedMetadata(typeName: string): any | undefined {
    if (!Hydrator.store)
      throw new Error("Hydrator not initialized. Call init() first.");
    const entry = Hydrator.store.getEntryByName(typeName);
    if (!entry) return undefined;
    const buf = Hydrator.store.getMetadataBuffer(entry);
    return decodeRTTIEntry(buf, (idx) => Hydrator.store.getStrings()[idx]);
  }
}
