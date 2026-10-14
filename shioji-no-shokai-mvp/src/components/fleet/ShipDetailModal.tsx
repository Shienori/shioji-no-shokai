import type { Ship } from "../../domain/types";

interface ShipDetailModalProps {
  ship: Ship;
  open: boolean;
  onClose: () => void;
}

export function ShipDetailModal({ ship, open, onClose }: ShipDetailModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop open">
      <div className="modal">
        <button className="close" onClick={onClose}>×</button>
        <h2>{ship.name}</h2>
        <div className="kv"><span>船種</span><span>{ship.kind === "sailing" ? "帆船" : "動力船"}</span></div>
        <div className="kv"><span>最大速力</span><span>{ship.maxSpeedKnots}ノット</span></div>
        <div className="kv"><span>常用速力</span><span>{ship.cruisingSpeedKnots}ノット</span></div>
        <div className="kv"><span>機関種類</span><span>{ship.engineType}</span></div>
        <div className="kv"><span>機関出力</span><span>{ship.engineOutput}</span></div>
        <div className="kv"><span>積載力</span><span>{ship.maxLoadUnits}LU</span></div>
        <button className="btn btn-primary" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
