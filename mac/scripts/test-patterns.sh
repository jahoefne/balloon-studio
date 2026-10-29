#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
xcrun swiftc -O -parse-as-library -swift-version 5 \
  -module-cache-path "$(pwd)/.build/module-cache" \
  Sources/BalloonStudio/BalloonGeometry.swift Sources/BalloonStudio/SurfaceQuery.swift \
  Sources/BalloonStudio/CeilingLoop.swift Sources/BalloonStudio/StringHoles.swift \
  Sources/BalloonStudio/BalloonPatterns.swift Sources/BalloonStudio/BalloonText.swift Sources/BalloonStudio/NightFlight.swift Sources/BalloonStudio/SummitCableCar.swift Sources/BalloonStudio/ThreeMF.swift Tests/PatternTests.swift Tests/NightFlightTests.swift Tests/SummitCableCarTests.swift \
  -o .build/PatternTests
.build/PatternTests
python3 scripts/verify-3mf.py
