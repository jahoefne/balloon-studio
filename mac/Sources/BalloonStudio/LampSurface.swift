import Foundation

enum LampSurface: String, Codable, CaseIterable, Identifiable, Sendable {
    case flat, sculpted
    var id: String { rawValue }
    var title: String { self == .flat ? "Flat" : "3D surface" }
}

/// Shapes the diffuser only. Each part of the silhouette is inflated into a
/// dome that leaves the side wall at the outline, so the front is a rounded
/// body rather than a relief on a plate. A sun's rays rise from their tips
/// towards a dome in the middle. The rim over the seating face is solid;
/// inside the skirt the shell follows the outside.
enum LampSurfaceGenerator {
    static func height(at point: Point3, parameters p: CloudParameters) -> Double {
        p.surface == .sculpted ? p.surfaceDepth*Field(p).value(at:point) : 0
    }

    private struct Field {
        // Outline chords run just inside the exact curve; the domes start there.
        static let rim = 0.15
        // 0.5 is an ellipsoid, flat on top. Higher values give a rounder crown
        // and a tighter roll at the outline.
        static let crown = 0.7
        // Higher values keep a firmer crease where two domes meet.
        static let crease = 16.0
        // The cloud's base melts into its puffs without a line of its own.
        static let soft = 5.0
        // A sun's dome meets its rays in a line.
        static let seam = 24.0
        let p: CloudParameters
        let profile: CloudProfile
        let verticalScale: Double
        let lobeWeights: [Double]
        init(_ parameters: CloudParameters) {
            p = parameters
            profile = p.profile
            verticalScale = p.verticalScale
            // Lobes stand as tall as they are wide, like the puffs of a cloud.
            let largest = profile.lobes.map(\.2).max() ?? 1
            lobeWeights = profile.lobes.map { $0.2/largest }
        }

        /// A sun, as unit height. Level lines of `star` are the outline
        /// scaled towards the middle: every ray gets a ridge from its tip
        /// inwards and every notch a valley, both fading towards the middle.
        func sun(_ x: Double, _ y: Double) -> Double {
            let w = p.width, rim = Self.rim, r = hypot(x, y), style = p.sunStyle
            func star(_ crown: Double, _ roll: Double, twist: Double = 0, spread: Double = 0) -> Double {
                guard r > 1e-9 else { return 1 }
                let angle = atan2(y, x)+twist
                var radius = CloudGenerator.radius(angle, inset:rim, width:w, profile:profile)
                if spread > 0 {
                    // A weighted mean over a small angle rounds ridge and
                    // valley. Many steps, or each would leave a line.
                    let table = SunGeometry.outline(style), steps = 16
                    var mean = 0.0
                    for step in -steps...steps {
                        mean += Double(steps+1-abs(step))*table.radius(angle+Double(step)*spread/Double(steps))
                    }
                    radius += w*(mean/Double((steps+1)*(steps+1))-table.radius(angle))
                }
                return pow(1-pow(min(1, r/radius), crown), roll)
            }
            // The dome stays small: surface depth is a fraction of the
            // width, and a wide dome of that height is a flat lens.
            func dome(_ radius: Double, _ roll: Double) -> Double {
                let q = 1-r*r/(radius*radius)
                return q > 0 ? pow(q, roll) : 0
            }
            func join(_ values: [Double]) -> Double {
                pow(values.reduce(0) { $0+pow($1, Self.seam) }, 1/Self.seam)
            }
            switch style {
            case .softStar:
                return join([0.78*star(2, 0.6), dome(0.21*w, 0.5)])
            case .boldEight:
                return join([0.7*star(1.25, 0.75), dome(0.22*w, 0.5)])
            case .pinwheel:
                // Inside the notches the ridges turn, further towards the
                // middle. Out on the rays they are sharp lines along the
                // mesh. Where they turn they cross it, and are rounded, so
                // the shell below keeps its thickness.
                let turn = max(0, 1-r/(profile.lobes[0].2*w-rim))
                return star(2, 0.6, twist:0.9*turn*turn, spread:0.3*turn)
            case .cones:
                // The root of the product of the clearances to both flanks
                // is half a cone, with its point at the tip of the ray.
                let radius = 0.215*w
                let rays = profile.polygons.map { polygon -> Double in
                    let a = polygon.planes[0], b = polygon.planes[2], t = polygon.points[0]/SunGeometry.tipRadius
                    // Beyond the middle the wedge between the flanks belongs to other rays.
                    guard t.x*x+t.y*y > 0 else { return 0 }
                    let first = a.offset*w-rim-a.x*x-a.y*y, second = b.offset*w-rim-b.x*x-b.y*y
                    guard first > 0 && second > 0 else { return 0 }
                    let atDome = (a.offset*w-rim-(a.x*t.x+a.y*t.y)*radius)*(b.offset*w-rim-(b.x*t.x+b.y*t.y)*radius)
                    return 0.48*(first*second/atDome).squareRoot()
                }
                return join(rays+[dome(radius, 0.5)])
            }
        }

