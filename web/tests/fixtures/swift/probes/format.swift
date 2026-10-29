import Foundation
var state: UInt64 = 0x1234567
func next() -> UInt64 { state &+= 0x9E3779B97F4A7C15; var z = state; z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9; z = (z ^ (z >> 27)) &* 0x94D049BB133111EB; return z ^ (z >> 31) }
let posix = Locale(identifier: "en_US_POSIX")
var values: [Double] = [0, -0.0, 1, -1, 25, 0.1, 0.2, 0.3, 0.1+0.2, 1e-5, 1e-4, 0.00012345, 1e15, 1e16, 9999999999999998, 123456789012345678,
  1e21, 1e22, 1e100, 5e-324, 2.2250738585072014e-308, .greatestFiniteMagnitude, .infinity, -.infinity, .nan,
  0.25, 0.35, 2.675, 0.125, 0.375, 2.5, 3.5, -0.25, -2.5, 0.05, -0.05, 1.45, 1.005, 2.25, 1.15, 8, 3.75, 2, 12, 0.5,
  123456, 1234567, 1e6, 100000, 999999.5, 9999995, 0.0001, 0.00001, 0.000123456789, 169.45178757107396, 230, 1e17, 1e-7,
  0.95, 0.995, 9.95, 99.95, -0.04, -0.05000000000000001, 0.45, 1.25, 1e300, -1e-300, 4.35, 0.15, 1234.5, 0.0625, 7.0e-5]
for i in 0..<12 { values.append(Double(i) * 0.05); values.append(Double(i) * 0.005 + 1); values.append(Double(i) / 8) }
for _ in 0..<600 {  // arbitrary finite bit patterns
    let bits = next()
    let d = Double(bitPattern: bits)
    if d.isFinite { values.append(d) }
}
for _ in 0..<1200 { // coordinate-like
    let u = Double(next() >> 11) / Double(1 << 53)
    let scale = [1e-6, 1e-3, 0.1, 1, 10, 300, 1e5, 1e15, 3e16][Int(next() % 9)]
    values.append((u * 2 - 1) * scale)
}
for _ in 0..<400 { // exact ties for %.1f / %.2f / %g: k/2^m
    let k = Double(Int(next() % 20000)) - 10000
    let m = Double(1 << Int(next() % 6 + 1))
    values.append(k / m / 100)
    values.append(k / m)
}
for v in values {
    let hex = String(v.bitPattern, radix: 16)
    let cols = [hex, "\(v)", String(format: "%.0f", locale: posix, v), String(format: "%.1f", locale: posix, v), String(format: "%.2f", locale: posix, v), String(format: "%.3f", locale: posix, v),
                String(format: "%g", locale: posix, v), String(format: "%.17g", locale: posix, v), String(format: "%g", v), String(format: "%.1f", v), String(format: "%.17g", v), String(format: "%.2f", v), String(format: "%.3f", v), String(format: "%.0f", v)]
    print(cols.joined(separator: "\t"))
}
