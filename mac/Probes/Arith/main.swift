import Foundation
import CryptoKit

// Swift arithmetic the web port must reproduce bit for bit (docs/plan.md, Abschnitt 3): no FMA
// contraction, Float(x), rounded() and its rules, remainder vs truncatingRemainder, min/max with
// signed zeros, Sequence.min/max ties, stable sort, stride, Int conversions, Float arithmetic.
// Random series use SplitMix64 (same definition as the Libm probe): the first records are
// written in full, every record is covered by the series' SHA-256.

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
    // A double in [-1, 1) scaled by 2^(next() % span - offset).
    mutating func scaled(_ span: UInt64, _ offset: Int) -> Double {
        let m = uniform(-1, 1), e = Int(next() % span) - offset
        return m * Double(sign: .plus, exponent: e, significand: 1)
    }
}

func hexBits(_ v: Double) -> String { String(v.bitPattern, radix: 16).leftPadded(16) }
func hexBits(_ v: Float) -> String { String(v.bitPattern, radix: 16).leftPadded(8) }
extension String { func leftPadded(_ n: Int) -> String { String(repeating: "0", count: max(0, n - count)) + self } }
func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
func bytes(_ values: [Double]) -> Data {
    var data = Data(capacity: values.count * 8)
    for v in values { var bits = v.bitPattern.littleEndian; withUnsafeBytes(of: &bits) { data.append(contentsOf: $0) } }
    return data
}

struct Random {
    let name: String
    let layout: String
    let arguments: String
    let seed: UInt64
    let record: (inout SplitMix64, Int) -> [Double]
}

let constants: [(String, Double)] = [("Double.pi", Double.pi), ("Double.pi/2", Double.pi/2), ("Double.pi/3", Double.pi/3), ("2*Double.pi", 2*Double.pi),
                                     ("Double.ulpOfOne", Double.ulpOfOne), ("1.0/3", 1.0/3), ("0.1+0.2", 0.1+0.2), ("Double(Float(0.005))", Double(Float(0.005))),
                                     ("Double(Float(0.025))", Double(Float(0.025))), ("Double(Float(1)/255)", Double(Float(1)/255)), ("sqrt(2.0)", sqrt(2.0)), ("sqrt(3.0)", sqrt(3.0))]

let randoms: [Random] = [
    Random(name: "fma", layout: "[a, b, c, d, a*b+c, a*b-c*d]", arguments: "a, b, c, d = scaled(41, 20): uniform(-1,1) * 2^(next()%41 - 20), drawn a, b, c, d", seed: 21) { r, _ in
        let a = r.scaled(41, 20), b = r.scaled(41, 20), c = r.scaled(41, 20), d = r.scaled(41, 20)
        return [a, b, c, d, a*b+c, a*b-c*d]
    },
    Random(name: "float", layout: "[x, Double(Float(x).bitPattern)]",
           arguments: "i%8 == 7: midpoint of a finite Float f = Float(bitPattern: UInt32(truncatingIfNeeded: next()) & 0x7f7fffff) and f.nextUp, (Double(f)+Double(f.nextUp))/2, negated when next()&1 == 1; else scaled(300, 150)", seed: 22) { r, i in
        var x: Double
        if i % 8 == 7 {
            let f = Float(bitPattern: UInt32(truncatingIfNeeded: r.next()) & 0x7f7fffff)
            x = (Double(f) + Double(f.nextUp)) / 2
            if r.next() & 1 == 1 { x = -x }
        } else {
            x = r.scaled(300, 150)
        }
        return [x, Double(Float(x).bitPattern)]
    },
    Random(name: "rounded", layout: "[x, x.rounded(), x.rounded(.up), x.rounded(.down), x.rounded(.towardZero), x.rounded(.toNearestOrEven)]",
           arguments: "i%3: 0 Double(Int(next()%4001)-2000)/2; 1 uniform(-1e6,1e6); 2 scaled(80, 40)", seed: 23) { r, i in
        let x = i % 3 == 0 ? Double(Int(r.next() % 4001) - 2000) / 2 : i % 3 == 1 ? r.uniform(-1e6, 1e6) : r.scaled(80, 40)
        return [x, x.rounded(), x.rounded(.up), x.rounded(.down), x.rounded(.towardZero), x.rounded(.toNearestOrEven)]
    },
    Random(name: "remainder", layout: "[a, b, a.remainder(dividingBy:b), a.truncatingRemainder(dividingBy:b)]",
           arguments: "i%4 == 0: b = divisors[next()%8], k = Int(next()%2001)-1000, a = (Double(k)+0.5)*b; else a = uniform(-1000,1000), b = uniform(0.1,50), negated when next()&1 == 1",
           seed: 24) { r, i in
        let divisors: [Double] = [1, 2, 0.5, 0.25, 3, 1.5, 2*Double.pi, Double.pi/3]
        var a: Double, b: Double
        if i % 4 == 0 {
            b = divisors[Int(r.next() % 8)]
            let k = Int(r.next() % 2001) - 1000
            a = (Double(k) + 0.5) * b
        } else {
            a = r.uniform(-1000, 1000); b = r.uniform(0.1, 50)
            if r.next() & 1 == 1 { b = -b }
        }
        return [a, b, a.remainder(dividingBy: b), a.truncatingRemainder(dividingBy: b)]
    },
    Random(name: "float-ops", layout: "[a, b, bits(a+b), bits(a-b), bits(a*b), bits(a/b), bits(max(0, a/Float(7)))] with a, b Floats from Float(scaled(40, 20))",
           arguments: "a = Float(scaled(40, 20)), b = Float(scaled(40, 20)); results are Float bit patterns stored as Double", seed: 25) { r, _ in
        let a = Float(r.scaled(40, 20)), b = Float(r.scaled(40, 20))
        return [Double(a), Double(b), Double((a+b).bitPattern), Double((a-b).bitPattern), Double((a*b).bitPattern), Double((a/b).bitPattern), Double(max(0, a/Float(7)).bitPattern)]
    },
    Random(name: "int", layout: "[x, Double(Int(x)), Double(Int(floor(x))), Double(Int(x.rounded(.up))), Double(Int(x.rounded()))]",
           arguments: "uniform(-1e6,1e6) for i%2 == 0, else Double(Int(next()%2001)-1000)/4", seed: 26) { r, i in
        let x = i % 2 == 0 ? r.uniform(-1e6, 1e6) : Double(Int(r.next() % 2001) - 1000) / 4
        return [x, Double(Int(x)), Double(Int(floor(x))), Double(Int(x.rounded(.up))), Double(Int(x.rounded()))]
    }
]

