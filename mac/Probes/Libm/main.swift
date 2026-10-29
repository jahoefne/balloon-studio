import Foundation
import CryptoKit

// Apple libm on the arguments the core feeds it (docs/plan.md, WP-V1 "Proben"). The web port's
// dmath (fdlibm in pure JS) is measured against these results; differences in the last bit
// are expected and only counted. Arguments come from SplitMix64, so they can be regenerated.
// Writes references/probes/libm.bin + libm.json (the first records of each series) and, with
// --full DIR, every record of every series for the reference pack.

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

struct Series {
    let name: String
    let function: String
    let arity: Int
    let seed: UInt64
    let arguments: String
    let make: (inout SplitMix64, Int) -> [Double]
    let evaluate: ([Double]) -> Double
    var fixed: [[Double]]? = nil
}

let twoPi = 2*Double.pi
let exponents: [Double] = [0.65, 2, 0.7, 1.25, 0.6, 0.75, 0.5, 24, 1.0/24, 16, 2.5, 5.0/16, 5, 1.0/5, 3]

let series: [Series] = [
    Series(name: "sin", function: "sin", arity: 1, seed: 1,
           arguments: "i%4: 0 uniform(-2pi,2pi); 1 Double(k)*(2*Double.pi)/Double(n), n=3+next()%4094, k=next()%(n+1); 2 uniform(-0.25,0.25); 3 uniform(-60,60)",
           make: { r, i in
               switch i % 4 {
               case 0: return [r.uniform(-twoPi, twoPi)]
               case 1: let n = 3 + Int(r.next() % 4094), k = Int(r.next() % UInt64(n + 1)); return [Double(k) * twoPi / Double(n)]
               case 2: return [r.uniform(-0.25, 0.25)]
               default: return [r.uniform(-60, 60)]
               }
           }, evaluate: { sin($0[0]) }),
    Series(name: "cos", function: "cos", arity: 1, seed: 1, arguments: "same arguments as sin",
           make: { r, i in
               switch i % 4 {
               case 0: return [r.uniform(-twoPi, twoPi)]
               case 1: let n = 3 + Int(r.next() % 4094), k = Int(r.next() % UInt64(n + 1)); return [Double(k) * twoPi / Double(n)]
               case 2: return [r.uniform(-0.25, 0.25)]
               default: return [r.uniform(-60, 60)]
               }
           }, evaluate: { cos($0[0]) }),
    Series(name: "tan", function: "tan", arity: 1, seed: 2, arguments: "uniform(-1.4,1.4)",
           make: { r, _ in [r.uniform(-1.4, 1.4)] }, evaluate: { tan($0[0]) }),
    Series(name: "atan", function: "atan", arity: 1, seed: 3, arguments: "i%2: 0 uniform(-10,10); 1 uniform(-1000,1000)",
           make: { r, i in [i % 2 == 0 ? r.uniform(-10, 10) : r.uniform(-1000, 1000)] }, evaluate: { atan($0[0]) }),
    Series(name: "atan2", function: "atan2", arity: 2, seed: 4,
           arguments: "(y, x) = (uniform(-300,300), uniform(-300,300)); i%16 == 0: y = +0 or -0 (alternating with i/16); i%16 == 8: x = +0 or -0",
           make: { r, i in
               var y = r.uniform(-300, 300), x = r.uniform(-300, 300)
               if i % 16 == 0 { y = (i / 16) % 2 == 0 ? 0.0 : -0.0 }
               if i % 16 == 8 { x = (i / 16) % 2 == 0 ? 0.0 : -0.0 }
               return [y, x]
           }, evaluate: { atan2($0[0], $0[1]) }),
    Series(name: "asin", function: "asin", arity: 1, seed: 5, arguments: "uniform(-1,1)",
           make: { r, _ in [r.uniform(-1, 1)] }, evaluate: { asin($0[0]) }),
    Series(name: "acos", function: "acos", arity: 1, seed: 6, arguments: "uniform(-1,1)",
           make: { r, _ in [r.uniform(-1, 1)] }, evaluate: { acos($0[0]) }),
    Series(name: "exp", function: "exp", arity: 1, seed: 7, arguments: "uniform(-40,2)",
           make: { r, _ in [r.uniform(-40, 2)] }, evaluate: { exp($0[0]) }),
    Series(name: "pow", function: "pow", arity: 2, seed: 8,
           arguments: "e = exponents[i%15]; x: e == 2 uniform(-300,300), e == 3 uniform(-1,1), else (i/15)%4 == 3 uniform(0,4) else unit()",
           make: { r, i in
               let e = exponents[i % exponents.count]
               let x = e == 2 ? r.uniform(-300, 300) : e == 3 ? r.uniform(-1, 1) : (i / exponents.count) % 4 == 3 ? r.uniform(0, 4) : r.unit()
               return [x, e]
           }, evaluate: { pow($0[0], $0[1]) }),
    Series(name: "sqrt", function: "sqrt", arity: 1, seed: 9, arguments: "i%2: 0 uniform(0,1e5); 1 unit()",
           make: { r, i in [i % 2 == 0 ? r.uniform(0, 1e5) : r.unit()] }, evaluate: { sqrt($0[0]) }),
    Series(name: "hypot", function: "hypot", arity: 2, seed: 10, arguments: "(uniform(-300,300), uniform(-300,300))",
           make: { r, _ in [r.uniform(-300, 300), r.uniform(-300, 300)] }, evaluate: { hypot($0[0], $0[1]) }),
    Series(name: "cbrt", function: "cbrt", arity: 1, seed: 11, arguments: "uniform(-1000,1000)",
           make: { r, _ in [r.uniform(-1000, 1000)] }, evaluate: { cbrt($0[0]) }),
    Series(name: "log", function: "log", arity: 1, seed: 12, arguments: "i%2: 0 uniform(0x1p-30,1); 1 uniform(1,1000)",
           make: { r, i in [i % 2 == 0 ? r.uniform(0x1p-30, 1) : r.uniform(1, 1000)] }, evaluate: { log($0[0]) }),
    // Hand-picked edges, listed in full.
    Series(name: "edges", function: "f(name)", arity: 1, seed: 0, arguments: "fixed list, see edgeFunctions", make: { _, _ in [] }, evaluate: { _ in 0 })
]

