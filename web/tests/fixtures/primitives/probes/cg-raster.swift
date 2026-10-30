// CoreGraphics rasterizer behaviour for WP-R2 (web/src/core/raster/{scanline,clip,gradient,canvas}.ts).
// Draws one context at a time (CoreGraphics is not deterministic across threads, docs/plan.md §13).
// Build and run from this directory; stdout is the fixture:
//   DEVELOPER_DIR=/Library/Developer/CommandLineTools xcrun swiftc -O cg-raster.swift -o /tmp/cg-raster
//   /tmp/cg-raster | gzip -9 -n > cg-raster.txt.gz
import CoreGraphics
import Foundation

func draw(_ w: Int, _ h: Int, _ body: (CGContext) -> Void) -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: w * h)
    bytes.withUnsafeMutableBytes { buffer in
        let c = CGContext(data: buffer.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                          space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
        c.translateBy(x: 0, y: CGFloat(h)); c.scaleBy(x: 1, y: -1)
        c.setFillColor(gray: 1, alpha: 1)
        body(c)
    }
    return bytes
}
func P(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x, y: y) }
func gradient(_ a: Double, _ b: Double) -> CGGradient {
    CGGradient(colorSpace: CGColorSpaceCreateDeviceGray(), colorComponents: [CGFloat(a), 1, CGFloat(b), 1], locations: [0, 1], count: 2)!
}
func rect(_ p: CGMutablePath, _ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double, ccw: Bool = true) {
    p.move(to: P(x0, y0))
    if ccw {
        p.addLine(to: P(x1, y0)); p.addLine(to: P(x1, y1)); p.addLine(to: P(x0, y1))
    } else {
        p.addLine(to: P(x0, y1)); p.addLine(to: P(x1, y1)); p.addLine(to: P(x1, y0))
    }
    p.closeSubpath()
}
func hex(_ bytes: ArraySlice<UInt8>) -> String { bytes.map { String(format: "%02x", $0) }.joined() }
func raster(_ name: String, _ w: Int, _ h: Int, _ bytes: [UInt8]) {
    print("RASTER \(name) \(w) \(h)")
    for y in 0..<h { print(hex(bytes[(y * w)..<((y + 1) * w)])) }
}

// A rectangle with one fractional edge: coverage of the partly covered pixel.
print("EDGE_X")
for i in 0...64 {
    let f = Double(i) / 64
    let b = draw(16, 16) { c in let p = CGMutablePath(); rect(p, 4 + f, 2, 12, 10); c.addPath(p); c.fillPath() }
    print(i, b[5 * 16 + 4])
}
print("EDGE_Y")
for i in 0...64 {
    let f = Double(i) / 64
    let b = draw(16, 16) { c in let p = CGMutablePath(); rect(p, 2, 4 + f, 10, 12); c.addPath(p); c.fillPath() }
    print(i, b[4 * 16 + 5])
}

// Subpaths meeting inside one pixel, in one fill: row 2 of a 16 × 8 canvas.
print("UNION")
func union(_ name: String, rule: CGPathFillRule = .winding, _ build: (CGMutablePath) -> Void) {
    let p = CGMutablePath(); build(p)
    let b = draw(16, 8) { c in c.addPath(p); c.fillPath(using: rule) }
    print(name, b[32..<48].map(String.init).joined(separator: " "))
}
union("right-edges-0.5-0.25") { p in rect(p, 2, 0, 8.5, 8); rect(p, 4, 0, 8.25, 8) }
union("left-edges-0.5-0.25") { p in rect(p, 8.5, 0, 14, 8); rect(p, 8.25, 0, 12, 8) }
union("abutting-at-8.4") { p in rect(p, 2, 0, 8.4, 8); rect(p, 8.4, 0, 14, 8) }
union("overlap-0.6-0.7") { p in rect(p, 2, 0, 8.6, 8); rect(p, 8.3, 0, 14, 8) }
union("gap-8.3-8.6") { p in rect(p, 2, 0, 8.3, 8); rect(p, 8.6, 0, 14, 8) }
union("opposite-directions") { p in rect(p, 2, 0, 10.5, 8); rect(p, 6.25, 0, 14, 8, ccw: false) }
union("evenodd", rule: .evenOdd) { p in rect(p, 2, 0, 10.5, 8); rect(p, 6.25, 0, 14, 8) }
union("same-rect-twice") { p in rect(p, 2, 0, 8.5, 8); rect(p, 2, 0, 8.5, 8) }
union("same-rect-opposite") { p in rect(p, 2, 0, 8.5, 8); rect(p, 2, 0, 8.5, 8, ccw: false) }

