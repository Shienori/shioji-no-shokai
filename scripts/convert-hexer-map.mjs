#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const inputPath = process.argv[2] ?? "raw/hexer-map.json";
const outputPath = process.argv[3] ?? "shioji-no-shokai-mvp/src/data/worldMap.json";

async function main() {
  const raw = JSON.parse(await readFile(inputPath, "utf8"));

  // Hexerの実JSONスキーマ確認後に、ここで terrain / seaHexes / features へ変換する。
  const worldMap = {
    meta: {
      id: "world_v1",
      name: "セレネ海域",
      hexRadius: 26,
      hexSpacingNm: 15,
    },
    terrain: [],
    seaHexes: [],
    features: [],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(worldMap, null, 2)}\n`, "utf8");

  console.log(`Converted ${inputPath} to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
