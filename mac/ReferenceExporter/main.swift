import Foundation
import CoreGraphics
import CoreText
import CryptoKit

// Headless reference exporter (work package V1 in docs/plan.md). It decodes every case of
// mac/cases/grid.json with the app's own JSONDecoder path, calls exactly the export the app
// calls (BalloonStudioApp:182-183, BasketEditor:74, RingEditor:115, CloudEditor:108,
// FigureEditor:68, CableClipEditor:64) and writes the files plus a manifest with hashes.
// Built by mac/scripts/build-reference-exporter.sh; -D PRISTINE_SOURCES builds it against
// the unpatched import (no raster dumps there) for mac/scripts/verify-swift-patches.sh.

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("reference-exporter: \(message)\n".utf8))
    exit(2)
}
func note(_ message: String) { FileHandle.standardError.write(Data("\(message)\n".utf8)) }

func hex<S: Sequence>(_ bytes: S) -> String where S.Element == UInt8 {
    let digits = Array("0123456789abcdef".utf8)
    var out = [UInt8](); out.reserveCapacity(64)
    for b in bytes { out.append(digits[Int(b >> 4)]); out.append(digits[Int(b & 15)]) }
    return String(decoding: out, as: UTF8.self)
}
func sha256(_ data: Data) -> String { hex(SHA256.hash(data: data)) }
func crc32(_ data: Data) -> UInt32 {
    var crc = UInt32.max
    for byte in data { crc = StoredZIP.table[Int((crc ^ UInt32(byte)) & 255)] ^ (crc >> 8) }
    return crc ^ UInt32.max
}

// The `normalized` strings: JSONEncoder with sorted keys, the layout the web port must match.
func sortedJSON<T: Encodable>(_ value: T) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    return String(decoding: try encoder.encode(value), as: UTF8.self)
}
func writeJSON(_ object: Any, to url: URL) throws {
    var data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
    data.append(10)
    try data.write(to: url, options: .atomic)
}
func decodeRaw<T: Decodable>(_ type: T.Type, _ raw: Any?) throws -> T? {
    guard let raw, !(raw is NSNull) else { return nil }
    let data = try JSONSerialization.data(withJSONObject: raw, options: [.fragmentsAllowed])
    return try JSONDecoder().decode(T.self, from: data)
}

// MARK: - Cases

let parts: Set<String> = ["balloon", "pattern", "basket", "ring", "cloud", "sun", "figure", "figureSet", "clip"]

struct GridCase {
    let index: Int
    let id: String
    let part: String
    let quality: BalloonGenerator.Quality
    let qualityName: String
    let group: String
    let parameters: Any?
    let pattern: Any?
    let purge: Any?
    let rasters: Bool
    let expect: [String: Any]
    let expectError: String?

    init(_ raw: [String: Any], index: Int) {
        guard let id = raw["id"] as? String, !id.isEmpty, id.allSatisfy({ $0.isASCII && ($0.isLowercase || $0.isNumber || $0 == "-") })
        else { fail("case \(index): id must be lowercase ASCII, digits and dashes") }
        guard let part = raw["part"] as? String, parts.contains(part) else { fail("\(id): unknown part \(raw["part"] ?? "nil")") }
        let quality = raw["quality"] as? String ?? "export"
        guard quality == "export" || quality == "preview" else { fail("\(id): quality must be export or preview") }
        let group = raw["group"] as? String ?? "identity"
        guard ["identity", "relief", "text"].contains(group) else { fail("\(id): unknown group \(group)") }
        let known: Set<String> = ["id", "part", "quality", "group", "parameters", "pattern", "purge", "rasters", "expect", "expectError", "comment"]
        if let extra = raw.keys.first(where: { !known.contains($0) }) { fail("\(id): unknown field \(extra)") }
        self.index = index; self.id = id; self.part = part; self.group = group
        self.quality = quality == "export" ? .export : .preview; self.qualityName = quality
        parameters = raw["parameters"]; pattern = raw["pattern"]; purge = raw["purge"]
        rasters = raw["rasters"] as? Bool ?? false
        expect = raw["expect"] as? [String: Any] ?? [:]
        expectError = raw["expectError"] as? String
    }
}

// MARK: - The app's export paths

struct Produced {
    var filename: String
    var data: Data
    var normalized: [String: String]
    var notes: [String: Any] = [:]
}

