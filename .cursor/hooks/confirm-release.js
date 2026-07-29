#!/usr/bin/env node

let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  try {
    const { command = "" } = JSON.parse(input);
    const isRelease =
      /\byarn\s+(?:run\s+)?release(?::(?:test|next|latest))?(?=\s|$)/.test(
        command,
      );

    if (isRelease) {
      process.stdout.write(
        JSON.stringify({
          permission: "ask",
          user_message:
            "This command starts an Excalidraw release. Confirm the target tag and version before continuing.",
          agent_message:
            "The project hook requires user approval for release commands.",
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
