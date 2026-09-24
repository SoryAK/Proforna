import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const resources = join(root, "web/src-tauri/resources");

rmSync(resources, { recursive: true, force: true });
mkdirSync(resources, { recursive: true });

const built = spawnSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
if (built.status !== 0) process.exit(built.status ?? 1);

await esbuild.build({
  entryPoints: [join(root, "server/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(resources, "server.mjs"),
});

const nodeBinary = join(resources, "node");
cpSync(process.execPath, nodeBinary);
chmodSync(nodeBinary, 0o755);
cpSync(join(root, "web/dist"), join(resources, "web"), { recursive: true });