// Decode like the app's models (`try? JSONDecoder().decode(...) ?? default`, then normalized()),
// except that a case whose parameters do not decode is an error here, not a silent default.
func produce(_ c: GridCase) throws -> Produced {
    let q = c.quality
    switch c.part {
    case "balloon", "pattern":
        let p = (try decodeRaw(BalloonParameters.self, c.parameters) ?? .classic).normalized()
        let settings = (try decodeRaw(PatternSettings.self, c.pattern) ?? PatternSettings()).normalized(p)
        let purge = (try decodeRaw(PurgeSettings.self, c.purge) ?? PurgeSettings()).normalized()
        var normalized = ["parameters": try sortedJSON(p)]
        if c.part == "pattern" {
            normalized["pattern"] = try sortedJSON(settings)
            normalized["purge"] = try sortedJSON(purge)
        }
        let mesh = BalloonGenerator.generate(p, quality: q)
        // BalloonModel.uses3MF: a pattern exports a 3MF, Solid an STL with settings in its header.
        if c.part == "pattern" && settings.style != .none {
            let suffix = settings.style == .nightFlight ? "-night-flight" : settings.style == .summitCableCar ? "-summit-cable-car" : "-pattern"
            let data = try PaintedBalloon.make(mesh, parameters: p, settings: settings).threeMF(settings: settings, purge: purge)
            return Produced(filename: p.filename.replacingOccurrences(of: ".stl", with: suffix) + ".3mf", data: data, normalized: normalized)
        }
        return Produced(filename: p.filename, data: try BalloonSTL.export(mesh, parameters: p), normalized: normalized)
    case "basket":
        let p = (try decodeRaw(BasketParameters.self, c.parameters) ?? BasketParameters()).normalized()
        return Produced(filename: p.filename, data: try BasketGenerator.generate(p, quality: q).binarySTL(), normalized: ["parameters": try sortedJSON(p)])
    case "ring":
        let p = (try decodeRaw(RingParameters.self, c.parameters) ?? .solid).normalized()
        let data = try p.segmented ? SegmentedRingKit(p, quality: q).archive() : RingGenerator.generate(p, quality: q).binarySTL()
        return Produced(filename: p.filename, data: data, normalized: ["parameters": try sortedJSON(p)])
    case "cloud", "sun":
        let kind: WallLampKind = c.part == "sun" ? .sun : .cloud
        var restored = try decodeRaw(CloudParameters.self, c.parameters) ?? kind.defaults
        restored.kind = kind
        let p = restored.normalized()
        return Produced(filename: p.filename, data: try CloudKit(p, quality: q).archive(), normalized: ["parameters": try sortedJSON(p)])
    case "figure":
        let p = (try decodeRaw(FigureParameters.self, c.parameters) ?? FigureParameters()).normalized()
        return Produced(filename: p.filename, data: try FigureGenerator.generate(p, quality: q).mesh.binarySTL(), normalized: ["parameters": try sortedJSON(p)])
    case "figureSet":
        // FigureSet always generates at export quality.
        let p = (try decodeRaw(FigureParameters.self, c.parameters) ?? FigureParameters()).normalized()
        return Produced(filename: p.setFilename, data: try FigureSet.archive(p), normalized: ["parameters": try sortedJSON(p)])
    case "clip":
        let p = (try decodeRaw(CableClipParameters.self, c.parameters) ?? CableClipParameters()).normalized()
        let kit = CableClipKit.generate(p, quality: q)
        var produced = Produced(filename: p.filename, data: try kit.printView.binarySTL(), normalized: ["parameters": try sortedJSON(p)])
        // The app disables export while the clip reports a problem; the reference keeps the geometry.
        if let problem = kit.clip.problem { produced.notes["problem"] = problem; produced.notes["appExportDisabled"] = true }
        if let hint = kit.clip.note { produced.notes["note"] = hint }
        return produced
    default:
        fail("unreachable part \(c.part)")
    }
}

// MARK: - Inspecting outputs

func kind(of name: String) -> String {
    switch (name as NSString).pathExtension.lowercased() {
    case "stl": return "stl"
    case "zip": return "zip"
    case "3mf": return "3mf"
    case "json": return "json"
    case "svg": return "svg"
    case "model": return "model"
    default: return "text"
    }
}

let standardSTLHeader: Data = {
    var header = Data("Balloon Studio | millimetres | watertight material | Z up".utf8)
    header.append(contentsOf: [UInt8](repeating: 0, count: 80-header.count))
    return header
}()

func stlFacts(_ data: Data) -> [String: Any] {
    guard data.count >= 84 else { return ["malformed": true] }
    return data.withUnsafeBytes { raw -> [String: Any] in
        let count = Int(UInt32(littleEndian: raw.loadUnaligned(fromByteOffset: 80, as: UInt32.self)))
        guard data.count == 84+50*count else { return ["malformed": true, "triangles": count] }
        var facts: [String: Any] = ["triangles": count]
        if data.prefix(80) != standardSTLHeader { facts["header"] = hex(data.prefix(80)) }
        guard count > 0 else { return facts }
        var low = [Float](repeating: .infinity, count: 3), high = [Float](repeating: -.infinity, count: 3)
        for i in 0..<count {
            for k in 0..<9 {
                let value = Float(bitPattern: UInt32(littleEndian: raw.loadUnaligned(fromByteOffset: 84+50*i+12+4*k, as: UInt32.self)))
                low[k%3] = min(low[k%3], value); high[k%3] = max(high[k%3], value)
            }
        }
        facts["bbox"] = ["min": low.map(Double.init), "max": high.map(Double.init)]
        return facts
    }
}

struct ZipEntry { let name: String; let offset: Int; let crc: UInt32; let data: Data }

// Reads the archive StoredZIP wrote: stored entries, no comment, no extra fields.
func zipEntries(_ data: Data) throws -> [ZipEntry] {
    func u16(_ o: Int) -> Int { Int(data[o]) | Int(data[o+1]) << 8 }
    func u32(_ o: Int) -> UInt32 { UInt32(data[o]) | UInt32(data[o+1]) << 8 | UInt32(data[o+2]) << 16 | UInt32(data[o+3]) << 24 }
    let end = data.count-22
    guard end >= 0, u32(end) == 0x06054b50 else { throw MeshError.invalid("no end of central directory") }
    let count = u16(end+10)
    var at = Int(u32(end+16)), entries: [ZipEntry] = []
    for _ in 0..<count {
        guard u32(at) == 0x02014b50 else { throw MeshError.invalid("bad central directory") }
        let crc = u32(at+16), size = Int(u32(at+24)), nameLength = u16(at+28), extra = u16(at+30), comment = u16(at+32)
        let offset = Int(u32(at+42)), name = String(decoding: data[(at+46)..<(at+46+nameLength)], as: UTF8.self)
        guard u32(offset) == 0x04034b50 else { throw MeshError.invalid("bad local header for \(name)") }
        let start = offset+30+u16(offset+26)+u16(offset+28)
        entries.append(ZipEntry(name: name, offset: offset, crc: crc, data: Data(data[start..<(start+size)])))
        at += 46+nameLength+extra+comment
    }
    return entries
}

// MARK: - Output tree

struct Options {
    var cases = ""
    var out = ""
    var only: Set<String>? = nil
    var jobs = 4
    var rasters = false
    var geometryOnly = false
    var tierA: String? = nil
    var tierALimit = 300_000
    var fontFiles: [String: String] = [:]   // BalloonTextFont raw value, or "*" for every font
}

