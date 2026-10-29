import Foundation

/// Figures to hang from the mobile ring: small flat-backed bodies with a
/// rounded front, a hole for the thread above their centre of gravity and,
/// if wanted, a second hole at the bottom for a figure hanging below.
enum FigureStyle: String, Codable, CaseIterable, Identifiable, Sendable {
    case balloon, cloud, star, moon, sun, heart, raindrop
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var subtitle: String {
        switch self {
        case .balloon: return "The studio's envelope, with a basket on two ropes"
        case .cloud: return "The Classic cloud, small enough to hang"
        case .star: return "Five soft points"
        case .moon: return "A crescent, leaning back"
        case .sun: return "Eight broad rays"
        case .heart: return "Full and round"
        case .raindrop: return "Hang a few under a cloud"
        }
    }
    var outline: FigureOutline { FigureOutlines.all[self]! }
}

enum FigureSurface: String, Codable, CaseIterable, Identifiable, Sendable {
    case pillow, puffy, flat
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var subtitle: String {
        switch self {
        case .pillow: return "A rounded edge, level in the middle"
        case .puffy: return "Domed all over, like a foil balloon"
        case .flat: return "A plain slab"
        }
    }
}

/// The drawing of a figure in its own units: an outer loop and any windows
/// through it, and the radius that rounds its corners. Loops may run either way.
struct FigureOutline: Sendable {
    let loops: [[SIMD2<Double>]]
    let rounding: Double
    let minX: Double, maxX: Double, minY: Double, maxY: Double
    /// Area centroid of the drawing, windows taken out.
    let centroid: SIMD2<Double>

    init(loops: [[SIMD2<Double>]], rounding: Double) {
        self.loops = loops
        self.rounding = rounding
        let all = loops.flatMap { $0 }
        minX = all.map(\.x).min()!; maxX = all.map(\.x).max()!
        minY = all.map(\.y).min()!; maxY = all.map(\.y).max()!
        // The outer loop has the largest area; windows count against it.
        var areas: [Double] = [], moments: [SIMD2<Double>] = []
        for loop in loops {
            var area = 0.0, moment = SIMD2<Double>(0, 0)
            for i in loop.indices {
                let a = loop[i], b = loop[(i+1) % loop.count], cross = a.x*b.y-b.x*a.y
                area += cross/2; moment += (a+b)*cross/6
            }
            areas.append(area); moments.append(moment)
        }
        let outer = areas.indices.max { abs(areas[$0]) < abs(areas[$1]) }!
        var total = 0.0, sum = SIMD2<Double>(0, 0)
        for i in loops.indices {
            let sign = areas[i] >= 0 ? 1.0 : -1.0, weight = i == outer ? 1.0 : -1.0
            total += weight*abs(areas[i]); sum += moments[i]*(sign*weight)
        }
        centroid = sum/total
    }
    /// Height and width of the drawing once its corners are rounded outward.
    var rawHeight: Double { maxY-minY+2*rounding }
    var rawWidth: Double { maxX-minX+2*rounding }
}

enum FigureOutlines {
    static let all = Dictionary(uniqueKeysWithValues: FigureStyle.allCases.map { ($0, make($0)) })

