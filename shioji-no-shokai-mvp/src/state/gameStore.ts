既存の全内容を保持し、acceptContract 内の既定速度のみ次へ変更します。

const speed =
  selectedSpeedKnots === undefined
    ? ship.standardSpeedKnots ?? ship.cruisingSpeedKnots
    : selectedSpeedKnots;