final class Writer {
    let root: URL
    let options: Options
    init(_ options: Options) { self.options = options; root = URL(fileURLWithPath: options.out) }
    func url(_ path: String) -> URL { root.appendingPathComponent(path) }
    func write(_ data: Data, _ path: String) throws {
        let target = url(path)
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: target)
    }
    func remove(_ path: String) { try? FileManager.default.removeItem(at: url(path)) }
    // Tier A: small bodies, content-addressed and deduplicated, committed with the manifest.
    @discardableResult
    func tierA(_ data: Data, _ hash: String) throws -> Bool {
        guard let dir = options.tierA, data.count <= options.tierALimit else { return false }
        let target = URL(fileURLWithPath: dir).appendingPathComponent(String(hash.prefix(2))).appendingPathComponent(hash)
        if !FileManager.default.fileExists(atPath: target.path) {
            try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: target, options: .atomic)
        }
        return true
    }
    func describe(_ data: Data, name: String, tierA allowed: Bool = true) throws -> [String: Any] {
        let hash = sha256(data), kind = kind(of: name)
        var facts: [String: Any] = ["kind": kind, "bytes": data.count, "sha256": hash]
        if !options.geometryOnly { facts["tierA"] = allowed ? try tierA(data, hash) : false }
        if kind == "stl" { facts.merge(stlFacts(data)) { a, _ in a } }
        // The patch proof compares JSON after parsing, so keep the text where the bodies are not written.
        if options.geometryOnly && kind == "json" { facts["text"] = String(decoding: data, as: UTF8.self) }
        return facts
    }
}

func checkExpectations(_ c: GridCase, _ produced: Produced) -> [String] {
    var failures: [String] = []
    for (path, expected) in c.expect.sorted(by: { $0.key < $1.key }) {
        let actual: Any?
        if path == "filename" {
            actual = produced.filename
        } else {
            let parts = path.split(separator: ".", maxSplits: 1).map(String.init)
            guard parts.count == 2, let text = produced.normalized[parts[0]],
                  let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]
            else { failures.append("\(path): no normalized \(path.split(separator: ".").first ?? "")"); continue }
            actual = object[parts[1]]
        }
        if expected is NSNull ? actual != nil : !((actual as? NSObject)?.isEqual(expected) ?? false) {
            failures.append("\(path): expected \(expected), got \(actual.map { "\($0)" } ?? "absent")")
        }
    }
    return failures
}

// CoreGraphics drawing into separate contexts on several threads at once does not give the same
// bitmap as drawing alone: on macOS 26.6.2, 11 of 16 parallel Night Flight or Summit Cable Car
// artworks differed from a sequential draw, by up to 140/255 in a few thousand pixels. Cases that
// draw (relief artworks, text masks) therefore run one at a time; the others stay parallel.
let coreGraphics = NSLock()
func drawsWithCoreGraphics(_ c: GridCase) -> Bool {
    guard c.part == "pattern", let style = (try? decodeRaw(PatternSettings.self, c.pattern))?.style else { return false }
    return style == .text || style.hasRelief
}

func run(_ c: GridCase, _ writer: Writer) -> [String: Any] {
    let serialized = drawsWithCoreGraphics(c)
    if serialized { coreGraphics.lock() }
    defer { if serialized { coreGraphics.unlock() } }
    var record: [String: Any] = ["id": c.id, "part": c.part, "quality": c.qualityName, "group": c.group]
    writer.remove("files/\(c.id)"); writer.remove("entries/\(c.id)")
    let start = DispatchTime.now().uptimeNanoseconds
    let produced: Produced
    do {
        produced = try produce(c)
    } catch {
        record["durationMs"] = Int((DispatchTime.now().uptimeNanoseconds-start)/1_000_000)
        record["error"] = error.localizedDescription
        if c.expectError == nil || !error.localizedDescription.contains(c.expectError!) { record["failures"] = ["unexpected error: \(error.localizedDescription)"] }
        return record
    }
    record["durationMs"] = Int((DispatchTime.now().uptimeNanoseconds-start)/1_000_000)
    var failures = checkExpectations(c, produced)
    if let expected = c.expectError { failures.append("expected the error \(expected), but the export succeeded") }
    record["filename"] = produced.filename
    record["normalized"] = produced.normalized["parameters"]
    if let pattern = produced.normalized["pattern"] { record["normalizedPattern"] = pattern }
    if let purge = produced.normalized["purge"] { record["normalizedPurge"] = purge }
    if !produced.notes.isEmpty { record["notes"] = produced.notes }
    do {
        record.merge(try writer.describe(produced.data, name: produced.filename)) { a, _ in a }
        let geometryOnly = writer.options.geometryOnly
        if !geometryOnly { try writer.write(produced.data, "files/\(c.id)/\(produced.filename)") }
        if ["zip", "3mf"].contains(kind(of: produced.filename)) {
            var entries: [[String: Any]] = []
            for entry in try zipEntries(produced.data) {
                guard crc32(entry.data) == entry.crc else { throw MeshError.invalid("CRC mismatch in \(entry.name)") }
                var facts = try writer.describe(entry.data, name: entry.name)
                facts["name"] = entry.name; facts["crc32"] = entry.crc; facts["localHeaderOffset"] = entry.offset
                entries.append(facts)
                if !geometryOnly { try writer.write(entry.data, "entries/\(c.id)/\(entry.name)") }
            }
            record["entries"] = entries
        }
        #if !PRISTINE_SOURCES
        if writer.options.rasters && c.rasters && c.group != "identity" {
            record["rasters"] = try dumpRasters(c, writer)
        }
        #endif
    } catch {
        failures.append("writing outputs: \(error.localizedDescription)")
    }
    if !failures.isEmpty { record["failures"] = failures }
    return record
}

// MARK: - Raster dumps (Abschnitt 7 of docs/plan.md)

#if !PRISTINE_SOURCES
func pgm(_ width: Int, _ height: Int, _ bytes: [UInt8]) -> Data {
    // Rows in memory order: the first row written is storage row 0, the bottom of the artwork.
    var data = Data("P5\n\(width) \(height)\n255\n".utf8)
    data.append(contentsOf: bytes)
    return data
}
func float32LE(_ values: [Float]) -> Data {
    var data = Data(capacity: values.count*4)
    for v in values { var bits = v.bitPattern.littleEndian; withUnsafeBytes(of: &bits) { data.append(contentsOf: $0) } }
    return data
}
func jsonData(_ object: Any) throws -> Data {
    var data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
    data.append(10)
    return data
}

