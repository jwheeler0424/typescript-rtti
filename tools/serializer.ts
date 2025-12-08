import {
  fnv1aHash,
  IndexEntry,
  OpCode,
  PrimitiveType,
  StringTable,
} from "./protocol.js";

export interface RTTIMetadata {
  fqName: string;
  kind: OpCode;
  data: unknown;
}

export class RTTISerializer {
  stringTable: StringTable = new StringTable();
  index: IndexEntry[] = [];
  heapBuffers: Buffer[] = [];
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

  serializeMetadata(meta: RTTIMetadata): Buffer {
    const chunks: Buffer[] = [];
    chunks.push(Buffer.from([meta.kind]));

    chunks.push(Buffer.from([this.stringTable.getOffset(meta.fqName) ?? 0]));

    // ----- PRIMITIVE -----
    if (meta.kind === OpCode.REF_PRIMITIVE) {
      chunks.push(Buffer.from([meta.data as number]));
    }

    // ----- CLASS/INTERFACE -----
    if (meta.kind === OpCode.REF_CLASS || meta.kind === OpCode.REF_OBJECT) {
      // 1. Properties/methods/ctors/accessors
      const props: any[] = (meta.data as any).props ?? [];
      chunks.push(Buffer.from([props.length]));
      for (const prop of props) {
        const nameIdx = this.stringTable.add(prop.name);
        chunks.push(Buffer.from([nameIdx, prop.type ?? 0, prop.flags ?? 0]));

        // 2. Member decorators
        const memberDecos: { name: string; args: string[] }[] =
          prop.decorators ?? [];
        chunks.push(Buffer.from([memberDecos.length]));
        for (const deco of memberDecos) {
          const decoNameIdx = this.stringTable.add(deco.name);
          chunks.push(Buffer.from([decoNameIdx]));
          chunks.push(Buffer.from([deco.args.length]));
          for (const arg of deco.args) {
            const argIdx = this.stringTable.add(arg);
            chunks.push(Buffer.from([argIdx]));
          }
        }

        // 3. Parameters, only for methods/ctors/accessors
        if (prop.parameters && Array.isArray(prop.parameters)) {
          chunks.push(Buffer.from([prop.parameters.length]));
          for (const param of prop.parameters) {
            const paramNameIdx = this.stringTable.add(param.name);
            chunks.push(Buffer.from([paramNameIdx, param.type ?? 0]));
            // Parameter decorators
            const paramDecos: { name: string; args: string[] }[] =
              param.decorators ?? [];
            chunks.push(Buffer.from([paramDecos.length]));
            for (const pDeco of paramDecos) {
              const pDecoNameIdx = this.stringTable.add(pDeco.name);
              chunks.push(Buffer.from([pDecoNameIdx]));
              chunks.push(Buffer.from([pDeco.args.length]));
              for (const arg of pDeco.args) {
                const argIdx = this.stringTable.add(arg);
                chunks.push(Buffer.from([argIdx]));
              }
            }
          }
        } else {
          // No parameters
          chunks.push(Buffer.from([0]));
        }
      }

      // 4. Generics
      const generics: string[] = (meta.data as any).generics ?? [];
      chunks.push(Buffer.from([generics.length]));
      generics.forEach((genericName) => {
        const nameIdx = this.stringTable.add(genericName);
        chunks.push(Buffer.from([nameIdx]));
      });

      // 5. Class/interface-level decorators
      const decos: { name: string; args: string[] }[] =
        (meta.data as any).decorators ?? [];
      chunks.push(Buffer.from([decos.length]));
      for (const deco of decos) {
        const nameIdx = this.stringTable.add(deco.name);
        chunks.push(Buffer.from([nameIdx]));
        chunks.push(Buffer.from([deco.args.length]));
        deco.args.forEach((a) => {
          const argIdx = this.stringTable.add(a);
          chunks.push(Buffer.from([argIdx]));
        });
      }

      // 6. Inheritance (bases)
      const bases: string[] = (meta.data as any).bases ?? [];
      chunks.push(Buffer.from([bases.length]));
      for (const b of bases) {
        const idx = this.stringTable.add(b);
        chunks.push(Buffer.from([idx]));
      }
    }

    // ----- FUNCTION -----
    if (meta.kind === OpCode.REF_FUNCTION) {
      const { params, returnType, generics, decorators } = meta.data as any;
      chunks.push(Buffer.from([params.length]));
      for (const param of params) {
        const nameIdx = this.stringTable.add(param.name);
        chunks.push(Buffer.from([nameIdx, param.type]));

        // Parameter decorators
        const paramDecos: { name: string; args: string[] }[] =
          param.decorators ?? [];
        chunks.push(Buffer.from([paramDecos.length]));
        for (const deco of paramDecos) {
          const decoNameIdx = this.stringTable.add(deco.name);
          chunks.push(Buffer.from([decoNameIdx]));
          chunks.push(Buffer.from([deco.args.length]));
          for (const arg of deco.args) {
            const argIdx = this.stringTable.add(arg);
            chunks.push(Buffer.from([argIdx]));
          }
        }
      }
      chunks.push(Buffer.from([returnType]));
      // Generics
      const gen: string[] = generics ?? [];
      chunks.push(Buffer.from([gen.length]));
      gen.forEach((genericName) => {
        const nameIdx = this.stringTable.add(genericName);
        chunks.push(Buffer.from([nameIdx]));
      });

      // Function-level decorators
      const decos: { name: string; args: string[] }[] = decorators ?? [];
      chunks.push(Buffer.from([decos.length]));
      for (const deco of decos) {
        const nameIdx = this.stringTable.add(deco.name);
        chunks.push(Buffer.from([nameIdx]));
        chunks.push(Buffer.from([deco.args.length]));
        deco.args.forEach((a) => {
          const argIdx = this.stringTable.add(a);
          chunks.push(Buffer.from([argIdx]));
        });
      }
    }

    // ----- ENUM -----
    if (meta.kind === OpCode.REF_ENUM) {
      const members: { name: string; value: string | number }[] =
        (meta.data as any).members ?? [];
      chunks.push(Buffer.from([members.length]));
      for (const m of members) {
        const nameIdx = this.stringTable.add(m.name);
        chunks.push(Buffer.from([nameIdx]));
        if (typeof m.value === "number") {
          const valBuf = Buffer.alloc(4);
          valBuf.writeInt32LE(m.value, 0);
          chunks.push(valBuf);
        } else {
          const strBytes = Buffer.from(String(m.value), "utf8");
          chunks.push(Buffer.from([strBytes.length]));
          chunks.push(strBytes);
        }
      }
    }

    // ----- UNION/INTERSECTION -----
    if (
      meta.kind === OpCode.REF_UNION ||
      meta.kind === OpCode.REF_INTERSECTION
    ) {
      const members: string[] = (meta.data as any).members ?? [];
      chunks.push(Buffer.from([members.length]));
      for (const m of members) {
        const idx = this.stringTable.add(m);
        chunks.push(Buffer.from([idx]));
      }
    }

    return Buffer.concat(chunks);
  }

