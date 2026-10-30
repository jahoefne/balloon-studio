// WP-K2 follow-up probe: which DecodingError text each document gets, and how read strings and
// keys convert (dump: ../jsonDecoder.txt). Build and run:
//   DEVELOPER_DIR=/Library/Developer/CommandLineTools xcrun swiftc -O -parse-as-library jsonDecoder.swift -o /tmp/jsonDecoder && /tmp/jsonDecoder > ../jsonDecoder.txt
// Each line: the document with non-printables as <U+XXXX>, a tab, the outcome.
import Foundation

/// Synthesized Codable: `decode`, in declaration order, the first failure wins.
struct Required: Decodable {let d: Double; let i: Int; let b: Bool; let s: String}
/// Synthesized Codable of optionals: `decodeIfPresent`.
struct Optionals: Decodable {let d: Double?; let i: Int?; let b: Bool?; let s: String?}
enum Kind: String, Decodable {case one, two}
struct WithEnum: Decodable {let k: Kind}
/// `((try? c.decodeIfPresent(String.self, forKey:)) ?? nil)`
struct Lenient: Decodable {
    let s: String?
    enum Keys: String, CodingKey {case s}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        s = (try? c.decodeIfPresent(String.self, forKey: .s)) ?? nil
    }
}

@main
struct Probe {
    static func show(_ s: String) -> String {
        s.unicodeScalars.map {$0.value<0x21 || $0.value>0x7e ? String(format:"<U+%04X>",$0.value) : String($0)}.joined()
    }
    static func text(_ error: Error) -> String {
        if error.localizedDescription == "The data couldn’t be read because it is missing." {return "missing"}
        if error.localizedDescription == "The data couldn’t be read because it isn’t in the correct format." {return "format"}
        return "other: \(error.localizedDescription)"
    }
    static func run<T: Decodable>(_ type: T.Type, _ json: String, _ value: (T) -> String) -> String {
        do {return "ok " + value(try JSONDecoder().decode(type, from: Data(json.utf8)))} catch {return text(error)}
    }
    static func main() {
        print("REQUIRED")
        let good = #""d":1,"i":2,"b":true,"s":"x""#
        for j in ["null","1","true","\"x\"","[]","","   ","{","{}","{\(good)}","[{\(good)}]",
                  #"{"d":null,"i":2,"b":true,"s":"x"}"#,#"{"i":2,"b":true,"s":"x"}"#,#"{"d":"x","i":2,"b":true,"s":"x"}"#,
                  #"{"d":"x"}"#,#"{"i":"x"}"#,#"{"d":null,"i":"x"}"#,#"{"d":1,"i":"x"}"#,#"{"d":1,"i":1.5,"b":null}"#,#"{"d":1,"i":2}"#,#"{"d":1,"i":2,"b":null}"#,#"{"d":1,"i":null}"#,
                  #"{"d":1,"i":2,"b":1,"s":null}"#,#"{"d":1,"i":2,"b":true,"s":1}"#,#"{"d":1,"i":2,"b":true,"s":null}"#,#"{"d":1,"i":2,"b":true}"#,#"{"d":1e400}"#,#"{"d":[]}"#,#"{"d":{}}"#,
                  "{\(good)} x","{\(good),}"] {
            print("\(show(j))\t\(run(Required.self,j) {_ in ""})")
        }
        print("OPTIONAL")
        for j in ["null","1","[]","{}",#"{"d":null}"#,#"{"d":"x"}"#,#"{"s":1}"#,#"{"s":null}"#,#"{"i":true}"#,#"{"b":0}"#,#"{"d":"x","i":null}"#] {
            print("\(show(j))\t\(run(Optionals.self,j) {_ in ""})")
        }
        print("ENUM")
        for j in [#"{"k":"one"}"#,#"{"k":"three"}"#,#"{"k":1}"#,#"{"k":null}"#,"{}",#"{"k":"ONE"}"#] {
            print("\(show(j))\t\(run(WithEnum.self,j) {"\($0.k.rawValue)"})")
        }
        print("LENIENT")
        for j in [#"{"s":"x"}"#,#"{"s":1}"#,#"{"s":null}"#,"{}",#"{"s":"\x"}"#,"[]","null"] {
            print("\(show(j))\t\(run(Lenient.self,j) {$0.s.map(show) ?? "nil"})")
        }
        print("STRING")
        for body in [#"a"#,#"\n"#,#"\t\r\b\f"#,#"\/"#,#"\\"#,#"\""#,#"\u00e9"#,#"\u00E9"#,#"\ud83d\ude00"#,#"\ud800"#,#"\udc00"#,#"\ud83dx"#,#"\ud83d\n"#,#"\ud83d\u0041"#,#"\ude00\ud83d"#,
                     #"\x"#,#"\U0041"#,#"\u12"#,#"\u12G4"#,#"\u"#,"a\nb","a\tb","a\u{01}b","a\u{7F}b","é😀",#"\u0000"#,"a\u{00}b",#"\a"#,#"\ "#,"\u{2028}"] {
            let j = "{\"s\":\"\(body)\"}"
            print("\(show(j))\t\(run(Optionals.self,j) {$0.s.map(show) ?? "nil"})")
        }
        print("KEYS")
        for j in [#"{"\u0073":"x"}"#,#"{"s":"a","\u0073":"b"}"#,#"{"\u0073":"a","s":"b"}"#,#"{"\x":1,"s":"a"}"#,"{\"a\nb\":1,\"s\":\"a\"}",#"{"\ud800":1,"s":"a"}"#,#"{"\u12":1,"s":"a"}"#,#"{"":1,"s":"a"}"#,#"{"s":"a","s":"\x"}"#,#"{"s":1,"s":"a"}"#,#"{"s":null,"s":"a"}"#,#"{"s":"a","s":null}"#] {
            print("\(show(j))\t\(run(Optionals.self,j) {$0.s.map(show) ?? "nil"})")
        }
        print("STRUCTURE")
        let deep = {(n:Int) in "{\"o\":" + String(repeating:"[",count:n) + String(repeating:"]",count:n) + "}"}
        let deepObject = {(n:Int) in String(repeating:"{\"o\":",count:n) + "1" + String(repeating:"}",count:n)}
        for (name,j) in [("deep-array-510",deep(510)),("deep-array-511",deep(511)),("deep-array-512",deep(512)),("deep-array-513",deep(513)),("deep-object-511",deepObject(511)),("deep-object-512",deepObject(512)),("deep-object-513",deepObject(513))] {
            print("\(name)\t\(run(Optionals.self,j) {_ in ""})")
        }
        for j in [#"{"o":{"\x":1}}"#,"{\"o\":{\"a\nb\":1}}",#"{"o":{"\u12":1}}"#,#"{"o":{"\ud800":1}}"#,#"{"o":{"a":1,"a":2}}"#,#"{"o":[{"\x":1}]}"#,#"{"o":"a\x"}"#,"{\"o\":\"a\nb\"}",#"{"o":"\ud800"}"#,#"{"o":[1 2]}"#,#"{"o":{"a"}}"#,#"{"o":{1:2}}"#,#"{"o":1x}"#,#"{"o":1.2.3}"#,#"{"o":--1}"#,#"{"o":+1}"#,#"{"o":.5}"#,#"{"o":e5}"#,#"{"o":truex}"#,#"{"o":"a"b}"#,#"{"o":nullx}"#,#"{"o":[1,,2]}"#,#"{"o":[,1]}"#,#"{"o":{,"a":1}}"#,#"{"o":{"a":1,,}}"#,#"{"o":1"#,#"{"o":[1"#,#"{"o":"a"#,#"{"o":"a\"#,#"{"o""#,#"{"o":"#,#"{"o" "#,"{\"o\":\u{00}1}","{\"o\":1\u{00}}","\u{00}{}","{}\u{00}","\u{0C}{}","{}\u{A0}",#"{"d":1.2.3}"#,#"{"d":1x}"#,#"{"d":--1}"#,#"{"d":1+1}"#,#"{"d":1e5e5}"#,#"{"d":1-}"#,#"{"o":-}"#,#"{"o":-x}"#,#"{"o":1e}"#,#"{"o":1e+}"#,#"{"o":01}"#,#"{"o":00}"#,#"{"o":1.}"#,#"{"o":-.5}"#] {
            print("\(show(j))\t\(run(Optionals.self,j) {_ in ""})")
        }
    }
}
