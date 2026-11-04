import { useState } from "react";
import type { WeatherNotice, WeatherSegment } from "./routeWeatherView";
const color = (item: { hasDelay: boolean; hasMissing: boolean }) => item.hasDelay ? "#F59E0B" : item.hasMissing ? "#64748B" : "#F8FAFC";
const meaning = (item: { hasDelay: boolean; hasMissing: boolean }) => item.hasDelay && item.hasMissing ? "減速注意・一部予報不足" : item.hasDelay ? "減速注意" : item.hasMissing ? "予報不足" : "遅延注意の判定なし";
const time = (value: number) => new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
export function RouteWeatherSegments({ segments, isDraft }: { segments: readonly WeatherSegment[]; isDraft: boolean }) {
  return <g pointerEvents="none" aria-hidden="true" opacity={isDraft ? .65 : 1}>
    {segments.map(segment => {
      const dx = segment.to.x - segment.from.x, dy = segment.to.y - segment.from.y, length = Math.hypot(dx, dy);
      const x = (segment.from.x + segment.to.x) / 2, y = (segment.from.y + segment.to.y) / 2;
      const nx = length ? -dy / length * 5 : 0, ny = length ? dx / length * 5 : 0;
      return <g key={segment.id} data-weather-segment={segment.id}>
        <line x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y} stroke="#17384A" strokeWidth={9} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y} stroke={color(segment)} strokeWidth={5} strokeLinecap="round" strokeDasharray={segment.hasMissing ? segment.hasDelay ? "9 6" : "3 7" : undefined} vectorEffect="non-scaling-stroke" />
        {segment.hasDelay && length > 0 && <line x1={x - nx} y1={y - ny} x2={x + nx} y2={y + ny} stroke="#F59E0B" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
      </g>;
    })}
  </g>;
}
export function RouteWeatherMarkers({ notices, selectedId, onSelect }: { notices: readonly WeatherNotice[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  return <g>{notices.map(notice => <g key={notice.id} transform={`translate(${notice.x + 16} ${notice.y - 16})`} role="button" tabIndex={0}
    aria-label={`注意箇所${notice.number}、区間${notice.sectionIndex + 1}、${meaning(notice)}`} aria-pressed={selectedId === notice.id}
    onFocus={() => setFocusedId(notice.id)} onBlur={() => setFocusedId(null)} onPointerDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); onSelect(notice.id); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect(notice.id); } }} style={{ cursor: "pointer" }}>
    <circle r={22} fill="transparent" pointerEvents="all" />
    <line x1={-16} y1={16} x2={0} y2={0} stroke="#17384A" strokeWidth={1.5} pointerEvents="none" />
    {(selectedId === notice.id || focusedId === notice.id) && <circle r={18} fill="none" stroke="white" strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
    <circle r={13} fill="#152633" stroke={color(notice)} strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />
    <text y={1} textAnchor="middle" dominantBaseline="middle" fill={color(notice)} fontSize={14} fontWeight={700} pointerEvents="none">{notice.hasDelay ? notice.number : "?"}</text>
    {notice.hasDelay && notice.hasMissing && <g transform="translate(12 -12)" pointerEvents="none"><circle r={7} fill="#64748B" stroke="white" /><text y={1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={10}>?</text></g>}
  </g>)}</g>;
}
export function RouteWeatherLegend() {
  return <div aria-label="航路の通過時予報の凡例" style={{ marginTop: 8, fontSize: 12 }}>
    <p>航路の線は各区間の計画通過時刻の評価です。時間バーで選んだ時刻の全海域の風とは異なります。</p>
    <p><span style={{ color: "#F8FAFC" }}>━ 通常</span> ／ <span style={{ color: "#F59E0B" }}>━┿ 減速注意</span> ／ <span>┄ ? 予報不足</span> ／ 橙の破線＋?：減速注意と予報不足</p>
    <p>通常は「遅延注意の判定なし」であり、無風や定刻到着を保証しません。番号・?を選ぶと通過時間を確認できます。</p>
  </div>;
}
export function RouteWeatherDetail({ notice, count, onShowTime, onNext }: { notice: WeatherNotice | null; count: number; onShowTime: (time: number) => void; onNext: () => void }) {
  return <section aria-label="航路の注意箇所" style={{ marginTop: 8, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
    <div aria-live="polite" aria-atomic="true">{notice ? <>
      <h4>注意箇所{notice.number}：区間{notice.sectionIndex + 1} ／ {meaning(notice)}</h4>
      <p>計画通過 {time(notice.startsAt)}〜{time(notice.endsAt)}</p>
      {notice.hasDelay && <p>通過予定時間に、設定速力から5%以上減速する予報を含みます。到着の遅れを断定するものではありません。</p>}
      {notice.hasMissing && <p>通過予定時間の予報が一部または全部不足しています。気象影響を十分に判断できません。</p>}
    </> : <p>{count ? `注意箇所は${count}か所です。海図の番号・?を選択してください。` : "表示中の計画に注意箇所はありません。予報上の評価であり、定刻到着の保証ではありません。"}</p>}</div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" disabled={!notice} onClick={() => { if (notice) onShowTime(notice.startsAt); }}>この時刻を見る</button>
      <button type="button" disabled={count === 0} onClick={onNext}>{notice ? "次の注意箇所" : "最初の注意箇所"}</button>
    </div>
  </section>;
}
