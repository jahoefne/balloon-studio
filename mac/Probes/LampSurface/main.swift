import Foundation

// LampSurface.swift the web port has to reproduce (WP-K4c): the height field on a grid of points,
// and `sculpt` on small synthetic fronts, whose STL bytes are the fixtures.
//
// Every number here comes from +, -, *, / on literals, so web/tests/lampSurface.test.ts rebuilds the
// same points and meshes without storing them, and no libm noise reaches an input vertex: a tie in
// `refine` (longest edge, shorter diagonal) goes the same way in both languages. What `Field` itself
// computes with `pow`, `atan2` and `hypot` is Apple's.
//
// Files: field.f64 (little-endian Float64, by set, then by point; the script gzips it), <mesh>.stl
// and probe.json (the parameters as JSONEncoder wrote them, and the counts).

/// The points of a set, at unit width and height: rows of a grid over the lamp and a little beyond,
/// then the middle, a point just beside it, and points far outside.
func fieldPoints(_ p: CloudParameters) -> [Point3] {
    var points: [Point3] = []
    let columns = 17, rows = 13
    for row in 0..<rows {
        for column in 0..<columns {
            let x = -0.54+1.08*Double(column)/Double(columns-1), y = -0.54+1.08*Double(row)/Double(rows-1)
            points.append(Point3(x:x*p.width, y:y*p.width*p.verticalScale, z:0))
        }
    }
    points.append(Point3(x:0, y:0, z:0))
    points.append(Point3(x:1e-10, y:0, z:0))
    points.append(Point3(x:p.width, y:p.width, z:0))
    return points
}

func fieldSets() -> [CloudParameters] {
    var sets: [CloudParameters] = []
    func add(_ kind: WallLampKind, _ change: (inout CloudParameters) -> Void) {
        var p = kind.defaults
        p.surface = .sculpted
        p.surfaceDepth = 1
        change(&p)
        sets.append(p)
    }
    for style in CloudStyle.allCases { add(.cloud) { $0.style = style } }
    add(.cloud) { $0.style = .billow; $0.mirrored = true }
    add(.cloud) { $0.style = .cotton; $0.width = 100 }
    // A lobe, and then the body, too small for the rim: their guards.
    add(.cloud) { $0.style = .cotton; $0.width = 1.6 }
    add(.cloud) { $0.width = 0.5 }
    for style in SunStyle.allCases {
        add(.sun) { $0.sunStyle = style }
        add(.sun) { $0.sunStyle = style; $0.width = 160 }
    }
    return sets
}

/// A closed front as the generator leaves it: the face at Z=0 and the cavity ceiling at the
/// diffuser's thickness, each a fan; the wall, the seating ledge (level with the ceiling, separated
/// from it by the skirt) and the skirt between them.
func front(_ outline: [(Double, Double)], thickness: Double, center: (Double, Double), ledge: Double, inner: Double) -> BalloonMesh {
    let skirt = thickness+CloudParameters.skirt
    let rings: [(Double, Double)] = [(1, 0), (1, thickness), (ledge, thickness), (ledge, skirt), (inner, skirt), (inner, thickness)]
    let count = outline.count
    var vertices = [Point3(x:center.0, y:center.1, z:0)]
    for ring in rings {
        for q in outline { vertices.append(Point3(x:center.0+(q.0-center.0)*ring.0, y:center.1+(q.1-center.1)*ring.0, z:ring.1)) }
    }
    vertices.append(Point3(x:center.0, y:center.1, z:thickness))
    let last = vertices.count-1
    func at(_ ring: Int, _ i: Int) -> Int { 1+ring*count+i%count }
    var triangles: [Triangle] = []
    for i in 0..<count {
        triangles.append(Triangle(a:0, b:at(0, i+1), c:at(0, i)))
        for ring in 0..<(rings.count-1) {
            triangles.append(Triangle(a:at(ring, i), b:at(ring+1, i+1), c:at(ring+1, i)))
            triangles.append(Triangle(a:at(ring, i), b:at(ring, i+1), c:at(ring+1, i+1)))
        }
        triangles.append(Triangle(a:at(rings.count-1, i), b:at(rings.count-1, i+1), c:last))
    }
    return BalloonMesh(vertices:vertices, triangles:triangles, maxOverhang:0)
}

struct MeshCase {
    let name: String
    let parameters: CloudParameters
    let quality: BalloonGenerator.Quality
    let mesh: BalloonMesh
}

