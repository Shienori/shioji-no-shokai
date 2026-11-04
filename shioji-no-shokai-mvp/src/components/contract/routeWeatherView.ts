import type { PlanTimeline } from "../../domain/planWeather";
import { getHexById } from "../../data/hexMap";
import { getMapCenter } from "../map/mapGeometry";
export interface WeatherAssessment {
  sectionIndex: number; hexId: string; startsAt: number; endsAt: number; hasDelay: boolean; hasMissing: boolean;
}
export interface WeatherSegment {
  id: string; index: number; sectionIndex: number; from: { x: number; y: number }; to: { x: number; y: number };
  startsAt: number; endsAt: number; hasDelay: boolean; hasMissing: boolean;
}
export interface WeatherNotice {
  id: string; number: number; sectionIndex: number; x: number; y: number;
  startsAt: number; endsAt: number; hasDelay: boolean; hasMissing: boolean; segments: WeatherSegment[];
}
export function buildRouteWeatherView(timeline: PlanTimeline | null, assessments: readonly WeatherAssessment[] = []) {
  if (!timeline) return { segments: [] as WeatherSegment[], notices: [] as WeatherNotice[] };
  const segments: WeatherSegment[] = timeline.passages.map((passage, index) => {
    const found = assessments[index];
    const matches = found && found.sectionIndex === passage.sectionIndex && found.hexId === passage.hexId && found.startsAt === passage.startsAt && found.endsAt === passage.endsAt;
    return { id: `${passage.sectionIndex}:${index}`, index, sectionIndex: passage.sectionIndex,
      from: getMapCenter(getHexById(passage.hexId)), to: getMapCenter(getHexById(passage.nextHexId)),
      startsAt: passage.startsAt, endsAt: passage.endsAt,
      hasDelay: matches ? found.hasDelay : false, hasMissing: matches ? found.hasMissing : true };
  });
  const notices: WeatherNotice[] = [];
  let previous: WeatherSegment | null = null;
  for (const segment of segments) {
    if (!segment.hasDelay && !segment.hasMissing) { previous = segment; continue; }
    const last = notices[notices.length - 1];
    const joins = previous && previous.index + 1 === segment.index && last && last.segments[last.segments.length - 1].id === previous.id &&
      last.sectionIndex === segment.sectionIndex && last.hasDelay === segment.hasDelay && last.hasMissing === segment.hasMissing;
    if (joins) { last.segments.push(segment); last.endsAt = segment.endsAt; }
    else notices.push({ id: segment.id, number: notices.length + 1, sectionIndex: segment.sectionIndex,
      x: 0, y: 0, startsAt: segment.startsAt, endsAt: segment.endsAt,
      hasDelay: segment.hasDelay, hasMissing: segment.hasMissing, segments: [segment] });
    previous = segment;
  }
  for (const notice of notices) {
    const middle = notice.segments[Math.floor(notice.segments.length / 2)];
    notice.x = (middle.from.x + middle.to.x) / 2;
    notice.y = (middle.from.y + middle.to.y) / 2;
  }
  return { segments, notices };
}