func storedProperty<T>(_ value: Any, _ label: String) -> T {
    guard let child = Mirror(reflecting: value).children.first(where: { $0.label == label })?.value as? T
    else { fail("\(type(of: value)) has no stored property \(label)") }
    return child
}

// Copy of the nested smooth() in NightFlightRelief.init, to prove the raw dump is its input.
func smooth(_ input: [Float], horizontal: Bool, columns: Int, rows: Int, width: Double, height: Double) -> [Float] {
    var output = Array(repeating: Float(0), count: input.count)
    let count = horizontal ? columns : rows, lines = horizontal ? rows : columns
    let radius = max(1, Int((0.25*Double(count)/(horizontal ? width : height)).rounded()))
    for line in 0..<lines {
        func index(_ offset: Int) -> Int { horizontal ? line*columns+(offset+count)%count : offset*columns+line }
        var sum: Float = 0
        for offset in (horizontal ? -radius : 0)...radius { sum += input[index(offset)] }
        for offset in 0..<count {
            output[index(offset)] = max(0, sum/Float(2*radius+1))
            if horizontal || offset-radius >= 0 { sum -= input[index(offset-radius)] }
            if horizontal || offset+radius+1 < count { sum += input[index(offset+radius+1)] }
        }
    }
    return output
}

let byteForLevel: [UInt32: UInt8] = Dictionary(uniqueKeysWithValues: (0...255).map { ((Float($0)/255).bitPattern, UInt8($0)) })

func dumpRasters(_ c: GridCase, _ writer: Writer) throws -> [[String: Any]] {
    let p = (try decodeRaw(BalloonParameters.self, c.parameters) ?? .classic).normalized()
    let s = (try decodeRaw(PatternSettings.self, c.pattern) ?? PatternSettings()).normalized(p)
    var files: [(String, Data)] = []
    if c.group == "relief" {
        guard s.style.hasRelief else { throw MeshError.invalid("relief case without a relief style") }
        let mesh = BalloonGenerator.generate(p, quality: c.quality)
        let relief = NightFlightRelief(settings: s, parameters: p, mesh: mesh)
        let crest: [Double] = storedProperty(relief, "crest"), field: [Float] = storedProperty(relief, "pixels")
        let columns = relief.columns, rows = relief.rows, width = relief.width, height = relief.height
        let raw: [Float]
        if s.style == .summitCableCar {
            // The crest radius exactly as NightFlightRelief hands it to the cable car.
            let crestRadius: (Double) -> Double = { y in
                let f = max(0, min(Double(rows-1), y/height*Double(rows-1))), i = min(rows-2, Int(f)), t = f-Double(i)
                return crest[i]*(1-t)+crest[i+1]*t
            }
            raw = SummitCableCarArtwork.draw(width: width, height: height, diameter: p.diameter, columns: columns, rows: rows, radius: crestRadius)
        } else {
            raw = NightFlightArtworkReference.draw(width: width, height: height, diameter: p.diameter, columns: columns, rows: rows)
        }
        let bytes = try raw.map { v -> UInt8 in
            guard let b = byteForLevel[v.bitPattern] else { throw MeshError.invalid("artwork value \(v) is not a byte/255") }
            return b
        }
        let blurred = smooth(smooth(raw, horizontal: true, columns: columns, rows: rows, width: width, height: height),
                             horizontal: false, columns: columns, rows: rows, width: width, height: height)
        guard blurred.map(\.bitPattern) == field.map(\.bitPattern) else { throw MeshError.invalid("re-blurred artwork differs from the relief field") }
        let radii = [true, false].map { h in max(1, Int((0.25*Double(h ? columns : rows)/(h ? width : height)).rounded())) }
        let rawData = pgm(columns, rows, bytes), fieldData = float32LE(field)
        files.append(("\(c.id).raw.pgm", rawData))
        files.append(("\(c.id).field.f32", fieldData))
        files.append(("\(c.id).json", try jsonData([
            "case": c.id, "style": s.style.rawValue, "width": width, "height": height, "columns": columns, "rows": rows,
            "bottom": relief.bottom, "depth": relief.depth, "diameter": p.diameter, "crest": crest,
            "blurRadius": ["horizontal": radii[0], "vertical": radii[1]], "blurVerified": true,
            "rowOrder": "row 0 is the bottom of the artwork (lowest z)",
            "rawSha256": sha256(rawData), "fieldSha256": sha256(fieldData)
        ] as [String: Any])))
    } else {
        guard s.style == .text else { throw MeshError.invalid("text case without the Text style") }
        let source = writer.options.fontFiles[s.textFont.rawValue] ?? writer.options.fontFiles["*"]
        let typeface: CTFont
        if let source {
            guard let data = FileManager.default.contents(atPath: source),
                  let descriptor = CTFontManagerCreateFontDescriptorFromData(data as CFData)
            else { throw MeshError.invalid("cannot load the font file \(source)") }
            typeface = CTFontCreateWithFontDescriptor(descriptor, 100, nil)
        } else {
            typeface = CTFontCreateWithName(s.textFont.postScriptName as CFString, 100, nil)
        }
        guard let dump = renderText(s.text, typeface: typeface) else { throw MeshError.invalid("text renders no mask") }
        if source == nil {
            // Same font, same code: the dump must be the mask the 3MF export used.
            guard let mask = BalloonTextMask(text: s.text, font: s.textFont), mask.width == dump.width, mask.height == dump.height,
                  mask.pixels == dump.pixels, mask.aspect == dump.aspect
            else { throw MeshError.invalid("text dump differs from BalloonTextMask") }
        }
        let image = pgm(dump.width, dump.height, dump.pixels)
        files.append(("\(c.id).pgm", image))
        files.append(("\(c.id).json", try jsonData([
            "case": c.id, "text": s.text, "font": s.textFont.rawValue,
            "fontSource": source.map { "file:\(($0 as NSString).lastPathComponent)" } ?? "system:\(s.textFont.postScriptName)",
            "fontPostScriptName": CTFontCopyPostScriptName(typeface) as String,
            "width": dump.width, "height": dump.height, "aspect": dump.aspect, "glyphCount": dump.glyphCount,
            "bounds": ["x": Double(dump.bounds.minX), "y": Double(dump.bounds.minY), "width": Double(dump.bounds.width), "height": Double(dump.bounds.height)],
            "runs": dump.runs, "antialias": false,
            "rowOrder": "row 0 is the bottom of the glyphs", "sha256": sha256(image)
        ] as [String: Any])))
    }
    return try files.map { name, data in
        try writer.write(data, "rasters/\(name)")
        var facts = try writer.describe(data, name: name, tierA: false)
        facts["name"] = name
        facts["kind"] = (name as NSString).pathExtension == "f32" ? "f32" : (name as NSString).pathExtension
        return facts
    }
}