        /// Unit height: 0 on the outline, about 1 on the tallest dome.
        func value(at point: Point3) -> Double {
            let x = point.x, y = point.y/verticalScale, w = p.width, rim = Self.rim
            if p.kind == .sun { return sun(x, y) }
            var sum = 0.0, base = 0.0
            // An order-independent smooth maximum. Outside its footprint a
            // dome contributes nothing, so the outline itself stays at zero.
            func add(_ weight: Double, _ q: Double) {
                if q > 0 && weight > 0 { sum += pow(weight*pow(q, Self.crown), Self.crease) }
            }
            for (index, lobe) in profile.lobes.enumerated() {
                let r = lobe.2*w-rim
                guard r > 0 else { continue }
                add(lobeWeights[index], 1-(pow(x-lobe.0*w, 2)+pow(y-lobe.1*w, 2))/(r*r))
            }
            if p.kind == .cloud {
                // A long roll along the flat base, ending inside the outer lobes.
                // The large lobes cover its crown; its lower flank shows.
                let body = profile.body
                let rx = (body.x1-body.x0)*w/2-rim, ry = (body.y1-body.y0)*w/2-rim
                if rx > 0 && ry > 0 {
                    let sx = (x-(body.x0+body.x1)*w/2)/rx, sy = (y-(body.y0+body.y1)*w/2)/ry
                    if abs(sx) < 1 && abs(sy) < 1 {
                        base = 0.65*pow((1-pow(abs(sx), 2.5))*(1-sy*sy), Self.crown)
                    }
                }
            }
            return pow(pow(sum, Self.soft/Self.crease)+pow(base, Self.soft), 1/Self.soft)
        }
    }

    private enum Face: UInt8 { case other, outer, ceiling }

    /// Input has its original face at Z=0, skirt pointing up, and assembly XY.
    /// Output rests on its skirt tips with the sculpted face pointing up.
    static func sculpt(_ input: BalloonMesh, parameters p: CloudParameters,
                       quality: BalloonGenerator.Quality) -> BalloonMesh {
        var mesh = input
        let thickness = p.diffuserThickness, field = Field(p), export = quality == .export
        var faces = classify(mesh, thickness:thickness)
        refine(&mesh, faces:&faces, field:field,
               spacing:max(export ? 3 : 5, p.width/(export ? 75 : 45)),
               deviation:export ? 0.02 : 0.06, shortest:export ? 0.4 : 0.8)
        let original = mesh.vertices
        var outer = Array(repeating:false, count:original.count), ceiling = outer, edge = outer
        for (t, face) in zip(mesh.triangles, faces) {
            for i in [t.a,t.b,t.c] {
                switch face {
                case .outer: outer[i] = true
                case .ceiling: ceiling[i] = true
                case .other: edge[i] = true
                }
            }
        }
        // The outline stays in the seating plane, on the back's side wall.
        var heights = original.indices.map { outer[$0] && !edge[$0] ? field.value(at:original[$0]) : 0 }
        // Include the requested peak exactly at either tessellation resolution.
        let peak = heights.max() ?? 0
        let scale = peak > 0 ? p.surfaceDepth/peak : 0
        for i in original.indices where outer[i] {
            heights[i] *= scale
            mesh.vertices[i].z = -heights[i]
        }
        let outerFaces = zip(mesh.triangles, faces).filter { $0.1 == .outer }.map(\.0)
        let outside = SurfaceQuery(vertices:mesh.vertices, triangles:outerFaces)
        for i in original.indices where ceiling[i] {
            let h = field.value(at:original[i])*scale
            guard h > 1e-9 else { continue }
            // Offset against actual outer triangles, not a vertically shifted
            // copy, which would become thin on slopes. The small allowance
            // protects the material between sample vertices. Never intrude
            // into the original LED cavity or alter the seating plane.
            let target = thickness + min(0.04, h*0.1)
            var low = thickness-h, high = thickness
            for _ in 0..<14 {
                let z = (low+high)/2
                if outside.isCloser(than:target, to:Point3(x:original[i].x,y:original[i].y,z:z)) { low = z }
                else { high = z }
            }
            mesh.vertices[i].z = high
        }
        // STL stores floats; calculate normals from those same coordinates so
        // very narrow triangles have consistent normals after serialization.
        mesh.vertices = mesh.vertices.map {
            Point3(x:Double(Float($0.x)),y:Double(Float($0.y)),z:Double(Float(thickness+CloudParameters.skirt-$0.z)))
        }
        mesh.triangles = mesh.triangles.map { Triangle(a:$0.a,b:$0.c,c:$0.b) }
        return mesh
    }

