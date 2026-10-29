import Foundation
var state: UInt64 = 0
func next() -> UInt64 { state &+= 0x9E3779B97F4A7C15; var z = state; z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9; z = (z ^ (z >> 27)) &* 0x94D049BB133111EB; return z ^ (z >> 31) }
func unit() -> Double { Double(next() >> 11) * 0x1p-53 }
func rawFinite() -> Double { let d = Double(bitPattern: next()); return d.isFinite ? d : 1.0 }
struct FNV { var h: UInt32 = 0x811c9dc5; mutating func add(_ d: Double) { var b = d.bitPattern; for _ in 0..<8 { h ^= UInt32(b & 255); h = h &* 0x01000193; b >>= 8 } } }
let posix = Locale(identifier: "en_US_POSIX")
func hex(_ d: Double) -> String { String(d.bitPattern, radix: 16) }
// 1. description boundaries
print("DESC")
for d in [9007199254740991.0, 9007199254740992.0, 9007199254740994.0, 4503599627370496.0, 0.0001, 0.0001.nextDown, 0.0001.nextUp, 1e16, 1e16.nextDown, 18014398509481984.0, 18014398509481988.0, -9007199254740992.0, -9007199254740994.0] {
    print(hex(d), "\(d)", separator: "\t")
}
print("GBOUND")
for d in [1e6, 1e6.nextUp, 1e6.nextDown, 2e6, 1000000.5, 999999.4, 999999.5, 0.0001, 0.0001.nextDown, 0.0000999999999, 0.00009999995, 0.000099999949, 1e17, 1e17.nextDown, 1e17.nextUp, 99999999999999990.0, 1e5, 1e-4*0.99999999] {
    print(hex(d), String(format: "%g", locale: posix, d), String(format: "%.17g", locale: posix, d), String(format: "%g", d), String(format: "%.17g", d), separator: "\t")
}
// 2. rounded
print("ROUNDED")
for d in [0.5, -0.5, 1.5, -1.5, 2.5, -2.5, -0.4, 0.4, 0.49999999999999994, -0.49999999999999994, 4503599627370495.5, -4503599627370495.5, 1e300, -0.0, 0.0, 2.0000000000000004, .infinity, -.infinity] {
    print(hex(d), hex(d.rounded()), separator: "\t")
}
state = 1
var hr = FNV()
for i in 0..<1_000_000 {
    let k = next() % 3
    let x: Double = k == 0 ? (unit()*2-1)*100 : k == 1 ? Double(Int(next() % 2001) - 1000) * 0.5 : rawFinite()
    hr.add(x.rounded())
    _ = i
}
print("ROUNDED_HASH", hr.h)
// 3. remainder
print("REMAINDER")
for (a, b) in [(2.5, 3.0), (-2.5, 3.0), (3.5, 1.0), (2.5, 1.0), (-2.5, 1.0), (5.0, 2.0), (6.0, 2.0), (-6.0, 2.0), (1e300, 3.0), (7.0, 0.0), (7.0, .infinity), (5e-324, 1e-323), (1.5e-323, 1e-323), (0.0, 1.0), (-0.0, 1.0), (1.7976931348623157e308, 1.5e308), (1.7976931348623157e308, -1.7976931348623157e308)] {
    print(hex(a), hex(b), hex(a.remainder(dividingBy: b)), separator: "\t")
}
state = 2
var hrem = FNV()
for _ in 0..<1_000_000 {
    let k = next() % 4
    var a = 0.0, b = 1.0
    switch k {
    case 0: a = (unit()*2-1)*1000; b = (unit()*2-1)*10; if b == 0 { b = 1 }
    case 1: let kk = Double(Int(next() % 2001) - 1000); b = Double(Int(next() % 64) + 1) * [0.25, 0.5, 1, 2][Int(next() % 4)]; a = (kk + 0.5) * b; if next() % 2 == 0 { b = -b }
    case 2: a = (unit()*2-1)*1e6; b = unit()*1e-3 + 1e-9
    default: a = rawFinite(); b = rawFinite(); if b == 0 { b = 1 }
    }
    hrem.add(a.remainder(dividingBy: b))
    hrem.add(a.truncatingRemainder(dividingBy: b))
}
print("REMAINDER_HASH", hrem.h)
// 4. FP contraction
state = 3
var hc = FNV()
for _ in 0..<1_000_000 {
    let a = (unit()*2-1)*1e3, b = (unit()*2-1)*1e3, c = (unit()*2-1)*1e6, d = (unit()*2-1)*1e3
    hc.add(a*b+c); hc.add(a*b-c*d); hc.add(a*b+c*d)
}
print("FMA_HASH", hc.h)
// 5. min/max
print("MINMAX")
for (a, b) in [(0.0, -0.0), (-0.0, 0.0), (1.0, 2.0), (2.0, 1.0), (Double.nan, 1.0), (1.0, Double.nan)] {
    print(hex(a), hex(b), hex(min(a, b)), hex(max(a, b)), separator: "\t")
}
print("MINMAX3", hex(min(0.0, -0.0, 0.0)), hex(max(0.0, -0.0, 0.0)), hex(min(-0.0, 0.0, 0.0)), hex(max(-0.0, 0.0, -0.0)), hex(max(1.0, 0.0, -0.0)))
print("SEQ", hex([0.0, -0.0].min()!), hex([0.0, -0.0].max()!), hex([-0.0, 0.0].min()!), hex([-0.0, 0.0].max()!))
let tagged = [(1, 0), (0, 1), (0, 2), (1, 3)]
print("BY", tagged.min(by: { $0.0 < $1.0 })!.1, tagged.max(by: { $0.0 < $1.0 })!.1)
// 6. sort stability
state = 4
var items: [(Int, Int)] = []
for i in 0..<20000 { items.append((Int(next() % 50), i)) }
let sortedItems = items.sorted { $0.0 < $1.0 }
var hs = FNV(); for it in sortedItems { hs.add(Double(it.1)) }
print("SORT_HASH", hs.h)
var doubles: [Double] = []
for _ in 0..<20000 { let k = next() % 3; doubles.append(k == 0 ? 0.0 : k == 1 ? -0.0 : Double(Int(next() % 7)) - 3) }
var hd = FNV(); for d in doubles.sorted() { hd.add(d) }
print("SORTD_HASH", hd.h)
// 7. stride
print("STRIDE")
for (f, t, s) in [(0.0, 1.0, 0.1), (0.0, 0.3, 0.1), (1.0, 0.0, -0.25), (0.0, 1.0, 0.7), (0.0, 1.0, 0.25), (2.0, 2.0, 1.0), (3.0, 2.0, 1.0)] {
    print(Array(stride(from: f, through: t, by: s)).map(hex).joined(separator: ","))
}
// 8. whitespace
print("WS")
var ws: [String] = []
for v in 0...0x10FFFF { if let u = Unicode.Scalar(v) { if Character(u).isWhitespace { ws.append(String(v, radix: 16)) } } }
print(ws.joined(separator: ","))
for s in [" \u{301}", "\r\n", "a\u{301}", "\u{301}", "\u{A0}", "\u{200B}", "\u{FEFF}", "\u{2028}", "👩‍👩‍👧", "\u{85}", "\t\u{301}", "\u{3000}\u{301}"] {
    print(s.unicodeScalars.map { String($0.value, radix: 16) }.joined(separator: " "), s.count, Character(String(s.prefix(1))).isWhitespace, separator: "\t")
}
let text = "Héllo\u{A0}wörld\tTab\nNew 👩‍👩‍👧 e\u{301}\r\nend \u{2028}x\u{200B}y" + String(repeating: "ab", count: 30)
let norm = String(text.prefix(64).map { $0.isWhitespace ? Character(" ") : $0 })
print("NORM", norm.unicodeScalars.map { String($0.value, radix: 16) }.joined(separator: " "), norm.count)