struct TextDump {
    let width: Int
    let height: Int
    let aspect: Double
    let pixels: [UInt8]
    let bounds: CGRect
    let glyphCount: Int
    let runs: [[String: Any]]
}

// BalloonTextMask.init (BalloonText.swift:28-77) with the typeface passed in, so bundled TTFs can be
// shaped by the same code. Kept line for line; dumpRasters checks it against the original.
func renderText(_ text: String, typeface: CTFont) -> TextDump? {
    let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !message.isEmpty else { return nil }
    let attributes = [NSAttributedString.Key(kCTFontAttributeName as String): typeface]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: message, attributes: attributes))
    let path = CGMutablePath()
    var glyphCount = 0, runs: [[String: Any]] = []
    for run in CTLineGetGlyphRuns(line) as! [CTRun] {
        let count = CTRunGetGlyphCount(run)
        var glyphs = Array(repeating: CGGlyph(), count: count)
        var positions = Array(repeating: CGPoint.zero, count: count)
        CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
        CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
        let runFont = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
        let matrix = CTRunGetTextMatrix(run)
        for i in 0..<count {
            guard let glyph = CTFontCreatePathForGlyph(runFont, glyphs[i], nil) else { continue }
            var transform = matrix
            transform.tx += positions[i].x; transform.ty += positions[i].y
            path.addPath(glyph, transform: transform)
        }
        glyphCount += count
        runs.append(["font": CTFontCopyPostScriptName(runFont) as String, "glyphs": glyphs.map(Int.init),
                     "positions": positions.map { [Double($0.x), Double($0.y)] }])
    }
    let bounds = path.boundingBoxOfPath
    guard !bounds.isNull, bounds.width > 0, bounds.height > 0 else { return nil }
    let aspect = Double(bounds.width/bounds.height)
    let scale = min(256/bounds.height, 8192/bounds.width)
    let width = max(1, Int(ceil(bounds.width*scale))), height = max(1, Int(ceil(bounds.height*scale)))
    var bytes = Array(repeating: UInt8(0), count: width*height)
    let rendered = bytes.withUnsafeMutableBytes { buffer -> Bool in
        guard let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                      bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
        context.setShouldAntialias(false)
        context.setFillColor(gray: 1, alpha: 1)
        context.translateBy(x: 0, y: CGFloat(height)); context.scaleBy(x: 1, y: -1)
        context.scaleBy(x: CGFloat(width)/bounds.width, y: CGFloat(height)/bounds.height)
        context.translateBy(x: -bounds.minX, y: -bounds.minY)
        context.addPath(path); context.fillPath()
        return true
    }
    guard rendered, bytes.contains(where: { $0 > 0 }) else { return nil }
    return TextDump(width: width, height: height, aspect: aspect, pixels: bytes, bounds: bounds, glyphCount: glyphCount, runs: runs)
}

