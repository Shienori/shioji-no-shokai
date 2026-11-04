import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ConfirmedVoyageRoute, VoyagePlanRouteDraft } from "../../domain/voyagePlanTypes";
import type { Ship } from "../../domain/types";
import { hexMap, getPortHexId } from "../../data/hexMap";
import { worldMap } from "../../data/worldMap";
import { getPortById } from "../../data/ports";
import { buildVoyagePlanRoute } from "../../domain/voyagePlanRoute";
import type { WorldPlanForecast } from "../../domain/worldPlanForecast";
import { getWorldPlanForecastAt } from "../../domain/worldPlanForecast";
import { describeNumericWind } from "../map/numericWindPresentation";
import { getMapCenter, getMapViewBox, MAP_HEX_SIZE } from "../map/mapGeometry";
import { MAP_COLORS } from "../map/HexMap";
import { buildRouteWindLegs } from "../../domain/routeWind";
import { evaluatePlanWeather, buildPlanTimeline, PLAN_DELAY_NOTICE, PLAN_FORECAST_MISSING_NOTICE, PLAN_NO_DELAY_NOTICE } from "../../domain/planWeather";
import { getCargoById } from "../../data/cargos";
import { calculateEffectiveSpeedKnots } from "../../domain/shipPerformance";
import { getHeavyLoadSpeedFactor } from "../../domain/voyage";
import type { ContractTemplate } from "../../domain/types";
import { calculateContractSchedule } from "../../domain/contractSchedule";

