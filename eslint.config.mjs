import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";

// Additive review plugins. All rules start at "warn" so they surface in lint
// reports + editor without breaking the build. Promote individual rules to
// "error" only after their findings have been triaged.
//
// See docs/adr/ for the rationale; introduced as part of the move-(A) OSS
// inventory work.
const reviewPlugins = defineConfig([
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { sonarjs, security },
    rules: {
      // sonarjs: code-smell + duplication detection. Recommended subset is
      // already ~50 rules; we keep the recommended set BUT force the
      // severity to "warn" so triage signal isn't equivalent to a build
      // break. Promote individual rules to "error" only after their
      // findings have been triaged.
      ...Object.fromEntries(
        Object.keys(sonarjs.configs.recommended.rules).map((k) => [k, "warn"]),
      ),
      // security: dangerous APIs (eval, child_process, unsafe regex, fs path
      // taint). Same warn-only stance.
      ...Object.fromEntries(
        Object.keys(security.configs.recommended.rules).map((k) => [k, "warn"]),
      ),
      // Noise overrides — set after the spreads so they win.
      // detect-object-injection flags ANY computed property access `obj[key]`
      // including legitimate Record / Map / array lookups. Industry-known
      // false-positive rule; disable to recover signal.
      "security/detect-object-injection": "off",
    },
  },
]);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...reviewPlugins,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / non-source surface.
    "src/generated/**",
    "src/proxy.ts",
  ]),
]);

export default eslintConfig;
