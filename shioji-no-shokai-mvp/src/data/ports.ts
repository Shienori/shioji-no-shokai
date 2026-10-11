import type { Port } from "../domain/types";

export const ports: Port[] = [
  { id: "port_aldera", name: "王都港アルデア", description: "王国の中心に位置する大港。" },
  { id: "port_selene", name: "セレネ港", description: "農業と漁業の港。" },
  { id: "port_rigel", name: "リゲル港", description: "鉄と武器を扱う工業港。" }
];

export function getPortById(id: string): Port {
  const port = ports.find((item) => item.id === id);
  if (!port) throw new Error(`Unknown port: ${id}`);
  return port;
}
