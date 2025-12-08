import fs from "fs";
import lz4 from "lz4js";
import { OpCode } from "./protocol.js"; // Modern ESM import

function decodeHeader(buf: Buffer) {
  return {
    magic: buf.readUInt32LE(0),
    version: buf.readUInt16LE(4),
    bitmap: buf.readUInt16LE(6),
    stringTableSize: buf.readUInt32LE(8),
    indexTableSize: buf.readUInt32LE(12),
    heapSize: buf.readUInt32LE(16),
    reserved: buf.subarray(20, 32),
  };
}

async function main(): Promise<void> {
  const file = process.argv[2] || "metadata.bin";
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(file);

  // Parse protocol header
  const header = decodeHeader(buf);
  if (header.magic !== 0x4d455441) {
    console.error("Invalid magic; not a META file.");
    process.exit(1);
  }
  console.log("RTTI Metadata Sidecar Inspector");
  console.log(`Version: ${header.version}`);
  console.log(`Feature bitmap: 0x${header.bitmap.toString(16)}`);
  console.log(`String table bytes: ${header.stringTableSize}`);
  console.log(`Index table bytes: ${header.indexTableSize}`);
  console.log(`Compressed heap bytes: ${header.heapSize}`);

  // Parse sidecar sections using Buffer.subarray (Node v20+ safe)
  let offset = 32;
  const stringTableBuf = buf.subarray(offset, offset + header.stringTableSize);
  offset += header.stringTableSize;
  const indexBuf = buf.subarray(offset, offset + header.indexTableSize);
  offset += header.indexTableSize;
  const compressedHeapBuf = buf.subarray(offset, offset + header.heapSize);

  // Decompress heap with lz4js (pure JS, cross platform)
  const heapBuf = Buffer.from(
    lz4.decompress(Uint8Array.from(compressedHeapBuf))
  );

  // Decode string table: null-terminated UTF-8 strings
  const strings: string[] = [];
  let pos = 0;
  while (pos < stringTableBuf.length) {
    let end = stringTableBuf.indexOf(0, pos);
    if (end === -1) end = stringTableBuf.length;
    strings.push(stringTableBuf.subarray(pos, end).toString("utf8"));
    pos = end + 1;
  }

  // Parse index entries (24 bytes each)
  const entrySize = 24;
  const typeEntries: {
    fqName: string;
    kind: number;
    dataOffset: number;
    dataLength: number;
  }[] = [];
  for (let i = 0; i < indexBuf.length; i += entrySize) {
    // Offsets strictly match protocol definition
    const hash = indexBuf.readUInt32LE(i);
    const stringOffset = indexBuf.readUInt32LE(i + 8);
    const dataOffset = indexBuf.readUInt32LE(i + 12);
    const dataLength = indexBuf.readUInt32LE(i + 16);

    const fqName = strings[stringOffset] ?? "<unknown>";
    typeEntries.push({ fqName, kind: 0, dataOffset, dataLength });
  }

  // Print all RTTI entries with decoded kind from decompressed heap
  console.log(`Discovered ${typeEntries.length} entries:`);
  typeEntries.forEach((entry, idx) => {
    const kind = heapBuf.readUInt8(entry.dataOffset);
    entry.kind = kind;
    const kindName = OpCode[kind] ?? "Unknown";
    console.log(
      `[${idx}] ${entry.fqName} : ${kindName} (offset: ${entry.dataOffset}, len: ${entry.dataLength})`
    );
  });

  console.log("Done.");
}

// ESM main entrypoint
main();
