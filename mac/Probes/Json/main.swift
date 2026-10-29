import Foundation

// The two Foundation JSON writers as the core uses them (docs/plan.md, Abschnitt 3), JSONDecoder's
// type rules for settings files, PatternSettings.normalized on awkward text, and a StoredZIP
// sample. Built with the core sources. Writes json.json (outputs as exact strings) and zip-sample.zip.

struct Nested: Codable { var b = 2.5; var a = [1, 2] }
struct Sample: Codable {
    var int = 450
    var double = 0.3
    var integral = 450.0
    var small = 1e-5
    var big = 1e16
    var negativeZero = -0.0
    var third = 1.0/3
    var precise = 169.45178757107396
    var flag = true
    var slash = "a/b"
    var missing: String? = nil
    var present: Double? = 2.5
    var list = [0.1, 2, 1e-7]
    var empty: [Int] = []
    var nested = Nested()
    var float: Float = 0.3
}

let strings = ["/", "\"", "\\", "\n", "\t", "\r", "\u{0}", "\u{1}", "\u{8}", "\u{c}", "\u{1f}", "\u{7f}", "é", "e\u{301}", "😀", "👩‍👩‍👧", "\u{2028}", "\u{2029}",
               "\u{a0}", "<>&'", "Zoë & Léa <3", "東京"]

func text(_ data: Data) -> String { String(decoding: data, as: UTF8.self) }
func sorted() -> JSONEncoder { let e = JSONEncoder(); e.outputFormatting = .sortedKeys; return e }
func attempt(_ body: () throws -> String) -> [String: String] {
    do { return ["output": try body()] } catch { return ["error": "\(error)"] }
}

