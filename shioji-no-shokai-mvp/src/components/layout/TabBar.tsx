interface TabBarProps {
  activeTab: "contracts" | "fleet" | "chart";
  onChange: (tab: "contracts" | "fleet" | "chart") => void;
}

export function TabBar({ activeTab, onChange }: TabBarProps) {
  return (
    <div className="tabs">
      <button className={`tab ${activeTab === "contracts" ? "active" : ""}`} onClick={() => onChange("contracts")}>依頼</button>
      <button className={`tab ${activeTab === "fleet" ? "active" : ""}`} onClick={() => onChange("fleet")}>船団</button>
      <button className={`tab ${activeTab === "chart" ? "active" : ""}`} onClick={() => onChange("chart")}>海図</button>
    </div>
  );
}
