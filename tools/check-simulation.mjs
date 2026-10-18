import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const manifest = JSON.parse(
  readFileSync("public/simulation/build.json", "utf8"),
);
for (const [file, expected] of Object.entries(manifest.sources)) {
  const actual = createHash("sha256")
    .update(readFileSync("simulation/" + file))
    .digest("hex");
  if (actual !== expected)
    throw Error(
      "Ядро " +
        file +
        " изменено после Web-сборки. Выполните npm run build:simulation",
    );
}
const pck = createHash("sha256")
  .update(readFileSync("public/simulation/engine.pck"))
  .digest("hex");
if (pck !== manifest.pck) throw Error("Повреждён пакет ядра");
