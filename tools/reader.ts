import fs from "fs";
import lz4 from "lz4js";
import { decodeRTTIEntry } from "./decoder";
import { IndexEntry } from "./protocol";

export interface MetadataHeader {
  magic: number;
  version: number;
  bitmap: number;
  stringTableSize: number;
  indexTableSize: number;
  heapSize: number;
}

/**
 * Loads and queries RTTI metadata.bin at runtime.
 */
export class MetadataStore {
  private header!: MetadataHeader;
  private strings: string[] = [];
  private index: IndexEntry[] = [];
  private heap: Uint8Array = new Uint8Array(0);

  async load(filePath: string): Promise<void> {
    const buf = fs.readFileSync(filePath);
    this.header = {
      magic: buf.readUInt32LE(0),
      version: buf.readUInt16LE(4),
      bitmap: buf.readUInt16LE(6),
      stringTableSize: buf.readUInt32LE(8),
      indexTableSize: buf.readUInt32LE(12),
      heapSize: buf.readUInt32LE(16),
    };
    let offset = 32;
    const stringTableBuf = buf.subarray(
      offset,
      offset + this.header.stringTableSize
    );
    offset += this.header.stringTableSize;
    const indexBuf = buf.subarray(offset, offset + this.header.indexTableSize);
    offset += this.header.indexTableSize;
    const compressedHeap = buf.subarray(offset, offset + this.header.heapSize);

    this.heap = lz4.decompress(Uint8Array.from(compressedHeap));

    let pos = 0;
    while (pos < stringTableBuf.length) {
      let end = stringTableBuf.indexOf(0, pos);
      if (end === -1) end = stringTableBuf.length;
      this.strings.push(stringTableBuf.subarray(pos, end).toString("utf8"));
      pos = end + 1;
    }

    const entrySize = 24;
    for (let i = 0; i < indexBuf.length; i += entrySize) {
      this.index.push({
        hash: indexBuf.readUInt32LE(i),
        stringOffset: indexBuf.readUInt32LE(i + 8),
        dataOffset: indexBuf.readUInt32LE(i + 12),
        dataLength: indexBuf.readUInt32LE(i + 16),
      });
    }
  }

  getEntryByName(name: string): IndexEntry | undefined {
    const idx = this.strings.indexOf(name);
    if (idx === -1) return undefined;
    return this.index.find((e) => e.stringOffset === idx);
  }

  getEntryByHash(hash: number): IndexEntry | undefined {
    return this.index.find((e) => e.hash === hash);
  }

  getMetadataBuffer(entry: IndexEntry): Uint8Array {
    return this.heap.subarray(
      entry.dataOffset,
      entry.dataOffset + entry.dataLength
    );
  }

  getDecodedEntryByName(name: string): any | undefined {
    const entry = this.getEntryByName(name);
    if (!entry) return undefined;
    const buf = this.getMetadataBuffer(entry);
    return decodeRTTIEntry(buf, (idx) => this.getStrings()[idx]);
  }

  listTypes(): string[] {
    return this.strings.filter((_, i) =>
      this.index.some((e) => e.stringOffset === i)
    );
  }

  getStrings(): string[] {
    return this.strings;
  }
}
