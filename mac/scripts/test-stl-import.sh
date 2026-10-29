#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
xcrun swiftc -O -parse-as-library -swift-version 5 \
  -module-cache-path "$(pwd)/.build/module-cache" \
  Sources/BalloonStudio/BalloonGeometry.swift Sources/BalloonStudio/BalloonPatterns.swift Sources/BalloonStudio/BalloonText.swift Sources/BalloonStudio/NightFlight.swift Sources/BalloonStudio/SummitCableCar.swift \
  Sources/BalloonStudio/ThreeMF.swift Sources/BalloonStudio/SurfaceQuery.swift \
  Sources/BalloonStudio/CeilingLoop.swift Sources/BalloonStudio/StringHoles.swift \
  Sources/BalloonStudio/BasketGeometry.swift Sources/BalloonStudio/STLImport.swift \
  Tests/STLImportTests.swift -o .build/STLImportTests
.build/STLImportTests
