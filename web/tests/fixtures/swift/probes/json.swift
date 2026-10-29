import Foundation

struct Inner: Codable { var b: Double; var a: Int }
enum Kind: String, Codable { case cloud, sun }
struct Probe: Codable {
    var name: String
    var width: Double
    var small: Double
    var arr: [Double]
    var ints: [Int]
    var count: Int
    var flag: Bool
    var off: Bool
    var missing: Double?
    var present: Double?
    var inner: Inner
    var kind: Kind
    var negZero: Double
    var big: Double
    var big15: Double
    var big17: Double
    var tiny: Double
    var sum: Double
    var ctrl: String
    var bandWidth: Double
    var bands: Int
    var a10: Int
    var a9: Int
    var B: Int
    var a: Int
    var _x: Int
    var Z: Int
    var aB: Int
    var ab: Int
    var x_y: Int
    var xY: Int
    var x01: Int
    var x1: Int
    var empty: [Double]
    var nested: [[Double]]
    var dict: [String: Double]
    var float32: Float
    var maxD: Double
    var minD: Double
    var neg: Double
}
let p = Probe(name: "a/b", width: 230, small: 1e-5, arr: [1, 2.5, 1e-5], ints: [3, -4], count: 450, flag: true, off: false,
              missing: nil, present: 0.3, inner: Inner(b: 0.1, a: 7), kind: .sun, negZero: -0.0, big: 1e16, big15: 1e15,
              big17: 123456789012345678, tiny: 5e-324, sum: 0.1+0.2,
              ctrl: "\u{0}\u{1}\u{8}\u{9}\u{a}\u{b}\u{c}\u{d}\u{1f}\u{7f}\"\\/é😀\u{2028}\u{2029}\u{FEFF}<>&'",
              bandWidth: 1, bands: 2, a10: 1, a9: 1, B: 1, a: 1, _x: 1, Z: 1, aB: 1, ab: 1, x_y: 1, xY: 1, x01: 1, x1: 1,
              empty: [], nested: [[1, 2], []], dict: ["k": 1, "J": 2, "_": 3, "k2": 4, "k10": 5],
              float32: 0.1, maxD: .greatestFiniteMagnitude, minD: 1e-4, neg: -12.5)
let enc = JSONEncoder()
enc.outputFormatting = [.sortedKeys]
let data = try enc.encode(p)
FileHandle.standardOutput.write("ENCODER\n".data(using: .utf8)!)
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\nENCODER_PRETTY\n".data(using: .utf8)!)
let enc2 = JSONEncoder(); enc2.outputFormatting = [.sortedKeys, .prettyPrinted]
FileHandle.standardOutput.write(try enc2.encode(p))
// Parse back and re-serialize with JSONSerialization
let obj = try JSONSerialization.jsonObject(with: data)
FileHandle.standardOutput.write("\nSER_PRETTY\n".data(using: .utf8)!)
let manifest: [String: Any] = ["format_version": 2, "units": "millimetres", "parameters": obj,
    "parts": [["file": "a.stl", "quantity": 6, "dimensions_mm": [169.45178757107396, 230.0, 0.3, 1e16, 1e-5, -0.0, 5e-324, 1e17, 1e21, 0.1]]],
    "load_rated": false, "yes": true, "emptyA": [Any](), "emptyD": [String: Any](), "dbl": 2.0, "intNeg": -3, "nsd": NSNumber(value: 0.5),
    "f32": Float(0.1), "u8": UInt8(3), "nan_s": "x/y"]
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys]))
FileHandle.standardOutput.write("\nSER_COMPACT\n".data(using: .utf8)!)
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys]))
let config: [String: Any] = ["filament_colour": ["#FFFFFF", "#E0245E"], "filament_type": ["PLA", "PLA"], "filament_diameter": ["1.75", "1.75"], "filament_density": [String(1.24), String(1.24)]]
FileHandle.standardOutput.write("\nSER_CONFIG\n".data(using: .utf8)!)
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: config, options: .sortedKeys))
// Key ordering stress
var keys: [String: Int] = [:]
for k in ["a10","a9","B","a","b","_x","Z","aB","ab","AB","x_y","xY","x1","x01","x001","é","e","f","z","~","-","0","9","10","a b","a-b","a.b","A_b","a_b","ä","ledClearance","led_mount","bandWidth","bands","x2y","x10y","Ab","aa"] { keys[k] = 1 }
FileHandle.standardOutput.write("\nSER_KEYS\n".data(using: .utf8)!)
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: keys, options: [.sortedKeys]))
FileHandle.standardOutput.write("\nENC_KEYS\n".data(using: .utf8)!)
FileHandle.standardOutput.write(try enc.encode(keys))
FileHandle.standardOutput.write("\nSER_STR\n".data(using: .utf8)!)
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: ["s": p.ctrl], options: [.sortedKeys]))
FileHandle.standardOutput.write("\nSER_NUMS\n".data(using: .utf8)!)
let parsed = try JSONSerialization.jsonObject(with: Data("[1,2.5,1e-05,230,-0,1e+16,0.3,450,true,false,1.0,100000000000000000000,-0.0,1.7976931348623157e+308,5e-324,0.1]".utf8))
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: parsed, options: [.prettyPrinted]))
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