let edgeFunctions: [(String, (Double) -> Double, [Double])] = [
    ("sin", sin, [0, -0.0, Double.pi, Double.pi/2, Double.pi/3, Double.pi/4, Double.pi/6, 2*Double.pi, 1e-9, 1e22]),
    ("cos", cos, [0, -0.0, Double.pi, Double.pi/2, Double.pi/3, Double.pi/4, Double.pi/6, 2*Double.pi, 1e-9, 1e22]),
    ("asin", asin, [-1, 1, 0, -0.0, 0.5, -0.5, 0x1p-30, 1-0x1p-53]),
    ("acos", acos, [-1, 1, 0, -0.0, 0.5, -0.5, 0x1p-30, 1-0x1p-53]),
    ("atan", atan, [0, -0.0, 1, -1, 1e300, -1e300, .infinity]),
    ("exp", exp, [0, -0.0, 1, -1, 709, -745, 1e-300]),
    ("sqrt", sqrt, [0, -0.0, 2, 0.5, 1e-300, 4]),
    ("cbrt", cbrt, [0, -0.0, 27, -8, 2, 1e-300]),
    ("log", log, [1, 2, 0.5, 10, M_E, 1e-300])
]

func bytes(_ values: [Double]) -> Data {
    var data = Data(capacity: values.count * 8)
    for v in values { var bits = v.bitPattern.littleEndian; withUnsafeBytes(of: &bits) { data.append(contentsOf: $0) } }
    return data
}

@main
struct LibmProbe {
    static func main() throws {
        var out = "", full: String? = nil, count = 1_000_000, committed = 4096
        var arguments = Array(CommandLine.arguments.dropFirst())
        while arguments.count >= 2 {
            switch arguments[0] {
            case "--out": out = arguments[1]
            case "--full": full = arguments[1]
            case "--count": count = Int(arguments[1]) ?? count
            case "--committed": committed = Int(arguments[1]) ?? committed
            default: fatalError("unknown option \(arguments[0])")
            }
            arguments.removeFirst(2)
        }
        precondition(!out.isEmpty, "usage: probe-libm --out DIR [--full DIR] [--count N] [--committed N]")
        try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
        if let full { try FileManager.default.createDirectory(atPath: full, withIntermediateDirectories: true) }
        var blob = Data(), described: [[String: Any]] = []
        for s in series {
            var records: [[Double]] = []
            var info: [String: Any] = ["name": s.name, "function": s.function, "arity": s.arity, "arguments": s.arguments]
            if s.name == "edges" {
                for (index, edge) in edgeFunctions.enumerated() { for x in edge.2 { records.append([Double(index), x, edge.1(x)]) } }
                info["arity"] = 2
                info["functions"] = edgeFunctions.map(\.0)
                info["layout"] = "[function index into functions, x, f(x)]"
                let block = bytes(records.flatMap { $0 })
                info.merge(["offset": blob.count, "count": records.count, "recordBytes": 24, "sha256": SHA256.hash(data: block).map { String(format: "%02x", $0) }.joined()]) { a, _ in a }
                blob.append(block); described.append(info); continue
            }
            var rng = SplitMix64(state: s.seed), hasher = SHA256(), fullData = Data()
            for i in 0..<count {
                let args = s.make(&rng, i), record = args + [s.evaluate(args)]
                let encoded = bytes(record)
                hasher.update(data: encoded)
                if full != nil { fullData.append(encoded) }
                if i < committed { records.append(record) }
            }
            let block = bytes(records.flatMap { $0 })
            info["seed"] = s.seed
            info["offset"] = blob.count
            info["count"] = records.count
            info["recordBytes"] = 8 * (s.arity + 1)
            info["layout"] = s.arity == 1 ? "[x, f(x)]" : "[a, b, f(a, b)]"
            info["sha256"] = SHA256.hash(data: block).map { String(format: "%02x", $0) }.joined()
            info["full"] = ["count": count, "sha256": hasher.finalize().map { String(format: "%02x", $0) }.joined(), "file": "probes/libm/\(s.name).bin"]
            blob.append(block); described.append(info)
            if let full { try fullData.write(to: URL(fileURLWithPath: "\(full)/\(s.name).bin")) }
        }
        try blob.write(to: URL(fileURLWithPath: "\(out)/libm.bin"))
        let header: [String: Any] = [
            "probe": "mac/Probes/Libm/main.swift",
            "format": "little-endian Float64 records, series after series at the given byte offsets",
            "prng": "SplitMix64: state += 0x9E3779B97F4A7C15; z = state; z = (z ^ z>>30) * 0xBF58476D1CE4E5B9; z = (z ^ z>>27) * 0x94D049BB133111EB; z ^ z>>31 (wrapping UInt64). unit() = Double(next() >> 11) * 2^-53; uniform(lo, hi) = lo + (hi - lo) * unit(). Each call to next/unit/uniform is one draw, in the order written in arguments.",
            "exponents": exponents,
            "series": described
        ]
        var json = try JSONSerialization.data(withJSONObject: header, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        json.append(10)
        try json.write(to: URL(fileURLWithPath: "\(out)/libm.json"))
        print("libm: \(series.count) series, \(blob.count) bytes committed")
    }
}
