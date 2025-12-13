import fs from "fs";
import ts from "typescript";
const sf = ts.createSourceFile(
  "test.ts",
  fs.readFileSync("src/DecoratorDiagnostics.ts", "utf-8"),
  ts.ScriptTarget.ESNext
);
function walk(node: ts.Node) {
  if ((node as any).decorators) {
    console.log(
      "decorators at",
      ts.SyntaxKind[node.kind],
      (node as any).decorators
    );
  }
  node.forEachChild(walk);
}
walk(sf);
