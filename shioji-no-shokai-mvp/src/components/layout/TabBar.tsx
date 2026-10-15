interface TabBarProps {
  activeTab: "contracts" | "fleet";
  onChange: (tab: "contracts" | "fleet") => void;
}

export function TabBar({ activeTab, onChange }: TabBarProps) {
  return (
    <div className="tabs">
      <button className={`tab ${activeTab === "contracts" ? "active" : ""}`} onClick={() => onChange("contracts")}>依頼</button>
      <button className={`tab ${activeTab === "fleet" ? "active" : ""}`} onClick={() => onChange("fleet")}>船団</button>
    </div>
  );
}
