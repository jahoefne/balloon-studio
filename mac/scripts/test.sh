#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
xcrun swiftc -O -parse-as-library -swift-version 5 \
  -module-cache-path "$(pwd)/.build/module-cache" \
  Sources/BalloonStudio/BalloonGeometry.swift Sources/BalloonStudio/BalloonPatterns.swift Sources/BalloonStudio/BalloonText.swift Sources/BalloonStudio/NightFlight.swift Sources/BalloonStudio/SummitCableCar.swift Sources/BalloonStudio/ThreeMF.swift Sources/BalloonStudio/StableJSON.swift Sources/BalloonStudio/SurfaceQuery.swift \
  Sources/BalloonStudio/CeilingLoop.swift Sources/BalloonStudio/StringHoles.swift Sources/BalloonStudio/BasketGeometry.swift Sources/BalloonStudio/RingGeometry.swift Sources/BalloonStudio/SegmentedRing.swift Sources/BalloonStudio/SunGeometry.swift Sources/BalloonStudio/CloudGeometry.swift Sources/BalloonStudio/CableSeal.swift Sources/BalloonStudio/CableClamp.swift Sources/BalloonStudio/LampSurface.swift Sources/BalloonStudio/CloudLEDLayout.swift Tests/LampSurfaceTests.swift Tests/SunTests.swift Tests/CloudTests.swift Tests/CloudShapeTests.swift Tests/CableOutletTests.swift Tests/CableClampTests.swift Tests/GeometryTests.swift \
  Sources/BalloonStudio/LampSettingsFile.swift Tests/LampSettingsTests.swift Tests/WickerTests.swift Tests/BasketHoleTests.swift \
  Sources/BalloonStudio/FigureGeometry.swift Tests/FigureTests.swift \
  Sources/BalloonStudio/NailInsert.swift Tests/NailInsertTests.swift \
  Sources/BalloonStudio/CableClip.swift Tests/CableClipTests.swift \
  -o .build/GeometryTests
.build/GeometryTests "$@"
