import { decodeVarint, OpCode } from "./protocol";
import { PrimitiveType, RTTITypeRef } from "./types";

// --- RTTITypeRef decoder helper ---
function decodeRTTITypeRef(
  buf: Uint8Array,
  offset: number,
  getString: (idx: number) => string
): { ref: RTTITypeRef; next: number } {
  const tagDecode = decodeVarint(buf, offset);
  const tag = tagDecode.value;
  offset = tagDecode.next;
  if (tag === 0) {
    const primDecode = decodeVarint(buf, offset);
    offset = primDecode.next;
    return {
      ref: { kind: "primitive", type: primDecode.value as PrimitiveType },
      next: offset,
    };
  } else {
    const idxDecode = decodeVarint(buf, offset);
    offset = idxDecode.next;
    return {
      ref: { kind: "ref", fqName: getString(idxDecode.value) },
      next: offset,
    };
  }
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
      const members: any[] = [];
      const propCtDecode = decodeVarint(buf, offset);
      let propCount = propCtDecode.value;
      offset = propCtDecode.next;

      for (let i = 0; i < propCount; i++) {
        const nameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;

        // RTTITypeRef decode!
        const typeDecode = decodeRTTITypeRef(buf, offset, getString);
        const type = typeDecode.ref;
        offset = typeDecode.next;

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

            const ptypeDecode = decodeRTTITypeRef(buf, offset, getString);
            const ptype = ptypeDecode.ref;
            offset = ptypeDecode.next;

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
          type,
          flags,
          decorators,
          parameters,
        });
      }

      // Generics
      const genDecode = decodeVarint(buf, offset);
      const genericsCt = genDecode.value;
      offset = genDecode.next;
      const generics: any[] = [];
      for (let i = 0; i < genericsCt; i++) {
        const nameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        let constraint: RTTITypeRef | undefined = undefined;
        const hasConstraint = buf[offset++];
        if (hasConstraint) {
          const cret = decodeRTTITypeRef(buf, offset, getString);
          constraint = cret.ref;
          offset = cret.next;
        }
        generics.push({ name: getString(nameIdx), constraint });
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
      const paramCtDecode = decodeVarint(buf, offset);
      const paramCt = paramCtDecode.value;
      offset = paramCtDecode.next;

      const params: any[] = [];
      for (let i = 0; i < paramCt; i++) {
        const nameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;

        const typeRefDec = decodeRTTITypeRef(buf, offset, getString);
        const type = typeRefDec.ref;
        offset = typeRefDec.next;

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
      const returnTypeDec = decodeRTTITypeRef(buf, offset, getString);
      const returnType = returnTypeDec.ref;
      offset = returnTypeDec.next;

      // Generics
      const genDecode = decodeVarint(buf, offset);
      const genCt = genDecode.value;
      offset = genDecode.next;
      const generics: any[] = [];
      for (let i = 0; i < genCt; i++) {
        const nameIdx = decodeVarint(buf, offset).value;
        offset = decodeVarint(buf, offset).next;
        let constraint: RTTITypeRef | undefined = undefined;
        const hasConstraint = buf[offset++];
        if (hasConstraint) {
          const cret = decodeRTTITypeRef(buf, offset, getString);
          constraint = cret.ref;
          offset = cret.next;
        }
        generics.push({ name: getString(nameIdx), constraint });
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
      const members: RTTITypeRef[] = [];
      for (let i = 0; i < ct; i++) {
        const refDec = decodeRTTITypeRef(buf, offset, getString);
        members.push(refDec.ref);
        offset = refDec.next;
      }
      return { kind, members };
    }

    case OpCode.REF_MAPPED: {
      const keyIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      // keyConstraint:
      let keyConstraint: RTTITypeRef | null = null;
      const hasConstraint = buf[offset++];
      if (hasConstraint) {
        const cret = decodeRTTITypeRef(buf, offset, getString);
        keyConstraint = cret.ref;
        offset = cret.next;
      }
      const valueTypeDec = decodeRTTITypeRef(buf, offset, getString);
      const valueType = valueTypeDec.ref;
      offset = valueTypeDec.next;
      return {
        kind,
        keyName: getString(keyIdx),
        keyConstraint,
        valueType,
      };
    }

    case OpCode.REF_CONDITIONAL: {
      const checkTypeDec = decodeRTTITypeRef(buf, offset, getString);
      const checkType = checkTypeDec.ref;
      offset = checkTypeDec.next;

      const extendsTypeDec = decodeRTTITypeRef(buf, offset, getString);
      const extendsType = extendsTypeDec.ref;
      offset = extendsTypeDec.next;

      const trueTypeDec = decodeRTTITypeRef(buf, offset, getString);
      const trueType = trueTypeDec.ref;
      offset = trueTypeDec.next;

      const falseTypeDec = decodeRTTITypeRef(buf, offset, getString);
      const falseType = falseTypeDec.ref;
      offset = falseTypeDec.next;

      return {
        kind,
        checkType,
        extendsType,
        trueType,
        falseType,
      };
    }

    case OpCode.REF_GENERIC: {
      const baseIdx = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const argsCt = decodeVarint(buf, offset).value;
      offset = decodeVarint(buf, offset).next;
      const args: RTTITypeRef[] = [];
      for (let i = 0; i < argsCt; i++) {
        const argDec = decodeRTTITypeRef(buf, offset, getString);
        args.push(argDec.ref);
        offset = argDec.next;
      }
      return { kind, base: getString(baseIdx), args };
    }

    default:
      return { kind };
  }
}
