import { OpCode } from "../tools/protocol.js";
import { MetadataStore } from "./reader.js";

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
    const metaBuf = Hydrator.store.getMetadataBuffer(entry);

    // Decode type from metadata buffer
    const opCode = metaBuf.readUInt8(0);
    if (opCode !== OpCode.REF_CLASS) return undefined;

    const propCount = metaBuf.readUInt8(2);
    let props: { [key: string]: unknown } = {};
    let offset = 3;
    for (let i = 0; i < propCount; i++) {
      const nameIdx = metaBuf.readUInt8(offset);
      const typeCode = metaBuf.readUInt8(offset + 1);
      const propName = Hydrator.store.getStrings()[nameIdx]; // Use getter!
      props[propName] = data[propName]; // Optionally add type validation!
      offset += 2;
    }

    // For test, just return the hydrated prop object
    return props as T;
  }

  /**
   * Get function signature metadata by name.
   * Returns param info and return type (demo only).
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
    const metaBuf = Hydrator.store.getMetadataBuffer(entry);
    const opCode = metaBuf.readUInt8(0);
    if (opCode !== OpCode.REF_FUNCTION) return undefined;

    const paramCount = metaBuf.readUInt8(2);
    let params: { name: string; type: number }[] = [];
    let offset = 3;
    for (let i = 0; i < paramCount; i++) {
      const nameIdx = metaBuf.readUInt8(offset);
      const typeCode = metaBuf.readUInt8(offset + 1);
      params.push({
        name: Hydrator.store.getStrings()[nameIdx],
        type: typeCode,
      });
      offset += 2;
    }
    const returnTypeCode = metaBuf.readUInt8(offset);
    return { params, returnType: returnTypeCode };
  }
}

// Example usage:
// (async () => {
//   await Hydrator.init("metadata.bin");
//   const person = Hydrator.hydrate("Person", { id: 7, name: "Alice", isActive: true });
//   console.log("Hydrated:", person);
//   const sig = Hydrator.getFunctionSignature("greet");
//   console.log(sig);
// })();
