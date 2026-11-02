import { getShipDesign } from "../../data/shipDesigns";

export function ShipDesignPanel({ shipId }: { shipId: string }) {
  const design = getShipDesign(shipId);
  if (!design) return null;
  const d = design.dimensions;
  const w = design.weightBudgetTons;
  return <section className="contract-card fleet-card">
    <h3>船体寸法・設計基準 v1</h3>
    <p className="contract-card-detail">{design.referenceLabel}。ゲーム用の概念設計で、実船の安全性や必要機関出力を検証済みという意味ではありません。</p>
    <div className="kv"><span>構造</span><span>{design.hullMaterialLabel}</span></div>
    <div className="kv"><span>推進方式</span><span>{design.propulsionLabel}</span></div>
    <div className="kv"><span>船体全長</span><span>{d.lengthOverallM.toFixed(1)}m</span></div>
    <div className="kv"><span>水線長</span><span>{d.lengthWaterlineM.toFixed(1)}m</span></div>
    <div className="kv"><span>船体幅（外輪を除く）</span><span>{d.hullBeamM.toFixed(1)}m</span></div>
    <div className="kv"><span>外輪込み最大幅</span><span>約{d.overallBeamMinM.toFixed(1)}〜{d.overallBeamMaxM.toFixed(1)}m</span></div>
    <div className="kv"><span>船体深さ</span><span>{d.mouldedDepthM.toFixed(1)}m</span></div>
    <div className="kv"><span>満載喫水</span><span>約{d.fullLoadDraftM.toFixed(1)}m</span></div>
    <div className="kv"><span>満載排水量</span><span>約{design.nominalFullLoadDisplacementTons}t</span></div>
    <div className="kv"><span>巡航／連続最大速力</span><span>{design.speed.cruisingKnots}／{design.speed.continuousMaxKnots}ノット</span></div>
    <div className="kv"><span>設計上の貨物重量上限</span><span>{design.cargoCapacity.maxWeightTons.toFixed(2)}t</span></div>
    <div className="kv"><span>設計上の貨物容積上限</span><span>{design.cargoCapacity.maxVolumeM3.toFixed(2)}m³</span></div>
    <div className="kv"><span>石炭搭載上限</span><span>{design.fuel.capacityTons.toFixed(2)}t</span></div>
    <div className="kv"><span>基準石炭消費</span><span>{design.fuel.referenceConsumptionTonsPerVoyageHour.toFixed(2)}t／航海時間（{design.fuel.referenceSpeedKnots}ノット）</span></div>
    <p className="contract-card-detail">貨物10t・12m³はロット／単位移行時に適用する設計値です。現在の受注判定は下記の旧単位の運用値を使用しており、この表示でセーブや進行中契約を変更することはありません。石炭は貨物枠とは別枠ですが、設計上の満載排水量には含めます。</p>
    <details>
      <summary>重量配分・未検証事項</summary>
      <div className="kv"><span>船体・機関・設備・機関内の水など</span><span>{w.hullMachineryEquipmentAndOperatingWater}t</span></div>
      <div className="kv"><span>貨物</span><span>最大{w.cargo}t</span></div>
      <div className="kv"><span>石炭</span><span>最大{w.coal}t</span></div>
      <div className="kv"><span>乗員・清水・食料・予備品など</span><span>{w.crewFreshWaterStoresAndSpares}t</span></div>
      <p className="contract-card-detail">重量配分は設計予算です。機関出力、外輪寸法、船内配置、復元性、波への強さは未検証です。外輪込み幅は詳細設計時に範囲内で確定します。</p>
    </details>
  </section>;
}
