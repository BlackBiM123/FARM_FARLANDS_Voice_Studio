import { rolldown } from "rolldown";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  cpSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const temp = mkdtempSync(join(tmpdir(), "farlands-clock-"));
try {
  const b = await rolldown({
    input: "src/world-defaults.ts",
    platform: "node",
  });
  await b.write({ file: join(temp, "defaults.mjs"), format: "esm" });
  const { createWorld } = await import(
    pathToFileURL(join(temp, "defaults.mjs")).href
  );
  const world = createWorld([
    { id: "npc_theo_hartley", name: "Тео Хартли" },
    { id: "npc_start_farm_martin_001", name: "Мартин Вейл" },
    { id: "npc_start_tavern_gideon_002", name: "Гидеон Брукс" },
  ]);
  mkdirSync(join(temp, "addons/farlands_world"), { recursive: true });
  for (const f of ["world_service.gd", "world_actor.gd"])
    cpSync("godot-integration/" + f, join(temp, "addons/farlands_world", f));
  cpSync(
    "simulation/world_core.gd",
    join(temp, "addons/farlands_world/world_core.gd"),
  );
  cpSync(
    "../../work/farm-and-farlands-audit/autoload/game_clock.gd",
    join(temp, "clock.gd"),
  );
  cpSync(
    "../../work/farm-and-farlands-audit/autoload/save_game.gd",
    join(temp, "save.gd"),
  );
  writeFileSync(join(temp, "world.json"), JSON.stringify(world));
  writeFileSync(
    join(temp, "bus.gd"),
    "extends Node\nsignal day_changed(day: int, season: StringName)\n",
  );
  writeFileSync(
    join(temp, "project.godot"),
    'config_version=5\n[application]\nrun/main_scene="res://main.tscn"\n[autoload]\nEventBus="*res://bus.gd"\nSaveGame="*res://save.gd"\nGameClock="*res://clock.gd"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n',
  );
  writeFileSync(
    join(temp, "main.tscn"),
    '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://tests.gd" id="1"]\n[node name="Tests" type="Node"]\nscript=ExtResource("1")\n',
  );
  writeFileSync(
    join(temp, "tests.gd"),
    readFileSync("godot-integration/test_clock.gd"),
  );
  for (const args of [
    ["--headless", "--path", temp, "--editor", "--import"],
    ["--headless", "--path", temp],
  ]) {
    const r = spawnSync(process.env.GODOT || "godot", args, {
      encoding: "utf8",
      timeout: 30000,
    });
    if (r.status !== 0 || /SCRIPT ERROR|FAIL:/.test(r.stdout + r.stderr))
      throw Error(r.stdout + r.stderr);
    console.log(
      r.stdout
        .split("\n")
        .filter((x) => /OK|Godot Engine/.test(x))
        .join("\n"),
    );
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
