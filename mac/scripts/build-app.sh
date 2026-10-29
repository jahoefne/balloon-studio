#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache dist
xcrun swiftc -O -module-cache-path "$(pwd)/.build/module-cache" scripts/create-icon.swift -o .build/create-icon
.build/create-icon .build/AppIcon.iconset
APP="$(pwd)/dist/Balloon Studio.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
xcrun swiftc -O -parse-as-library -swift-version 5 \
  -module-cache-path "$(pwd)/.build/module-cache" \
  -target arm64-apple-macosx14.0 \
  Sources/BalloonStudio/*.swift \
  -o "$APP/Contents/MacOS/BalloonStudio"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>BalloonStudio</string>
<key>CFBundleIdentifier</key><string>local.balloonstudio.mac</string>
<key>CFBundleName</key><string>Balloon Studio</string>
<key>CFBundleDisplayName</key><string>Balloon Studio</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.29.3</string>
<key>CFBundleVersion</key><string>38</string>
<key>CFBundleDocumentTypes</key><array><dict>
<key>CFBundleTypeName</key><string>STL Model</string>
<key>CFBundleTypeRole</key><string>Editor</string>
<key>LSHandlerRank</key><string>Alternate</string>
<key>CFBundleTypeExtensions</key><array><string>stl</string></array>
</dict><dict>
<key>CFBundleTypeName</key><string>Balloon Studio Lamp Settings</string>
<key>CFBundleTypeRole</key><string>Viewer</string>
<key>LSHandlerRank</key><string>Alternate</string>
<key>LSItemContentTypes</key><array><string>public.json</string></array>
<key>CFBundleTypeExtensions</key><array><string>json</string></array>
</dict></array>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>NSHumanReadableCopyright</key><string>Balloon Studio</string>
</dict></plist>
PLIST
if [ -f .build/AppIcon.icns ]; then cp .build/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"; fi
codesign --force --deep --sign - "$APP"
echo "Built $APP"
