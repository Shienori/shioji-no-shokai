import { useEffect, useRef, useState } from "react";
import { HexMap } from "./HexMap";

type Point = { x: number; y: number };
type Camera = Point & { scale: number };
type Controls = { zoom: (factor: number) => void; reset: () => void };
const MAX_ZOOM = 4;

export function MapViewport() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<Controls | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const viewport = viewportRef.current;
    const surface = surfaceRef.current;
    const content = contentRef.current;
    if (!viewport || !surface || !content) return;
    const pointers = new Map<number, Point>();
    let fit = 1;
    let camera: Camera = { x: 0, y: 0, scale: 1 };
    const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
    const constrainAxis = (position: number, size: number, available: number) =>
      size <= available ? (available - size) / 2 : clamp(position, available - size - 32, 32);
    const apply = (next: Camera) => {
      camera = {
        scale: next.scale,
        x: constrainAxis(next.x, content.offsetWidth * next.scale, surface.clientWidth),
        y: constrainAxis(next.y, content.offsetHeight * next.scale, surface.clientHeight),
      };
      content.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
      setZoom(camera.scale / fit);
    };
    const reset = () => {
      const width = content.offsetWidth;
      const height = content.offsetHeight;
      if (!width || !height || !surface.clientWidth || !surface.clientHeight) return;
      pointers.clear();
      fit = Math.min(surface.clientWidth / width, surface.clientHeight / height);
      apply({ x: 0, y: 0, scale: fit });
    };
    const zoomAt = (factor: number, before: Point, after = before) => {
      const scale = clamp(camera.scale * factor, fit, fit * MAX_ZOOM);
      const ratio = scale / camera.scale;
      apply({ scale, x: after.x - (before.x - camera.x) * ratio, y: after.y - (before.y - camera.y) * ratio });
    };
    const local = (event: { clientX: number; clientY: number }): Point => {
      const rect = surface.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      surface.focus({ preventScroll: true });
      pointers.set(event.pointerId, local(event));
      surface.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const before = Array.from(pointers.values());
      const next = local(event);
      pointers.set(event.pointerId, next);
      const after = Array.from(pointers.values());
      if (before.length === 1) {
        apply({ ...camera, x: camera.x + next.x - previous.x, y: camera.y + next.y - previous.y });
      } else if (before.length === 2) {
        const oldDistance = distance(before[0], before[1]);
        if (oldDistance > 0) zoomAt(distance(after[0], after[1]) / oldDistance, midpoint(before[0], before[1]), midpoint(after[0], after[1]));
      }
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    };
    const onLost = (event: PointerEvent) => { pointers.delete(event.pointerId); };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1);
      zoomAt(Math.exp(clamp(-delta * 0.002, -1, 1)), local(event));
    };
    const zoomCenter = (factor: number) => zoomAt(factor, { x: surface.clientWidth / 2, y: surface.clientHeight / 2 });
    const onKey = (event: KeyboardEvent) => {
      const directions: Record<string, Point> = { ArrowLeft: { x: 40, y: 0 }, ArrowRight: { x: -40, y: 0 }, ArrowUp: { x: 0, y: 40 }, ArrowDown: { x: 0, y: -40 } };
      if (directions[event.key]) {
        event.preventDefault();
        const delta = directions[event.key];
        apply({ ...camera, x: camera.x + delta.x, y: camera.y + delta.y });
      } else if (["+", "=", "-", "0", "Home"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "0" || event.key === "Home") reset();
        else zoomCenter(event.key === "-" ? 1 / 1.25 : 1.25);
      }
    };
    const resizeHeight = () => {
      viewport.style.height = `${Math.max(160, window.innerHeight - viewport.getBoundingClientRect().top)}px`;
    };
    controlsRef.current = { zoom: zoomCenter, reset };
    surface.addEventListener("pointerdown", onDown);
    surface.addEventListener("pointermove", onMove);
    surface.addEventListener("pointerup", onUp);
    surface.addEventListener("pointercancel", onUp);
    surface.addEventListener("lostpointercapture", onLost);
    surface.addEventListener("wheel", onWheel, { passive: false });
    surface.addEventListener("keydown", onKey);
    window.addEventListener("resize", resizeHeight);
    window.visualViewport?.addEventListener("resize", resizeHeight);
    const observer = new ResizeObserver(reset);
    observer.observe(viewport);
    observer.observe(content);
    resizeHeight();
    reset();
    return () => {
      observer.disconnect();
      controlsRef.current = null;
      surface.removeEventListener("pointerdown", onDown);
      surface.removeEventListener("pointermove", onMove);
      surface.removeEventListener("pointerup", onUp);
      surface.removeEventListener("pointercancel", onUp);
      surface.removeEventListener("lostpointercapture", onLost);
      surface.removeEventListener("wheel", onWheel);
      surface.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", resizeHeight);
      window.visualViewport?.removeEventListener("resize", resizeHeight);
    };
  }, []);

  return <div ref={viewportRef} className="world-map-viewport">
    <div ref={surfaceRef} className="world-map-surface" tabIndex={0} role="region" aria-label="世界海図。ドラッグで移動、ピンチまたはホイールで拡大縮小。キーボードは矢印で移動、プラスとマイナスで拡大縮小、Homeで全体表示。">
      <div ref={contentRef} className="world-map-content"><HexMap ariaLabel="L型沿岸と4港の世界海図" /></div>
    </div>
    <p className="world-map-help">ドラッグで移動・ピンチ／ホイールで拡大縮小</p>
    <div className="world-map-controls" role="group" aria-label="海図の表示操作">
      <button type="button" aria-label="縮小" disabled={zoom <= 1.001} onClick={() => controlsRef.current?.zoom(1 / 1.25)}>−</button>
      <output aria-label="全体表示を100パーセントとした倍率">{Math.round(zoom * 100)}%</output>
      <button type="button" aria-label="拡大" disabled={zoom >= MAX_ZOOM - 0.001} onClick={() => controlsRef.current?.zoom(1.25)}>＋</button>
      <button type="button" onClick={() => controlsRef.current?.reset()}>全体表示</button>
    </div>
  </div>;
}