    private static func make(_ style: FigureStyle) -> FigureOutline {
        switch style {
        case .star:
            var points: [SIMD2<Double>] = []
            for i in 0..<10 {
                let angle = Double.pi/2 + Double(i) * .pi/5, r = i % 2 == 0 ? 1.0 : 0.46
                points.append(SIMD2(r*cos(angle), r*sin(angle)))
            }
            return FigureOutline(loops:[points], rounding:0.055)
        case .heart:
            let points = (0..<240).map { i -> SIMD2<Double> in
                let t = Double(i)/240 * 2 * .pi
                return SIMD2(16*pow(sin(t), 3), 13*cos(t)-5*cos(2*t)-2*cos(3*t)-cos(4*t))
            }
            return FigureOutline(loops:[points], rounding:0.7)
        case .moon:
            // Outer circle of radius 1, the inner one offset to the right, then
            // the whole crescent leans back so its tips point up and to the right.
            let r = 0.78, d = 0.42
            let tipX = (1-r*r+d*d)/(2*d), tipY = (1-tipX*tipX).squareRoot()
            let outerStart = atan2(tipY, tipX), innerTip = atan2(tipY, tipX-d)
            var points: [SIMD2<Double>] = []
            for i in 0...160 {
                let a = outerStart + (2 * .pi - 2*outerStart) * Double(i)/160
                points.append(SIMD2(cos(a), sin(a)))
            }
            for i in 1..<120 {
                let a = (2 * .pi - innerTip) - (2 * .pi - 2*innerTip) * Double(i)/120
                points.append(SIMD2(d+r*cos(a), r*sin(a)))
            }
            let lean = Double.pi/6
            return FigureOutline(loops:[points.map { SIMD2($0.x*cos(lean)-$0.y*sin(lean), $0.x*sin(lean)+$0.y*cos(lean)) }], rounding:0.045)
        case .cloud:
            let profile = CloudStyle.classic.profile
            let points = (0..<240).map { i -> SIMD2<Double> in
                let a = Double(i) * 2 * .pi/240, r = CloudGenerator.radius(a, inset:0, width:1, profile:profile)
                return SIMD2(r*cos(a), r*sin(a))
            }
            return FigureOutline(loops:[points], rounding:0.015)
        case .sun:
            let profile = SunStyle.boldEight.profile
            let points = (0..<480).map { i -> SIMD2<Double> in
                let a = Double(i) * 2 * .pi/480, r = CloudGenerator.radius(a, inset:0, width:1, profile:profile)
                return SIMD2(r*cos(a), r*sin(a))
            }
            return FigureOutline(loops:[points], rounding:0.014)
        case .raindrop:
            let apex = 2.3, touch = acos(1/apex)
            var points: [SIMD2<Double>] = [SIMD2(0, apex)]
            let start = Double.pi/2 + touch, end = Double.pi/2 - touch + 2 * .pi
            for i in 0...140 {
                let a = start + (end-start) * Double(i)/140
                points.append(SIMD2(cos(a), sin(a)))
            }
            return FigureOutline(loops:[points], rounding:0.09)
        case .balloon:
            return balloon()
        }
    }

    /// The classic envelope's meridian, the neck, two ropes and a basket. The
    /// window between the ropes is a loop of its own.
    private static func balloon() -> FigureOutline {
        func bezier(_ a: (Double,Double), _ b: (Double,Double), _ c: (Double,Double), _ d: (Double,Double), _ t: Double) -> SIMD2<Double> {
            let s = 1-t
            return SIMD2(s*s*s*a.0+3*s*s*t*b.0+3*s*t*t*c.0+t*t*t*d.0, s*s*s*a.1+3*s*s*t*b.1+3*s*t*t*c.1+t*t*t*d.1)
        }
        // Right half of the envelope from the neck to the crown, in the
        // generator's units, with its shoulder at 65% of a 220 unit height.
        var right: [SIMD2<Double>] = []
        for i in 0...60 {
            let t = Double(i)/60
            let p = t <= 0.25 ? bezier((16,6),(16,17),(26,28),(33,38), t*4) : bezier((33,38),(56,71),(90,94),(90,142), (t-0.25)/0.75)
            right.append(SIMD2(p.x, 6+(p.y-6)*137/136))
        }
        for i in 1...50 {
            right.append(bezier((90,143),(90,143+77*42/78),(48,220),(0,220), Double(i)/50))
        }
        let neck = 16.0, rope = 10.0, basketTop = -40.0, basketBottom = -78.0
        let basketHalfTop = 30.0, basketHalfBottom = 26.0, corner = 6.0
        var outer: [SIMD2<Double>] = [SIMD2(0, basketBottom), SIMD2(basketHalfBottom-corner, basketBottom)]
        for i in 1...8 {
            let a = -Double.pi/2 + Double.pi/2 * Double(i)/8
            outer.append(SIMD2(basketHalfBottom-corner+corner*cos(a), basketBottom+corner+corner*sin(a)))
        }
        outer += [SIMD2(basketHalfTop, basketTop), SIMD2(basketHalfTop-2, basketTop), SIMD2(neck, 0), SIMD2(neck, 6)]
        outer += right.dropFirst()
        outer += right.dropLast().reversed().map { SIMD2(-$0.x, $0.y) }
        outer += [SIMD2(-neck, 0), SIMD2(-(basketHalfTop-2), basketTop), SIMD2(-basketHalfTop, basketTop)]
        for i in 0..<8 {
            let a = Double.pi + Double.pi/2 * Double(i)/8
            outer.append(SIMD2(-(basketHalfBottom-corner)+corner*cos(a), basketBottom+corner+corner*sin(a)))
        }
        outer.append(SIMD2(-(basketHalfBottom-corner), basketBottom))
        let window = [SIMD2(-(neck-rope), 0), SIMD2(neck-rope, 0), SIMD2(basketHalfTop-2-rope, basketTop), SIMD2(-(basketHalfTop-2-rope), basketTop)]
        return FigureOutline(loops:[outer, window], rounding:1.5)
    }
}

