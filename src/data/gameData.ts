export const PORTS = [
  { id: "shioh", name: "白穂港シホ" },
  { id: "aldea", name: "王都港アルデア" },
  { id: "selene", name: "セレネ港" },
];

export const ROUTES = [
  { id: "shioh-aldea", from: "shioh", to: "aldea", hours: 6 },
  { id: "aldea-selene", from: "aldea", to: "selene", hours: 8 },
];

export const CARGOS = [
  { id: "wheat", name: "小麦" },
  { id: "fish", name: "鮮魚" },
  { id: "silk", name: "絹布" },
  { id: "spice", name: "香辛料" },
];

export const CONTRACTS = [
  {
    id: "contract_001",
    cargoId: "wheat",
    quantity: 10,
    reward: 60,
    from: "shioh",
    to: "aldea",
    dueHours: 16,
  },
  {
    id: "contract_002",
    cargoId: "fish",
    quantity: 8,
    reward: 72,
    from: "aldea",
    to: "selene",
    dueHours: 18,
  },
  {
    id: "contract_003",
    cargoId: "silk",
    quantity: 5,
    reward: 100,
    from: "selene",
    to: "shioh",
    dueHours: 20,
  },
];

export const SHIP = {
  id: "ship_001",
  name: "初期帆船",
  status: "docked",
};
