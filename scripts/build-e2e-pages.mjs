import { execFileSync } from "node:child_process";

const command =
  process.platform === "win32"
    ? { file: "cmd.exe", args: ["/d", "/s", "/c", "npm run build"] }
    : { file: "sh", args: ["-c", "npm run build"] };

execFileSync(command.file, command.args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_PUBLIC_BASE_PATH: "/phrase-memory-2",
  },
  stdio: "inherit",
});
