# Acceptance-time numeric forecasts

Base: 9e53b99566fb1f3fbabce96ec2ab808da29bc67d. Branch: feature/contract-wind-forecast-snapshot.

New contracts receive windForecastSnapshot before ID/state updates: schema/model versions, capture/issue times, route order and 96 slots per distinct sea HEX. Values are copied; reader returns copies or null outside coverage, never a newer edition. No actual-wind/hit fields are stored.

Existing seaForecast, save version/key, money, deadlines, offers and voyage physics/UI are unchanged. Snapshot generation errors propagate before the existing store updates or saves. No new error UI or gameStore refactor.

Loading never regenerates. Missing snapshots stay missing. Invalid/unsupported-schema snapshots are removed in memory and marked windForecastSnapshotIssue='invalid', preserving the contract/game. loadGame does not overwrite storage; a later normal save persists normalization. Structurally valid historical model labels remain valid without current-map lookup. This is not general repair of all old saves.

CI runs snapshot, contract regression, forecast and coastal tests plus build on this feature branch only; contents:read, 15-minute timeout, no automatic commits/merges, logs retained 7 days. Test syntax checked locally; Vite tests/TypeScript build and deployed behavior remain unverified until CI.