@main
struct JsonProbe {
    static func main() throws {
        var out = ""
        var arguments = Array(CommandLine.arguments.dropFirst())
        while arguments.count >= 2 {
            switch arguments[0] {
            case "--out": out = arguments[1]
            default: fatalError("unknown option \(arguments[0])")
            }
            arguments.removeFirst(2)
        }
        precondition(!out.isEmpty, "usage: probe-json --out DIR")
        var report: [String: Any] = ["probe": "mac/Probes/Json/main.swift"]

        // JSONEncoder: compact; StableJSON adds sortedKeys. Without it the key order changes per
        // process, so only facts about that output are recorded.
        let sample = Sample()
        let stable = try StableJSON.encode(sample), plain = try JSONEncoder().encode(sample)
        let reparsed = { (d: Data) in try JSONSerialization.jsonObject(with: d) as! NSDictionary }
        report["jsonEncoder"] = [
            "sortedKeys": text(stable),
            "unsorted": ["sameLength": plain.count == stable.count, "equalAfterParsing": try reparsed(plain).isEqual(reparsed(stable)),
                         "note": "JSONEncoder without .sortedKeys orders keys differently in every process"],
            "strings": strings.map { s in ["input": s, "output": text(try! sorted().encode(s))] },
            "doubles": [0.0, -0.0, 1, 450, 0.3, 1e-5, 1e-7, 1e16, 1e21, 1.5e300, 5e-324, 169.45178757107396, 1.0/3, 2.675].map { v in
                ["bits": String(v.bitPattern, radix: 16), "output": text(try! sorted().encode([v]))]
            },
            "floats": [Float(0.3), 1e-5, 16777216, 0.1].map { v in ["bits": String(v.bitPattern, radix: 16), "output": text(try! sorted().encode([v]))] },
            "nonFinite": attempt { text(try sorted().encode([Double.nan])) }
        ] as [String: Any]

        // JSONSerialization: Swift values vs numbers parsed from JSON text (the kit-manifest path).
        let parsed = try JSONSerialization.jsonObject(with: Data(#"{"pointThree":0.3,"int":450,"integralDouble":450.0,"half":2.5,"tiny":1e-05,"big":1e16,"negativeZero":-0.0,"precise":169.45178757107396}"#.utf8))
        let object: [String: Any] = [
            "swiftInt": 450, "swiftDouble": 0.3, "swiftIntegralDouble": 450.0, "swiftTiny": 1e-5, "swiftBig": 1e16, "swiftNegativeZero": -0.0,
            "swiftPrecise": 169.45178757107396, "swiftDimensions": [165.31068284943365, 165.3106828494337, 12.0], "swiftFloat": Float(0.3),
            "nsNumberDouble": NSNumber(value: 0.3), "bool": true, "falseBool": false, "null": NSNull(), "string": strings.joined(),
            "emptyArray": [Any](), "emptyObject": [String: Any](), "nested": ["z": [1, [2, [3]]], "a": ["k": "v"]], "parsed": parsed,
            "settingsReparsed": try JSONSerialization.jsonObject(with: StableJSON.encode(RingParameters.large))
        ]
        report["jsonSerialization"] = [
            "prettySorted": text(try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])),
            "compactSorted": text(try JSONSerialization.data(withJSONObject: object, options: .sortedKeys)),
            "kitManifestPath": text(try JSONSerialization.data(withJSONObject: ["format_version": 2, "parameters": try JSONSerialization.jsonObject(with: StableJSON.encode(RingParameters.large)),
                                                                                 "parts": [["file": "A.stl", "quantity": 3, "dimensions_mm": [165.31068284943365, 165.3106828494337, 12.0]]]] as [String: Any],
                                                               options: [.prettyPrinted, .sortedKeys])),
            "balloonSettingsPath": text(try JSONSerialization.data(withJSONObject: ["filament_density": [String(1.24), String(PurgeSettings(density: 1.1).normalized().density)],
                                                                                    "filament_colour": ["#DB6E2E", "#F5EAD2"]] as [String: Any], options: .sortedKeys)),
            "note": "values: Swift literals bridged to NSNumber; parsed: the same values read back by JSONSerialization.jsonObject"
        ] as [String: Any]

        // JSONDecoder rules the settings migrations rely on.
        let inputs = [#"{"panels":17}"#, #"{"panels":17.0}"#, #"{"panels":17.5}"#, #"{"height":"220"}"#, #"{"hollow":1}"#, #"{"height":null}"#,
                      #"{"height":1e400}"#, #"{"height":220,"unknown":[1,2]}"#, #"[]"#, #"{"diameter":-0.0}"#]
        report["jsonDecoder"] = [
            "balloon": inputs.map { input in
                ["input": input].merging(attempt { try sortedJSON(JSONDecoder().decode(BalloonParameters.self, from: Data(input.utf8))) }) { a, _ in a }
            },
            "basket": [#"{"style":"ribbed"}"#, #"{"style":"wicker","width":64,"depth":48,"height":42,"wallThickness":2.4,"cordClearance":3,"texture":0.7}"#].map { input in
                ["input": input].merging(attempt { try sortedJSON(JSONDecoder().decode(BasketParameters.self, from: Data(input.utf8))) }) { a, _ in a }
            },
            "purge": [#"{"layerHeight":0.1}"#, "{}"].map { input in
                ["input": input].merging(attempt { try sortedJSON(JSONDecoder().decode(PurgeSettings.self, from: Data(input.utf8))) }) { a, _ in a }
            },
            "cloud": [#"{"sunStyle":"halo","kind":"sun"}"#, #"{"sunStyle":7}"#, #"{"cableSide":"middle"}"#, #"{"secondCableSide":null}"#].map { input in
                ["input": input].merging(attempt { try sortedJSON(JSONDecoder().decode(CloudParameters.self, from: Data(input.utf8))) }) { a, _ in a }
            },
            "figure": [#"{"style":7}"#, #"{"surface":"velvet","height":"75"}"#].map { input in
                ["input": input].merging(attempt { try sortedJSON(JSONDecoder().decode(FigureParameters.self, from: Data(input.utf8))) }) { a, _ in a }
            },
            "note": "output is the decoded value re-encoded with sorted keys (not normalized); error is the Swift DecodingError"
        ] as [String: Any]

        // PatternSettings.normalized keeps 64 grapheme clusters and turns whitespace into spaces.
        let texts = ["e\u{301}e\u{301}", "👩‍👩‍👧 family", "a\u{a0}b", "x\ty\nz", "line\u{2028}break", "🇩🇪🇫🇷", "  lead and trail  ", "\u{3000}ideographic",
                     String(repeating: "ab", count: 40), String(repeating: "e\u{301}", count: 70), String(repeating: "😀", count: 65), "Zoë & Léa <3"]
        report["patternText"] = texts.map { input -> [String: Any] in
            var s = PatternSettings(); s.style = .text; s.text = input
            let n = s.normalized(.classic)
            return ["input": input, "text": n.text, "characters": n.text.count, "scalars": n.text.unicodeScalars.count, "utf8": n.text.utf8.count,
                    "normalized": try! sortedJSON(n)]
        }

        // StoredZIP: names in UTF-8, an empty entry, binary data.
        let entries: [(String, Data)] = [("a.txt", Data("hello\n".utf8)), ("dir/ü.json", Data("{}".utf8)), ("empty", Data()), ("bin.dat", Data((0...255).map { UInt8($0) }))]
        let zip = StoredZIP.archive(entries)
        try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
        try zip.write(to: URL(fileURLWithPath: "\(out)/zip-sample.zip"))
        report["storedZip"] = ["file": "zip-sample.zip", "bytes": zip.count,
                               "entries": entries.map { ["name": $0.0, "bytes": $0.1.count, "content": $0.0 == "bin.dat" ? "bytes 0...255" : text($0.1)] }]

        var json = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        json.append(10)
        try json.write(to: URL(fileURLWithPath: "\(out)/json.json"))
        print("json: \(strings.count) strings, \(texts.count) texts, zip \(zip.count) bytes")
    }
}

func sortedJSON<T: Encodable>(_ value: T) throws -> String { text(try sorted().encode(value)) }
