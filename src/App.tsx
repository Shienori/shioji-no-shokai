import { useState } from "react";
import ContractBoard from "./components/ContractBoard";
import SailingScreen from "./components/SailingScreen";
import ArrivalReport from "./components/ArrivalReport";

export default function App() {
  const [screen, setScreen] = useState<"board" | "sailing" | "report">("board");

  return (
    <div className="app">
      {screen === "board" && (
        <ContractBoard onStart={() => setScreen("sailing")} />
      )}
      {screen === "sailing" && (
        <SailingScreen onArrive={() => setScreen("report")} />
      )}
      {screen === "report" && (
        <ArrivalReport onBack={() => setScreen("board")} />
      )}
    </div>
  );
}
