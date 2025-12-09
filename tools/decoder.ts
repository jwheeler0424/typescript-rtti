import { decodeVarint, OpCode } from "./protocol"; // adjust path as needed

export interface RTTIClassMember {
  name: string;
  type: number;
  flags: number;
  decorators: { name: string; args: string[] }[];
  parameters?: {
    name: string;
    type: number;
    decorators: { name: string; args: string[] }[];
  }[];
}

export function decodeRTTIEntry(
  buf: Uint8Array,
  getString: (idx: number) => string
): any {
  let offset = 0;
  const kind = buf[offset++];
  // FQ name index (varint, usually can be skipped for external lookup)
  offset = decodeVarint(buf, offset).next;

  switch (kind) {
    case OpCode.REF_PRIMITIVE: {
      const value = decodeVarint(buf, offset).value;
      return { kind: OpCode.REF_PRIMITIVE, type: value };
    }

    case OpCode.REF_CLASS:
    case OpCode.REF_OBJECT: {
      const members: RTTIClassMember[] = [];
      const propCtDecode = decodeVarint(buf, offset);
      let propCount = propCtDecode.value;
      offset = propCtDecode.next;

      for (let i = 0; i < propCount; i++) {
        const nameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const typeCode = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const flags = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;

        // member decorators
        const decoCt = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const decorators: { name: string; args: string[] }[] = [];
        for (let d = 0; d < decoCt; d++) {
          const decoNameIdx = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          const argCount = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          const args: string[] = [];
          for (let a = 0; a < argCount; a++) {
            const argIdx = decodeVarint(buf, offset).value;
            offset = decodeVarint(buf, offset).next;
            args.push(getString(argIdx));
          }
          decorators.push({ name: getString(decoNameIdx), args });
        }

        // parameters (for methods, accessors, ctors)
        const paramCt = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        let parameters = undefined;
        if (paramCt > 0) {
          parameters = [];
          for (let p = 0; p < paramCt; p++) {
            const pnameIdx = decodeVarint(buf, offset).value;
            offset = decodeVarint(buf, offset).next;
            const ptype = decodeVarint(buf, offset).value;
            offset = decodeVarint(buf, offset).next;
            const pdecoCt = decodeVarint(buf, offset).value;
            offset = decodeVarint(buf, offset).next;
            const paramDecorators = [];
            for (let pd = 0; pd < pdecoCt; pd++) {
              const pname = decodeVarint(buf, offset).value;
              offset = decodeVarint(buf, offset).next;
              const argCt = decodeVarint(buf, offset).value;
              offset = decodeVarint(buf, offset).next;
              const pargs: string[] = [];
              for (let pa = 0; pa < argCt; pa++) {
                const aidx = decodeVarint(buf, offset).value;
                offset = decodeVarint(buf, offset).next;
                pargs.push(getString(aidx));
              }
              paramDecorators.push({ name: getString(pname), args: pargs });
            }
            parameters.push({
              name: getString(pnameIdx),
              type: ptype,
              decorators: paramDecorators,
            });
          }
        }
        members.push({
          name: getString(nameIdx),
          type: typeCode,
          flags,
          decorators,
          parameters,
        });
      }

      // Generics
      const genDecode = decodeVarint(buf, offset);
      const genericsCt = genDecode.value;
      offset = genDecode.next;
      const generics: string[] = [];
      for (let i = 0; i < genericsCt; i++) {
        const nameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        generics.push(getString(nameIdx));
      }

      // Type-level decorators
      const classDecoCt = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const typeDecorators: { name: string; args: string[] }[] = [];
      for (let i = 0; i < classDecoCt; i++) {
        const decoNameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const argCount = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const args: string[] = [];
        for (let j = 0; j < argCount; j++) {
          const argIdx = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          args.push(getString(argIdx));
        }
        typeDecorators.push({ name: getString(decoNameIdx), args });
      }

      // Bases/implements
      const baseCt = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const bases: string[] = [];
      for (let i = 0; i < baseCt; i++) {
        const baseIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        bases.push(getString(baseIdx));
      }

      return {
        kind,
        props: members,
        generics,
        decorators: typeDecorators,
        bases,
      };
    }

    case OpCode.REF_FUNCTION: {
      // Params
      const paramCtDecode = decodeVarint(buf, offset);
      const paramCt = paramCtDecode.value;
      offset = paramCtDecode.next;

      const params: {
        name: string;
        type: number;
        decorators: { name: string; args: string[] }[];
      }[] = [];
      for (let i = 0; i < paramCt; i++) {
        const nameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const type = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const decoCt = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const decorators: { name: string; args: string[] }[] = [];
        for (let j = 0; j < decoCt; j++) {
          const decoNameIdx = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          const argCount = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          const args: string[] = [];
          for (let a = 0; a < argCount; a++) {
            const argIdx = decodeVarint(buf, offset).value;
            offset = decodeVarint(buf, offset).next;
            args.push(getString(argIdx));
          }
          decorators.push({ name: getString(decoNameIdx), args });
        }
        params.push({ name: getString(nameIdx), type, decorators });
      }
      // Return type
      offset; // currently at next offset after all params
      const returnTypeDecode = decodeVarint(buf, offset); // FIX: this must advance offset
      const returnType = returnTypeDecode.value;
      offset = returnTypeDecode.next;

      // Generics
      const genDecode = decodeVarint(buf, offset);
      const genCt = genDecode.value;
      offset = genDecode.next;
      const generics: string[] = [];
      for (let i = 0; i < genCt; i++) {
        const idx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        generics.push(getString(idx));
      }

      // Function-level decorators
      const decoCt = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const decorators: { name: string; args: string[] }[] = [];
      for (let i = 0; i < decoCt; i++) {
        const decoNameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const argCt = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        const args: string[] = [];
        for (let a = 0; a < argCt; a++) {
          const argIdx = decodeVarint(buf, offset).value;
          offset = decodeVarint(buf, offset).next;
          args.push(getString(argIdx));
        }
        decorators.push({ name: getString(decoNameIdx), args });
      }
      return {
        kind,
        params,
        returnType,
        generics,
        decorators,
      };
    }

    case OpCode.REF_ENUM: {
      const members: { name: string; value: string | number }[] = [];
      const memberDecode = decodeVarint(buf, offset);
      const memberCount = memberDecode.value;
      offset = memberDecode.next;
      for (let i = 0; i < memberCount; i++) {
        const nameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        let value: string | number;
        // Custom protocol: 0xFF (number) OR varint (str len)
        if (buf[offset] === 0xff) {
          value =
            buf[offset + 1] |
            (buf[offset + 2] << 8) |
            (buf[offset + 3] << 16) |
            (buf[offset + 4] << 24);
          offset += 5;
        } else {
          const strLenDecode = decodeVarint(buf, offset);
          const strLen = strLenDecode.value;
          offset = strLenDecode.next;
          value = new TextDecoder().decode(buf.slice(offset, offset + strLen));
          offset += strLen;
        }
        members.push({ name: getString(nameIdx), value });
      }
      return { kind, members };
    }

    case OpCode.REF_UNION:
    case OpCode.REF_INTERSECTION: {
      const countDecode = decodeVarint(buf, offset);
      const ct = countDecode.value;
      offset = countDecode.next;
      const members: string[] = [];
      for (let i = 0; i < ct; i++) {
        const idx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        members.push(getString(idx));
      }
      return { kind, members };
    }

    case OpCode.REF_MAPPED: {
      const keyIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const valIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      return {
        kind,
        keyType: getString(keyIdx),
        valueType: getString(valIdx),
      };
    }

    case OpCode.REF_CONDITIONAL: {
      const checkIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const extendsIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const trueIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const falseIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      return {
        kind,
        checkType: getString(checkIdx),
        extendsType: getString(extendsIdx),
        trueType: getString(trueIdx),
        falseType: getString(falseIdx),
      };
    }

    default:
      return { kind };
  }
}
