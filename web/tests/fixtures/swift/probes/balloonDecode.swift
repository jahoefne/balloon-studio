// WP-K2 probe: Double(String), String(data:encoding:.utf8) with a BOM, and JSONDecoder on the
// BalloonParameters field types (dump: ../balloonDecode.txt). Build and run:
//   DEVELOPER_DIR=/Library/Developer/CommandLineTools xcrun swiftc -O -parse-as-library balloonDecode.swift -o /tmp/balloonDecode && /tmp/balloonDecode
import Foundation

struct D: Decodable {let v: Double?}
struct I: Decodable {let v: Int?}
struct B: Decodable {let v: Bool?}

@main
struct Probe {
    static func hex(_ d: Double) -> String {String(d.bitPattern,radix:16)}
    static func show(_ s: String) -> String {
        s.unicodeScalars.map {$0.value<0x21 || $0.value>0x7e ? String(format:"\\u%04X",$0.value) : String($0)}.joined()
    }
    static func main() throws {
        print("DOUBLE")
        for s in ["0","-0","+0","1","+1","-1","1.5",".5","5.","-.5","+.5",".","-","+","","e5","1e5","1E5","1e+5","1e-5","1e","1e+","1.e5",".5e1",".e1",
                  "1e999","-1e999","1e-999","-1e-999","1e400","4.9e-324","2.4703282292062328e-324","1.7976931348623157e308","1.7976931348623159e308",
                  "inf","INF","Inf","+inf","-inf","infinity","INFINITY","Infinity","-Infinity","infin","nan","NaN","NAN","-nan","+nan","nan(0x1)","nan(1)","nan()","nan(abc)","snan","nan(",
                  "0x10","0X10","0x1p4","0x1P4","0x1.8p1","-0x1.8p1","0x.8p1","0x1.p1","0x","0x.","0xp1","0x1p","0x1p+","0x1.8","0xg","0x1p-1074","0x1p-1075","0x1.8p-1074","0x1p1024","0x1.fffffffffffff8p0","0x1.fffffffffffff7p0",
                  " 1","1 ","\t1","1\n","1_000","1,5","١","１","1f","1d","1.0.0","--1","+-1","00012","0.1e0000000000000000005","1e00000000000000000000000000000000000000001","123456789012345678901234567890","0.000000000000000000000000000000000000000000000000000001","1e99999999999999999999","1e-99999999999999999999","0e99999999999999999999",
                  "nan(a-b)","nan(a)b","nan)","snan(1)","-snan","+snan","SNAN","sNaN","nan(_)","nan(\u{E9})","nan(a(b))","nan(0x)","infx","infinit","INFINIty","1e5x","0x1.8p1.5","0x1p4f","0x1e5","0X1P+4","0x1p-4","+0x1p0","0x1.8p0000000000000000000000001","1e+0005","0xfffffffffffffffffffffffffffffffp0","0x.p1","0x1.8P-1","0x0p99999999999","0x1p99999999999","0x1p-99999999999","-0x0","-0x0p0"] {
            if let d=Double(s) {print("\(show(s))\t\(hex(d))")} else {print("\(show(s))\tnil")}
        }
        print("BOM")
        print(String(data:Data([0xEF,0xBB,0xBF,0xEF,0xBB,0xBF,0x61]),encoding:.utf8).map(show) ?? "nil")
        let bom=String(data:Data([0xEF,0xBB,0xBF,0x61]),encoding:.utf8)
        print(bom.map(show) ?? "nil")
        print(String(data:Data([0xC0,0x80]),encoding:.utf8).map(show) ?? "nil")
        print(String(data:Data([0xED,0xA0,0x80]),encoding:.utf8).map(show) ?? "nil")
        print(String(data:Data([0x61,0x00,0x62]),encoding:.utf8).map(show) ?? "nil")
        print(String(data:Data(),encoding:.utf8).map(show) ?? "nil")
        print("SPLIT")
        for s in ["a\r\nb","a\rb","a\nb","a\u{0B}b","a\u{0C}b","a\u{85}b","a\u{2028}b","a\u{2029}b","a\n\u{301}b","a\r\n\u{301}b"] {
            print(show(s),s.split(whereSeparator:{$0.isNewline}).count)
        }
        for s in ["a b","a\tb","a \u{301}b","a\u{A0}b","a\u{3000}b","a\u{200B}b","a\u{FEFF}b","a\u{1680}b","a\u{2003}b","a\u{1C}b","a\u{1F}b","a\u{85}b"] {
            print(show(s),s.split(whereSeparator:{$0.isWhitespace}).count)
        }
        print("LOWER")
        for s in ["SOLID","Solid","FACET","VERTEX","ENDSOLID","ſolid","\u{212A}","İ"] {print(show(s),show(s.lowercased()))}
        print("JSON")
        for j in ["1","1.0","1.5","1e2","1E2","1e-2","10e-1","-0","-0.0","0.1e1","20.0","9007199254740993","9223372036854775807","9223372036854775808","-9223372036854775808","-9223372036854775809","1e18","1e19","1e400","-1e400","1e-400","1e-127","1e-128","1e-129","1e-130","-1e-400","1.00000000000000000000000000000000000000000000000001","1.5e0","15e-1","150e-2","1.50e1","0e5","0e-5","0.0","-1e2","1e-0","9.223372036854775807e18","9.223372036854775808e18","1e38","1e127","1e128","true","false","\"1\"","null","[]","{}","01","+1",".5","5.","NaN","Infinity"] {
            let text="{\"v\":\(j)}".data(using:.utf8)!
            var row=[j]
            if let v=try? JSONDecoder().decode(D.self,from:text) {row.append("D=\(v.v.map(hex) ?? "nil")")} else {row.append("D=err")}
            if let v=try? JSONDecoder().decode(I.self,from:text) {row.append("I=\(v.v.map {String($0)} ?? "nil")")} else {row.append("I=err")}
            if let v=try? JSONDecoder().decode(B.self,from:text) {row.append("B=\(v.v.map {String($0)} ?? "nil")")} else {row.append("B=err")}
            print(row.joined(separator:"\t"))
        }
        print("TOP")
        for j in ["{}","[]","1","null","\"x\"","\u{FEFF}{}","{} ","{},","{\"v\":1,\"v\":\"x\"}","{\"v\":\"x\",\"v\":1}"," {\"v\":1}","{\"v\":1,}","{'v':1}","{\"\\u0076\":\"x\"}","{\"other\":[1,2,{\"a\":null}]}",
                  "{\"other\":\"\\ud800\"}","{\"other\":\"\\x\"}","{\"other\":\"a\nb\"}","{\"other\":[1,]}","{\"other\":[,]}","{\"other\":{\"a\":1,}}","{\"other\":01}","{\"other\":1e}","{\"other\":-}","{,}","{\"v\":1,,}","{\"v\"}","{\"v\":1}x","{/*c*/}","{\"v\":1}//c","\t\n\r{\"v\":1}\t\n\r","\u{0B}{}","{\"v\":1e-320}","{\"v\":4.9e-324}","{\"v\":2e-324}","{\"v\":0e-400}","{\"v\":0.0e-999}","{\"v\":-1e-400}","{\"v\":1e308}","{\"v\":1.8e308}","{\"other\":1e999}","{\"other\":tru}","{\"other\":nul}","{\"other\":\"\\u00e9\\ud83d\\ude00\"}","{\"other\":\"\\ud83d\"}","{\"other\":\"\\u12\"}"] {
            let text=j.data(using:.utf8)!
            if let v=try? JSONDecoder().decode(D.self,from:text) {print("\(show(j))\tok \(v.v.map(hex) ?? "nil")")} else {print("\(show(j))\terr")}
        }
    }
}
