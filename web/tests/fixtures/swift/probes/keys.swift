import Foundation
var state: UInt64 = 0x9E3779B97F4A7C15
func next() -> UInt64 { state &+= 0x9E3779B97F4A7C15; var z = state; z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9; z = (z ^ (z >> 27)) &* 0x94D049BB133111EB; return z ^ (z >> 31) }
let alpha = Array("abcxyzABCXYZ0123456789_-. ")
let letters = Array("abcdeABCDE")
var keys = Set<String>()
while keys.count < 400 {
    let n = Int(next() % 6) + 1
    var s = ""
    for _ in 0..<n { s.append(alpha[Int(next() % UInt64(alpha.count))]) }
    keys.insert(s)
}
// camelCase-ish identifiers
while keys.count < 700 {
    let n = Int(next() % 7) + 2
    var s = ""
    for _ in 0..<n { s.append(letters[Int(next() % UInt64(letters.count))]) }
    if next() % 3 == 0 { s.append("_") ; s.append(letters[Int(next() % 10)]) }
    if next() % 4 == 0 { s.append(String(next() % 120)) }
    keys.insert(s)
}
var dict: [String: Int] = [:]
for k in keys { dict[k] = 0 }
let data = try JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
let enc = JSONEncoder(); enc.outputFormatting = [.sortedKeys]
FileHandle.standardOutput.write(try enc.encode(dict))
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