struct FigureParameters: Codable, Equatable, Sendable {
    var style: FigureStyle = .star
    var height = 60.0
    var surface: FigureSurface = .pillow
    var edge = 1.6
    var dome = 3.2
    var doubleSided = false
    var holeDiameter = 2.0
    var holeMargin = 2.5
    var chainHole = false

    init() {}
    init(style: FigureStyle) { self.style = style }

    enum CodingKeys: String, CodingKey { case style, height, surface, edge, dome, doubleSided, holeDiameter, holeMargin, chainHole }
    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        style = ((try? c.decodeIfPresent(String.self, forKey: .style)) ?? nil).flatMap(FigureStyle.init(rawValue:)) ?? style
        height = try c.decodeIfPresent(Double.self, forKey: .height) ?? height
        surface = ((try? c.decodeIfPresent(String.self, forKey: .surface)) ?? nil).flatMap(FigureSurface.init(rawValue:)) ?? surface
        edge = try c.decodeIfPresent(Double.self, forKey: .edge) ?? edge
        dome = try c.decodeIfPresent(Double.self, forKey: .dome) ?? dome
        doubleSided = try c.decodeIfPresent(Bool.self, forKey: .doubleSided) ?? doubleSided
        holeDiameter = try c.decodeIfPresent(Double.self, forKey: .holeDiameter) ?? holeDiameter
        holeMargin = try c.decodeIfPresent(Double.self, forKey: .holeMargin) ?? holeMargin
        chainHole = try c.decodeIfPresent(Bool.self, forKey: .chainHole) ?? chainHole
    }

    static let heightRange = 40.0...120.0
    static let edgeRange = 0.8...6.0
    static let domeRange = 0.8...10.0
    static let holeRange = 1.5...4.0
    static let marginRange = 1.5...6.0

    var domed: Bool { surface != .flat }
    var sides: Int { domed && doubleSided ? 2 : 1 }
    /// Thickness at the thickest point.
    var thickness: Double { edge + (domed ? dome*Double(sides) : 0) }
    /// Scale from the drawing's units to millimetres.
    var scale: Double { height/style.outline.rawHeight }
    var width: Double { style.outline.rawWidth*scale }
    var fitsP2S: Bool { max(width, height)+16 <= 256 }
    var displayName: String { "\(style.title) · \(Int(height.rounded())) mm" }
    var filename: String {
        let surfaceSuffix = surface == .pillow ? "" : "-\(surface.rawValue)"
        return "Mobile-Figure-\(style.rawValue)-\(Int(height.rounded()))mm\(surfaceSuffix)\(sides == 2 ? "-two-sided" : "")\(chainHole ? "-chain" : "").stl"
    }
    var setFilename: String {
        let surfaceSuffix = surface == .pillow ? "" : "-\(surface.rawValue)"
        return "Mobile-Figures-\(Int(height.rounded()))mm\(surfaceSuffix)\(sides == 2 ? "-two-sided" : "")\(chainHole ? "-chain" : "")-set.zip"
    }

    func normalized() -> Self {
        var p = self
        func clamp(_ v: Double, _ range: ClosedRange<Double>, _ fallback: Double) -> Double {
            v.isFinite ? min(range.upperBound, max(range.lowerBound, v)) : fallback
        }
        p.height = clamp(height, Self.heightRange, 60)
        p.edge = clamp(edge, Self.edgeRange, 1.6)
        p.dome = clamp(dome, Self.domeRange, 3.2)
        p.holeDiameter = clamp(holeDiameter, Self.holeRange, 2)
        p.holeMargin = clamp(holeMargin, Self.marginRange, 2.5)
        if p.surface == .flat { p.doubleSided = false }
        return p
    }
}