interface Props {
  departurePortId: string; destinationPortId: string; worldForecast: WorldPlanForecast;
  selectedShip: Ship | null; contract: ContractTemplate; baseRealTime: number; offeredDeadlineAt: number | null;
  selectedSpeedKnots: number | undefined; onEditedChange: (edited: boolean, route: ConfirmedVoyageRoute) => void;
  onRequestForecastRefresh: () => void;
}
const initialDraft = (): VoyagePlanRouteDraft => ({ stops: [], legs: [{ waypointHexIds: [] }] });
const cells = new Map(hexMap.map(hex => [hex.id, hex]));
const terrain = new Map(worldMap.terrain.map(hex => [`${hex.q},${hex.r}`, hex]));
const pointString = (q: number, r: number) => {
  const center = getMapCenter({ q, r });
  return Array.from({ length: 6 }, (_, i) => { const angle = (60 * i - 30) * Math.PI / 180; return `${center.x + MAP_HEX_SIZE * Math.cos(angle)},${center.y + MAP_HEX_SIZE * Math.sin(angle)}`; }).join(" ");
};
const timeLabel = (time: number) => new Date(time).toLocaleString("ja-JP", { hour12: false });
export function RouteWeatherEditor({ departurePortId, destinationPortId, worldForecast, selectedShip, contract, baseRealTime, offeredDeadlineAt, selectedSpeedKnots, onEditedChange, onRequestForecastRefresh }: Props) {
  const [history, setHistory] = useState<VoyagePlanRouteDraft[]>([initialDraft()]);
  const draft = history[history.length - 1];
  const [activeSection, setActiveSection] = useState(0);
  const [selectedRealTime, setSelectedRealTime] = useState(worldForecast.capturedAt);
  const [selectedHexId, setSelectedHexId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<VoyagePlanRouteDraft | null>(null);
  const [message, setMessage] = useState("");
  const [candidateMessage, setCandidateMessage] = useState("");
  const [zoom, setZoom] = useState(1);
  const [compactWind, setCompactWind] = useState(true);
  const drag = useRef<{ pointerId: number; section: number; waypoint: number; x: number; y: number; moved: boolean; next: VoyagePlanRouteDraft | null } | null>(null);
  const suppressClick = useRef(false);
  const endpoints = { departurePortId, destinationPortId };
  const result = useMemo(() => buildVoyagePlanRoute(endpoints, draft), [departurePortId, destinationPortId, draft]);
  const shortest = useMemo(() => buildVoyagePlanRoute(endpoints, initialDraft()), [departurePortId, destinationPortId]);
  const candidateResult = candidate ? buildVoyagePlanRoute(endpoints, candidate) : null;
  const edited = draft.stops.length > 0 || draft.legs.some(leg => leg.waypointHexIds.length > 0);
  const activeIndex = Math.min(activeSection, draft.legs.length - 1);
  useEffect(() => { if (result.ok) onEditedChange(edited, result.route); }, [edited, result, onEditedChange]);
  useEffect(() => { setSelectedRealTime(worldForecast.capturedAt); }, [worldForecast.capturedAt]);
  if (!result.ok) return <section className="card detail-card route-weather-editor"><h3>ルート編集／気象予測</h3><p role="alert">{result.message}</p></section>;
  const route = result.route;
  const totalWaypoints = draft.legs.reduce((sum, leg) => sum + leg.waypointHexIds.length, 0);
  const passages = route.sections.flatMap((section, sectionIndex) => buildRouteWindLegs(section.hexIds).map(leg => ({ ...leg, sectionIndex })));
  const splitIndex = (hexId: string) => {
    const position = route.sections[activeIndex].hexIds.indexOf(hexId);
    return draft.legs[activeIndex].waypointHexIds.filter(id => route.sections[activeIndex].hexIds.indexOf(id) < position).length;
  };
  const commit = (next: VoyagePlanRouteDraft) => {
    const checked = buildVoyagePlanRoute(endpoints, next);
    if (!checked.ok) { setMessage(checked.message); return false; }
    setHistory(old => [...old.slice(-49), next]); setMessage(""); setCandidate(null); setCandidateMessage(""); return true;
  };
  const chooseCell = (hexId: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setSelectedHexId(hexId);
    const cell = cells.get(hexId); if (!cell) return;
    if (cell.kind === "sea") {
      if (draft.legs[activeIndex].waypointHexIds.includes(hexId)) return;
      if (totalWaypoints >= 8) { setMessage("ウェイポイントは航海全体で8個までです。"); return; }
      const waypoints = [...draft.legs[activeIndex].waypointHexIds];
      waypoints.splice(splitIndex(hexId), 0, hexId);
      commit({ ...draft, legs: draft.legs.map((leg, index) => index === activeIndex ? { waypointHexIds: waypoints } : leg) });
      return;
    }
    if (cell.kind === "port" && cell.portId) {
      if (cell.portId === departurePortId || cell.portId === destinationPortId) { setMessage("出発港と最終目的港は固定です。"); return; }
      const found = draft.stops.findIndex(stop => stop.portId === cell.portId);
      if (found >= 0) { setActiveSection(found); return; }
      const stops = [...draft.stops]; stops.splice(activeIndex, 0, { portId: cell.portId, refuelTargetPercent: 100 });
      const current = draft.legs[activeIndex], split = Math.floor(current.waypointHexIds.length / 2);
      const legs = [...draft.legs]; legs.splice(activeIndex, 1,
        { waypointHexIds: current.waypointHexIds.slice(0, split) }, { waypointHexIds: current.waypointHexIds.slice(split) });
      if (commit({ stops, legs })) setActiveSection(activeIndex);
    }
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
    current.moved = true;
    const matrix = event.currentTarget.getScreenCTM(); if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const nearest = hexMap.filter(cell => cell.kind === "sea").map(cell => ({ cell, point: getMapCenter(cell) }))
      .sort((a, b) => Math.hypot(a.point.x - p.x, a.point.y - p.y) - Math.hypot(b.point.x - p.x, b.point.y - p.y))[0];
    if (!nearest || Math.hypot(nearest.point.x - p.x, nearest.point.y - p.y) > MAP_HEX_SIZE) { current.next = null; setCandidate(null); setCandidateMessage("海上HEXに通過地点を置いてください。"); return; }
    const leg = draft.legs[current.section], points = [...leg.waypointHexIds]; points[current.waypoint] = nearest.cell.id;
    current.next = { ...draft, legs: draft.legs.map((item, index) => index === current.section ? { waypointHexIds: points } : item) };
    const checked = buildVoyagePlanRoute(endpoints, current.next);
    setCandidate(checked.ok ? current.next : null); setCandidateMessage(checked.ok ? "指を離すと候補航路を確定します。" : checked.message);
  };
  const finish = (event: ReactPointerEvent<SVGSVGElement>, cancel = false) => {
    const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    suppressClick.current = current.moved;
    if (!cancel && current.moved && current.next) commit(current.next);
    else if (!cancel && current.moved) setMessage(candidateMessage || "無効な候補です。直前の有効な航路を維持しました。");
    setCandidate(null); setCandidateMessage("");
  };
  const target = Math.min(worldForecast.validTo - 1, Math.max(worldForecast.validFrom, selectedRealTime));
  const rows = new Map<string, { directionShort: string; directionLabel: string; speedLabel: string; deltaLabel: string; effect: string; color: string }>();
  const headings = new Map<string, number>();
  for (const passage of passages) if (!headings.has(passage.hexId) || passage.sectionIndex === activeIndex) headings.set(passage.hexId, passage.headingDeg);
  for (const cell of hexMap) {
    if (cell.kind !== "sea") continue;
    const slot = getWorldPlanForecastAt(worldForecast, cell.id, target); if (!slot) continue;
    const heading = headings.get(cell.id);
    rows.set(cell.id, describeNumericWind(slot.forecastWind, heading ?? 0, heading !== undefined));
  }
  const missing = hexMap.some(cell => cell.kind === "sea" && !rows.has(cell.id));
  const timelineSpeed = selectedSpeedKnots ?? selectedShip?.cruisingSpeedKnots;
  const weatherResult = (() => {
    if (!timelineSpeed || !selectedShip) return { hasDelay: false, hasMissing: true };
    try {
      const cargo = getCargoById(contract.cargoId);
      const loadFactor = getHeavyLoadSpeedFactor(contract, selectedShip);
      const loadMs = cargo.loadingTimeMsPerUnit * contract.quantity;
      const departure = baseRealTime + loadMs / GAME_TIME_MULTIPLIER;
      const end = Math.min(worldForecast.validTo - 1, departure + route.sections.reduce((total, section) => total + buildRouteWindLegs(section.hexIds).reduce((sum, leg) => sum + leg.distanceNm, 0), 0) / timelineSpeed * 3600000 / GAME_TIME_MULTIPLIER);
      const timeline = buildPlanTimeline(route, baseRealTime, departure, timelineSpeed);
      const extracted = buildVoyagePlanForecastFromWorld(route, worldForecast);
      const value = evaluatePlanWeather(timeline, extracted);
      return { hasDelay: value.hasDelay, hasMissing: value.hasMissing || end > worldForecast.validTo };
    } catch { return { hasDelay: false, hasMissing: true }; }
  })();
  const position = (() => {
    try {
      if (!selectedShip || !timelineSpeed) return null;
      const departure = baseRealTime + getCargoById(contract.cargoId).loadingTimeMsPerUnit * contract.quantity / GAME_TIME_MULTIPLIER;
      const timeline = buildPlanTimeline(route, baseRealTime, departure, timelineSpeed);
      return getPlanPosition(timeline, target);
    } catch { return null; }
  })();
  const displayed = candidateResult?.ok ? candidateResult.route : route;
  const renderedTerrain = worldMap.terrain.map(cell => ({ key: `${cell.q},${cell.r}`, points: pointString(cell.q, cell.r), kind: cell.kind }));
  const routeLine = (section: typeof route.sections[number]) => section.hexIds.map(id => { const p = getMapCenter(cells.get(id)!); return `${p.x},${p.y}`; }).join(" ");
  const selectedCell = selectedHexId ? cells.get(selectedHexId) : undefined;
  const selectedSlot = selectedCell?.kind === "sea" ? getWorldPlanForecastAt(worldForecast, selectedCell.id, target) : null;
  const selectedHeading = selectedCell?.kind === "sea" ? passages.find(item => item.hexId === selectedCell.id && item.sectionIndex === activeIndex)?.headingDeg : undefined;
  const selectedInfo = selectedSlot ? describeNumericWind(selectedSlot.forecastWind, selectedHeading ?? 0, selectedHeading !== undefined) : null;
  return <section className="card detail-card route-weather-editor" aria-label="ルート編集と気象予測">
    <div className="route-weather-toolbar"><h3>ルート編集／気象予測</h3><div role="group" aria-label="航路と海図の操作">
      <button type="button" disabled={history.length < 2} onClick={() => { setHistory(old => old.slice(0,-1)); setMessage(""); }}>取り消し</button>
      <button type="button" onClick={() => { commit(initialDraft()); setActiveSection(0); }}>最短ルートへ戻す</button>
      <button type="button" disabled={zoom<=1} onClick={()=>setZoom(v=>Math.max(1,v-.5))}>縮小</button><output>{Math.round(zoom*100)}%</output>
      <button type="button" disabled={zoom>=3} onClick={()=>setZoom(v=>Math.min(3,v+.5))}>拡大</button>
      <button type="button" onClick={()=>{setZoom(1);setSelectedRealTime(worldForecast.capturedAt);}}>全体表示</button>
      <button type="button" onClick={onRequestForecastRefresh}>予報を更新</button>
    </div></div>
    <p>海域を選択して通過地点を追加、青い点をドラッグして移動。港を選ぶと途中寄港を追加します。出発・目的港は固定です。</p>
    <label>編集区間 <select value={activeIndex} onChange={event=>setActiveSection(Number(event.target.value))}>
      {route.sections.map((section,index)=><option key={index} value={index}>{index+1}. {getPortById(section.fromPortId).name} → {getPortById(section.toPortId).name}</option>)}
    </select></label>
    <p>計画距離 {result.totalDistanceNm}海里 ／ ウェイポイント {totalWaypoints}/8</p>
    <div className="route-weather-map-scroll" role="region" aria-label="全海域の予報・航路編集海図">
      <svg viewBox={getMapViewBox(worldMap.terrain.map(getMapCenter))} aria-label="全海域の風予報、編集航路、計画位置" style={{display:"block",width:`${zoom*100}%`,minWidth:600,touchAction:"pan-x pan-y"}}
        onPointerMove={move} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={()=>{drag.current=null;setCandidate(null);}}>
        {renderedTerrain.map(cell=><polygon key={cell.key} points={cell.points} fill={cell.kind==="land"?MAP_COLORS.land:MAP_COLORS.sea} stroke="white"/>)}
        {hexMap.filter(cell=>cell.kind==="port").map(cell=><polygon key={`port-${cell.id}`} points={pointString(cell.q,cell.r)} fill={MAP_COLORS.port} stroke="white"/>)}
        {hexMap.filter(cell=>cell.kind==="sea").map(cell=>{const wind=rows.get(cell.id);if(!wind)return null;const p=getMapCenter(cell),onRoute=headings.has(cell.id);const heading=headings.get(cell.id);
          const angle=onRoute&&selectedHeading!==undefined&&selectedCell?.id===cell.id?selectedHeading:(wind.directionShort==="北"?0:wind.directionShort==="東"?90:wind.directionShort==="南"?180:wind.directionShort==="西"?270:wind.directionShort==="北東"?45:wind.directionShort==="南東"?135:wind.directionShort==="南西"?225:wind.directionShort==="北西"?315:0);
          const size=Math.max(5,Math.min(14,5+Number.parseFloat(wind.speedLabel)*.8));
          return <g key={`wind-${cell.id}`} pointerEvents="none"><circle cx={p.x} cy={p.y} r={9} fill={wind.color} fillOpacity={.14}/><path d={`M 0 ${size/2} L 0 ${-size/2} M ${-size/3} ${-size/6} L 0 ${-size/2} L ${size/3} ${-size/6}`} transform={`translate(${p.x} ${p.y}) rotate(${angle})`} stroke={wind.color} strokeWidth={onRoute?2.5:1.6} fill="none"/><title>{`${cell.id}: ${wind.speedLabel}${onRoute?`, 速力${wind.deltaLabel}`:""}`}</title></g>;})}
        {displayed.sections.map((section,index)=><polyline key={`route-${index}`} points={routeLine(section)} fill="none" stroke={index===activeIndex?"#8a4b17":"#64748b"} strokeWidth={4} strokeDasharray={candidate?"7 5":undefined} pointerEvents="none"/>)}
        {hexMap.filter(cell=>cell.kind==="port").map(cell=>{const p=getMapCenter(cell);return <text key={`port-label-${cell.id}`} x={p.x} y={p.y+4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#254B5C" stroke="white" strokeWidth={2} paintOrder="stroke">{getPortById(cell.portId!).name}</text>;})}
        {route.sections.flatMap((section,index)=>section.waypointHexIds.map((id,pointIndex)=>{const p=getMapCenter(cells.get(id)!);return <g key={`wp-${index}-${pointIndex}`}>
          <circle cx={p.x} cy={p.y} r={13} fill="#2563eb" stroke="white" strokeWidth={2} style={{touchAction:"none",cursor:"grab"}} onPointerDown={event=>{if(!event.isPrimary||event.button!==0)return;event.preventDefault();event.stopPropagation();drag.current={pointerId:event.pointerId,section:index,waypoint:pointIndex,x:event.clientX,y:event.clientY,moved:false,next:null};event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);}}/>
          <text x={p.x} y={p.y+4} textAnchor="middle" fill="white" fontSize={10} pointerEvents="none">{index+1}-{pointIndex+1}</text></g>;}))}
        {hexMap.filter(cell=>cell.kind==="sea").map(cell=><polygon key={`sea-hit-${cell.id}`} points={pointString(cell.q,cell.r)} fill="transparent" stroke="transparent" role="button" tabIndex={0} aria-label={`海域${cell.id}を選択`}
          onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}chooseCell(cell.id);}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();chooseCell(cell.id);}}}/>)}
        {hexMap.filter(cell=>cell.kind==="port").map(cell=><polygon key={`port-hit-${cell.id}`} points={pointString(cell.q,cell.r)} fill="transparent" stroke="transparent" role="button" tabIndex={0} aria-label={`${getPortById(cell.portId!).name}を選択`}
          onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}chooseCell(cell.id);}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();chooseCell(cell.id);}}}/>)}
        {position&&(()=>{const p=getMapCenter(position.axial);return <g pointerEvents="none" data-plan-hex={position.hexId}><circle cx={p.x} cy={p.y} r={13} fill="none" stroke="#7c3aed" strokeWidth={3} strokeDasharray="4 2"/><text x={p.x} y={p.y-17} textAnchor="middle" fontSize={10} fill="#5b21b6" stroke="white" strokeWidth={3} paintOrder="stroke">計画位置</text></g>;})()}
      </svg>
    </div>
    <label>海図時刻 {timeLabel(target)} <input aria-label="海図全域の気象予報時刻" type="range" min={worldForecast.validFrom} max={worldForecast.validTo-1} step={SEA_CONDITION_SLOT_MS} value={target} onChange={event=>setSelectedRealTime(Number(event.target.value))}/></label>
    <div className="route-weather-legend"><span>全海域に風向・風の強さを表示</span><span>航路上のみ 速力増加=緑／減少=赤</span><span>風=矢印の向きと長さ</span></div>
    {!selectedShip&&<p>船未選択のため計画位置と速力補正は未表示です。風予報だけを表示しています。</p>}
    {missing&&<p role="status">選択時刻の一部または全海域は予報なしです。風を推測して表示しません。</p>}
    {selectedDescription&&<p aria-live="polite">選択HEX：風向 {selectedDescription.directionLabel} ／ 風速 {selectedDescription.speedLabel} ／ 航路速力補正 {selectedDescription.deltaLabel}</p>}
    <p role="status" aria-live="polite">{evaluation.hasDelay&&PLAN_DELAY_NOTICE}{evaluation.hasMissing&&` ${PLAN_FORECAST_MISSING_NOTICE}`}{!evaluation.hasDelay&&!evaluation.hasMissing&&`${PLAN_NO_DELAY_NOTICE}（定刻到着の保証ではありません）。`}</p>
    <p>遅延注意は時間バーの1時点ではなく、全区間の計画通過時刻と重なる予報から判定。気象補正ETA・遅延分数・早着予告は計算せず、表示操作で実航行・燃料・保存を変更しません。</p>
    {draft.legs.flatMap((leg,index)=>leg.waypointHexIds.map(id=><p key={`waypoint-list-${index}-${id}`}>通過地点 {index+1}: {id} <button type="button" onClick={()=>{const next={...draft,legs:draft.legs.map((item,n)=>n===index?{waypointHexIds:item.waypointHexIds.filter(value=>value!==id)}:item)};commit(next);}}>削除</button></p>))}
    {route.sections.slice(0,-1).map((section,index)=><div key={`stop-${section.toPortId}`} className="route-stop-settings"><label>{getPortById(section.toPortId).name} 補油目標 {section.refuelTargetPercent}% <input type="range" min={0} max={100} step={1} value={section.refuelTargetPercent} onChange={event=>commit({...draft,stops:draft.stops.map((stop,n)=>n===index?{...stop,refuelTargetPercent:Number(event.target.value)}:stop})}/></label><button type="button" onClick={()=>{const stops=draft.stops.filter((_,n)=>n!==index),legs=[...draft.legs];legs.splice(index,2,{waypointHexIds:[...draft.legs[index].waypointHexIds,...draft.legs[index+1].waypointHexIds]});commit({stops,legs});}}>寄港を削除</button></div>)}
    <p>予報発行 {timeLabel(worldForecast.issuedAt)} ／ 取得 {timeLabel(worldForecast.capturedAt)}</p>
    <p role="status">{message||candidateMessage}</p>
  </section>;
}
