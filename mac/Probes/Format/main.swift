import Foundation

// Number formatting as the core writes it (docs/plan.md, Abschnitt 3): "\(Double)" in 3MF
// coordinates and balloon-studio.txt, String(format:) with en_US_POSIX for %.1f/%.2f (kit texts,
// SVG, filenames), %g (ring and clip filenames) and %.17g. Built with the core sources so the
// sample includes real coordinates of the classic balloon.
// Writes format.tsv: bits, then each format, tab separated, one value per line.

struct SplitMix64 {
    var state: UInt64
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
    mutating func unit() -> Double { Double(next() >> 11) * 0x1p-53 }
    mutating func uniform(_ lo: Double, _ hi: Double) -> Double { lo + (hi - lo) * unit() }
}

let posix = Locale(identifier: "en_US_POSIX")
let columns: [(String, (Double) -> String)] = [
    ("description", { "\($0)" }),
    ("%.1f", { String(format: "%.1f", locale: posix, $0) }),
    ("%.2f", { String(format: "%.2f", locale: posix, $0) }),
    ("%g", { String(format: "%g", locale: posix, $0) }),
    ("%.17g", { String(format: "%.17g", locale: posix, $0) })
]

@main
struct FormatProbe {
    static func main() throws {
        var out = "", total = 100_000
        var arguments = Array(CommandLine.arguments.dropFirst())
        while arguments.count >= 2 {
            switch arguments[0] {
            case "--out": out = arguments[1]
            case "--count": total = Int(arguments[1]) ?? total
            default: fatalError("unknown option \(arguments[0])")
            }
            arguments.removeFirst(2)
        }
        precondition(!out.isEmpty, "usage: probe-format --out DIR [--count N]")
        var values: [(String, Double)] = []
        func add(_ group: String, _ v: Double) { values.append((group, v)) }
        // Hand-picked: exact dyadic ties, decimal near-ties, exponent boundaries, specials.
        for v in [0.0, -0.0, 1, -1, 25, 0.1, 0.2, 0.3, 1.0/3, 2.25, 0.125, 0.375, 0.25, 0.35, 0.45, 0.05, 0.15, 0.55, 2.675, 1.005, 1.45, 2.5, 3.5, -2.5, 0.5,
                  1.5, -0.25, -0.125, 99.95, 99.995, 9.995, 123456.789, 1.5e-5, 1e-5, 0.0001, 0.00001, 0.000123456, 1e-4, 9.99999e-5, 1e15, 1e16, 1e17,
                  9007199254740992, 9007199254740994, 1000000000000000.0, 1.2345678901234568e17, 999999.5, 1e6, 1e-6, 123456, 1234567, 0.0005, 100, 450,
                  169.45178757107396, 5e-324, Double.leastNormalMagnitude, Double.greatestFiniteMagnitude, .infinity, -.infinity, .nan,
                  Double(Float(0.1)), Double(Float(2.675)), 3.75, 8, 2.2, 3.3, 15.625, 0.29999999999999999, 1e21, 1e22, 1e-7, 4.35, 8.345, 0.001, 0.0015] {
            add("special", v)
        }
        for k in -256...256 { add("dyadic", Double(k)/16); add("dyadic", Double(k)/64); add("dyadic", Double(k)/128) }
        for k in -3000...3000 { add("decimal", Double(k)/1000) }
        for k in 0...2000 { add("decimal", Double(k)/100 + 0.005); add("decimal", Double(k)/10 + 0.05) }
        // Coordinates as the 3MF writes them: the classic balloon at preview quality.
        let mesh = BalloonGenerator.generate(.classic)
        for v in mesh.vertices.prefix(7000) { add("coordinate", v.x); add("coordinate", v.y); add("coordinate", v.z) }
        var rng = SplitMix64(state: 41)
        for _ in 0..<5000 { add("float32", Double(Float(rng.uniform(-300, 300)))) }
        while values.count < total {
            let e = Int(rng.next() % 61) - 30, m = rng.uniform(-1, 1)
            add("random", m * pow(10, Double(e)))
        }
        var text = "bits\tgroup\t" + columns.map(\.0).joined(separator: "\t") + "\n"
        for (group, v) in values {
            let bits = String(v.bitPattern, radix: 16)
            text += String(repeating: "0", count: 16 - bits.count) + bits + "\t" + group + "\t" + columns.map { $0.1(v) }.joined(separator: "\t") + "\n"
        }
        try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
        try Data(text.utf8).write(to: URL(fileURLWithPath: "\(out)/format.tsv"))
        print("format: \(values.count) values")
    }
}
