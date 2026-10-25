import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

// Playwright owns this process tree. Never reuse an existing app or user database.
const server = spawn(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    resolve("../scripts/run-web.ps1"),
    "-Port",
    "18080",
    "-TcpPort",
    "18081",
    "-DatabasePath",
    `target/web-e2e/${randomUUID()}/cafelink.db`,
    "-OrderingMode",
    process.env.CAFELINK_E2E_GROUP === "v7" ? "prepay" : "postpay",
    ...(process.env.CAFELINK_E2E_GROUP === "policy" ? ["-AssetsPath","web/experiment-dist"] : []),
  ],
  { stdio: "inherit", windowsHide: true },
);
server.on("exit", (code) => process.exit(code ?? 1));
