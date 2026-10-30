// What CoreText does with the bundled TTFs on strings the 20 text dumps do not exercise (WP-R3).
//   DEVELOPER_DIR=/Library/Developer/CommandLineTools xcrun swiftc -O -o /tmp/ct-shaping tests/fixtures/text/ct-shaping.swift
//   /tmp/ct-shaping public/fonts > tests/fixtures/text/ct-shaping.json
import CoreGraphics
import CoreText
import Foundation

let files = ["Nunito-Bold", "Arimo-Bold", "Gelasio-Bold", "ComicNeue-Bold", "DejaVuSansMono-Bold"]
let strings = ["AVATAR", "To Wave, Ty. LT", "Tokyo Yves", "office fi fl", "a\u{AD}b", "e\u{308}", "A\u{200D}B", "a\tb", "a\u{2009}b", "A\u{FE0F}B",
               "\u{133}", "\u{17F}", "\u{126}\u{127}", "a\u{127}a", "Zo\u{EB} & L\u{E9}a <3", "\u{20AC} 3 <3", "\u{6771}\u{4EAC}", "\u{1F600}"]
var out: [[String: Any]] = []
for name in files {
    let data = FileManager.default.contents(atPath: "\(CommandLine.arguments[1])/\(name).ttf")!
    let typeface = CTFontCreateWithFontDescriptor(CTFontManagerCreateFontDescriptorFromData(data as CFData)!, 100, nil)
    for text in strings {
        let attributes = [NSAttributedString.Key(kCTFontAttributeName as String): typeface]
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
        var runs: [[String: Any]] = []
        for run in CTLineGetGlyphRuns(line) as! [CTRun] {
            let count = CTRunGetGlyphCount(run)
            var glyphs = Array(repeating: CGGlyph(), count: count), positions = Array(repeating: CGPoint.zero, count: count)
            CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
            CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
            let font = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
            runs.append(["font": CTFontCopyPostScriptName(font) as String, "glyphs": glyphs.map(Int.init), "x": positions.map { Double($0.x) }])
        }
        out.append(["font": name, "text": text, "runs": runs])
    }
}
let json = try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys, .withoutEscapingSlashes])
print(String(decoding: json, as: UTF8.self))
