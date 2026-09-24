import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";

function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (up) => {
      socket.destroy();
      resolve(up);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

if (await listening(5173)) {
  process.stdin.resume();
} else {
  const child = spawn("pnpm", ["dev"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
