import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const root = process.argv[2];
if (!root) throw Error("Укажите путь игрового репозитория");
const items = [];
function walk(path) {
  for (const f of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, f.name);
    if (f.isDirectory()) walk(file);
    else if (f.name.endsWith(".tres")) {
      const s = readFileSync(file, "utf8"),
        id = s.match(/^id = &"([^"]+)"/m)?.[1];
      if (!id) continue;
      const value = (key, fallback) =>
        Number(
          s.match(new RegExp("^" + key + " = ([0-9.]+)", "m"))?.[1] ?? fallback,
        );
      items.push({
        id,
        name: s.match(/^display_name = "([^"]+)"/m)?.[1] ?? id,
        weight: value("unit_weight", 1),
        baseValue: value("base_value", 1),
        maxStack: value("max_stack", 1),
        source: file.slice(root.length + 1).replaceAll("\\", "/"),
      });
    }
  }
}
walk(root + "/data/items");
items.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(
  "public/simulation/item-catalog.json",
  JSON.stringify(
    {
      repository: "BlackBiM123/farm-and-farlands",
      revision: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      items,
    },
    null,
    2,
  ),
);
console.log("Каталог игры: " + items.length + " предметов");
