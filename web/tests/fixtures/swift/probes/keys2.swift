import Foundation
var dict: [String: Int] = [:]
for v in 32...126 { let c = String(UnicodeScalar(UInt8(v))); dict["a" + c + "b"] = v }
let data = try JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys])
FileHandle.standardOutput.write(data); print()
var d2: [String: Int] = [:]
for k in ["A1", "a01", "a1", "A01", "x1y", "x01Y", "X1y", "x001", "x1", "a1b2", "a01b02", "a1b02", "a01b2", "1", "01", "001", "0", "00", "a0", "a", "a00"] { d2[k] = 0 }
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: d2, options: [.sortedKeys])); print()
