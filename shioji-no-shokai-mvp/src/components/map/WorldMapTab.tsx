import { worldMap } from "../../data/worldMap";

export function WorldMapTab() {
  const portCount = worldMap.features.filter(
    (feature) => feature.type === "port",
  ).length;

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "16px",
        borderRadius: "12px",
        background: "#eaf3fb",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "18px" }}>海図</h2>
      <p style={{ margin: 0, fontSize: "14px" }}>
        世界マップデータは準備中です。
      </p>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "4px 12px",
          margin: 0,
          fontSize: "14px",
        }}
      >
        <dt>海域HEX</dt>
        <dd style={{ margin: 0 }}>{worldMap.seaHexes.length}件</dd>
        <dt>港</dt>
        <dd style={{ margin: 0 }}>{portCount}件</dd>
        <dt>地形セル</dt>
        <dd style={{ margin: 0 }}>{worldMap.terrain.length}件</dd>
      </dl>
    </section>
  );
}
