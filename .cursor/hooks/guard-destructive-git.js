#!/usr/bin/env node

let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  try {
    const { command = "" } = JSON.parse(input);
    const isHardReset = /\bgit\b[^;&|\n]*\breset\b[^;&|\n]*--hard\b/.test(
      command,
    );
    const isForcePush =
      /\bgit\b[^;&|\n]*\bpush\b[^;&|\n]*(?:--force(?:-with-lease)?\b|(?:^|\s)-f(?:\s|$))/.test(
        command,
      );

    if (isHardReset || isForcePush) {
      process.stdout.write(
        JSON.stringify({
          permission: "deny",
          user_message:
            "Blocked a destructive Git command. Use a non-destructive alternative or run it manually after review.",
          agent_message:
            "The project hook blocks hard resets and force pushes to protect local and remote work.",
        }),
      );
      return;
    }

    process.stdout.write(JSON.stringify({ permission: "allow" }));
  } catch {
    process.stderr.write("Could not parse beforeShellExecution input.\n");
    process.exitCode = 1;
  }
});
