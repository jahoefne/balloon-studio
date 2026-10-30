// Apple's libm for tests/patterns.replay.test.ts: reads the arguments the TS run recorded in
// <dir>/<fn>.miss (pairs of Float64), appends (x, y, result) triples to <dir>/<fn>.bin and empties the .miss.
//
// `sin` and `cos` of one argument in one basic block compile to __sincos_stret, whose sine differs from
// sin() in about 0.4 % of the values (cosines all agree). The sites the patterns use are all such pairs
// (or atan2(sin(d), cos(d))), so the sine comes from the same merged call here.
//
// DEVELOPER_DIR=/Library/Developer/CommandLineTools xcrun swiftc -O -swift-version 5 \
//   -target arm64-apple-macosx14.0 libmReplay.swift -o libmReplay
import Foundation

@inline(never) func both(_ x: Double) -> (Double, Double) { (sin(x), cos(x)) }

let dir = CommandLine.arguments[1]
var total = 0
for fn in ["sin", "cos", "atan", "atan2", "hypot"] {
    let miss = URL(fileURLWithPath: "\(dir)/\(fn).miss")
    guard let data = try? Data(contentsOf: miss), !data.isEmpty else { continue }
    let n = data.count/16
    var out = [Double](repeating: 0, count: n*3)
    data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
        let arguments = raw.bindMemory(to: Double.self)
        for i in 0..<n {
            let x = arguments[2*i], y = arguments[2*i+1]
            out[3*i] = x; out[3*i+1] = y
            switch fn {
            case "sin": out[3*i+2] = both(x).0
            case "cos": out[3*i+2] = both(x).1
            case "atan": out[3*i+2] = atan(x)
            case "atan2": out[3*i+2] = atan2(x, y)
            default: out[3*i+2] = hypot(x, y)
            }
        }
    }
    let bytes = out.withUnsafeBytes { Data($0) }
    let url = URL(fileURLWithPath: "\(dir)/\(fn).bin")
    if let handle = try? FileHandle(forWritingTo: url) { handle.seekToEndOfFile(); handle.write(bytes); handle.closeFile() } else { try! bytes.write(to: url) }
    try! Data().write(to: miss)
    total += n
}
print(total)
