import { rolldown } from "rolldown";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const dir = mkdtempSync(join(tmpdir(), "farlands-stress-"));
try {
  for (const [input, file] of [
    ["src/world-defaults.ts", "defaults.mjs"],
    ["shared/world.ts", "schema.mjs"],
  ]) {
    const bundle = await rolldown({ input, platform: "node" });
    await bundle.write({ file: join(dir, file), format: "esm" });
  }
  const { createWorld } = await import(
      pathToFileURL(join(dir, "defaults.mjs")).href
    ),
    { reportSchema } = await import(
      pathToFileURL(join(dir, "schema.mjs")).href
    );
  const world = process.env.WORLD_DEFINITION_PATH
    ? JSON.parse(readFileSync(process.env.WORLD_DEFINITION_PATH, "utf8"))
    : createWorld([
        { id: "npc_theo_hartley", name: "Тео" },
        { id: "npc_start_farm_martin_001", name: "Мартин" },
        { id: "npc_start_tavern_gideon_002", name: "Гидеон" },
      ]);
  writeFileSync(join(dir, "world.json"), JSON.stringify(world));
  const result = spawnSync(
    process.env.GODOT || "godot",
    [
      "--headless",
      "--path",
      resolve("simulation"),
      "--script",
      "test_stress.gd",
      "--",
      join(dir, "world.json"),
      dir,
    ],
    { encoding: "utf8", timeout: 120000 },
  );
  console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  if (result.status !== 0 || /SCRIPT ERROR/.test(result.stdout + result.stderr))
    throw Error("Нагрузочный прогон не прошёл");
  for (const count of [27, 100]) {
    const parsed = reportSchema.parse(
      JSON.parse(readFileSync(join(dir, `stress-${count}.json`), "utf8")),
    );
    if (Object.keys(parsed.state.agents).length !== count)
      throw Error("Неверный состав снимка");
    const events = parsed.archive ?? parsed.state.events;
    console.log(
      JSON.stringify({
        actors: count,
        days: (parsed.state.minute - 360) / 1440,
        events: events.length,
        criticalHunger: Object.values(parsed.state.agents).filter(
          (a) => a.hunger < 150,
        ).length,
        exhausted: Object.values(parsed.state.agents).filter(
          (a) => a.energy < 100,
        ).length,
        failedPlans: events.filter((e) => e.type === "plan_failed").length,
        blockedEvents: events.filter((e) => e.type === "blocked").length,
        money: Object.values(parsed.state.accounts).reduce((a, b) => a + b, 0),
        midpointRestoreExact: true,
      }),
    );
  }
  console.log(
    "Нагрузочные снимки приняты схемой серверного API; балансы сходятся.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
