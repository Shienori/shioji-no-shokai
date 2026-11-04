import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ConfirmedVoyageRoute, VoyagePlanRouteDraft } from "../../domain/voyagePlanTypes";
import type { ContractTemplate, Ship } from "../../domain/types";
import { hexMap } from "../../data/hexMap";
import { worldMap } from "../../data/worldMap";
import { getPortById } from "../../data/ports";
import { getCargoById } from "../../data/cargos";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";
import { buildVoyagePlanRoute } from "../../domain/voyagePlanRoute";
import type { WorldPlanForecast } from "../../domain/worldPlanForecast";
import { getWorldPlanForecastAt, buildVoyagePlanForecastFromWorld } from "../../domain/worldPlanForecast";
import { buildPlanTimeline, getPlanPosition, evaluatePlanWeather, PLAN_DELAY_NOTICE, PLAN_FORECAST_MISSING_NOTICE, PLAN_NO_DELAY_NOTICE } from "../../domain/planWeather";
import { buildRouteWindLegs } from "../../domain/routeWind";
import { describeNumericWind } from "../map/numericWindPresentation";
import { getMapCenter, getMapViewBox, MAP_HEX_SIZE } from "../map/mapGeometry";
import { MAP_COLORS } from "../map/HexMap";

interface Props {
  departurePortId: string; destinationPortId: string; worldForecast: WorldPlanForecast;
  selectedShip: Ship | null; contract: ContractTemplate; baseRealTime: number; offeredDeadlineAt: number | null;
  selectedSpeedKnots: number | undefined;
  onEditedChange: (edited: boolean, route: ConfirmedVoyageRoute) => void;
  onRequestForecastRefresh: () => void;
}
const initialDraft = (): VoyagePlanRouteDraft => ({ stops: [], legs: [{ waypointHexIds: [] }] });
const cells = new Map(hexMap.map(hex => [hex.id, hex]));
const polygon = (q: number, r: number) => {
  const p = getMapCenter({ q, r });
  return Array.from({ length: 6 }, (_, i) => {
    const a = (60 * i - 30) * Math.PI / 180;
    return `${p.x + MAP_HEX_SIZE * Math.cos(a)},${p.y + MAP_HEX_SIZE * Math.sin(a)}`;
  }).join(" ");
};
const labelTime = (time: number) => new Date(time).toLocaleString("ja-JP", { hour12: false });
type Drag = { pointerId: number; section: number; waypoint: number; x: number; y: number; moved: boolean; next: VoyagePlanRouteDraft | null };
export function RouteWeatherEditor({ departurePortId, destinationPortId, worldForecast, selectedShip, contract, baseRealTime, selectedSpeedKnots, onEditedChange, onRequestForecastRefresh }: Props) {
  const [history, setHistory] = useState<VoyagePlanRouteDraft[]>([initialDraft()]);
  const draft = history[history.length - 1];
  const [sectionIndex, setSectionIndex] = useState(0);
  const activeIndex = Math.min(sectionIndex, draft.legs.length - 1);
  const [timeProgress, setTimeProgress] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<VoyagePlanRouteDraft | null>(null);
  const [message, setMessage] = useState("");
  const [zoom, setZoom] = useState(1);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const endpoints = { departurePortId, destinationPortId };
  const result = useMemo(() => buildVoyagePlanRoute({ departurePortId, destinationPortId }, draft), [departurePortId, destinationPortId, draft]);
  const edited = draft.stops.length > 0 || draft.legs.some(leg => leg.waypointHexIds.length > 0);
  useEffect(() => { if (result.ok) onEditedChange(edited, result.route); }, [result, edited, onEditedChange]);
  if (!result.ok) return <p role="alert">{result.message}</p>;
  const route = result.route;
  const preview = candidate ? buildVoyagePlanRoute(endpoints, candidate) : null;
  const displayed = preview?.ok ? preview.route : route;
  const speed = selectedSpeedKnots ?? selectedShip?.cruisingSpeedKnots;
  const timeline = (() => {
    if (!selectedShip || speed === undefined) return null;
    try {
      const departure = baseRealTime + getCargoById(contract.cargoId).loadingTimeMsPerUnit * contract.quantity / GAME_TIME_MULTIPLIER;
      return buildPlanTimeline(displayed, baseRealTime, departure, speed);
    } catch { return null; }
  })();
  const progress = Math.min(1000, Math.max(0, timeProgress));
  const target = timeline
    ? progress === 1000 ? timeline.plannedEtaRealTime
      : timeline.departureRealTime + (timeline.plannedEtaRealTime - timeline.departureRealTime) * progress / 1000
    : worldForecast.capturedAt;
  const evaluation = (() => {
    if (!timeline) return null;
    try { return evaluatePlanWeather(timeline, buildVoyagePlanForecastFromWorld(displayed, worldForecast)); }
    catch { return { hasDelay: false, hasMissing: true }; }
  })();
  const position = timeline ? getPlanPosition(timeline, target) : null;
  const headings = new Map<string, number>();
  displayed.sections.forEach((section, index) => buildRouteWindLegs(section.hexIds).forEach(leg => {
    if (!headings.has(leg.hexId) || index === activeIndex) headings.set(leg.hexId, leg.headingDeg);
  }));
  const rows = hexMap.filter(hex => hex.kind === "sea").map(hex => {
    const slot = getWorldPlanForecastAt(worldForecast, hex.id, target);
    return { hex, slot, info: slot ? describeNumericWind(slot.forecastWind, headings.get(hex.id) ?? 0, !!selectedShip && headings.has(hex.id)) : null };
  });
  const selected = rows.find(row => row.hex.id === selectedId);
  function commit(next: VoyagePlanRouteDraft) {
    const checked = buildVoyagePlanRoute(endpoints, next);
    if (!checked.ok) { setMessage(checked.message); return; }
    setHistory(old => [...old.slice(-49), next]); setCandidate(null); setMessage("");
  }
  function insertionIndex(id: string) {
    const p = getMapCenter(cells.get(id)!);
    const ids = route.sections[activeIndex].hexIds;
    const nearest = ids.reduce((best, value, index) => {
      const a = getMapCenter(cells.get(value)!);
      const b = getMapCenter(cells.get(ids[best])!);
      return Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? index : best;
    }, 0);
    return draft.legs[activeIndex].waypointHexIds.filter(value => ids.indexOf(value) <= nearest).length;
  }
  function choose(id: string) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setSelectedId(id);
    const hex = cells.get(id)!;
    const leg = draft.legs[activeIndex];
    const split = insertionIndex(id);
    if (hex.kind === "sea") {
      if (leg.waypointHexIds.includes(id)) return;
      const points = [...leg.waypointHexIds]; points.splice(split, 0, id);
      commit({ ...draft, legs: draft.legs.map((item, n) => n === activeIndex ? { waypointHexIds: points } : item) });
    } else if (hex.kind === "port" && hex.portId) {
      if (hex.portId === departurePortId || hex.portId === destinationPortId) { setMessage("出発港と最終目的港は固定です。"); return; }
      const existing = draft.stops.findIndex(stop => stop.portId === hex.portId);
      if (existing >= 0) { setSectionIndex(existing); return; }
      const stops = [...draft.stops]; stops.splice(activeIndex, 0, { portId: hex.portId, refuelTargetPercent: 100 });
      const legs = [...draft.legs]; legs.splice(activeIndex, 1, { waypointHexIds: leg.waypointHexIds.slice(0, split) }, { waypointHexIds: leg.waypointHexIds.slice(split) });
      commit({ stops, legs });
    }
  }
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
    current.moved = true;
    const matrix = event.currentTarget.getScreenCTM(); if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const nearest = rows.map(row => ({ hex: row.hex, p: getMapCenter(row.hex) })).sort((a, b) => Math.hypot(a.p.x - p.x, a.p.y - p.y) - Math.hypot(b.p.x - p.x, b.p.y - p.y))[0];
    if (!nearest || Math.hypot(nearest.p.x - p.x, nearest.p.y - p.y) > MAP_HEX_SIZE) { current.next = null; setCandidate(null); return; }
    current.next = { ...draft, legs: draft.legs.map((leg, n) => n === current.section ? { waypointHexIds: leg.waypointHexIds.map((id, i) => i === current.waypoint ? nearest.hex.id : id) } : leg) };
    const checked = buildVoyagePlanRoute(endpoints, current.next);
    setCandidate(checked.ok ? current.next : null); setMessage(checked.ok ? "指を離すと候補航路を確定します。" : checked.message);
  }
  function finish(event: ReactPointerEvent<SVGSVGElement>, cancel = false) {
    const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null; suppressClick.current = current.moved;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && current.moved && current.next) commit(current.next);
    else if (!cancel && current.moved) setMessage("海上HEXに置いてください。直前の航路を維持しました。");
    setCandidate(null);
  }
  return <section className="card detail-card route-weather-editor" aria-label="ルート編集と気象予測">
    <div className="route-weather-toolbar"><h3>ルート編集／気象予測</h3><div role="group" aria-label="海図操作">
      <button type="button" disabled={history.length < 2} onClick={() => { setHistory(old => old.slice(0, -1)); setMessage(""); }}>取り消し</button>
      <button type="button" onClick={() => { commit(initialDraft()); setSectionIndex(0); }}>最短ルートへ戻す</button>
      <button type="button" disabled={zoom <= 1} onClick={() => setZoom(v => Math.max(1, v - .5))}>縮小</button>
      <output>{Math.round(zoom * 100)}%</output><button type="button" disabled={zoom >= 3} onClick={() => setZoom(v => Math.min(3, v + .5))}>拡大</button>
      <button type="button" onClick={() => setZoom(1)}>全体表示</button><button type="button" onClick={onRequestForecastRefresh}>予報を更新</button>
    </div></div>
    <p>海を選んで通過地点を追加、青い丸をドラッグして移動。港を選んで途中寄港を指定します。</p>
    <label>編集区間 <select value={activeIndex} onChange={event => setSectionIndex(Number(event.target.value))}>{route.sections.map((section, index) => <option key={index} value={index}>{index + 1}. {getPortById(section.fromPortId).name} → {getPortById(section.toPortId).name}</option>)}</select></label>
    <p>計画距離 {result.totalDistanceNm}海里 ／ 通過地点 {draft.legs.reduce((sum, leg) => sum + leg.waypointHexIds.length, 0)}/8</p>
    <div className="route-weather-map-scroll"><svg viewBox={getMapViewBox(worldMap.terrain.map(getMapCenter))} aria-label="全海域予報と編集航路" style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? 600 * zoom : undefined }} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={() => { drag.current = null; setCandidate(null); }}>
      {worldMap.terrain.map(hex => <polygon key={`terrain-${hex.q},${hex.r}`} points={polygon(hex.q, hex.r)} fill={hex.kind === "land" ? MAP_COLORS.land : MAP_COLORS.sea} stroke="white" />)}
      {hexMap.map(hex => <polygon key={hex.id} points={polygon(hex.q, hex.r)} fill={hex.kind === "port" ? MAP_COLORS.port : "transparent"} stroke="white" role="button" tabIndex={0} aria-label={hex.kind === "port" ? getPortById(hex.portId!).name : `通過地点を追加 ${hex.id}`} onClick={() => choose(hex.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(hex.id); } }} />)}
      {rows.map(({ hex, slot, info }) => {
        if (!slot || !info) return null;
        const p = getMapCenter(hex), length = Math.min(18, 6 + slot.forecastWind.speedMps);
        return <g key={`wind-${hex.id}`} pointerEvents="none"><title>{`${info.directionLabel}・${info.speedLabel}・${info.deltaLabel}`}</title>{slot.forecastWind.fromDeg === null ? <circle cx={p.x} cy={p.y} r={3} fill={info.color} /> : <path d={`M 0 ${length / 2} V ${-length / 2} M -3 ${-length / 2 + 4} L 0 ${-length / 2} L 3 ${-length / 2 + 4}`} transform={`translate(${p.x} ${p.y}) rotate(${slot.forecastWind.fromDeg + 180})`} fill="none" stroke={info.color} strokeWidth={2} />}</g>;
      })}
      {displayed.sections.map((section, index) => <polyline key={`route-${index}`} points={section.hexIds.map(id => { const p = getMapCenter(cells.get(id)!); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke={index === activeIndex ? "#8a4b17" : "#64748b"} strokeWidth={4} strokeDasharray={candidate ? "7 5" : undefined} pointerEvents="none" />)}
      {hexMap.filter(hex => hex.kind === "port").map(hex => { const p = getMapCenter(hex); return <text key={`port-${hex.id}`} x={p.x} y={p.y + 4} textAnchor="middle" fontSize={10} fill="#254B5C" stroke="white" strokeWidth={2} paintOrder="stroke" pointerEvents="none">{getPortById(hex.portId!).name}</text>; })}
      {draft.legs.flatMap((leg, section) => leg.waypointHexIds.map((id, waypoint) => { const p = getMapCenter(cells.get(id)!); return <g key={`wp-${section}-${waypoint}`}><circle cx={p.x} cy={p.y} r={13} fill="#2563eb" stroke="white" strokeWidth={2} style={{ touchAction: "none", cursor: "grab" }} onClick={event => event.stopPropagation()} onPointerDown={event => { if (!event.isPrimary || event.button !== 0) return; event.preventDefault(); event.stopPropagation(); suppressClick.current = false; drag.current = { pointerId: event.pointerId, section, waypoint, x: event.clientX, y: event.clientY, moved: false, next: null }; event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId); }} /><text x={p.x} y={p.y + 4} textAnchor="middle" fill="white" fontSize={10} pointerEvents="none">{section + 1}-{waypoint + 1}</text></g>; }))}
      {position && (() => { const p = getMapCenter(position.axial); return <g pointerEvents="none"><circle cx={p.x} cy={p.y} r={15} fill="none" stroke="#7c3aed" strokeWidth={3} /><text x={p.x} y={p.y - 18} textAnchor="middle" fontSize={10} fill="#5b21b6">計画位置</text></g>; })()}
    </svg></div>
    {timeline ? <>
      <p>出港予定 {labelTime(timeline.departureRealTime)} → 計画到着 {labelTime(timeline.plannedEtaRealTime)}（荷卸し前）</p>
      <label>海図時刻 {labelTime(target)} <input type="range" aria-label="出港から計画到着までの気象予報時刻" aria-valuetext={labelTime(target)} min={0} max={1000} step={1} value={progress} onChange={event => setTimeProgress(Number(event.target.value))} /></label>
    </> : <p role="status">船・速力・航路を確認すると、出港から計画到着までの時間バーを表示します。</p>}
    <p>矢印は風が吹いていく向き、長さは風の強さ。航路上の速力補正は緑＝増加、赤＝減少です。</p>
    {rows.some(row => !row.slot) && <p role="status">一部または全海域に予報がありません。風を推測しません。</p>}
    {selected?.info && <p>選択海域 {selectedId}：{selected.info.directionLabel} ／ {selected.info.speedLabel} ／ {selected.info.deltaLabel}</p>}
    <p role="status">{evaluation ? `${evaluation.hasDelay ? PLAN_DELAY_NOTICE : ""} ${evaluation.hasMissing ? PLAN_FORECAST_MISSING_NOTICE : ""} ${!evaluation.hasDelay && !evaluation.hasMissing ? PLAN_NO_DELAY_NOTICE : ""}` : "船・速力を選択すると計画位置と遅延注意を表示します。"}</p>
    <p>計画位置は設定速力一定の参考表示です。定刻到着を保証せず、気象補正ETA・遅延分数は計算しません。表示操作で実航行・燃料・保存は変更しません。</p>
    {draft.legs.flatMap((leg, section) => leg.waypointHexIds.map((id, index) => <p key={`${section}-${index}`}>通過地点 {section + 1}-{index + 1}：{id} <button type="button" onClick={() => commit({ ...draft, legs: draft.legs.map((item, n) => n === section ? { waypointHexIds: item.waypointHexIds.filter((_, i) => i !== index) } : item) })}>削除</button></p>))}
    {draft.stops.map((stop, index) => <div key={stop.portId} className="route-stop-settings"><label>{getPortById(stop.portId).name} 補油目標 {stop.refuelTargetPercent}% <input type="range" min={0} max={100} step={1} value={stop.refuelTargetPercent} onChange={event => commit({ ...draft, stops: draft.stops.map((item, n) => n === index ? { ...item, refuelTargetPercent: Number(event.target.value) } : item) })} /></label><button type="button" onClick={() => { const legs = [...draft.legs]; legs.splice(index, 2, { waypointHexIds: [...legs[index].waypointHexIds, ...legs[index + 1].waypointHexIds] }); commit({ stops: draft.stops.filter((_, n) => n !== index), legs }); }}>寄港を削除</button></div>)}
    <p>予報発行 {labelTime(worldForecast.issuedAt)} ／ 取得 {labelTime(worldForecast.capturedAt)}</p><p role="status" aria-live="polite">{message}</p>
  </section>;
}
