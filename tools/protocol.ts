export const META_MAGIC = 0x4d455441; // "META"
export const PROTOCOL_VERSION = 1;
export const FEATURE_BITMAP = 0x0001;
export const HEADER_SIZE = 32;
export const INDEX_ENTRY_SIZE = 24;

export enum OpCode {
  REF_PRIMITIVE = 1,
  REF_ARRAY = 2,
  REF_OBJECT = 3,
  REF_CLASS = 4,
  REF_FUNCTION = 5,
  REF_GENERIC = 6,
  REF_UNION = 7,
  REF_INTERSECTION = 8,
  REF_ENUM = 9,
  REF_LITERAL = 10,
  REF_MAPPED = 11,
  REF_CONDITIONAL = 12,
}

export enum PrimitiveType {
  Number = 1,
  String = 2,
  Boolean = 3,
  Null = 4,
  Undefined = 5,
  Symbol = 6,
  BigInt = 7,
  Any = 8,
  Unknown = 9,
}

export interface ProtocolHeader {
  magic: number;
  version: number;
  bitmap: number;
  stringTableSize: number;
  indexTableSize: number;
  dataHeapSize: number;
  reserved: number[]; // [6]
}

export interface IndexEntry {
  hash: number;
  stringOffset: number;
  dataOffset: number;
  dataLength: number;
}

export class StringTable {
  private strings = new Map<string, number>();
  private reverse: string[] = [];

  add(str: string): number {
    if (this.strings.has(str)) return this.strings.get(str)!;
    const idx = this.reverse.length;
    this.strings.set(str, idx);
    this.reverse.push(str);
    return idx;
  }

  getOffset(str: string): number | undefined {
    return this.strings.get(str);
  }

  getByOffset(offset: number): string | undefined {
    return this.reverse[offset];
  }

  entries(): [string, number][] {
    return Array.from(this.strings.entries());
  }
}

export function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0; // Node 20+ ok with Math.imul
  }
  return hash;
}

export function encodeVarint(num: number): Uint8Array {
  const arr: number[] = [];
  while (num > 127) {
    arr.push((num & 0x7f) | 0x80);
    num >>>= 7;
  }
  arr.push(num);
  return Uint8Array.from(arr);
}

export function decodeVarint(
  buf: Uint8Array,
  offset: number
): { value: number; next: number } {
  let value = 0,
    shift = 0,
    next = offset;
  while (true) {
    const b = buf[next++];
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value, next };
}

export function hasFeature(bitmap: number, featureMask: number): boolean {
  return (bitmap & featureMask) === featureMask;
}