// setShouldAntialias(false): every pixel the fill touches.
print("ALIASED")
func aliased(_ name: String, rule: CGPathFillRule = .winding, _ build: (CGMutablePath) -> Void) {
    let p = CGMutablePath(); build(p)
    let b = draw(10, 8) { c in c.setShouldAntialias(false); c.addPath(p); c.fillPath(using: rule) }
    print(name, hex(b[0..<80]))
}
aliased("tiny-inside-a-pixel") { p in rect(p, 4.1, 4.1, 4.2, 4.2) }
aliased("thin-column") { p in rect(p, 4.1, 2, 4.4, 6) }
aliased("straddling-a-corner") { p in rect(p, 3.9, 2.9, 4.1, 3.1) }
aliased("below-the-snap") { p in rect(p, 3.999, 2.999, 5.001, 5.001) }
aliased("above-the-snap") { p in rect(p, 3.99, 2.99, 5.01, 5.01) }
aliased("half-pixel-rect") { p in rect(p, 3.5, 2.5, 5.5, 5.5) }
aliased("integer-rect") { p in rect(p, 4, 3, 6, 5) }
aliased("triangle") { p in p.move(to: P(2.9, 1)); p.addLine(to: P(7.1, 1)); p.addLine(to: P(5, 6.3)); p.closeSubpath() }
aliased("thin-diagonal") { p in p.move(to: P(1.2, 1.2)); p.addLine(to: P(9.3, 6.7)); p.addLine(to: P(9.3, 6.9)); p.addLine(to: P(1.2, 1.4)); p.closeSubpath() }
aliased("evenodd-hole", rule: .evenOdd) { p in rect(p, 1.5, 1.5, 8.5, 6.5); rect(p, 3.5, 2.5, 6.5, 5.5) }
aliased("gap-inside-a-pixel") { p in rect(p, 1.5, 1.5, 4.3, 6.5); rect(p, 4.6, 1.5, 8.5, 6.5) }

// Curves: fillEllipse for several radii (chord counts), a free cubic path and a quad path.
print("CURVES")
for r in [2, 5, 10, 20, 40, 80] {
    let s = 2 * r + 8
    raster("circle-\(r)", s, s, draw(s, s) { c in c.fillEllipse(in: CGRect(x: 4, y: 4, width: 2 * r, height: 2 * r)) })
}
raster("cubic-blob", 256, 256, draw(256, 256) { c in
    let p = CGMutablePath(); p.move(to: P(20, 30))
    p.addCurve(to: P(230, 60), control1: P(60, 250), control2: P(180, -40))
    p.addCurve(to: P(60, 220), control1: P(300, 180), control2: P(100, 300))
    p.closeSubpath(); c.addPath(p); c.fillPath()
})
raster("quad-blob", 256, 256, draw(256, 256) { c in
    let p = CGMutablePath(); p.move(to: P(20, 30))
    p.addQuadCurve(to: P(230, 60), control: P(120, 280))
    p.addQuadCurve(to: P(40, 230), control: P(250, 300))
    p.closeSubpath(); c.addPath(p); c.fillPath()
})

// Gradient table: distinct values of v(t) for one pixel while the gradient slides under it.
func stairs(_ approx: Int, _ evaluate: (Double) -> UInt8) -> Int {
    let steps = approx * 12
    var previous = evaluate(0.5 / Double(steps)), count = 1
    for i in 1..<steps {
        let v = evaluate((Double(i) + 0.5) / Double(steps))
        if v != previous { count += 1; previous = v }
    }
    return count
}
let both: CGGradientDrawingOptions = [.drawsBeforeStartLocation, .drawsAfterEndLocation]
print("TABLE_LINEAR")
for length in [8.0, 13.5, 14.1, 16, 29.5, 30.1, 32, 45.9, 46.1, 64, 100, 128, 200] {
    print(length, stairs(Int(length) + 60) { t in
        let s = 8.5 - t * length
        return draw(16, 16) { c in c.drawLinearGradient(gradient(0, 1), start: P(s, 0), end: P(s + length, 0), options: both) }[8 * 16 + 8]
    })
}
print("TABLE_LINEAR_CTM")
for (lx, ly, sx, sy) in [(16.0, 0.0, 1.0, 3.0), (0, 16, 1, 3), (16, 16, 1, 3), (8, 8, 2, 4)] {
    print(lx, ly, sx, sy, stairs(150) { t in
        let px = 8.5 / sx - t * lx, py = 8.5 / sy - t * ly
        return draw(16, 16) { c in
            c.scaleBy(x: sx, y: sy)
            c.drawLinearGradient(gradient(0, 1), start: P(px, py), end: P(px + lx, py + ly), options: both)
        }[8 * 16 + 8]
    })
}
print("TABLE_RADIAL")
for (sx, sy, rotate) in [(1.0, 1.0, 0.0), (1, 3, 0), (3, 1, 0), (2, 0.5, 0), (0.5, 2, 0), (1, 3, 0.5), (3, 1, 0.5), (2, 2, 0.5)] {
    print(sx, sy, rotate, stairs(150) { t in
        let u = CGPoint(x: 8.5, y: 8.5).applying(CGAffineTransform(scaleX: sx, y: sy).rotated(by: rotate).inverted())
        let cx = Double(u.x) - t * 16, cy = Double(u.y)
        return draw(16, 16) { c in
            c.scaleBy(x: sx, y: sy); c.rotate(by: rotate)
            c.drawRadialGradient(gradient(0, 1), startCenter: P(cx, cy), startRadius: 0, endCenter: P(cx, cy), endRadius: 16, options: .drawsAfterEndLocation)
        }[8 * 16 + 8]
    })
}

