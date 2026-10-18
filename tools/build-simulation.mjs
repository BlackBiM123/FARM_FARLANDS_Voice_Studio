import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
for (const directory of ["simulation", "godot-integration"]) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = entry.name;
    if (entry.isFile() && /\.(gd|tscn|godot|cfg|md)$/.test(file)) {
      const path = directory + "/" + file;
      writeFileSync(path, readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
    }
  }
}
const binary = process.env.GODOT;
if (!binary) throw Error("Укажите путь к Godot 4.7.1 в GODOT");
const run = spawnSync(
  binary,
  ["--headless", "--path", "simulation", "--export-release", "Web"],
  { encoding: "utf8", timeout: 120000 },
);
if (
  run.status !== 0 ||
  /SCRIPT ERROR|Parse Error/.test(run.stdout + run.stderr)
)
  throw Error(run.stdout + run.stderr);
writeFileSync(
  "public/simulation/engine.html",
  '<!doctype html><html><head><meta charset="utf-8"><title>Farlands simulation engine</title></head><body><canvas id="canvas" width="16" height="16" tabindex="-1"></canvas><script src="engine.js"></script><script src="launch.js"></script></body></html>',
);
mkdirSync("public/simulation/source", { recursive: true });
for (const file of [
  "world_core.gd",
  "run.gd",
  "project.godot",
  "web.gd",
  "web.tscn",
])
  writeFileSync(
    "public/simulation/source/" + file,
    readFileSync("simulation/" + file),
  );
mkdirSync("public/simulation/integration", { recursive: true });
for (const file of [
  "world_service.gd",
  "world_actor.gd",
  "world_lab.gd",
  "world_lab.tscn",
  "README.md",
])
  writeFileSync(
    "public/simulation/integration/" + file,
    readFileSync("godot-integration/" + file),
  );
const hashes = Object.fromEntries(
  ["world_core.gd", "web.gd"].map((f) => [
    f,
    createHash("sha256")
      .update(readFileSync("simulation/" + f))
      .digest("hex"),
  ]),
);
writeFileSync(
  "public/simulation/build.json",
  JSON.stringify(
    {
      coreVersion: "farlands-core-1",
      godot: "4.7.1",
      sources: hashes,
      pck: hash("public/simulation/engine.pck"),
    },
    null,
    2,
  ),
);
function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
console.log(
  "Единое ядро собрано для браузера; исходники и контрольные суммы обновлены.",
);
