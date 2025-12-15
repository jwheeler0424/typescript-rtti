import {
  encodeVarint,
  fnv1aHash,
  IndexEntry,
  OpCode,
  StringTable,
} from "./protocol";
import {
  RTTIConditionalMetadata,
  RTTIDecorator,
  RTTIMappedMetadata,
  RTTIMetadata,
  RTTIMethodOverload,
  RTTITypeRef,
  RTTIUnionMetadata,
} from "./types";

// --------- RTTITypeRef Serializer Helper -----------
function serializeRTTITypeRef(
  ref: RTTITypeRef,
  stringTable: StringTable
): Uint8Array[] {
  if (ref.kind === "primitive") {
    return [encodeVarint(0), encodeVarint(ref.type)];
  } else {
    return [encodeVarint(1), encodeVarint(stringTable.add(ref.fqName))];
  }
}

// ----- Decorator Serializer -----
function serializeDecoratorList(
  decos: RTTIDecorator[],
  stringTable: StringTable
): Uint8Array[] {
  const out: Uint8Array[] = [encodeVarint(decos.length)];
  for (const deco of decos) {
    const decoNameIdx = stringTable.add(deco.name);
    out.push(encodeVarint(decoNameIdx));
    out.push(encodeVarint(deco.args.length));
    for (const arg of deco.args) {
      const argIdx = stringTable.add(arg);
      out.push(encodeVarint(argIdx));
    }
  }
  return out;
}