    /// The visible face, and the cavity ceiling inside the skirt. The seating
    /// ledge shares the ceiling's plane but is separated from it by the skirt.
    private static func classify(_ mesh: BalloonMesh, thickness: Double) -> [Face] {
        func level(_ t: Triangle, _ z: Double) -> Bool {
            [t.a,t.b,t.c].allSatisfy { abs(mesh.vertices[$0].z-z) < 1e-9 }
        }
        var parents = Array(mesh.vertices.indices)
        func root(_ value: Int) -> Int {
            var i = value
            while parents[i] != i { parents[i] = parents[parents[i]]; i = parents[i] }
            return i
        }
        var center: Int?
        for t in mesh.triangles where level(t, thickness) {
            parents[root(t.b)] = root(t.a); parents[root(t.c)] = root(t.a)
            for i in [t.a,t.b,t.c] {
                let v = mesh.vertices[i]
                if center.map({ hypot(mesh.vertices[$0].x, mesh.vertices[$0].y) > hypot(v.x, v.y) }) ?? true { center = i }
            }
        }
        let cavity = center.map(root)
        return mesh.triangles.map { t in
            if level(t, 0) { return .outer }
            return level(t, thickness) && root(t.a) == cavity ? .ceiling : .other
        }
    }

    /// Share midpoints across both neighboring triangles, preserving the exact
    /// existing perimeter chords and clip geometry when refining the face.
    private static func refine(_ mesh: inout BalloonMesh, faces: inout [Face], field: Field,
                               spacing: Double, deviation: Double, shortest: Double) {
        struct Edge: Hashable {
            let a: Int, b: Int
            init(_ x: Int, _ y: Int) { a = min(x,y); b = max(x,y) }
        }
        let depth = field.p.surfaceDepth
        var heights = mesh.vertices.map { depth*field.value(at:$0) }
        // A triangle that is fine enough stays so until a neighbor splits it.
        var settled = faces.map { $0 == .other }
        while true {
            var marked = Set<Edge>()
            for (index, t) in mesh.triangles.enumerated() where !settled[index] {
                let ids = [t.a,t.b,t.c]
                let lengths = (0..<3).map {(mesh.vertices[ids[$0]]-mesh.vertices[ids[($0+1)%3]]).length}
                let longest = (0..<3).max { lengths[$0] < lengths[$1] }!
                // Measure across the surface: a dome leaves the outline
                // steeply, where a vertical tolerance would never be met.
                let needsDetail = lengths[longest] > spacing || lengths[longest] > shortest && (0..<3).contains { j in
                    let a=ids[j], b=ids[(j+1)%3], midpoint=(mesh.vertices[a]+mesh.vertices[b])*0.5
                    let slope = (heights[a]-heights[b])/max(lengths[j], 1e-9)
                    return lengths[j] > shortest
                        && abs(depth*field.value(at:midpoint)-(heights[a]+heights[b])*0.5) > deviation*(1+slope*slope).squareRoot()
                }
                if needsDetail {
                    // Bisect the longest edge even when curvature was detected
                    // on a shorter one, preventing repeated sliver refinement.
                    marked.insert(Edge(ids[longest],ids[(longest+1)%3]))
                } else { settled[index] = true }
            }
            if marked.isEmpty { break }
            var mids: [Edge:Int] = [:]
            for edge in marked.sorted(by:{ $0.a == $1.a ? $0.b < $1.b : $0.a < $1.a }) {
                mids[edge] = mesh.vertices.count
                let point=(mesh.vertices[edge.a]+mesh.vertices[edge.b])*0.5
                mesh.vertices.append(point)
                heights.append(depth*field.value(at:point))
            }
            var triangles: [Triangle] = [], kinds: [Face] = [], done: [Bool] = []
            for (index, t) in mesh.triangles.enumerated() {
                let face = faces[index]
                func add(_ a: Int, _ b: Int, _ c: Int) {
                    triangles.append(Triangle(a:a,b:b,c:c)); kinds.append(face); done.append(face == .other)
                }
                let v = [t.a,t.b,t.c], m = (0..<3).map { mids[Edge(v[$0],v[($0+1)%3])] }
                switch m.compactMap({$0}).count {
                case 0: triangles.append(t); kinds.append(face); done.append(settled[index])
                case 3:
                    add(v[0],m[0]!,m[2]!); add(m[0]!,v[1],m[1]!)
                    add(m[2]!,m[1]!,v[2]); add(m[0]!,m[1]!,m[2]!)
                case 1:
                    let i = m.firstIndex(where:{$0 != nil})!
                    add(v[i],m[i]!,v[(i+2)%3]); add(m[i]!,v[(i+1)%3],v[(i+2)%3])
                default:
                    let i = (0..<3).first { m[$0] != nil && m[($0+2)%3] != nil }!
                    let a=v[i], b=v[(i+1)%3], c=v[(i+2)%3], ab=m[i]!, ca=m[(i+2)%3]!
                    add(a,ab,ca)
                    // Use the shorter diagonal. A fixed diagonal can keep
                    // producing long slivers across a ray's curved shoulder.
                    if (mesh.vertices[ab]-mesh.vertices[c]).length <= (mesh.vertices[b]-mesh.vertices[ca]).length {
                        add(ab,b,c); add(ab,c,ca)
                    } else {
                        add(ab,b,ca); add(b,c,ca)
                    }
                }
            }
            mesh.triangles = triangles
            faces = kinds
            settled = done
        }
    }
}
