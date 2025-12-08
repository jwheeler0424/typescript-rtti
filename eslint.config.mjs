import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  {
    rules: {
      ...tseslint.configs.recommended,
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^(?:_|...)",
          varsIgnorePattern: "^(?:_|...)",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "sort-imports": [
        "error",
        {
          ignoreCase: false,
          ignoreDeclarationSort: true, // use eslint-plugin-import to handle this rule
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
          allowSeparatedGroups: true,
        },
      ],
      "import/no-named-as-default-member": "off",
      "import/namespace": "off",
      "import/order": [
        "error",
        {
          groups: [
            "builtin", // Built-in imports
            "external", // External imports
            "internal", // Absolute imports
            ["sibling", "parent"], // Relative imports
            "index", // index imports
            "unknown",
          ],
          // Keep all the `react` imports at the top level
          pathGroups: [
            { pattern: "react", group: "builtin", position: "before" },
          ],
          "newlines-between": "always",
          alphabetize: {
            // sort in ascending order
            order: "asc",
            caseInsensitive: true,
          },
          // Exclude `react` imports so that our custom pathGroups applies
          pathGroupsExcludedImportTypes: ["react"],
        },
      ],
      "tsdoc/syntax": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "static/**",
    "__tests__/**",
  ]),
]);

export default eslintConfig;
