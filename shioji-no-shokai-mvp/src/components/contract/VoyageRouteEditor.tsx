import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { hexMap } from "../../data/hexMap";
import { worldMap } from "../../data/worldMap";
import { getPortById } from "../../data/ports";
import { buildVoyagePlanRoute } from "../../domain/voyagePlanRoute";
import { suggestAutoRefuelPlan, suggestAutoRoute } from "../../domain/autoRefuelPlan";
import type { ConfirmedVoyageRoute, VoyagePlanRouteDraft } from "../../domain/voyagePlanTypes";
import type { Ship } from "../../domain/types";
import { getMapCenter, getMapViewBox, MAP_HEX_SIZE } from "../map/mapGeometry";
import { MAP_COLORS } from "../map/HexMap";

interface Props { departurePortId: string; destinationPortId: string; onEditedChange: (edited: boolean, route: ConfirmedVoyageRoute) => void; acceptanceEnabled?: boolean; autoRefuelParams?: { ship: Ship; speed: number; baseRealTime: number; loadingDurationOperationMs: number }; }
type RefuelMethod = "departure" | "enRoute";
const initialDraft = (): VoyagePlanRouteDraft => ({ stops: [], legs: [{ waypointHexIds: [] }] });
const cells = new Map(hexMap.map(hex => [hex.id, hex]));
const points = (q: number, r: number) => {
  const center = getMapCenter({ q, r });
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (60 * i - 30) * Math.PI / 180;
    return `${center.x + MAP_HEX_SIZE * Math.cos(angle)},${center.y + MAP_HEX_SIZE * Math.sin(angle)}`;
  }).join(" ");
};
export function VoyageRouteEditor({ departurePortId, destinationPortId, onEditedChange, acceptanceEnabled = false, autoRefuelParams }: Props) {
  const [history, setHistory] = useState<VoyagePlanRouteDraft[]>([initialDraft()]);
  const [refuelMethod, setRefuelMethod] = useState<RefuelMethod>("enRoute");
  const draft = history[history.length - 1];
  const endpoints = useMemo(() => ({ departurePortId, destinationPortId }), [departurePortId, destinationPortId]);
  const result = useMemo(() => buildVoyagePlanRoute(endpoints, draft), [endpoints, draft]);
  const shortest = useMemo(() => buildVoyagePlanRoute(endpoints, initialDraft()), [endpoints]);
  const edited = draft.stops.length > 0 || draft.legs.some(leg => leg.waypointHexIds.length > 0);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [selectedStop, setSelectedStop] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [candidate, setCandidate] = useState<VoyagePlanRouteDraft | null>(null);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ pointerId: number; section: number; waypoint: number; x: number; y: number; moved: boolean; draft: VoyagePlanRouteDraft | null } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { if (result.ok) onEditedChange(edited, result.route); }, [edited, result, onEditedChange]);
  const activeSection = Math.min(sectionIndex, draft.legs.length - 1);
  const preview = candidate ? buildVoyagePlanRoute(endpoints, candidate) : null;
  function commit(next: VoyagePlanRouteDraft) {
    const checked = buildVoyagePlanRoute(endpoints, next);
    if (!checked.ok) { setMessage(checked.message); return; }
    setHistory(previous => [...previous.slice(-49), next]); setMessage(""); setCandidate(null);
  }
  function replaceWaypoint(section: number, index: number, id: string): VoyagePlanRouteDraft {
    return { ...draft, legs: draft.legs.map((leg, n) => n === section
      ? { waypointHexIds: leg.waypointHexIds.map((old, i) => i === index ? id : old) } : leg) };
  }
  function nearestRouteIndex(id: string) {
    if (!result.ok) return 0;
    const center = getMapCenter(cells.get(id)!);
    const ids = result.route.sections[activeSection].hexIds;
    let best = 0, distance = Infinity;
    ids.forEach((hexId, index) => {
      const point = getMapCenter(cells.get(hexId)!);
      const value = Math.hypot(point.x - center.x, point.y - center.y);
      if (value < distance) { best = index; distance = value; }
    });
    return best;
  }
  function selectHex(id: string) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!result.ok) return;
    const hex = cells.get(id)!;
    const leg = draft.legs[activeSection];
    const routeIds = result.route.sections[activeSection].hexIds;
    const insertion = nearestRouteIndex(id);
    const split = leg.waypointHexIds.filter(point => routeIds.indexOf(point) <= insertion).length;
    if (hex.kind === "sea") {
      if (leg.waypointHexIds.includes(id)) { setMessage("通過地点は地図上でドラッグ、または一覧の削除ボタンで編集できます。"); return; }
      const ids = [...leg.waypointHexIds]; ids.splice(split, 0, id);
      commit({ ...draft, legs: draft.legs.map((item, n) => n === activeSection ? { waypointHexIds: ids } : item) });
    } else if (hex.kind === "port" && hex.portId) {
      if (hex.portId === departurePortId || hex.portId === destinationPortId) { setMessage("出発港と最終目的港は固定です。"); return; }
      const existing = draft.stops.findIndex(stop => stop.portId === hex.portId);
      if (existing >= 0) { setSelectedStop(existing); setMessage(""); return; }
      const stops = [...draft.stops]; stops.splice(activeSection, 0, { portId: hex.portId, refuelTargetPercent: 100 });
      const legs = [...draft.legs]; legs.splice(activeSection, 1,
        { waypointHexIds: leg.waypointHexIds.slice(0, split) }, { waypointHexIds: leg.waypointHexIds.slice(split) });
      const next = { stops, legs };
      if (buildVoyagePlanRoute(endpoints, next).ok) setSelectedStop(activeSection);
      commit(next);
    }
  }
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5 && !current.moved) return;
    current.moved = true;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const nearest = hexMap.filter(hex => hex.kind === "sea").map(hex => ({ hex, center: getMapCenter(hex) }))
      .sort((a, b) => Math.hypot(a.center.x - point.x, a.center.y - point.y) - Math.hypot(b.center.x - point.x, b.center.y - point.y))[0];
    current.draft = nearest && Math.hypot(nearest.center.x - point.x, nearest.center.y - point.y) <= MAP_HEX_SIZE
      ? replaceWaypoint(current.section, current.waypoint, nearest.hex.id) : null;
    setCandidate(current.draft);
  }
  function finish(event: ReactPointerEvent<SVGSVGElement>, cancel = false) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null; setCandidate(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    suppressClick.current = current.moved;
    if (!cancel && current.moved) {
      if (current.draft) commit(current.draft); else setMessage("海上HEXに通過地点を置いてください。直前の航路を維持しました。");
    }
  }
  function runAutoRefuel() {
    setRefuelMethod("enRoute");
    const params = autoRefuelParams;
    if (!params) { setMessage("ルート自動編集には船・速力・時刻の情報が必要です。"); return; }
    const suggestion = suggestAutoRoute({
      endpoints,
      ship: params.ship,
      selectedSpeedKnots: params.speed,
      baseRealTime: params.baseRealTime,
      loadingDurationOperationMs: params.loadingDurationOperationMs,
    });
    if (suggestion.status === "planned" && suggestion.draft) {
      commit(suggestion.draft);
      setMessage(suggestion.message);
    } else {
      setMessage(suggestion.message);
    }
  }
  if (!result.ok) return <p role="alert">{result.message}</p>;
  const displayed = preview?.ok ? preview.route : result.route;
  return <section className="card detail-card" aria-label="航路編集">
    <h3>{acceptanceEnabled ? "航海計画1：ルート編集" : "航海計画1：ルート編集（試用）"}</h3>
    <p>海をタップして通過地点を追加、青い丸をドラッグして移動。港をタップして途中寄港を指定します。</p>
    <fieldset className="plan-speed-selector" style={{ marginBottom: 8 }}>
      <legend>補油方法</legend>
      <div className="voyage-flow-actions">
        <button type="button" className="btn btn-secondary" aria-pressed={refuelMethod === "enRoute"} onClick={runAutoRefuel}>ルート自動編集</button>
        <button type="button" className="btn btn-secondary" aria-pressed={refuelMethod === "departure"} onClick={() => setRefuelMethod("departure")}>出発港で補油</button>
      </div>
      {refuelMethod === "enRoute" && <p>燃料不足が予期される場合、寄港地と補油目標を自動で設定します。補油の余りは自動返金します。</p>}
      {refuelMethod === "departure" && <p>出発港で必要量を補油します。必要量の自動計算と受注への接続は準備中です。</p>}
    </fieldset>
    {acceptanceEnabled ? <p>編集した航路は最終確認へ引き継ぎます。受注を確定するまでは保存・燃料消費を行いません。</p> : <p>編集結果の受注・保存はまだ未接続です。変更中は受注できません。「最短ルートへ戻す」で従来の受注に戻せます。</p>}
    <label>編集する区間 <select value={activeSection} onChange={event => setSectionIndex(Number(event.target.value))}>
      {result.route.sections.map((section, index) => <option key={index} value={index}>{index + 1}. {getPortById(section.fromPortId).name} → {getPortById(section.toPortId).name}</option>)}
    </select></label>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
      <button type="button" disabled={history.length < 2} onClick={() => { setHistory(old => old.slice(0, -1)); setSelectedStop(null); setMessage(""); }}>取り消し</button>
      <button type="button" onClick={() => { commit(initialDraft()); setSectionIndex(0); setSelectedStop(null); }}>最短ルートへ戻す</button>
      <button type="button" disabled={zoom <= 1} onClick={() => setZoom(old => Math.max(1, old / 1.25))}>縮小</button>
      <button type="button" disabled={zoom >= 4} onClick={() => setZoom(old => Math.min(4, old * 1.25))}>拡大</button>
      <button type="button" onClick={() => setZoom(1)}>全体表示</button>
    </div>
    <p>計画距離 {result.totalDistanceNm}海里 ／ 最短との差 {shortest.ok ? result.totalDistanceNm - shortest.totalDistanceNm : "—"}海里</p>
    <p>通過地点 {draft.legs.reduce((sum, leg) => sum + leg.waypointHexIds.length, 0)} / 8。拡大時は地図をスクロールして移動できます。</p>
    <div style={{ overflow: "auto", maxHeight: "55vh", borderRadius: 12, background: MAP_COLORS.sea }}>
      <svg viewBox={getMapViewBox(worldMap.terrain.map(getMapCenter))} aria-label="編集可能な航路海図" style={{ display: "block", width: `${zoom * 100}%`, minWidth: zoom > 1 ? 600 * zoom : undefined }}
        onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
        onLostPointerCapture={() => { drag.current = null; setCandidate(null); }}>
        {worldMap.terrain.map(cell => <polygon key={`terrain-${cell.q},${cell.r}`} points={points(cell.q, cell.r)} fill={cell.kind === "land" ? MAP_COLORS.land : MAP_COLORS.sea} stroke="white" />)}
        {hexMap.map(hex => <polygon key={hex.id} points={points(hex.q, hex.r)} fill={hex.kind === "port" ? MAP_COLORS.port : "transparent"} stroke="white"
          role="button" tabIndex={0} aria-label={hex.kind === "port" ? getPortById(hex.portId!).name : `通過地点を追加 ${hex.id}`}
          onClick={() => selectHex(hex.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectHex(hex.id); } }} />)}
        {displayed.sections.map((section, index) => <polyline key={`route-${index}`} points={section.hexIds.map(id => { const p = getMapCenter(cells.get(id)!); return `${p.x},${p.y}`; }).join(" ")}
          fill="none" stroke={index === activeSection ? "#b45309" : "#64748b"} strokeWidth={4} strokeDasharray={candidate ? "6 4" : undefined} pointerEvents="none" />)}
        {hexMap.filter(hex => hex.kind === "port").map(hex => { const p = getMapCenter(hex); return <text key={`name-${hex.id}`} x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} pointerEvents="none">{getPortById(hex.portId!).name}</text>; })}
        {draft.legs.flatMap((leg, section) => leg.waypointHexIds.map((id, waypoint) => {
          const p = getMapCenter(cells.get(id)!);
          return <g key={`${section}-${waypoint}`}><circle cx={p.x} cy={p.y} r={13} fill="#2563eb" stroke="white" strokeWidth={2} style={{ touchAction: "none", cursor: "grab" }}
            onClick={event => event.stopPropagation()} onPointerDown={event => {
              if (!event.isPrimary || event.button !== 0) return;
              event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
              drag.current = { pointerId: event.pointerId, section, waypoint, x: event.clientX, y: event.clientY, moved: false, draft: null };
              event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
            }} /><text x={p.x} y={p.y + 4} textAnchor="middle" fill="white" fontSize={11} pointerEvents="none">{section + 1}-{waypoint + 1}</text></g>;
        }))}
      </svg>
    </div>
    {candidate && <p role="status">{preview?.ok ? "候補航路：指を離すと確定します。" : preview && !preview.ok ? preview.message : "候補を確認中"}</p>}
    <p role="status" aria-live="polite">{message}</p>
    {draft.legs.map((leg, section) => <div key={section}>{leg.waypointHexIds.map((id, index) => <p key={`${index}-${id}`}>通過地点 {section + 1}-{index + 1}：{id} <button type="button" onClick={() => commit({ ...draft, legs: draft.legs.map((item, n) => n === section ? { waypointHexIds: item.waypointHexIds.filter((_, i) => i !== index) } : item) })}>削除</button></p>)}</div>)}
    {draft.stops.map((stop, index) => <div key={stop.portId} style={{ border: selectedStop === index ? "2px solid #2563eb" : "1px solid #cbd5e1", padding: 8, marginTop: 8 }}>
      <p>途中港 {index + 1}：{getPortById(stop.portId).name}</p>
      <label>補油後の目標 {stop.refuelTargetPercent}% <input type="range" min={0} max={100} step={1} value={stop.refuelTargetPercent} onChange={event => commit({ ...draft, stops: draft.stops.map((item, n) => n === index ? { ...item, refuelTargetPercent: Number(event.target.value) } : item) })} /></label>
      {[50, 100].map(value => <button key={value} type="button" onClick={() => commit({ ...draft, stops: draft.stops.map((item, n) => n === index ? { ...item, refuelTargetPercent: value } : item) })}>{value === 50 ? "半載（50%）" : "満載（100%）"}</button>)}
      <button type="button" onClick={() => {
        const legs = [...draft.legs]; legs.splice(index, 2, { waypointHexIds: [...legs[index].waypointHexIds, ...legs[index + 1].waypointHexIds] });
        commit({ stops: draft.stops.filter((_, n) => n !== index), legs }); setSelectedStop(null);
      }}>寄港を削除</button><p>燃料単価 120G/t。目標以上の燃料は減らしません。</p>
    </div>)}
  </section>;
}
