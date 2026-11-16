import { useEffect } from "react";
import { MainPage } from "./pages/MainPage";
import { useGameStore } from "./state/gameStore";

export default function App() {
  useEffect(() => {
    const interval = setInterval(() => {
      useGameStore.getState().tick();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return <MainPage />;
}
