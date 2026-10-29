// Swift reference for WP-K1 geometry/io. Built together with verbatim excerpts:
//   BalloonGeometry.swift:99-210 (Point3, Triangle, MeshError, BalloonMesh), ThreeMF.swift:57-85 (StoredZIP),
//   SurfaceQuery.swift (whole). See web/tests/fixtures/swift/probes/README.md.
import Foundation

var state: UInt64 = 0
func next() -> UInt64 { state &+= 0x9E3779B97F4A7C15; var z = state; z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9; z = (z ^ (z >> 27)) &* 0x94D049BB133111EB; return z ^ (z >> 31) }
func unit() -> Double { Double(next() >> 11) * 0x1p-53 }
func hex(_ d: Double) -> String { d.isNaN ? "nan" : String(d.bitPattern, radix: 16) }
let out = CommandLine.arguments[1]

struct EdgeKey: Hashable { let a: Int; let b: Int }
func sphere(levels: Int, radius: Double, offset: Point3) -> BalloonMesh {
    var v = [Point3(x: radius, y: 0, z: 0), Point3(x: -radius, y: 0, z: 0), Point3(x: 0, y: radius, z: 0),
             Point3(x: 0, y: -radius, z: 0), Point3(x: 0, y: 0, z: radius), Point3(x: 0, y: 0, z: -radius)]
    var t = [Triangle(a: 0, b: 2, c: 4), Triangle(a: 2, b: 1, c: 4), Triangle(a: 1, b: 3, c: 4), Triangle(a: 3, b: 0, c: 4),
             Triangle(a: 2, b: 0, c: 5), Triangle(a: 1, b: 2, c: 5), Triangle(a: 3, b: 1, c: 5), Triangle(a: 0, b: 3, c: 5)]
    for _ in 0..<levels {
        var cache: [EdgeKey: Int] = [:]
        func mid(_ i: Int, _ j: Int) -> Int {
            let key = EdgeKey(a: min(i, j), b: max(i, j))
            if let k = cache[key] { return k }
            let m = (v[i] + v[j]) * 0.5
            let p = m * (radius / m.length)
            cache[key] = v.count; v.append(p); return v.count - 1
        }
        var next: [Triangle] = []
        for f in t {
            let ab = mid(f.a, f.b), bc = mid(f.b, f.c), ca = mid(f.c, f.a)
            next += [Triangle(a: f.a, b: ab, c: ca), Triangle(a: ab, b: f.b, c: bc), Triangle(a: ca, b: bc, c: f.c), Triangle(a: ab, b: bc, c: ca)]
        }
        t = next
    }
    return BalloonMesh(vertices: v.map { $0 + offset }, triangles: t, maxOverhang: 0)
}
func describe(_ mesh: BalloonMesh) -> String {
    do { try mesh.validate(); return "ok" } catch { return (error as? MeshError).map { "\($0.localizedDescription)" } ?? "other" }
}
var report = ""
let tetra = BalloonMesh(vertices: [Point3(x: 0, y: -0.0, z: 0), Point3(x: 10.1, y: 0, z: -0.0), Point3(x: 0.3, y: 20.3, z: 0.1), Point3(x: 1.7, y: 2.9, z: 7.7)],
                        triangles: [Triangle(a: 0, b: 2, c: 1), Triangle(a: 0, b: 1, c: 3), Triangle(a: 1, b: 2, c: 3), Triangle(a: 0, b: 3, c: 2)], maxOverhang: 0)