/// A generated figure, lying on its back with its lowest point at Z = 0.
struct FigureBody: Sendable {
    var mesh: BalloonMesh
    let parameters: FigureParameters
    let width: Double
    /// Hole centres in the figure's plane, millimetres from its middle.
    let hangingHole: SIMD2<Double>?
    let chainHole: SIMD2<Double>?
    var holesWanted: Int { 1+(parameters.chainHole ? 1 : 0) }
    var holes: Int { (hangingHole == nil ? 0 : 1)+(chainHole == nil ? 0 : 1) }

    /// The figure upright, as it hangs, with a thread rising from its hole.
    func hangingView() -> (mesh: BalloonMesh, colors: [Int]) {
        let p = parameters, half = p.height/2
        var m = mesh
        m.vertices = m.vertices.map { Point3(x:$0.x, y:p.thickness/2-$0.z, z:$0.y+half) }
        var colors = Array(repeating:0, count:m.triangles.count)
        if let hole = hangingHole {
            let w = 0.45, top = hole.y+half+p.height*0.55, bottom = hole.y+half
            let base = m.vertices.count
            for (dx, dy, z) in [(-w,-w,bottom),(w,-w,bottom),(w,w,bottom),(-w,w,bottom),(-w,-w,top),(w,-w,top),(w,w,top),(-w,w,top)] {
                m.vertices.append(Point3(x:hole.x+dx, y:dy, z:z))
            }
            for (a,b,c) in [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)] {
                m.triangles.append(Triangle(a:base+a, b:base+b, c:base+c)); colors.append(1)
            }
        }
        return (m, colors)
    }
}

enum FigureGenerator {
    /// Signed distance to the figure's edge, positive inside, with the corners
    /// rounded outward and the holes taken out.
    struct Field: Sendable {
        private let segments: [(a: SIMD2<Double>, b: SIMD2<Double>)]
        let rounding: Double
        var holes: [(center: SIMD2<Double>, radius: Double)] = []
        init(loops: [[SIMD2<Double>]], rounding: Double) {
            self.rounding = rounding
            segments = loops.flatMap { loop in loop.indices.map { (loop[$0], loop[($0+1) % loop.count]) } }
        }
        func distance(_ p: SIMD2<Double>) -> Double {
            var best = Double.infinity, inside = false
            for s in segments {
                let e = s.b-s.a, w = p-s.a
                let t = max(0, min(1, (w.x*e.x+w.y*e.y)/max(e.x*e.x+e.y*e.y, 1e-30)))
                let q = w-e*t
                best = min(best, q.x*q.x+q.y*q.y)
                if (s.a.y > p.y) != (s.b.y > p.y) {
                    let x = s.a.x+(p.y-s.a.y)/(s.b.y-s.a.y)*(s.b.x-s.a.x)
                    if x > p.x { inside.toggle() }
                }
            }
            var d = (inside ? 1 : -1)*best.squareRoot()+rounding
            for h in holes { d = min(d, hypot(p.x-h.center.x, p.y-h.center.y)-h.radius) }
            return d
        }
        /// Moves a point near the edge onto it: a step along the gradient,
        /// then a bisection once the edge is bracketed. At a sharp notch the
        /// gradient is unreliable, so a plain Newton step could overshoot.
        func project(_ p: SIMD2<Double>) -> SIMD2<Double> {
            var q = p
            for _ in 0..<6 {
                let d = distance(q)
                if abs(d) < 1e-7 { return q }
                let h = 1e-4
                let g = SIMD2((distance(SIMD2(q.x+h, q.y))-distance(SIMD2(q.x-h, q.y)))/(2*h),
                              (distance(SIMD2(q.x, q.y+h))-distance(SIMD2(q.x, q.y-h)))/(2*h))
                let n = max((g.x*g.x+g.y*g.y).squareRoot(), 1e-6)
                let step = q-g*(1.5*d/n)
                guard (distance(step) > 0) != (d > 0) else { q = q-g*(d/n); continue }
                var a = q, b = step
                for _ in 0..<24 {
                    let m = (a+b)*0.5
                    if (distance(m) > 0) == (d > 0) { a = m } else { b = m }
                }
                return (a+b)*0.5
            }
            return q
        }
    }