  buildBinarySections(): {
    stringTableBuffer: Buffer;
    indexBuffer: Buffer;
    heapBuffer: Buffer;
  } {
    const strings = this.stringTable
      .entries()
      .map(([str]) => Buffer.from(str + "\0", "utf8"));
    const stringTableBuffer = Buffer.concat(strings);

    const indexBuffer = Buffer.alloc(this.index.length * 24);
    this.index.forEach((entry, i) => {
      indexBuffer.writeUInt32LE(entry.hash, i * 24 + 0);
      indexBuffer.writeUInt32LE(entry.stringOffset, i * 24 + 8);
      indexBuffer.writeUInt32LE(entry.dataOffset, i * 24 + 12);
      indexBuffer.writeUInt32LE(entry.dataLength, i * 24 + 16);
      // Reserved section remains zeroed
    });

    const heapBuffer = Buffer.concat(this.heapBuffers);

    return { stringTableBuffer, indexBuffer, heapBuffer };
  }
}

// --- Example manual usage for dev/testing ---
if (process.env["SERIALIZER_DEMO"]) {
  const serializer = new RTTISerializer();
  serializer.addType({
    fqName: "User.id",
    kind: OpCode.REF_PRIMITIVE,
    data: PrimitiveType.Number,
  });
  serializer.addType({
    fqName: "User",
    kind: OpCode.REF_CLASS,
    data: {
      props: [
        { name: "id", type: PrimitiveType.Number },
        { name: "name", type: PrimitiveType.String },
      ],
    },
  });
  const sections = serializer.buildBinarySections();
  console.log("Demo string table bytes:", sections.stringTableBuffer.length);
  console.log("Demo index bytes:", sections.indexBuffer.length);
  console.log("Demo heap bytes:", sections.heapBuffer.length);
}