// ----- Method Overload Serializer -----
function serializeMethodOverload(
  overload: RTTIMethodOverload,
  stringTable: StringTable
): Uint8Array[] {
  const buf: Uint8Array[] = [];
  // Params
  buf.push(encodeVarint(overload.params.length));
  for (const param of overload.params) {
    const paramNameIdx = stringTable.add(param.name);
    buf.push(encodeVarint(paramNameIdx));
    buf.push(...serializeRTTITypeRef(param.type, stringTable));
    buf.push(...serializeDecoratorList(param.decorators, stringTable));
  }
  // Return type
  buf.push(...serializeRTTITypeRef(overload.returnType, stringTable));
  // Method-level decorators on this overload (not the main method)
  buf.push(...serializeDecoratorList(overload.decorators, stringTable));
  return buf;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

export class RTTISerializer {
  stringTable: StringTable = new StringTable();
  index: IndexEntry[] = [];
  heapBuffers: Uint8Array[] = [];
  currentHeapOffset = 0;

  addType(meta: RTTIMetadata): void {
    const stringOffset = this.stringTable.add(meta.fqName);
    const hash = fnv1aHash(meta.fqName);
    const heapBuffer = this.serializeMetadata(meta);

    const entry: IndexEntry = {
      hash,
      stringOffset,
      dataOffset: this.currentHeapOffset,
      dataLength: heapBuffer.length,
    };
    this.index.push(entry);

    this.heapBuffers.push(heapBuffer);
    this.currentHeapOffset += heapBuffer.length;
  }

  serializeMetadata(meta: RTTIMetadata): Uint8Array {
    const chunks: Uint8Array[] = [];
    chunks.push(new Uint8Array([meta.kind]));
    // Always write fqName string index as varint
    chunks.push(encodeVarint(this.stringTable.getOffset(meta.fqName) ?? 0));

    // ----- PRIMITIVE -----
    if (meta.kind === OpCode.REF_PRIMITIVE) {
      chunks.push(encodeVarint(meta.data as number));
    }

    // ----- CLASS/INTERFACE -----
    if (meta.kind === OpCode.REF_CLASS || meta.kind === OpCode.REF_OBJECT) {
      const props: any[] = (meta.data as any).props ?? [];
      chunks.push(encodeVarint(props.length));
      for (const prop of props) {
        const nameIdx = this.stringTable.add(prop.name);
        chunks.push(encodeVarint(nameIdx));

        // RTTITypeRef!
        chunks.push(...serializeRTTITypeRef(prop.type, this.stringTable));

        chunks.push(encodeVarint(prop.flags ?? 0));

        // Member decorators
        const memberDecos: { name: string; args: string[] }[] =
          prop.decorators ?? [];
        chunks.push(encodeVarint(memberDecos.length));
        for (const deco of memberDecos) {
          const decoNameIdx = this.stringTable.add(deco.name);
          chunks.push(encodeVarint(decoNameIdx));
          chunks.push(encodeVarint(deco.args.length));
          for (const arg of deco.args) {
            const argIdx = this.stringTable.add(arg);
            chunks.push(encodeVarint(argIdx));
          }
        }

        // Parameters
        if (prop.parameters && Array.isArray(prop.parameters)) {
          chunks.push(encodeVarint(prop.parameters.length));
          for (const param of prop.parameters) {
            const paramNameIdx = this.stringTable.add(param.name);
            chunks.push(encodeVarint(paramNameIdx));
            chunks.push(...serializeRTTITypeRef(param.type, this.stringTable));

            const paramDecos: { name: string; args: string[] }[] =
              param.decorators ?? [];
            chunks.push(encodeVarint(paramDecos.length));
            for (const pDeco of paramDecos) {
              const pDecoNameIdx = this.stringTable.add(pDeco.name);
              chunks.push(encodeVarint(pDecoNameIdx));
              chunks.push(encodeVarint(pDeco.args.length));
              for (const arg of pDeco.args) {
                const argIdx = this.stringTable.add(arg);
                chunks.push(encodeVarint(argIdx));
              }
            }
          }
        } else {
          chunks.push(encodeVarint(0));
        }
      }

      // Generics
      const generics: any[] = (meta.data as any).generics ?? [];
      chunks.push(encodeVarint(generics.length));
      generics.forEach((genericParam) => {
        const nameIdx = this.stringTable.add(genericParam.name);
        chunks.push(encodeVarint(nameIdx));
        // Optionally: generic constraint?
        if (genericParam.constraint) {
          chunks.push(new Uint8Array([1]));
          chunks.push(
            ...serializeRTTITypeRef(genericParam.constraint, this.stringTable)
          );
        } else {
          chunks.push(new Uint8Array([0]));
        }
      });

      // Class/interface-level decorators
      const decos: { name: string; args: string[] }[] =
        (meta.data as any).decorators ?? [];
      chunks.push(encodeVarint(decos.length));
      for (const deco of decos) {
        const nameIdx = this.stringTable.add(deco.name);
        chunks.push(encodeVarint(nameIdx));
        chunks.push(encodeVarint(deco.args.length));
        deco.args.forEach((a) => {
          const argIdx = this.stringTable.add(a);
          chunks.push(encodeVarint(argIdx));
        });
      }

      // Inheritance (bases)
      const bases: string[] = (meta.data as any).bases ?? [];
      chunks.push(encodeVarint(bases.length));
      for (const b of bases) {
        const idx = this.stringTable.add(b);
        chunks.push(encodeVarint(idx));
      }
    }

    // ----- FUNCTION -----
    if (meta.kind === OpCode.REF_FUNCTION) {
      const { params, returnType, generics, decorators } = meta.data as any;
      chunks.push(encodeVarint(params.length));
      for (const param of params) {
        const nameIdx = this.stringTable.add(param.name);
        chunks.push(encodeVarint(nameIdx));

        chunks.push(...serializeRTTITypeRef(param.type, this.stringTable));

        const paramDecos: { name: string; args: string[] }[] =
          param.decorators ?? [];
        chunks.push(encodeVarint(paramDecos.length));
        for (const deco of paramDecos) {
          const decoNameIdx = this.stringTable.add(deco.name);
          chunks.push(encodeVarint(decoNameIdx));
          chunks.push(encodeVarint(deco.args.length));
          for (const arg of deco.args) {
            const argIdx = this.stringTable.add(arg);
            chunks.push(encodeVarint(argIdx));
          }
        }
      }
      // Return type
      chunks.push(...serializeRTTITypeRef(returnType, this.stringTable));

      // Generics
      chunks.push(encodeVarint(generics.length));
      for (const genericParam of generics) {
        const nameIdx = this.stringTable.add(genericParam.name);
        chunks.push(encodeVarint(nameIdx));
        if (genericParam.constraint) {
          chunks.push(new Uint8Array([1]));
          chunks.push(
            ...serializeRTTITypeRef(genericParam.constraint, this.stringTable)
          );
        } else {
          chunks.push(new Uint8Array([0]));
        }
      }

      // Function-level decorators
      const decos: { name: string; args: string[] }[] = decorators ?? [];
      chunks.push(encodeVarint(decos.length));
      for (const deco of decos) {
        const nameIdx = this.stringTable.add(deco.name);
        chunks.push(encodeVarint(nameIdx));
        chunks.push(encodeVarint(deco.args.length));
        deco.args.forEach((a) => {
          const argIdx = this.stringTable.add(a);
          chunks.push(encodeVarint(argIdx));
        });
      }
    }

    // ----- ENUM -----
    if (meta.kind === OpCode.REF_ENUM) {
      const members: { name: string; value: string | number }[] =
        (meta.data as any).members ?? [];
      chunks.push(encodeVarint(members.length));
      for (const m of members) {
        const nameIdx = this.stringTable.add(m.name);
        chunks.push(encodeVarint(nameIdx));
        if (typeof m.value === "number") {
          chunks.push(new Uint8Array([0xff]));
          const valBuf = new Uint8Array(4);
          new DataView(valBuf.buffer).setInt32(0, m.value, true);
          chunks.push(valBuf);
        } else {
          const strBytes = new TextEncoder().encode(String(m.value));
          chunks.push(encodeVarint(strBytes.length));
          chunks.push(strBytes);
        }
      }
    }

    // ----- UNION/INTERSECTION -----
    if (
      meta.kind === OpCode.REF_UNION ||
      meta.kind === OpCode.REF_INTERSECTION
    ) {
      const members: RTTITypeRef[] =
        (meta.data as RTTIUnionMetadata["data"]).members ?? [];
      chunks.push(encodeVarint(members.length));
      for (const ref of members) {
        chunks.push(...serializeRTTITypeRef(ref, this.stringTable));
      }
    }

    if (meta.kind === OpCode.REF_MAPPED) {
      const { keyName, keyConstraint, valueType } =
        meta.data as RTTIMappedMetadata["data"];
      const keyNameIdx = this.stringTable.add(keyName);
      chunks.push(encodeVarint(keyNameIdx));
      // keyConstraint RTTITypeRef (maybe null)
      if (keyConstraint) {
        chunks.push(new Uint8Array([1]));
        chunks.push(...serializeRTTITypeRef(keyConstraint, this.stringTable));
      } else {
        chunks.push(new Uint8Array([0]));
      }
      chunks.push(...serializeRTTITypeRef(valueType, this.stringTable));
    }

    if (meta.kind === OpCode.REF_CONDITIONAL) {
      const { checkType, extendsType, trueType, falseType } =
        meta.data as RTTIConditionalMetadata["data"];
      chunks.push(...serializeRTTITypeRef(checkType, this.stringTable));
      chunks.push(...serializeRTTITypeRef(extendsType, this.stringTable));
      chunks.push(...serializeRTTITypeRef(trueType, this.stringTable));
      chunks.push(...serializeRTTITypeRef(falseType, this.stringTable));
    }

    // Optionally, your alias/generic "pointer" nodes
    if (meta.kind === OpCode.REF_GENERIC && (meta.data as any).base) {
      const baseIdx = this.stringTable.add((meta.data as any).base);
      chunks.push(encodeVarint(baseIdx));
      const args: RTTITypeRef[] = (meta.data as any).args || [];
      chunks.push(encodeVarint(args.length));
      for (const arg of args) {
        chunks.push(...serializeRTTITypeRef(arg, this.stringTable));
      }
    }

    return concatUint8Arrays(chunks);
  }

  buildBinarySections(): {
    stringTableBuffer: Uint8Array;
    indexBuffer: Uint8Array;
    heapBuffer: Uint8Array;
  } {
    const strings = this.stringTable
      .entries()
      .map(([str]) => new TextEncoder().encode(str + "\0"));
    const stringTableBuffer = concatUint8Arrays(strings);

    const indexBuffer = Buffer.alloc(this.index.length * 24);
    this.index.forEach((entry, i) => {
      indexBuffer.writeUInt32LE(entry.hash, i * 24 + 0);
      indexBuffer.writeUInt32LE(entry.stringOffset, i * 24 + 8);
      indexBuffer.writeUInt32LE(entry.dataOffset, i * 24 + 12);
      indexBuffer.writeUInt32LE(entry.dataLength, i * 24 + 16);
    });

    const heapBuffer = concatUint8Arrays(this.heapBuffers);

    return { stringTableBuffer, indexBuffer, heapBuffer };
  }
}