    private struct Edge: Hashable {
        let a: Int, b: Int
        init(_ x: Int, _ y: Int) { a = min(x,y); b = max(x,y) }
    }
    private struct Site {
        var point: SIMD2<Double>
        var top: Bool
        var boundary: Bool
        var distance: Double
    }

    static func field(_ input: FigureParameters) -> (field: Field, hanging: SIMD2<Double>?, chain: SIMD2<Double>?) {
        let p = input.normalized(), outline = p.style.outline, scale = p.scale
        let center = SIMD2((outline.minX+outline.maxX)/2, (outline.minY+outline.maxY)/2)
        var field = Field(loops: outline.loops.map { $0.map { ($0-center)*scale } }, rounding: outline.rounding*scale)
        let radius = p.holeDiameter/2, need = radius+p.holeMargin, half = p.height/2
        let x = (outline.centroid.x-center.x)*scale
        // The thread's hole sits as high as the figure has room for it, on the
        // vertical through the centre of gravity, so the figure hangs straight.
        func place(from start: Double, step: Double, until limit: Double) -> SIMD2<Double>? {
            var y = start
            while step > 0 ? y <= limit : y >= limit {
                if field.distance(SIMD2(x, y)) >= need { return SIMD2(x, y) }
                y += step
            }
            return nil
        }
        let hanging = place(from: half-need, step: -0.1, until: -half+need)
        var chain: SIMD2<Double>? = nil
        if p.chainHole {
            chain = place(from: -half+need, step: 0.1, until: half-need)
            if let h = hanging, let c = chain, hypot(h.x-c.x, h.y-c.y) < 2*radius+p.holeMargin { chain = nil }
        }
        field.holes = [hanging, chain].compactMap { $0 }.map { ($0, radius) }
        return (field, hanging, chain)
    }