@main
struct ArithProbe {
    static func main() throws {
        var out = "", count = 1_000_000, committed = 4096
        var arguments = Array(CommandLine.arguments.dropFirst())
        while arguments.count >= 2 {
            switch arguments[0] {
            case "--out": out = arguments[1]
            case "--count": count = Int(arguments[1]) ?? count
            case "--committed": committed = Int(arguments[1]) ?? committed
            default: fatalError("unknown option \(arguments[0])")
            }
            arguments.removeFirst(2)
        }
        precondition(!out.isEmpty, "usage: probe-arith --out DIR [--count N] [--committed N]")
        try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

        // Random series.
        var blob = Data(), series: [[String: Any]] = []
        for s in randoms {
            var rng = SplitMix64(state: s.seed), hasher = SHA256(), kept: [Double] = [], width = 0
            for i in 0..<count {
                let record = s.record(&rng, i)
                width = record.count
                hasher.update(data: bytes(record))
                if i < committed { kept += record }
            }
            let block = bytes(kept)
            series.append(["name": s.name, "layout": s.layout, "arguments": s.arguments, "seed": s.seed, "offset": blob.count, "count": committed,
                           "recordBytes": 8 * width, "sha256": digest(block), "full": ["count": count, "sha256": hex(hasher.finalize())]])
            blob.append(block)
        }
        try blob.write(to: URL(fileURLWithPath: "\(out)/arith.bin"))

        // Contraction witnesses: with FMA these would differ from the separately rounded result.
        // fma(a,b,c) = c.addingProduct(a, b), one rounding, only for comparison.
        let triplets: [(Double, Double, Double)] = [(1 + 0x1p-30, 1 - 0x1p-30, -1.0), (0.1, 10, -1), (1/3.0, 3, -1), (Double.pi, 1/Double.pi, -1)]
        let witnesses: [[String: String]] = triplets.map { (a: Double, b: Double, c: Double) -> [String: String] in
            let separate = a*b+c, fused = c.addingProduct(a, b)
            return ["a": hexBits(a), "b": hexBits(b), "c": hexBits(c), "a*b+c": hexBits(separate), "fma(a,b,c)": hexBits(fused)]
        }

        // Signed zeros, NaN and ties in min/max.
        let pairs: [(Double, Double)] = [(0, -0.0), (-0.0, 0), (0, 0), (-0.0, -0.0), (1, 1), (1, 2), (2, 1), (.nan, 1), (1, .nan), (.infinity, -.infinity), (-1, -1)]
        let minmax = pairs.map { x, y in ["x": hexBits(x), "y": hexBits(y), "min": hexBits(min(x, y)), "max": hexBits(max(x, y))] }
        let triples: [(Double, Double, Double)] = [(0, -0.0, 0), (-0.0, 0, -0.0), (0, 0, -0.0), (1, 1, 1), (2, 1, 1)]
        let minmax3 = triples.map { x, y, z in ["x": hexBits(x), "y": hexBits(y), "z": hexBits(z), "min": hexBits(min(x, y, z)), "max": hexBits(max(x, y, z))] }
        let arrays: [[Double]] = [[0, -0.0], [-0.0, 0], [1, 0, -0.0, 0], [3, 1, 1, 2], [1, .nan, 0], [.nan, 1, 0]]
        let sequence = arrays.map { a in ["array": a.map(hexBits), "min()": hexBits(a.min()!), "max()": hexBits(a.max()!)] }
        let keyed: [(Int, Int)] = [(2, 0), (1, 1), (1, 2), (3, 3), (3, 4), (1, 5)]
        let byKey: [String: Any] = ["elements": keyed.map { [$0.0, $0.1] },
                                    "min(by: key <)": keyed.min { $0.0 < $1.0 }!.1, "max(by: key <)": keyed.max { $0.0 < $1.0 }!.1,
                                    "firstIndex of min key": keyed.firstIndex { $0.0 == 1 }!]

        // Sort stability on 10 k ties, and the order of signed zeros after sort().
        var rng = SplitMix64(state: 31)
        let items = (0..<10_000).map { (key: Int(rng.next() % 7), index: $0) }
        let sorted = items.sorted { $0.key < $1.key }
        let stable = zip(sorted, sorted.dropFirst()).allSatisfy { $0.key < $1.key || ($0.key == $1.key && $0.index < $1.index) }
        var permutation = Data()
        for item in sorted { var v = UInt32(item.index).littleEndian; withUnsafeBytes(of: &v) { permutation.append(contentsOf: $0) } }
        let zeros: [Double] = (0..<1000).map { _ in [0.0, -0.0, 1, -1, 0.5][Int(rng.next() % 5)] }
        let zerosSorted = zeros.sorted(), zerosDescending = zeros.sorted(by: >)

        // stride(from:through:by:) and stride(from:to:by:) on Doubles.
        let strides: [[String: Any]] = [(-15.0, 3.0, 4.5, true), (0, 1, 0.1, true), (0, 1, 0.1, false), (0.5, 3.2, 0.3, true), (1, 0, -0.25, true)].map { a, b, s, through in
            let values = through ? Array(stride(from: a, through: b, by: s)) : Array(stride(from: a, to: b, by: s))
            return ["from": a, "to": b, "by": s, "through": through, "values": values.map(hexBits)]
        }

        let report: [String: Any] = [
            "probe": "mac/Probes/Arith/main.swift",
            "format": "arith.bin: little-endian Float64 records at the given offsets; bit patterns as lowercase hex",
            "prng": "SplitMix64 as in libm.json; scaled(span, offset) = uniform(-1,1) * 2^(Int(next() % span) - offset), drawn in that order",
            "series": series,
            "constants": constants.map { ["expression": $0.0, "bits": hexBits($0.1)] },
            "contraction": witnesses,
            "minmax": minmax, "minmax3": minmax3, "sequenceMinMax": sequence, "minMaxBy": byKey,
            "sort": ["count": items.count, "keys": "Int(next() % 7) from SplitMix64(31), index = position", "stable": stable,
                     "permutationSha256": digest(permutation), "first64": sorted.prefix(64).map(\.index)],
            "sortSignedZeros": ["input": zeros.prefix(64).map(hexBits), "inputSha256": digest(bytes(zeros)),
                                "sorted": zerosSorted.prefix(64).map(hexBits), "sortedSha256": digest(bytes(zerosSorted)),
                                "descendingSha256": digest(bytes(zerosDescending)), "draws": "1000 x [0.0, -0.0, 1, -1, 0.5][next() % 5] after the 10 000 sort keys"],
            "stride": strides,
            "floatConversion": [0.1, 0.2, 1.0/3, 2.675, 16777217, 1e-46, 3.4028235677973366e38, -0.0].map { ["x": hexBits($0), "Float(x)": hexBits(Float($0))] }
        ]
        var json = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        json.append(10)
        try json.write(to: URL(fileURLWithPath: "\(out)/arith.json"))
        print("arith: \(randoms.count) series, sort stable \(stable)")
    }
}

func hex(_ digest: SHA256.Digest) -> String { digest.map { String(format: "%02x", $0) }.joined() }
