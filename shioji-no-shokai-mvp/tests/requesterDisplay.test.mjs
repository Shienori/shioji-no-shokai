import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server;
try {
  server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), server: { middlewareMode: true }, appType: "custom" });
  const { shippers, miraSaltGuild, findShipperById, ensureMiraReputation } = await server.ssrLoadModule("/src/data/shippers.ts");
  const { contractTemplates, tutorialWheatContract } = await server.ssrLoadModule("/src/data/contracts.ts");
  const { ContractDetailScreen } = await server.ssrLoadModule("/src/components/contract/ContractDetailScreen.tsx");
  const expected = [
    ["shipper_selene_farmers", "セレネ農業組合", "セレネ周辺の農家がつくる組合。農産物の出荷や、営農に必要な物資の輸送を依頼する。"],
    ["shipper_aldera_merchants", "アルデラ商人会", "複数の港で商品を売買し、輸送を仲介する商人団体。"],
    ["shipper_rigel_forge", "リゲル製鉄組合", "鉄鉱石・鋼材を中心に、工業関連物資を扱う組合。"],
    ["shipper_mira_salt_guild", "ミラ塩商組合", "ミラの塩田主と交易商がつくる組合。各地への塩の出荷と、市場に集まる香辛料の輸送を取りまとめる。"],
  ];
  assert.equal(shippers.length, 4);
  assert.equal(new Set(shippers.map(item => item.id)).size, 4);
  for (const [id, name, description] of expected) {
    assert.equal(findShipperById(id)?.name, name);
    assert.equal(findShipperById(id)?.description, description);
  }
  assert.strictEqual(findShipperById(miraSaltGuild.id), miraSaltGuild);
  assert.equal(findShipperById("unknown"), undefined);
  assert.equal(findShipperById(tutorialWheatContract.shipperId)?.name, "セレネ農業組合");
  const render = contract => renderToStaticMarkup(createElement(ContractDetailScreen, {
    contract, ships: [], eligibleShips: [], acceptReason: null,
    offeredDeadlineAt: Date.now() + 3600000, onAccept: () => {}, onClose: () => {},
  }));
  for (const contract of contractTemplates) {
    const requester = findShipperById(contract.shipperId);
    assert.ok(requester, `Unregistered requester for ${contract.id}`);
    const html = render(contract);
    assert.ok(html.includes("<span>依頼主</span>"));
    assert.ok(html.includes(requester.name));
    assert.ok(html.includes(requester.description));
    assert.ok(!html.includes("<span>荷主</span>"));
  }
  const unknown = render({ ...tutorialWheatContract, shipperId: "unknown" });
  assert.ok(unknown.includes("不明な依頼主"));
  assert.ok(!unknown.includes("セレネ農業組合"));
  const reputations = [{ shipperId: "shipper_selene_farmers", value: 1 }, { shipperId: miraSaltGuild.id, value: 1.25 }];
  assert.strictEqual(ensureMiraReputation(reputations), reputations);
  const source = await readFile(new URL("../src/components/contract/ContractDetailScreen.tsx", import.meta.url), "utf8");
  const confirmation = source.slice(source.indexOf("{showConfirmation && selectedShip"));
  assert.ok(confirmation.includes("<span>依頼主</span><span>{requesterName}</span>"));
  assert.ok(!confirmation.includes("<span>荷主</span>"));
  console.log(JSON.stringify({ requesterCount: shippers.length, renderedContracts: contractTemplates.length, confirmationSourceCheck: "passed", browserInteraction: "not tested" }));
} finally {
  if (server) await server.close();
}