report += "tetra \(describe(tetra))\n"
try tetra.binarySTL().write(to: URL(fileURLWithPath: out + "/tetra.stl"))
let ball = sphere(levels: 3, radius: 23.7, offset: Point3(x: 3.1, y: -2.2, z: 40.5))
report += "sphere \(ball.vertices.count) \(ball.triangles.count) \(describe(ball))\n"
try ball.binarySTL().write(to: URL(fileURLWithPath: out + "/sphere3.stl"))
let d = ball.dimensions
report += "dimensions \(hex(d.x)) \(hex(d.y)) \(hex(d.z))\n"
let e = BalloonMesh(vertices: [], triangles: [], maxOverhang: 0).dimensions
report += "emptyDimensions \(hex(e.x)) \(hex(e.y)) \(hex(e.z))\n"
var m = BalloonMesh(vertices: Array(ball.vertices.prefix(3)), triangles: [Triangle(a: 0, b: 1, c: 2)], maxOverhang: 0)
report += "empty \(describe(m))\n"
m = ball; m.vertices[5].y = .nan; report += "nonfinite \(describe(m))\n"
m = ball; m.vertices[5].z = .infinity; report += "infinite \(describe(m))\n"
m = ball; m.triangles.append(Triangle(a: 0, b: 1, c: 99999)); report += "index \(describe(m))\n"
m = ball; m.triangles.append(Triangle(a: -1, b: 1, c: 2)); report += "negativeIndex \(describe(m))\n"
m = ball; m.triangles.append(Triangle(a: 0, b: 0, c: 1)); report += "collapsed \(describe(m))\n"
m = ball; m.triangles.removeLast(); report += "open \(describe(m))\n"
m = ball; let f = m.triangles[0]; m.triangles[0] = Triangle(a: f.a, b: f.c, c: f.b); report += "reversed \(describe(m))\n"
m = ball; m.triangles = m.triangles.map { Triangle(a: $0.a, b: $0.c, c: $0.b) }; report += "insideOut \(describe(m))\n"
m = ball; let n = m.vertices.count; m.vertices += tetra.vertices.map { $0 + Point3(x: 100, y: 0, z: 0) }
m.triangles += tetra.triangles.map { Triangle(a: $0.a + n, b: $0.b + n, c: $0.c + n) }; report += "twoBodies \(describe(m))\n"
m = ball; m.vertices.append(Point3(x: 1, y: 2, z: 3)); report += "unusedVertex \(describe(m))\n"
m = ball; m.triangles += [Triangle(a: 0, b: 2, c: 4), Triangle(a: 0, b: 4, c: 2)]; report += "duplicateFaces \(describe(m))\n"
// SurfaceQuery
let big = sphere(levels: 4, radius: 31.3, offset: Point3(x: -4.4, y: 7.25, z: 12.0))
let query = SurfaceQuery(vertices: big.vertices, triangles: big.triangles)
state = 11
var bits = ""
for _ in 0..<20000 {
    let p = Point3(x: -4.4 + (unit() * 2 - 1) * 45, y: 7.25 + (unit() * 2 - 1) * 45, z: 12 + (unit() * 2 - 1) * 45)
    let dist = unit() * 18
    bits += query.isCloser(than: dist, to: p) ? "1" : "0"
}
report += "query \(bits)\n"
let emptyQuery = SurfaceQuery(vertices: [], triangles: [])
report += "emptyQuery \(emptyQuery.isCloser(than: 1e9, to: .zero))\n"
state = 12
var ds: [String] = []
for i in 0..<4000 {
    func rp() -> Point3 { Point3(x: (unit() * 2 - 1) * 10, y: (unit() * 2 - 1) * 10, z: (unit() * 2 - 1) * 10) }
    let p = rp(), a = rp()
    let b = i % 50 == 0 ? a : rp()
    let c = i % 77 == 0 ? b : rp()
    ds.append(hex(SurfaceQuery.distanceSquared(p, a, b, c)))
}
report += "distanceSquared \(ds.joined(separator: ","))\n"
// StoredZIP
var bin = Data(); for i in 0..<256 { bin.append(UInt8(i)) }
var big70 = Data(); for i in 0..<70000 { big70.append(UInt8((i &* 31 &+ 7) & 255)) }
let entries: [(String, Data)] = [
    ("[Content_Types].xml", Data("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types/>".utf8)),
    ("dir/b.bin", bin), ("empty.txt", Data()), ("ünï/ß.txt", Data("x".utf8)), ("big.bin", big70)]
try StoredZIP.archive(entries).write(to: URL(fileURLWithPath: out + "/stored.zip"))
try StoredZIP.archive([]).write(to: URL(fileURLWithPath: out + "/empty.zip"))
try report.write(to: URL(fileURLWithPath: out + "/geometry.txt"), atomically: true, encoding: .utf8)
