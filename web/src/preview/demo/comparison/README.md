# Stage against SceneKit

The images here put the real `BalloonPreview.Coordinator` next to `Stage`, with the same meshes, at
1000×800, device scale 1. Mean absolute error over the whole image (ImageMagick `compare -metric MAE`):

| Case | Against SceneKit as framed | Against SceneKit, roll removed |
| --- | --- | --- |
| Balloon Classic, Saffron | 0.12 % | 0.12 % |
| Balloon, opening (hollow) | 0.07 % | 0.07 % |
| Balloon, filled neck | 4.06 % | 0.09 % |
| Balloon, hollow cutaway | 0.13 % | 0.13 % |
| Balloon, hanger | 2.09 % | 0.08 % |
| Ring reflected, assembled | 1.28 % | 0.15 % |
| Ring reflected, solid, top down | 0.17 % | 0.17 % |
| Cloud exploded | 0.51 % | 0.10 % |
| Basket | 1.10 % | 0.11 % |

"Roll removed" is explained in the SWIFT-DIFF note at the top of `framing.ts`. What remains is mostly
anti-aliased edges and thin grid lines: SceneKit resolves MSAA and blends in linear light, WebGL in sRGB.

## How to repeat it

`refrender.swift` renders through the Coordinator and dumps each mesh. Build it with the core files of
`mac/scripts/build-reference-exporter.sh` plus `BalloonPreview.swift`, from `mac/`:

```bash
DEVELOPER_DIR=/Library/Developer/CommandLineTools xcrun swiftc -O -parse-as-library -swift-version 5 -target arm64-apple-macosx14.0 <those files> ../web/src/preview/demo/comparison/refrender.swift -o /tmp/refrender
```

`/tmp/refrender <dir>` writes `<case>.scenekit.png`, `<case>.bin` and `<case>.json`; any second argument
writes `<case>.noroll.png` instead. Serve `<dir>` with CORS, for example on port 8765, run `npm run dev`
and open the demo page with the case, or shoot it headless:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=metal --ignore-gpu-blocklist --hide-scrollbars --force-device-scale-factor=1 --window-size=1000,800 --virtual-time-budget=6000 --screenshot=<case>.web.png "http://localhost:5173/balloon-studio/src/preview/demo/index.html?case=http://127.0.0.1:8765/<case>"
```

`&shininess=<n>` and `&specular=<int>` override the material. With `specular` at 0x474747 the error over
the shininess sweep has its minimum at 48, and `0.38 × 128 = 48.64`:

| Shininess | Balloon | Basket | Cloud | Solid ring |
| --- | --- | --- | --- | --- |
| 0.38 | 0.55 % | 2.05 % | 0.92 % | 0.35 % |
| 8 | 0.24 % | 1.23 % | 0.56 % | 0.24 % |
| 24 | 0.15 % | 1.10 % | 0.51 % | 0.18 % |
| 48 | 0.12 % | 1.10 % | 0.51 % | 0.17 % |
| 128 | 0.13 % | 1.10 % | 0.51 % | 0.18 % |
