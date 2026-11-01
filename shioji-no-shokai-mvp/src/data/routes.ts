import type { Route } from "../domain/types";

export const routes: Route[] = [
  { id: "route_selene_aldera", fromPortId: "port_selene", toPortId: "port_aldera", distance: 30, baseVoyageHours: 5 },
  { id: "route_rigel_aldera", fromPortId: "port_rigel", toPortId: "port_aldera", distance: 45, baseVoyageHours: 7.5 },
  { id: "route_selene_rigel", fromPortId: "port_selene", toPortId: "port_rigel", distance: 60, baseVoyageHours: 10 },
  { id: "route_aldera_selene", fromPortId: "port_aldera", toPortId: "port_selene", distance: 30, baseVoyageHours: 5 },
  { id: "route_aldera_rigel", fromPortId: "port_aldera", toPortId: "port_rigel", distance: 45, baseVoyageHours: 7.5 },
  { id: "route_aldera_mira", fromPortId: "port_aldera", toPortId: "port_mira", distance: 90, baseVoyageHours: 15 },
  { id: "route_mira_aldera", fromPortId: "port_mira", toPortId: "port_aldera", distance: 90, baseVoyageHours: 15 },
  { id: "route_selene_mira", fromPortId: "port_selene", toPortId: "port_mira", distance: 90, baseVoyageHours: 15 },
  { id: "route_mira_selene", fromPortId: "port_mira", toPortId: "port_selene", distance: 90, baseVoyageHours: 15 },
  { id: "route_rigel_mira", fromPortId: "port_rigel", toPortId: "port_mira", distance: 30, baseVoyageHours: 5 },
  { id: "route_mira_rigel", fromPortId: "port_mira", toPortId: "port_rigel", distance: 30, baseVoyageHours: 5 }
];

export const routesById: Record<string, Route> = Object.fromEntries(
  routes.map((route) => [route.id, route])
);

export function getRouteById(id: string): Route {
  const route = routes.find((item) => item.id === id);
  if (!route) throw new Error(`Unknown route: ${id}`);
  return route;
}