// Calibration canvases for the TS rasterizer (WP-R2): 64 × 64 DeviceGray, black background,
// flipped like the artworks so storage row 0 is user y = 0. One unit is one pixel.
func primitives() -> [(name: String, spec: [String: Any], draw: (CGContext) -> Void)] {
    func points(_ pts: [(Double, Double)]) -> [[Double]] { pts.map { [$0.0, $0.1] } }
    let polyline: [(Double, Double)] = [(8, 12), (30, 52), (40, 20), (57, 30)]
    func addPolyline(_ c: CGContext) {
        c.move(to: CGPoint(x: polyline[0].0, y: polyline[0].1))
        for p in polyline.dropFirst() { c.addLine(to: CGPoint(x: p.0, y: p.1)) }
    }
    // The moon of NightFlight.swift:84-93 at r = 24 around the canvas centre.
    let moonRadius = 24.0, mx = 32.0, my = 32.0
    let dx = 0.48, dy = 0.28, innerRadius = 0.89, d = hypot(dx, dy)
    let direction = atan2(dy, dx), halfAngle = acos((1-innerRadius*innerRadius+d*d)/(2*d))
    let upper = direction+halfAngle, lower = direction-halfAngle
    let innerStart = atan2(sin(lower)-dy, cos(lower)-dx), innerEnd = atan2(sin(upper)-dy, cos(upper)-dx)
    return [
        ("circle-r20-gray07", ["op": "fillEllipse", "rect": [12, 12, 40, 40], "gray": 0.7, "antialias": true], { c in
            c.setFillColor(gray: 0.7, alpha: 1); c.fillEllipse(in: CGRect(x: 12, y: 12, width: 40, height: 40))
        }),
        ("triangle-aa-off", ["op": "fillPath", "antialias": false, "gray": 1, "path": points([(6.3, 8.6), (58.2, 20.4), (21.7, 57.1)]), "closed": true], { c in
            c.setShouldAntialias(false); c.setFillColor(gray: 1, alpha: 1)
            c.move(to: CGPoint(x: 6.3, y: 8.6)); c.addLine(to: CGPoint(x: 58.2, y: 20.4)); c.addLine(to: CGPoint(x: 21.7, y: 57.1))
            c.closePath(); c.fillPath()
        }),
        ("polyline-miter-w6", ["op": "strokePath", "points": points(polyline), "width": 6, "cap": "butt", "join": "miter", "miterLimit": 10, "gray": 1], { c in
            c.setStrokeColor(gray: 1, alpha: 1); c.setLineWidth(6); c.setLineCap(.butt); c.setLineJoin(.miter); c.setMiterLimit(10)
            addPolyline(c); c.strokePath()
        }),
        ("polyline-round-w6", ["op": "strokePath", "points": points(polyline), "width": 6, "cap": "round", "join": "round", "gray": 0.8], { c in
            c.setStrokeColor(gray: 0.8, alpha: 1); c.setLineWidth(6); c.setLineCap(.round); c.setLineJoin(.round)
            addPolyline(c); c.strokePath()
        }),
        ("cubic-dash-8-5-w4", ["op": "strokePath", "move": [6, 10], "curve": [[10, 62], [54, 2], [58, 54]], "dash": ["phase": 0, "lengths": [8, 5]],
                               "width": 4, "cap": "butt", "join": "miter", "gray": 1], { c in
            c.setStrokeColor(gray: 1, alpha: 1); c.setLineWidth(4); c.setLineCap(.butt); c.setLineDash(phase: 0, lengths: [8, 5])
            c.move(to: CGPoint(x: 6, y: 10)); c.addCurve(to: CGPoint(x: 58, y: 54), control1: CGPoint(x: 10, y: 62), control2: CGPoint(x: 54, y: 2))
            c.strokePath()
        }),
        ("roundedrect-stroke-w2", ["op": "strokePath", "roundedRect": [10, 14, 44, 36], "cornerWidth": 8, "cornerHeight": 8, "width": 2, "gray": 0.9], { c in
            c.setStrokeColor(gray: 0.9, alpha: 1); c.setLineWidth(2)
            c.addPath(CGPath(roundedRect: CGRect(x: 10, y: 14, width: 44, height: 36), cornerWidth: 8, cornerHeight: 8, transform: nil)); c.strokePath()
        }),
        ("radial-gradient-circle-clip", ["op": "drawRadialGradient", "clipEllipse": [8, 8, 48, 48], "colors": [0.9, 0.6], "locations": [0, 1],
                                         "startCenter": [26, 38], "startRadius": 0, "endCenter": [26, 38], "endRadius": 20, "options": ["drawsAfterEndLocation"]], { c in
            c.addEllipse(in: CGRect(x: 8, y: 8, width: 48, height: 48)); c.clip()
            let g = CGGradient(colorSpace: CGColorSpaceCreateDeviceGray(), colorComponents: [0.9, 1, 0.6, 1], locations: [0, 1], count: 2)!
            c.drawRadialGradient(g, startCenter: CGPoint(x: 26, y: 38), startRadius: 0, endCenter: CGPoint(x: 26, y: 38), endRadius: 20, options: .drawsAfterEndLocation)
        }),
        ("radial-gradient-anisotropic", ["op": "drawRadialGradient", "clipEllipse": [4, 14, 56, 36], "translate": [32, 32], "scale": [2.2, 1],
                                         "colors": [0.95, 0.2], "locations": [0, 1], "startCenter": [0, 0], "startRadius": 0, "endCenter": [0, 0],
                                         "endRadius": 12, "options": ["drawsAfterEndLocation"], "comment": "as SummitCableCar.rounded(): clip, then translate and scale x"], { c in
            c.addEllipse(in: CGRect(x: 4, y: 14, width: 56, height: 36)); c.clip()
            c.translateBy(x: 32, y: 32); c.scaleBy(x: 2.2, y: 1)
            let g = CGGradient(colorSpace: CGColorSpaceCreateDeviceGray(), colorComponents: [0.95, 1, 0.2, 1], locations: [0, 1], count: 2)!
            c.drawRadialGradient(g, startCenter: .zero, startRadius: 0, endCenter: .zero, endRadius: 12, options: .drawsAfterEndLocation)
        }),
        ("linear-gradient-rect-clip", ["op": "drawLinearGradient", "clipPathRect": [8, 12, 48, 40], "colors": [0.2, 1], "locations": [0, 1],
                                       "start": [20, 20], "end": [44, 44], "options": ["drawsBeforeStartLocation", "drawsAfterEndLocation"]], { c in
            c.addRect(CGRect(x: 8, y: 12, width: 48, height: 40)); c.clip()
            let g = CGGradient(colorSpace: CGColorSpaceCreateDeviceGray(), colorComponents: [0.2, 1, 1, 1], locations: [0, 1], count: 2)!
            c.drawLinearGradient(g, start: CGPoint(x: 20, y: 20), end: CGPoint(x: 44, y: 44), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        }),
        ("nested-aa-clips", ["op": "fillRect", "clipEllipses": [[6, 10, 40, 44], [20, 6, 38, 46]], "rect": [0, 0, 64, 64], "gray": 1], { c in
            c.addEllipse(in: CGRect(x: 6, y: 10, width: 40, height: 44)); c.clip()
            c.addEllipse(in: CGRect(x: 20, y: 6, width: 38, height: 46)); c.clip()
            c.setFillColor(gray: 1, alpha: 1); c.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
        }),
        ("moon-r24", ["op": "fillPath", "gray": 0.9, "source": "NightFlight.swift:84-93", "center": [mx, my], "radius": moonRadius,
                      "outerArc": ["startAngle": upper, "endAngle": lower+2*Double.pi, "clockwise": false],
                      "innerArc": ["center": [mx+dx*moonRadius, my+dy*moonRadius], "radius": innerRadius*moonRadius,
                                   "startAngle": innerStart, "endAngle": innerEnd, "clockwise": true], "closed": true], { c in
            let moon = CGMutablePath()
            moon.addArc(center: CGPoint(x: mx, y: my), radius: moonRadius, startAngle: upper, endAngle: lower+2*Double.pi, clockwise: false)
            moon.addArc(center: CGPoint(x: mx+dx*moonRadius, y: my+dy*moonRadius), radius: innerRadius*moonRadius,
                        startAngle: innerStart, endAngle: innerEnd, clockwise: true)
            moon.closeSubpath()
            c.setFillColor(gray: 0.9, alpha: 1); c.addPath(moon); c.fillPath()
        }),
        ("stroked-copy-fill", ["op": "fillPath", "of": "copy(strokingWithWidth: 5, lineCap: round, lineJoin: round, miterLimit: 4)", "points": points(polyline), "gray": 0.75,
                               "comment": "SummitCableCar.line(): CG's stroker output filled"], { c in
            let p = CGMutablePath(); p.move(to: CGPoint(x: polyline[0].0, y: polyline[0].1))
            for q in polyline.dropFirst() { p.addLine(to: CGPoint(x: q.0, y: q.1)) }
            c.setFillColor(gray: 0.75, alpha: 1); c.addPath(p.copy(strokingWithWidth: 5, lineCap: .round, lineJoin: .round, miterLimit: 4)); c.fillPath()
        }),
        ("dashed-copy-stroke", ["op": "fillPath", "of": "copy(dashingWithPhase: 0, lengths: [3.4, 2.8]) then copy(strokingWithWidth: 1.4, round, round, 4)",
                                "move": [6, 32], "curve": [[20, 58], [44, 6], [58, 32]], "gray": 0.32, "comment": "SummitCableCar.swift:213"], { c in
            let p = CGMutablePath(); p.move(to: CGPoint(x: 6, y: 32))
            p.addCurve(to: CGPoint(x: 58, y: 32), control1: CGPoint(x: 20, y: 58), control2: CGPoint(x: 44, y: 6))
            let dashed = p.copy(dashingWithPhase: 0, lengths: [3.4, 2.8])
            c.setFillColor(gray: 0.32, alpha: 1); c.addPath(dashed.copy(strokingWithWidth: 1.4, lineCap: .round, lineJoin: .round, miterLimit: 4)); c.fillPath()
        }),
        ("overlap-twice-circle", ["op": "fillEllipse", "rect": [12, 12, 40, 40], "gray": 0.7, "times": 2, "comment": "drawn twice; equal to circle-r20-gray07 only without conflation"], { c in
            c.setFillColor(gray: 0.7, alpha: 1)
            c.fillEllipse(in: CGRect(x: 12, y: 12, width: 40, height: 40)); c.fillEllipse(in: CGRect(x: 12, y: 12, width: 40, height: 40))
        })
    ]
}

func dumpPrimitives(_ writer: Writer) throws -> [[String: Any]] {
    var records: [[String: Any]] = [], index: [[String: Any]] = []
    for primitive in primitives() {
        var bytes = [UInt8](repeating: 0, count: 64*64)
        bytes.withUnsafeMutableBytes { buffer in
            let c = CGContext(data: buffer.baseAddress, width: 64, height: 64, bitsPerComponent: 8, bytesPerRow: 64,
                              space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
            c.translateBy(x: 0, y: 64); c.scaleBy(x: 1, y: -1)
            primitive.draw(c)
        }
        let data = pgm(64, 64, bytes), name = "primitives/\(primitive.name).pgm"
        try writer.write(data, "rasters/\(name)")
        var facts = try writer.describe(data, name: name)
        facts["name"] = name; facts["kind"] = "pgm"
        records.append(facts)
        var spec = primitive.spec
        spec["name"] = primitive.name; spec["sha256"] = facts["sha256"]
        index.append(spec)
    }
    let data = try jsonData(["canvas": ["width": 64, "height": 64, "space": "DeviceGray", "background": 0,
                                        "transform": "translate(0,64) scale(1,-1): storage row 0 is y = 0"],
                             "primitives": index] as [String: Any])
    try writer.write(data, "rasters/primitives/index.json")
    var facts = try writer.describe(data, name: "primitives/index.json")
    facts["name"] = "primitives/index.json"
    records.append(facts)
    return records
}
#endif

// MARK: - Stamping the pack into the manifest

func stamp(_ arguments: [String]) throws {
    var manifestPath = "", outPath = "", release = "", assets: [(String, String)] = []
    var i = 0
    while i < arguments.count {
        let flag = arguments[i], value = i+1 < arguments.count ? arguments[i+1] : ""
        switch flag {
        case "--manifest": manifestPath = value
        case "--out": outPath = value
        case "--release": release = value
        case "--asset": assets.append((value, i+2 < arguments.count ? arguments[i+2] : "")); i += 1
        default: fail("stamp: unknown option \(flag)")
        }
        i += 2
    }
    guard let data = FileManager.default.contents(atPath: manifestPath),
          var manifest = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { fail("stamp: cannot read \(manifestPath)") }
    var described: [[String: Any]] = []
    for (path, url) in assets {
        guard let body = FileManager.default.contents(atPath: path) else { fail("stamp: cannot read \(path)") }
        described.append(["name": (path as NSString).lastPathComponent, "url": url, "bytes": body.count, "sha256": sha256(body)])
    }
    manifest["pack"] = ["release": release, "assets": described]
    try writeJSON(manifest, to: URL(fileURLWithPath: outPath.isEmpty ? manifestPath : outPath))
}

// MARK: - Main

func sourcesFacts(_ directory: String?) -> [String: Any] {
    guard let directory else { return [:] }
    let names = ["BalloonGeometry", "BalloonPatterns", "BalloonText", "NightFlight", "SummitCableCar", "ThreeMF", "SurfaceQuery",
                 "CeilingLoop", "StringHoles", "BasketGeometry", "RingGeometry", "SegmentedRing", "SunGeometry", "CloudGeometry",
                 "CableSeal", "CableClamp", "LampSurface", "CloudLEDLayout", "LampSettingsFile", "FigureGeometry", "NailInsert",
                 "CableClip", "STLImport", "StableJSON"]
    var files: [[String: Any]] = [], lines = ""
    for name in names {
        let path = "\(directory)/\(name).swift"
        guard let body = FileManager.default.contents(atPath: path) else { continue }
        let hash = sha256(body)
        files.append(["file": "\(name).swift", "sha256": hash])
        lines += "\(hash)  \(name).swift\n"
    }
    return ["count": files.count, "files": files, "sha256": sha256(Data(lines.utf8)),
            "rule": "sha256 over the lines \"<sha256>  <file>\\n\" in the order of files"]
}

@main
struct ReferenceExporter {
    static func main() throws {
        setbuf(stdout, nil)
        var arguments = Array(CommandLine.arguments.dropFirst())
        if arguments.first == "stamp" { try stamp(Array(arguments.dropFirst())); return }
        var options = Options(), sources: String? = nil, toolchain: [String: Any] = [:]
        func value() -> String {
            guard arguments.count > 1 else { fail("missing value for \(arguments[0])") }
            let v = arguments[1]; arguments.removeFirst(2); return v
        }
        while let flag = arguments.first {
            switch flag {
            case "--cases": options.cases = value()
            case "--out": options.out = value()
            case "--only": options.only = Set(value().split(separator: ",").map(String.init))
            case "--jobs": options.jobs = max(1, Int(value()) ?? 4)
            case "--tier-a": options.tierA = value()
            case "--tier-a-limit": options.tierALimit = Int(value()) ?? 300_000
            case "--sources": sources = value()
            case "--toolchain":
                let parts = value().split(separator: "=", maxSplits: 1).map(String.init)
                toolchain[parts[0]] = parts.count == 2 ? parts[1] : ""
            case "--font-file":
                // Font=file.ttf with the raw value ("Sans serif") or the case name ("sans"); a bare file applies to every font.
                let spec = value(), parts = spec.split(separator: "=", maxSplits: 1).map(String.init)
                if parts.count == 2, let font = BalloonTextFont.allCases.first(where: { $0.rawValue == parts[0] || "\($0)" == parts[0] }) {
                    options.fontFiles[font.rawValue] = parts[1]
                } else {
                    options.fontFiles["*"] = spec
                }
            case "--rasters": options.rasters = true; arguments.removeFirst()
            case "--geometry-only": options.geometryOnly = true; arguments.removeFirst()
            default: fail("unknown option \(flag)")
            }
        }
        #if PRISTINE_SOURCES
        if options.rasters { fail("--rasters needs the patched sources") }
        #endif
        if options.geometryOnly { options.rasters = false; options.tierA = nil }
        guard !options.cases.isEmpty, !options.out.isEmpty else {
            fail("usage: reference-exporter --cases grid.json --out DIR [--only id,…] [--jobs N] [--rasters] [--geometry-only] [--tier-a DIR] [--font-file [Font=]file.ttf] [--sources DIR]\n       reference-exporter stamp --manifest FILE --release TAG --asset FILE URL … [--out FILE]")
        }
        guard let gridData = FileManager.default.contents(atPath: options.cases),
              let grid = try JSONSerialization.jsonObject(with: gridData) as? [String: Any],
              let rawCases = grid["cases"] as? [[String: Any]] else { fail("cannot read cases from \(options.cases)") }
        let all = rawCases.enumerated().map { GridCase($0.element, index: $0.offset) }
        if Set(all.map(\.id)).count != all.count { fail("duplicate case ids") }
        if let only = options.only, let unknown = only.first(where: { id in !all.contains { $0.id == id } }) { fail("unknown case \(unknown)") }
        let cases = all.filter { options.only?.contains($0.id) ?? true }
        let writer = Writer(options)
        try FileManager.default.createDirectory(at: writer.root, withIntermediateDirectories: true)

        final class Results: @unchecked Sendable {
            let lock = NSLock()
            var next = 0, done = 0
            var records: [Int: [String: Any]] = [:]
        }
        let results = Results(), started = Date()
        note("reference-exporter: \(cases.count) cases, \(options.jobs) jobs\(options.rasters ? ", rasters" : "")\(options.geometryOnly ? ", geometry only" : "")")
        DispatchQueue.concurrentPerform(iterations: min(options.jobs, max(1, cases.count))) { _ in
            while true {
                results.lock.lock(); let i = results.next; results.next += 1; results.lock.unlock()
                guard i < cases.count else { return }
                let record = autoreleasepool { run(cases[i], writer) }
                results.lock.lock()
                results.records[i] = record; results.done += 1
                let line = "[\(results.done)/\(cases.count)] \(cases[i].id) \(record["durationMs"] ?? 0) ms\(record["failures"] != nil ? " FAILED" : "")"
                results.lock.unlock()
                note(line)
            }
        }
        let records = (0..<cases.count).map { results.records[$0]! }
        let sourceFacts = sourcesFacts(sources)
        var manifest: [String: Any] = [
            "schema": 1,
            "generatedAt": ISO8601DateFormatter().string(from: started),
            "generator": ["exporter": "mac/ReferenceExporter/main.swift", "toolchain": toolchain,
                          "macOS": ProcessInfo.processInfo.operatingSystemVersionString,
                          "geometryOnly": options.geometryOnly, "rasters": options.rasters,
                          "fontFiles": options.fontFiles.mapValues { ($0 as NSString).lastPathComponent }] as [String: Any],
            "grid": ["path": "mac/cases/grid.json", "sha256": sha256(gridData), "cases": all.count],
            "sources": sourceFacts,
            "sourcesSha256": sourceFacts["sha256"] ?? NSNull(),
            "tierA": ["path": "references/files/<sha256[0:2]>/<sha256>", "maxBytes": options.tierALimit],
            "cases": records
        ]
        #if !PRISTINE_SOURCES
        if options.rasters { manifest["primitives"] = try dumpPrimitives(writer) }
        #endif
        try writeJSON(manifest, to: writer.url("manifest.json"))
        let failed = records.filter { $0["failures"] != nil }
        for record in failed { note("FAILED \(record["id"]!): \(record["failures"]!)") }
        note("reference-exporter: \(records.count) cases in \(Int(Date().timeIntervalSince(started))) s, \(failed.count) failed")
        if !failed.isEmpty { exit(1) }
    }
}
