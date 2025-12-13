# typescript-rtti

TypeScript Binary Sidecar RTTI System  
_Phase 1 Scaffolding for Type Reflection & Metadata Extraction_

## Quickstart

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build project:

   ```bash
   npx tsc
   ```

3. Start developing in `/src`, `/tools`, `/lib`.

See `NOTES.md` for full architecture and implementation instructions.

## Commands For Testing

```bash
rm metadata.cache metadata.bin
```

```bash
npx tsx tools/compiler.ts
```

```bash
npx tsx tools/cli.ts metadata.bin
```