func meshCases() -> [MeshCase] {
    // Beyond the outline at its corners: faces and ceilings where the height is zero.
    let octagon: [(Double, Double)] = [(-24, -6), (-6, -12), (6, -12), (24, -6), (24, 6), (6, 14), (-6, 14), (-24, 6)]
    // Over one ray of a sun and part of the dome, in a quality fine enough for the ridge.
    let patch: [(Double, Double)] = [(8, -9), (30, -7), (52, -2), (52, 2), (30, 7), (8, 9)]
    let center: [(Double, Double)] = [(-11, -11), (11, -11), (11, 11), (-11, 11)]
    // Symmetric about its center: the fan's triangles have two equal long edges, so `refine` meets
    // exact ties of the longest edge and of the diagonals.
    let narrow: [(Double, Double)] = [(-3, -16), (3, -16), (3, 16), (-3, 16)]
    // All of it below `shortest` and outside the silhouette: nothing to refine, and no peak.
    let tiny: [(Double, Double)] = [(199.75, -0.2), (200.25, -0.2), (200.25, 0.2), (199.75, 0.2)]

    var cloud = CloudParameters()
    cloud.surface = .sculpted; cloud.width = 48; cloud.surfaceDepth = 5; cloud.diffuserThickness = 1.2
    var cones = WallLampKind.sun.defaults
    cones.surface = .sculpted; cones.sunStyle = .cones; cones.width = 160; cones.surfaceDepth = 12; cones.diffuserThickness = 1.6
    var pinwheel = WallLampKind.sun.defaults
    pinwheel.surface = .sculpted; pinwheel.sunStyle = .pinwheel; pinwheel.width = 160; pinwheel.surfaceDepth = 10; pinwheel.diffuserThickness = 0.8
    var soft = WallLampKind.sun.defaults
    soft.surface = .sculpted; soft.sunStyle = .softStar; soft.width = 160; soft.surfaceDepth = 12; soft.diffuserThickness = 1.2

    return [
        MeshCase(name:"cloud-octagon-preview", parameters:cloud, quality:.preview,
                 mesh:front(octagon, thickness:cloud.diffuserThickness, center:(1.5, 2.25), ledge:0.92, inner:0.85)),
        MeshCase(name:"sun-ray-export", parameters:cones, quality:.export,
                 mesh:front(patch, thickness:cones.diffuserThickness, center:(26, 0.5), ledge:0.98, inner:0.95)),
        MeshCase(name:"sun-middle-preview", parameters:pinwheel, quality:.preview,
                 mesh:front(center, thickness:pinwheel.diffuserThickness, center:(0.5, 0.25), ledge:0.92, inner:0.85)),
        MeshCase(name:"sun-middle-export", parameters:soft, quality:.export,
                 mesh:front(center, thickness:soft.diffuserThickness, center:(0.5, 0.25), ledge:0.92, inner:0.85)),
        MeshCase(name:"cloud-ties-export", parameters:cloud, quality:.export,
                 mesh:front(narrow, thickness:cloud.diffuserThickness, center:(0, 0), ledge:0.92, inner:0.85)),
        MeshCase(name:"tiny-flat", parameters:cloud, quality:.preview,
                 mesh:front(tiny, thickness:cloud.diffuserThickness, center:(200.0625, 0.03125), ledge:0.92, inner:0.85)),
    ]
}

@main
struct Probe {
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
        precondition(!out.isEmpty, "usage: probe-lamp-surface --out DIR")
        try FileManager.default.createDirectory(atPath:out, withIntermediateDirectories:true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        func encoded(_ p: CloudParameters) throws -> String { String(decoding:try encoder.encode(p), as:UTF8.self) }

        var field = Data(), sets: [[String:Any]] = []
        for p in fieldSets() {
            let points = fieldPoints(p)
            for point in points {
                var bits = LampSurfaceGenerator.height(at:point, parameters:p).bitPattern.littleEndian
                withUnsafeBytes(of:&bits) { field.append(contentsOf:$0) }
            }
            sets.append(["parameters":try encoded(p), "points":points.count])
        }
        try field.write(to:URL(fileURLWithPath:"\(out)/field.f64"))

        var meshes: [[String:Any]] = []
        for c in meshCases() {
            let sculpted = LampSurfaceGenerator.sculpt(c.mesh, parameters:c.parameters, quality:c.quality)
            let data = try sculpted.binarySTL()
            try data.write(to:URL(fileURLWithPath:"\(out)/\(c.name).stl"))
            meshes.append(["name":c.name, "parameters":try encoded(c.parameters), "quality":c.quality == .export ? "export" : "preview",
                           "inputTriangles":c.mesh.triangles.count, "triangles":sculpted.triangles.count, "vertices":sculpted.vertices.count])
            print("\(c.name): \(c.mesh.triangles.count) -> \(sculpted.triangles.count) triangles, \(data.count) bytes")
        }
        let json = try JSONSerialization.data(withJSONObject:["fieldSets":sets, "meshes":meshes], options:[.prettyPrinted, .sortedKeys])
        try json.write(to:URL(fileURLWithPath:"\(out)/probe.json"))
    }
}
