import fs from "fs";
import ts from "typescript";
const sf = ts.createSourceFile(
  "test.ts",
  fs.readFileSync("src/User.ts", "utf-8"),
  ts.ScriptTarget.ESNext
);

function walkChildren(node: ts.Node, parent: ts.Node) {
  if (ts.isDecorator(node)) {
    console.log("parent at:", ts.SyntaxKind[parent.kind], parent.getText(sf));
    console.log(
      "child decorators at",
      ts.SyntaxKind[node.kind],
      node.getText(sf)
    );
    console.log({ node });
    node.forEachChild((childNode) => walkChildren(childNode, node));
  }
  const nodeParent = node.parent;
  if (nodeParent) {
    console.log(
      "node parent at:",
      ts.SyntaxKind[nodeParent.kind],
      nodeParent.getText(sf)
    );
  }
  // node.forEachChild((childNode) => walkChildren(childNode, node));
}

function walk(node: ts.Node) {
  if (ts.isClassDeclaration(node)) {
    console.log("class at", ts.SyntaxKind[node.kind], node.name?.getText(sf));
    node.forEachChild((childNode) => walkChildren(childNode, node));
  }
  // if (ts.isMethodDeclaration(node)) {
  //   console.log("method at", ts.SyntaxKind[node.kind], node.name?.getText(sf));
  //   node.forEachChild((childNode) => walkChildren(childNode, node));
  // }
  // if (ts.isPropertyDeclaration(node)) {
  //   console.log(
  //     "property at",
  //     ts.SyntaxKind[node.kind],
  //     node.name?.getText(sf)
  //   );
  //   node.forEachChild((childNode) => walkChildren(childNode, node));
  // }
  // if (ts.isDecorator(node)) {
  //   console.log("decorators at", ts.SyntaxKind[node.kind], node.getText(sf));
  //   console.log({ node });
  //   node.forEachChild((childNode) => walkChildren(childNode, node));
  // }
  node.forEachChild(walk);
  // const children = node.getChildren();
}

walk(sf);
