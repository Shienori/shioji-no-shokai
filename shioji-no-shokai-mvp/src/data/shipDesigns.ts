/** Approved fictional concept design, not a certified vessel or a historical replica. */
export const shionamiDesignV1 = {
  version: "shionami-design-v1",
  shipId: "ship_shionami",
  name: "潮鳴号",
  hullMaterialLabel: "木造",
  propulsionLabel: "初期型蒸気機関・両舷外輪式",
  referenceLabel: "コメット号を参考にした架空の小型外輪貨物船",
  dimensions: {
    lengthOverallM: 14,
    lengthWaterlineM: 13,
    hullBeamM: 4,
    overallBeamMinM: 6,
    overallBeamMaxM: 6.5,
    mouldedDepthM: 1.9,
    fullLoadDraftM: 1.2,
  },
  nominalFullLoadDisplacementTons: 35,
  weightBudgetTons: {
    hullMachineryEquipmentAndOperatingWater: 18,
    cargo: 10,
    coal: 5,
    crewFreshWaterStoresAndSpares: 2,
  },
  cargoCapacity: {
    maxWeightTons: 10,
    maxVolumeM3: 12,
    applicationStatus: "active-for-new-contracts",
  },
  fuel: {
    fuelType: "coal",
    capacityTons: 5,
    referenceSpeedKnots: 6,
    referenceConsumptionTonsPerVoyageHour: 0.2,
  },
  speed: { cruisingKnots: 6, continuousMaxKnots: 7 },
  validationStatus: "concept-only",
} as const;

export function getShipDesign(shipId: string) {
  return shipId === shionamiDesignV1.shipId ? shionamiDesignV1 : null;
}