    static func generate(_ input: FigureParameters, quality: BalloonGenerator.Quality = .preview) -> FigureBody {
        let p = input.normalized()
        let (field, hanging, chain) = field(p)
        let halfW = p.width/2, halfH = p.height/2
        let cell = p.height/(quality == .export ? 150 : 56)
        let x0 = -halfW-1.5*cell, y0 = -halfH-1.5*cell
        let nx = Int(((2*halfW+3*cell)/cell).rounded(.up)), ny = Int(((2*halfH+3*cell)/cell).rounded(.up))

        // Corner distances. A corner exactly on the edge counts as inside.
        var corner = [Double](repeating: 0, count: (nx+1)*(ny+1))
        var deepest = 0.0
        for j in 0...ny { for i in 0...nx {
            var d = field.distance(SIMD2(x0+Double(i)*cell, y0+Double(j)*cell))
            if abs(d) < 1e-9 { d = 1e-9 }
            corner[j*(nx+1)+i] = d
            deepest = max(deepest, d)
        } }

        var sites: [Site] = []
        var mate: [Int: Int] = [:]
        var triangles: [Triangle] = [], faces: [UInt8] = []   // 0 top, 1 bottom, 2 wall
        var chords = Set<Edge>()
        var cornerTop: [Int: Int] = [:], cornerBottom: [Int: Int] = [:]
        var crossTop: [Int: Int] = [:], crossBottom: [Int: Int] = [:]
        func add(_ point: SIMD2<Double>, top: Bool, boundary: Bool, distance: Double) -> Int {
            sites.append(Site(point:point, top:top, boundary:boundary, distance:distance))
            return sites.count-1
        }
        func cornerSite(_ i: Int, _ j: Int, top: Bool) -> Int {
            let key = j*(nx+1)+i
            if let v = top ? cornerTop[key] : cornerBottom[key] { return v }
            let v = add(SIMD2(x0+Double(i)*cell, y0+Double(j)*cell), top:top, boundary:false, distance:corner[key])
            if top { cornerTop[key] = v } else { cornerBottom[key] = v }
            return v
        }
        /// The edge's zero crossing, found on the exact field.
        func crossing(_ i: Int, _ j: Int, horizontal: Bool, top: Bool) -> Int {
            let key = (j*(nx+1)+i)*2+(horizontal ? 1 : 0)
            if let v = top ? crossTop[key] : crossBottom[key] { return v }
            if let other = top ? crossBottom[key] : crossTop[key] {
                let v = add(sites[other].point, top:top, boundary:true, distance:0)
                mate[v] = other; mate[other] = v
                if top { crossTop[key] = v } else { crossBottom[key] = v }
                return v
            }
            let a = SIMD2(x0+Double(i)*cell, y0+Double(j)*cell)
            let b = horizontal ? SIMD2(a.x+cell, a.y) : SIMD2(a.x, a.y+cell)
            var lo = 0.0, hi = 1.0
            let positiveAtA = corner[j*(nx+1)+i] > 0
            for _ in 0..<14 {
                let t = (lo+hi)/2
                if (field.distance(a+(b-a)*t) > 0) == positiveAtA { lo = t } else { hi = t }
            }
            let t = min(0.98, max(0.02, (lo+hi)/2))
            let v = add(a+(b-a)*t, top:top, boundary:true, distance:0)
            if top { crossTop[key] = v } else { crossBottom[key] = v }
            return v
        }
        func emit(_ polygon: [(site: Int, boundary: Bool)], top: Bool) {
            // Fan from a corner where there is one, so chords stay chords.
            let start = polygon.firstIndex { !$0.boundary } ?? 0
            let ring = Array(polygon[start...]+polygon[..<start])
            for k in 1..<(ring.count-1) {
                let a = ring[0].site, b = ring[k].site, c = ring[k+1].site
                triangles.append(top ? Triangle(a:a, b:b, c:c) : Triangle(a:a, b:c, c:b)); faces.append(top ? 0 : 1)
            }
            guard top else { return }
            for k in ring.indices where ring[k].boundary && ring[(k+1) % ring.count].boundary {
                let a = ring[k].site, b = ring[(k+1) % ring.count].site
                let ba = mate[a]!, bb = mate[b]!
                triangles.append(Triangle(a:a, b:ba, c:bb)); faces.append(2)
                triangles.append(Triangle(a:a, b:bb, c:b)); faces.append(2)
                chords.insert(Edge(a, b)); chords.insert(Edge(ba, bb))
            }
        }
        for j in 0..<ny { for i in 0..<nx {
            let corners = [(i,j),(i+1,j),(i+1,j+1),(i,j+1)]
            let inside = corners.map { corner[$0.1*(nx+1)+$0.0] > 0 }
            let count = inside.filter { $0 }.count
            guard count > 0 else { continue }
            // Edge k runs from corner k to corner k+1.
            func cross(_ k: Int, top: Bool) -> Int {
                switch k {
                case 0: return crossing(i, j, horizontal:true, top:top)
                case 1: return crossing(i+1, j, horizontal:false, top:top)
                case 2: return crossing(i, j+1, horizontal:true, top:top)
                default: return crossing(i, j, horizontal:false, top:top)
                }
            }
            var groups: [[Int]] = [[0,1,2,3]]
            if count == 2 && inside[0] == inside[2] {
                // Two opposite corners: joined through the middle, or two separate corners.
                let middle = field.distance(SIMD2(x0+(Double(i)+0.5)*cell, y0+(Double(j)+0.5)*cell))
                if middle <= 0 { groups = inside[0] ? [[3,0],[1,2]] : [[0,1],[2,3]] }
            }
            for top in [false, true] {
                for group in groups {
                    var polygon: [(site: Int, boundary: Bool)] = []
                    for k in group {
                        if inside[k] { polygon.append((cornerSite(corners[k].0, corners[k].1, top:top), false)) }
                        if inside[k] != inside[(k+1) % 4] { polygon.append((cross(k, top:top), true)) }
                    }
                    if polygon.count >= 3 { emit(polygon, top:top) }
                }
            }
        } }

        // Refine until the domes are smooth and the chords follow the edge.
        let dome = p.domed ? p.dome : 0
        let roll = p.surface == .puffy ? deepest : min(1.75*dome, deepest)
        func rise(_ d: Double) -> Double {
            guard dome > 0, roll > 0 else { return 0 }
            let s = min(1, max(0, d)/roll)
            return dome*(1-(1-s)*(1-s)).squareRoot()
        }
        let tolerance = quality == .export ? 0.02 : 0.08
        let shortest = quality == .export ? 0.3 : 0.7
        var settled = faces.map { $0 == 2 }
        while true {
            var marked = Set<Edge>()
            for (index, t) in triangles.enumerated() where !settled[index] {
                let ids = [t.a, t.b, t.c]
                let lengths = (0..<3).map { k -> Double in
                    let d = sites[ids[k]].point-sites[ids[(k+1) % 3]].point
                    return (d.x*d.x+d.y*d.y).squareRoot()
                }
                let domedFace = dome > 0 && (faces[index] == 0 || p.sides == 2)
                let needsDetail = (0..<3).contains { k -> Bool in
                    let a = ids[k], b = ids[(k+1) % 3]
                    guard lengths[k] > shortest else { return false }
                    let midpoint = (sites[a].point+sites[b].point)*0.5
                    if chords.contains(Edge(a, b)) { return abs(field.distance(midpoint)) > tolerance }
                    guard domedFace else { return false }
                    let ha = rise(sites[a].distance), hb = rise(sites[b].distance), slope = (ha-hb)/lengths[k]
                    return abs(rise(field.distance(midpoint))-(ha+hb)*0.5) > tolerance*(1+slope*slope).squareRoot()
                }
                if needsDetail {
                    let longest = (0..<3).max { lengths[$0] < lengths[$1] }!
                    marked.insert(Edge(ids[longest], ids[(longest+1) % 3]))
                } else { settled[index] = true }
            }
            if marked.isEmpty { break }
            // A chord is split together with its twin on the other face.
            for edge in marked where chords.contains(edge) {
                if let a = mate[edge.a], let b = mate[edge.b] { marked.insert(Edge(a, b)) }
            }
            var mids: [Edge: Int] = [:]
            for edge in marked.sorted(by: { $0.a == $1.a ? $0.b < $1.b : $0.a < $1.a }) {
                let a = sites[edge.a], b = sites[edge.b]
                if chords.contains(edge) {
                    let twin = Edge(mate[edge.a]!, mate[edge.b]!)
                    let point = mids[twin].map { sites[$0].point } ?? field.project((a.point+b.point)*0.5)
                    let v = add(point, top:a.top, boundary:true, distance:0)
                    if let other = mids[twin] { mate[v] = other; mate[other] = v }
                    mids[edge] = v
                    chords.remove(edge); chords.insert(Edge(edge.a, v)); chords.insert(Edge(v, edge.b))
                } else {
                    let point = (a.point+b.point)*0.5
                    mids[edge] = add(point, top:a.top, boundary:false, distance:field.distance(point))
                }
            }
            var next: [Triangle] = [], kinds: [UInt8] = [], done: [Bool] = []
            for (index, t) in triangles.enumerated() {
                let face = faces[index]
                func put(_ a: Int, _ b: Int, _ c: Int) { next.append(Triangle(a:a, b:b, c:c)); kinds.append(face); done.append(face == 2) }
                let v = [t.a, t.b, t.c], m = (0..<3).map { mids[Edge(v[$0], v[($0+1) % 3])] }
                switch m.compactMap({ $0 }).count {
                case 0: next.append(t); kinds.append(face); done.append(settled[index])
                case 3:
                    put(v[0], m[0]!, m[2]!); put(m[0]!, v[1], m[1]!); put(m[2]!, m[1]!, v[2]); put(m[0]!, m[1]!, m[2]!)
                case 1:
                    let i = m.firstIndex { $0 != nil }!
                    put(v[i], m[i]!, v[(i+2) % 3]); put(m[i]!, v[(i+1) % 3], v[(i+2) % 3])
                default:
                    let i = (0..<3).first { m[$0] != nil && m[($0+2) % 3] != nil }!
                    let a = v[i], b = v[(i+1) % 3], c = v[(i+2) % 3], ab = m[i]!, ca = m[(i+2) % 3]!
                    put(a, ab, ca)
                    let d1 = sites[ab].point-sites[c].point, d2 = sites[b].point-sites[ca].point
                    if d1.x*d1.x+d1.y*d1.y <= d2.x*d2.x+d2.y*d2.y { put(ab, b, c); put(ab, c, ca) } else { put(ab, b, ca); put(b, c, ca) }
                }
            }
            triangles = next; faces = kinds; settled = done
        }

        let base = p.sides == 2 ? dome : 0
        let vertices = sites.map { s -> Point3 in
            let z: Double
            if s.top { z = base+p.edge+(s.boundary ? 0 : rise(s.distance)) }
            else { z = p.sides == 2 && !s.boundary ? base-rise(s.distance) : base }
            return Point3(x:s.point.x, y:s.point.y, z:z)
        }
        let mesh = BalloonMesh(vertices:vertices, triangles:triangles, maxOverhang:0)
        return FigureBody(mesh:mesh, parameters:p, width:p.width, hangingHole:hanging, chainHole:chain)
    }
}