// Dither: smallest k with byte 101 for gray (100 + k/256)/255, per pixel of a flat gradient; 256 = never.
print("DITHER")
var tile = [Int](repeating: 256, count: 256)
for k in stride(from: 255, through: 0, by: -1) {
    let g = (100.0 + Double(k) / 256) / 255
    let b = draw(16, 16) { c in c.drawLinearGradient(gradient(g, g), start: P(0, 0), end: P(16, 0), options: both) }
    for i in 0..<256 where b[i] == 101 { tile[i] = k }
}
print(tile.map(String.init).joined(separator: " "))

// Where the tile starts under a clip: flat 0.5 gradient over 40 × 40, printed whole.
print("DITHER_CLIP")
func flat(_ name: String, _ body: (CGContext) -> Void) {
    let b = draw(40, 40) { c in
        body(c)
        c.drawLinearGradient(gradient(0.5, 0.5), start: P(0, 0), end: P(16, 0), options: both)
    }
    print(name, hex(b[0..<1600]))
}
flat("none") { _ in }
flat("rect-4-14") { c in c.clip(to: CGRect(x: 4, y: 14, width: 20, height: 20)) }
flat("rect-3-5") { c in c.clip(to: CGRect(x: 3, y: 5, width: 20, height: 20)) }
flat("rect-off-canvas") { c in c.clip(to: CGRect(x: -5, y: -7, width: 20, height: 20)) }
flat("nested-rects") { c in c.clip(to: CGRect(x: 4, y: 14, width: 20, height: 20)); c.clip(to: CGRect(x: 7, y: 16, width: 20, height: 20)) }
flat("fractional-rect") { c in c.clip(to: CGRect(x: 3.5, y: 5.5, width: 20, height: 20)) }
flat("two-ellipses") { c in c.addEllipse(in: CGRect(x: 6, y: 10, width: 20, height: 24)); c.clip(); c.addEllipse(in: CGRect(x: 13, y: 6, width: 20, height: 24)); c.clip() }

// Nested clips, solid fill over a gray background: path clips multiply, rectangle clips intersect exactly.
print("CLIP_NESTED")
func nested(_ name: String, _ first: (CGContext) -> Void, _ second: (CGContext) -> Void) {
    let b = draw(16, 4) { c in
        c.setFillColor(gray: 0.2, alpha: 1); c.fill(CGRect(x: 0, y: 0, width: 16, height: 4))
        first(c); second(c)
        c.setFillColor(gray: 1, alpha: 1); c.fill(CGRect(x: 0, y: 0, width: 16, height: 4))
    }
    print(name, b[16..<32].map(String.init).joined(separator: " "))
}
// Vertical edges at x0 and x1 on a shape CoreGraphics cannot treat as a rectangle (extra corners far above and below).
func column(_ c: CGContext, _ x0: Double, _ x1: Double) {
    let p = CGMutablePath()
    p.move(to: P(x0, -4)); p.addLine(to: P(x1, -4)); p.addLine(to: P(x1, 8)); p.addLine(to: P((x0 + x1) / 2, 9)); p.addLine(to: P(x0, 8)); p.closeSubpath()
    c.addPath(p); c.clip()
}
nested("rects", { $0.clip(to: CGRect(x: 3.5, y: 0, width: 8.5, height: 4)) }, { $0.clip(to: CGRect(x: 3.25, y: 0, width: 8.25, height: 4)) })
nested("paths", { column($0, 3.5, 12) }, { column($0, 3.25, 11.5) })
