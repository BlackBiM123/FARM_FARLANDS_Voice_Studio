import { rolldown } from "rolldown";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const dir = mkdtempSync(join(tmpdir(), "farlands-tests-"));
try {
  const bundle = await rolldown({
    input: "src/world-defaults.ts",
    platform: "node",
  });
  await bundle.write({ file: join(dir, "defaults.mjs"), format: "esm" });
  const { createWorld } = await import(
    pathToFileURL(join(dir, "defaults.mjs")).href
  );
  const world = createWorld([
    { id: "npc_theo_hartley", name: "Тео Хартли" },
    { id: "npc_start_farm_martin_001", name: "Мартин Вейл" },
    { id: "npc_start_tavern_gideon_002", name: "Гидеон Брукс" },
  ]);
  writeFileSync(join(dir, "world.json"), JSON.stringify(world));
  const result = spawnSync(
    process.env.GODOT || "godot",
    [
      "--headless",
      "--path",
      resolve("simulation"),
      "--script",
      "test_core.gd",
      "--",
      join(dir, "world.json"),
    ],
    { encoding: "utf8", timeout: 60000 },
  );
  console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  if (result.status !== 0 || /SCRIPT ERROR/.test(result.stdout + result.stderr))
    process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
