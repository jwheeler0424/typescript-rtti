import {
  encodeVarint,
  fnv1aHash,
  IndexEntry,
  OpCode,
  StringTable,
} from "./protocol";
import {
  RTTIConditionalMetadata,
  RTTIMappedMetadata,
  RTTIUnionMetadata,
  type RTTIMetadata,
} from "./types";

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
        chunks.push(encodeVarint(prop.type ?? 0));
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
            chunks.push(encodeVarint(param.type ?? 0));
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
      const generics: string[] = (meta.data as any).generics ?? [];
      chunks.push(encodeVarint(generics.length));
      generics.forEach((genericName) => {
        const nameIdx = this.stringTable.add(genericName);
        chunks.push(encodeVarint(nameIdx));
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
        chunks.push(encodeVarint(param.type));

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
      chunks.push(encodeVarint(returnType));
      // Generics
      chunks.push(encodeVarint(generics.length));
      for (const genericName of generics) {
        const nameIdx = this.stringTable.add(genericName);
        chunks.push(encodeVarint(nameIdx));
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
          // Write special tag, then as 4-bytes little-endian
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
      const members: string[] =
        (meta.data as RTTIUnionMetadata["data"]).members ?? [];
      chunks.push(encodeVarint(members.length));
      for (const m of members) {
        const idx = this.stringTable.add(m);
        chunks.push(encodeVarint(idx));
      }
    }

    if (meta.kind === OpCode.REF_MAPPED) {
      const { keyName, valueType } = meta.data as RTTIMappedMetadata["data"];
      const keyIdx = this.stringTable.add(keyName);
      const valIdx = this.stringTable.add(valueType);
      chunks.push(encodeVarint(keyIdx));
      chunks.push(encodeVarint(valIdx));
    }

    if (meta.kind === OpCode.REF_CONDITIONAL) {
      const { checkType, extendsType, trueType, falseType } =
        meta.data as RTTIConditionalMetadata["data"];
      chunks.push(encodeVarint(this.stringTable.add(checkType)));
      chunks.push(encodeVarint(this.stringTable.add(extendsType)));
      chunks.push(encodeVarint(this.stringTable.add(trueType)));
      chunks.push(encodeVarint(this.stringTable.add(falseType)));
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
      // Reserved section remains zeroed
    });

    const heapBuffer = concatUint8Arrays(this.heapBuffers);

    return { stringTableBuffer, indexBuffer, heapBuffer };
  }
}
