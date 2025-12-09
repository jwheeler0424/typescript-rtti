import fs from "fs";
import { decodeRTTIEntry } from "./decoder";
import { OpCode } from "./protocol";
import { MetadataStore } from "./reader";

// Load and parse the .bin file
async function main() {
  const file = process.argv[2] || "metadata.bin";
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  // Use MetadataStore with lz4 for heap decompression & string table parsing
  const store = new MetadataStore();
  await store.load(file);

  const allTypes = store.listTypes();

  console.log("=== RTTI Types Table ===");
  allTypes.forEach((fqName, idx) => {
    // Look up RTTI entry by fqName
    const entry = store.getEntryByName(fqName);
    if (!entry) return;
    // Get entry buffer (Uint8Array)
    const metaBuf = store.getMetadataBuffer(entry);
    // Universal decode (yields all fields; props, flags, generics, params, decorators, etc.)
    const decoded = decodeRTTIEntry(metaBuf, (idx) => store.getStrings()[idx]);
    // Print one-line summary, or verbose expand
    const kind = metaBuf[0];
    const kindName = OpCode[kind] ?? `OpCode(${kind})`;
    console.log(`\n------`);
    console.log(`• [${idx}] ${fqName}`);
    console.log(`  kind: ${kindName}`);
    console.log(`  FULL META:`);
    console.dir(decoded, { depth: 8, colors: true });
  });

  console.log("\nIntrospection done!");
}

main();
