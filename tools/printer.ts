/**
 * Pretty-prints a decoded RTTIMetadata entry from decodeRTTIEntry.
 */
function prettyPrintTypeRef(ref: any): string {
  if (!ref) return "<unknown>";
  if (ref.kind === "primitive") return `#${ref.type}`;
  if (ref.kind === "ref") return `[${ref.fqName}]`;
  return JSON.stringify(ref);
}

function prettyPrintParameters(params: any[], indent: string): string {
  if (!params || !Array.isArray(params)) return "";
  return params
    .map((param) => {
      let deco =
        param.decorators && param.decorators.length
          ? ` ${param.decorators
              .map(
                (d: { name: string; args: any[] }) =>
                  "@" +
                  d.name +
                  (d.args?.length ? "(" + d.args.join(", ") + ")" : "")
              )
              .join(" ")}`
          : "";
      return `${indent}- ${param.name}: ${prettyPrintTypeRef(
        param.type
      )}${deco}`;
    })
    .join("\n");
}

function prettyPrintMethodOverload(overload: any, indent = "  "): string {
  if (!overload) return "";
  let params = overload.params
    ? overload.params
        .map(
          (p: { name: any; type: any }) =>
            `${p.name}: ${prettyPrintTypeRef(p.type)}`
        )
        .join(", ")
    : "";
  let deco =
    overload.decorators && overload.decorators.length
      ? ` ${overload.decorators
          .map(
            (d: { name: string; args: any[] }) =>
              "@" +
              d.name +
              (d.args?.length ? "(" + d.args.join(", ") + ")" : "")
          )
          .join(" ")}`
      : "";
  let paramLines =
    overload.params &&
    overload.params.some(
      (p: { decorators: string | any[] }) => p.decorators?.length
    )
      ? "\n" + prettyPrintParameters(overload.params, indent + "    ")
      : "";
  return `${indent}- (${params}) => ${prettyPrintTypeRef(
    overload.returnType
  )}${deco}${paramLines}`;
}

export function prettyPrintRTTIEntry(rtti: any, name: string = ""): string {
  let s = name ? `[${name}]:\n` : "";
  switch (rtti.kind) {
    case 4: // REF_CLASS
    case 3: // REF_OBJECT
      s += `  type: ${rtti.kind === 4 ? "class" : "interface"}\n`;
      if (rtti.generics?.length) {
        s += `  generics: <${rtti.generics
          .map(
            (g: { name: string; constraint: any }) =>
              g.name +
              (g.constraint
                ? ` extends ${prettyPrintTypeRef(g.constraint)}`
                : "")
          )
          .join(", ")}>\n`;
      }
      if (rtti.bases && rtti.bases.length) {
        s += `  extends: ${rtti.bases.join(", ")}\n`;
      }
      if (rtti.decorators?.length) {
        s += `  decorators: ${rtti.decorators
          .map(
            (d: { name: string; args: any[] }) =>
              "@" +
              d.name +
              (d.args?.length ? "(" + d.args.join(", ") + ")" : "")
          )
          .join(" ")}\n`;
      }
      for (const prop of rtti.props || []) {
        if (prop.kind === "method" || prop.overloads || prop.implementation) {
          s += `  method: ${prop.name}\n`;
          if (prop.decorators?.length) {
            s += `    decorators: ${prop.decorators
              .map(
                (d: { name: string; args: any[] }) =>
                  "@" +
                  d.name +
                  (d.args?.length ? "(" + d.args.join(", ") + ")" : "")
              )
              .join(" ")}\n`;
          }
          if (prop.overloads) {
            s += `    overloads:\n`;
            for (const o of prop.overloads) {
              s += prettyPrintMethodOverload(o, "      ") + "\n";
            }
          }
          if (prop.implementation) {
            s += `    implementation:\n`;
            s +=
              prettyPrintMethodOverload(prop.implementation, "      ") + "\n";
          }
        } else if (prop.kind === "constructor") {
          s += `  constructor:\n`;
          s += prettyPrintParameters(prop.parameters, "    ") + "\n";
        } else {
          let pDecos = prop.decorators?.length
            ? ` ${prop.decorators
                .map(
                  (d: { name: string; args: any[] }) =>
                    "@" +
                    d.name +
                    (d.args?.length ? "(" + d.args.join(", ") + ")" : "")
                )
                .join(" ")}`
            : "";
          s += `  ${prop.kind === "accessor" ? "accessor" : "property"}: ${
            prop.name
          }: ${prettyPrintTypeRef(prop.type)}${pDecos}\n`;
          if (prop.parameters && prop.parameters.length) {
            s += prettyPrintParameters(prop.parameters, "    ") + "\n";
          }
        }
      }
      break;
    case 5: // REF_FUNCTION
      s += "  type: function\n";
      if (rtti.generics?.length) {
        s += `  generics: <${rtti.generics
          .map(
            (g: { name: string; constraint: any }) =>
              g.name +
              (g.constraint
                ? ` extends ${prettyPrintTypeRef(g.constraint)}`
                : "")
          )
          .join(", ")}>\n`;
      }
      s += `  params:\n${prettyPrintParameters(rtti.params, "    ")}\n`;
      s += `  returns: ${prettyPrintTypeRef(rtti.returnType)}\n`;
      if (rtti.decorators?.length) {
        s += `  decorators: ${rtti.decorators
          .map(
            (d: { name: string; args: any[] }) =>
              "@" +
              d.name +
              (d.args?.length ? "(" + d.args.join(", ") + ")" : "")
          )
          .join(" ")}\n`;
      }
      break;
    case 7: // UNION
      s += "  type: union\n  members:\n";
      s +=
        (rtti.members || [])
          .map((ref: any) => `    - ${prettyPrintTypeRef(ref)}`)
          .join("\n") + "\n";
      break;
    case 8: // INTERSECTION
      s += "  type: intersection\n  members:\n";
      s +=
        (rtti.members || [])
          .map((ref: any) => `    - ${prettyPrintTypeRef(ref)}`)
          .join("\n") + "\n";
      break;
    case 9: // ENUM
      s += `  type: enum\n  members:\n`;
      s +=
        (rtti.members || [])
          .map(
            (m: { name: any; value: any }) =>
              `    - ${m.name} = ${JSON.stringify(m.value)}`
          )
          .join("\n") + "\n";
      break;
    case 11: // MAPPED
      s += `  type: mapped\n  key: ${
        rtti.keyName
      } constraint: ${prettyPrintTypeRef(
        rtti.keyConstraint
      )}\n  value: ${prettyPrintTypeRef(rtti.valueType)}\n`;
      break;
    case 12: // CONDITIONAL
      s += "  type: conditional\n";
      s += `    check: ${prettyPrintTypeRef(rtti.checkType)}\n`;
      s += `    extends: ${prettyPrintTypeRef(rtti.extendsType)}\n`;
      s += `    true: ${prettyPrintTypeRef(rtti.trueType)}\n`;
      s += `    false: ${prettyPrintTypeRef(rtti.falseType)}\n`;
      break;
    case 6: // GENERIC pointer/alias
      s += `  type: generic/alias\n  base: ${rtti.base}\n  args: [${(
        rtti.args || []
      )
        .map((a: any) => prettyPrintTypeRef(a))
        .join(", ")}]\n`;
      break;
    default:
      s += JSON.stringify(rtti, null, 2);
  }
  return s;
}
