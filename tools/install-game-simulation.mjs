import { rolldown } from "rolldown";
import {
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
const root = process.argv[2];
if (!root || !existsSync(root + "/project.godot"))
  throw Error("Укажите путь существующего проекта Godot");
mkdirSync(root + "/addons/farlands_world", { recursive: true });
mkdirSync(root + "/world", { recursive: true });
for (const f of [
  "world_service.gd",
  "world_actor.gd",
  "world_lab.gd",
  "world_lab.tscn",
  "README.md",
])
  copyFileSync("godot-integration/" + f, root + "/addons/farlands_world/" + f);
copyFileSync(
  "simulation/world_core.gd",
  root + "/addons/farlands_world/world_core.gd",
);
copyFileSync(
  "simulation/mechanics.gd",
  root + "/addons/farlands_world/mechanics.gd",
);
const b = await rolldown({ input: "src/world-defaults.ts", platform: "node" });
copyFileSync("simulation/life.gd", root + "/addons/farlands_world/life.gd");
await b.write({
  file: "node_modules/.cache/world-defaults.mjs",
  format: "esm",
});
const { createWorld } =
  await import("../node_modules/.cache/world-defaults.mjs");
if (!existsSync(root + "/world/definition.json"))
  writeFileSync(
    root + "/world/definition.json",
    JSON.stringify(
      createWorld([
        { id: "npc_theo_hartley", name: "Тео Хартли" },
        { id: "npc_start_farm_martin_001", name: "Мартин Вейл" },
        { id: "npc_start_tavern_gideon_002", name: "Гидеон Брукс" },
      ]),
      null,
      2,
    ),
  );
let config = readFileSync(root + "/project.godot", "utf8");
if (!config.includes("WorldSimulation="))
  config = config.replace(
    'GameClock="*res://autoload/game_clock.gd"',
    'GameClock="*res://autoload/game_clock.gd"\nWorldSimulation="*res://addons/farlands_world/world_service.gd"',
  );
writeFileSync(root + "/project.godot", config);