/// Every figure at the current settings, with notes, as one ZIP.
enum FigureSet {
    static func entries(_ input: FigureParameters) throws -> [(String, Data)] {
        let p = input.normalized()
        var parts: [(String, Data)] = []
        for style in FigureStyle.allCases {
            var q = p; q.style = style
            parts.append((q.filename, try FigureGenerator.generate(q, quality:.export).mesh.binarySTL()))
        }
        return parts+[("FIGURES.md", Data(notes(p).utf8)), ("figure-settings.json", try StableJSON.encode(p))]
    }
    static func archive(_ p: FigureParameters) throws -> Data { StoredZIP.archive(try entries(p)) }

    static func notes(_ p: FigureParameters) -> String {
        func mm(_ v: Double) -> String { String(format:"%.1f", locale:Locale(identifier:"en_US_POSIX"), v) }
        let body: String
        switch p.surface {
        case .flat: body = "a flat slab \(mm(p.edge)) mm thick"
        case .pillow: body = "a flat back, a \(mm(p.edge)) mm edge band and a rounded front rising \(mm(p.dome)) mm"
        case .puffy: body = "a flat back, a \(mm(p.edge)) mm edge band and a domed front rising \(mm(p.dome)) mm in the middle"
        }
        let twoSided = p.sides == 2 ? """

        These figures are domed on both sides. Print them on a raft with supports under the \
        lower dome, or print the flat-backed version twice and glue the pair back to back.
        """ : ""
        let chain = p.chainHole ? """

        Each figure also has a hole at the bottom, so another figure can hang below it: \
        raindrops under a cloud, a star under the moon.
        """ : ""
        return """
        # Mobile figures

        Seven figures, \(Int(p.height.rounded())) mm tall, each with \(body). \
        Every figure has a \(mm(p.holeDiameter)) mm hole for the thread, placed above its \
        centre of gravity with at least \(mm(p.holeMargin)) mm of material around it, so it \
        hangs straight.\(twoSided)\(chain)

        ## Printing

        Import at 100% scale in millimetres. Print flat back down, no supports, with a brim if \
        the figure is slim. About 0.2 mm layers and enough walls to fill the edge band work \
        well; use fine or adaptive layers for the gently curved crown. Print each figure in \
        its own colour, or pause for a colour change at the top of the edge band.

        ## Hanging

        Thread a cord through the hole from front to back and tie a loop, or knot the cord \
        through the hole directly. Hang the figures from the mobile ring's holes at \
        different heights, 60 to 90 mm apart in height reads best. Keep the whole mobile out \
        of a baby's reach: mount it high, keep the cords short, and take it down once the \
        baby can push up on hands and knees. Check knots and cords regularly. Nothing here \
        has been load- or safety-tested.
        """
    }
}
