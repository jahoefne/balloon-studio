import Foundation

/// How the clip is fixed to the wall.
enum CableClipMount: String, Codable, CaseIterable, Identifiable, Sendable {
    case nail, adhesive
    var id: String { rawValue }
    var title: String { self == .nail ? "Nail" : "Adhesive" }
    var subtitle: String {
        self == .nail ? "The plate runs on past the strap and the nail goes through that extension, so the hammer meets flat plate and never the strap. The head sinks in under the cable."
                      : "No extension and no hole: the plate is as long as the strap and is stuck on with a pad of tape or mounting putty."
    }
}

/// A one-piece wall clip for the lead between lamps: a plate under the cable
/// with a strap over it. The strap is fixed to the plate on one side and free
/// on the other, where it ends below the cable's middle. The cable is pressed
/// in from the open side and the strap springs open to let it in. The plate
/// runs on past the strap on one side, and the nail goes through there.
struct CableClipParameters: Codable, Equatable, Sendable {
    /// Measured over the fabric sheath.
    var cableDiameter = 3.75
    var mount: CableClipMount = .nail
    var nailDiameter = 1.8
    var nailHeadDiameter = 3.3
    var nailHeadHeight = 0.7
    /// From the strap's end to the edge of the nail head's counterbore: room for the hammer or a nail punch.
    var nailGap = 3.0
    /// The plate under the cable. It is always at least 0.6 mm thicker than the nail head.
    var plate = 2.0
    /// The strap along the cable.
    var length = 6.0
    /// The strap's thickness: it is the spring.
    var wall = 0.7
    /// How far the strap's free end reaches below the cable's middle.
    var overlap = 0.5
    /// Print lying on the plate instead of standing on the strap's end.
    var flat = false

    init() {}

    enum CodingKeys: String, CodingKey { case cableDiameter, mount, nailDiameter, nailHeadDiameter, nailHeadHeight, nailGap, plate, length, wall, overlap, flat }
    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        cableDiameter = try c.decodeIfPresent(Double.self, forKey: .cableDiameter) ?? cableDiameter
        mount = ((try? c.decodeIfPresent(String.self, forKey: .mount)) ?? nil).flatMap(CableClipMount.init(rawValue:)) ?? mount
        nailDiameter = try c.decodeIfPresent(Double.self, forKey: .nailDiameter) ?? nailDiameter
        nailHeadDiameter = try c.decodeIfPresent(Double.self, forKey: .nailHeadDiameter) ?? nailHeadDiameter
        nailHeadHeight = try c.decodeIfPresent(Double.self, forKey: .nailHeadHeight) ?? nailHeadHeight
        nailGap = try c.decodeIfPresent(Double.self, forKey: .nailGap) ?? nailGap
        plate = try c.decodeIfPresent(Double.self, forKey: .plate) ?? plate
        length = try c.decodeIfPresent(Double.self, forKey: .length) ?? length
        wall = try c.decodeIfPresent(Double.self, forKey: .wall) ?? wall
        overlap = try c.decodeIfPresent(Double.self, forKey: .overlap) ?? overlap
        flat = try c.decodeIfPresent(Bool.self, forKey: .flat) ?? flat
    }

    static let cableRange = 2.0...6.0
    static let nailRange = 1.0...4.0
    static let headRange = 2.0...8.0
    static let headHeightRange = 0.3...2.0
    static let nailGapRange = 0.4...10.0
    static let plateRange = 1.2...4.0
    static let lengthRange = 4.0...12.0
    static let wallRange = 0.6...1.2
    static let overlapRange = 0.3...1.5

    func normalized() -> Self {
        var p = self
        func clamp(_ v: Double, _ range: ClosedRange<Double>, _ fallback: Double) -> Double {
            v.isFinite ? min(range.upperBound, max(range.lowerBound, v)) : fallback
        }
        p.cableDiameter = clamp(cableDiameter, Self.cableRange, 3.75)
        p.nailDiameter = clamp(nailDiameter, Self.nailRange, 1.8)
        p.nailHeadDiameter = clamp(nailHeadDiameter, Self.headRange, 3.3)
        p.nailHeadHeight = clamp(nailHeadHeight, Self.headHeightRange, 0.7)
        p.nailGap = clamp(nailGap, Self.nailGapRange, 3)
        p.plate = clamp(plate, Self.plateRange, 2)
        p.length = clamp(length, Self.lengthRange, 6)
        p.wall = clamp(wall, Self.wallRange, 0.7)
        p.overlap = clamp(overlap, Self.overlapRange, 0.5)
        return p
    }

    var cableText: String { String(format:"%g", locale:Locale(identifier:"en_US_POSIX"), cableDiameter) }
    var displayName: String { "Cable clip · Ø \(cableText) mm" }
    var filename: String { "Cable-Clip-\(cableText)mm\(mount == .adhesive ? "-adhesive" : "")\(flat ? "-flat" : "").stl" }
}

/// The clip's dimensions, derived from the parameters. In the wall frame X
/// runs across the cable, Y along it and Z up from the wall. The strap's root
/// is on the -X side, its free end on the +X side; the plate's extension with
/// the nail is on the +Y side of the strap.
struct CableClip: Sendable {
    /// The strap's inner radius beyond the cable's.
    static let archPlay = 0.1
    /// What stays under a nail head at least: the plate grows for a tall head.
    static let headFloor = 0.6
    /// Under the strap the plate reaches only this share of the cable's radius
    /// (at least minRidge) past the cable's middle on the open side, so the
    /// cable can pass under the strap's tip. Past the strap the plate widens
    /// to its full width along a slant, this many times as long as it is wide,
    /// which the standing print can build without support.
    static let ridge = 0.4
    static let minRidge = 0.6
    static let flare = 1.1
    /// Concave fillet where the strap rises from the plate.
    static let rootFillet = 0.6
    /// Plate beside the counterbore; counterbore to the plate's end.
    static let flangeMargin = 0.7
    static let endMargin = 1.0
    static let minHalfWidth = 1.5
    /// A textile cable gives about this much when it is pressed in.
    static let squish = 0.5
    /// The strap's tip never comes closer than this to the plate.
    static let minOpening = 0.3

    let parameters: CableClipParameters
    /// Cable radius; strap inner and outer radius.
    let radius: Double
    let inner: Double
    let outer: Double
    let plateThickness: Double
    let halfWidth: Double
    /// Height of the cable's middle.
    let center: Double
    /// Where the strap's free end stops, measured around the cable's middle; negative, below the middle on the open side.
    let tipAngle: Double
    /// The plate's edge on the open side under the strap.
    let edgeX: Double
    let bore: Double
    let counterbore: Double
    let counterboreDepth: Double
    /// Where the slant past the strap reaches the plate's full width (the strap's end for adhesive).
    let flareEnd: Double
    /// The nail along the cable, past the strap; nil for adhesive.
    let nailY: Double?
    /// The plate's +Y end; the strap spans ±length/2.
    let plateEnd: Double
    let fillet: Double

    init(_ input: CableClipParameters) {
        let p = input.normalized()
        parameters = p
        let c = p.cableDiameter, nail = p.mount == .nail
        radius = c/2
        inner = c/2+Self.archPlay
        outer = inner+p.wall
        bore = p.nailDiameter+0.3
        counterbore = max(p.nailHeadDiameter+0.3, bore+0.4)
        let thickness = nail ? max(p.plate, p.nailHeadHeight+Self.headFloor) : p.plate
        plateThickness = thickness
        counterboreDepth = nail ? min(p.nailHeadHeight, thickness-Self.headFloor) : 0
        halfWidth = max(outer, Self.minHalfWidth, nail ? counterbore/2+Self.flangeMargin : 0)
        center = thickness+c/2
        let ex = max(Self.ridge*c/2, Self.minRidge)
        edgeX = ex
        let fil = min(Self.rootFillet, c/4)
        fillet = fil
        // The free end stops where asked, but never closer than minOpening to the plate or the wall.
        let rm = (inner+outer)/2, ctr = thickness+c/2
        let hw = max(outer, Self.minHalfWidth, nail ? counterbore/2+Self.flangeMargin : 0)
        var angle = -asin(min(p.overlap, inner-0.2)/inner)
        while angle < 0 && Self.pinch(tip:(rm*cos(angle), ctr+rm*sin(angle)), wall:p.wall, plate:thickness, edgeX:ex, inner:inner, fillet:fil) < Self.minOpening {
            angle = min(0, angle+0.005)
        }
        tipAngle = angle
        if nail {
            let half = p.length/2, slant = (1+Self.flare*Self.flare).squareRoot()
            flareEnd = half+Self.flare*(hw-ex)
            // The counterbore keeps the asked gap to the strap and its margin to the slanted edge.
            let y = max(half+p.nailGap+counterbore/2, half+(counterbore/2+Self.flangeMargin)*slant-Self.flare*ex)
            nailY = y
            plateEnd = y+counterbore/2+Self.endMargin
        } else {
            flareEnd = p.length/2
            nailY = nil
            plateEnd = p.length/2
        }
    }

    private func mm(_ v: Double) -> String { String(format:"%.1f", locale:Locale(identifier:"en_US_POSIX"), v) }
    var problem: String? {
        let p = parameters
        if p.mount == .nail && p.nailHeadDiameter < p.nailDiameter+0.6 {
            return "A \(mm(p.nailHeadDiameter)) mm head is too small for a \(mm(p.nailDiameter)) mm nail: it needs a head of \(mm(p.nailDiameter+0.6)) mm or more to hold the plate."
        }
        return nil
    }
    /// The overlap the strap really has, after keeping its tip off the plate.
    var overlap: Double { -inner*sin(tipAngle) }
    var note: String? {
        let p = parameters
        var notes: [String] = []
        if p.mount == .nail && p.nailHeadHeight > counterboreDepth+0.001 {
            notes.append("The nail head stands \(mm(p.nailHeadHeight-counterboreDepth)) mm proud of the plate under the cable; the sheath takes up about 0.3 mm of that.")
        }
        if overlap < p.overlap-0.01 {
            notes.append("The overlap is limited to \(mm(overlap)) mm here, so the strap's tip stays \(mm(Self.minOpening)) mm off the plate.")
        }
        return notes.isEmpty ? nil : notes.joined(separator:" ")
    }

    var length: Double { parameters.length/2+plateEnd }
    var width: Double { 2*halfWidth }
    var height: Double { center+outer }
    /// The strap's free end: the middle of its round tip, and its lowest point.
    var tip: (x: Double, z: Double) {
        let r = (inner+outer)/2
        return (r*cos(tipAngle), center+r*sin(tipAngle))
    }
    var tipBottom: Double { tip.z-parameters.wall/2 }
    /// The widest thing that passes between the strap's tip and what lies
    /// below it: the plate's top beside the root, the ridge's edge, the step and the wall.
    static func pinch(tip: P2, wall: Double, plate: Double, edgeX: Double, inner: Double, fillet: Double) -> Double {
        let path: [P2] = [(-inner+fillet, plate), (edgeX, plate), (edgeX, 0), (edgeX+50, 0)]
        var best = Double.infinity
        for i in 0..<path.count-1 {
            let a = path[i], b = path[i+1], dx = b.0-a.0, dz = b.1-a.1, l2 = max(dx*dx+dz*dz, 1e-12)
            let t = min(1, max(0, ((tip.0-a.0)*dx+(tip.1-a.1)*dz)/l2))
            best = min(best, hypot(tip.0-(a.0+t*dx), tip.1-(a.1+t*dz)))
        }
        return best-wall/2
    }
    /// The cable has to pass through here.
    var opening: Double { Self.pinch(tip:tip, wall:parameters.wall, plate:plateThickness, edgeX:edgeX, inner:inner, fillet:fillet) }
    /// The plate's footprint, the glue pad.
    var padArea: Double { (halfWidth+edgeX)*parameters.length+(parameters.mount == .nail ? 2*halfWidth*(plateEnd-parameters.length/2)-(halfWidth-edgeX)*(flareEnd-parameters.length/2)/2 : 0) }
    /// How far the tip has to lift for the squeezed cable to pass.
    var insertion: Double { max(0, parameters.cableDiameter-Self.squish-opening) }
    /// Rough bending strain in the strap as the cable goes in: a cantilever
    /// from the root, the straight leg plus the arc to the tip. PLA takes about 2%.
    var snapStrain: Double {
        let leg = max(0, center-plateThickness-fillet), arc = (Double.pi-tipAngle)*(inner+outer)/2
        let spring = leg+arc
        return 1.5*parameters.wall*insertion/(spring*spring)
    }

    typealias P2 = (Double, Double)
    static func arc(_ cx: Double, _ cz: Double, _ r: Double, _ a0: Double, _ a1: Double, _ n: Int) -> [P2] {
        (0...n).map { let a = a0+(a1-a0)*Double($0)/Double(n); return (cx+r*cos(a), cz+r*sin(a)) }
    }
    static func dedupe(_ pts: [P2]) -> [P2] {
        var out: [P2] = []
        for p in pts {
            if let last = out.last, abs(last.0-p.0) < 1e-9 && abs(last.1-p.1) < 1e-9 { continue }
            out.append(p)
        }
        if out.count > 1, abs(out[0].0-out.last!.0) < 1e-9 && abs(out[0].1-out.last!.1) < 1e-9 { out.removeLast() }
        return out
    }

    /// The strap alone, counterclockwise, from its root on the plate's top:
    /// up the inner leg, over the inner arc, round the tip, back over the
    /// outer arc and down the outer face. Its first edge lies on the plate.
    func strapProfile(quality: BalloonGenerator.Quality) -> [P2] {
        let n = quality == .export ? 32 : 14, t = plateThickness, f = fillet
        var pts: [P2] = [(-outer, t), (-inner+f, t)]
        pts += Self.arc(-inner+f, t+f, f, -Double.pi/2, -Double.pi, 4)
        pts += [(-inner, center)]
        // The arcs are split at the crown and at the open side's equator, so those points are exact.
        let m = max(2, n/4)
        pts += Self.arc(0, center, inner, Double.pi, Double.pi/2, n/2)
        pts += Self.arc(0, center, inner, Double.pi/2, 0, n/2)
        pts += Self.arc(0, center, inner, 0, tipAngle, m)
        let r = (inner+outer)/2, tc = (r*cos(tipAngle), center+r*sin(tipAngle))
        pts += Self.arc(tc.0, tc.1, parameters.wall/2, tipAngle+Double.pi, tipAngle+2*Double.pi, 8)
        pts += Self.arc(0, center, outer, tipAngle, 0, m)
        pts += Self.arc(0, center, outer, 0, Double.pi/2, n/2)
        pts += Self.arc(0, center, outer, Double.pi/2, Double.pi, n/2)
        pts += [(-outer, center)]
        return Self.dedupe(pts)
    }
    /// Plate and strap together, counterclockwise, where the strap stands: the
    /// plate ends at edgeX on the open side.
    func fullProfile(quality: BalloonGenerator.Quality) -> [P2] {
        let w = halfWidth, t = plateThickness
        var pts: [P2] = [(-w, 0), (edgeX, 0), (edgeX, t)]
        pts += strapProfile(quality:quality).dropFirst()      // from (-inner+f, t) round to (-outer, center)
        pts += [(-outer, t), (-w, t)]
        return Self.dedupe(pts)
    }
}

/// Builds the clip where it sits on the wall, and lays it down for printing.
enum CableClipGenerator {
    private static func quad(_ b: inout CloudMeshBuilder, _ p: Int, _ q: Int, _ r: Int, _ s: Int) {
        b.triangles.append(Triangle(a:p, b:q, c:r))
        b.triangles.append(Triangle(a:p, b:r, c:s))
    }
    private static func cap(_ b: inout CloudMeshBuilder, _ profile: [CableClip.P2], y: Double, facing: Double) {
        let tris = FlatRegion.triangles(outline:Array(profile.indices), holes:[], points:profile) ?? []
        assert(!tris.isEmpty, "A clip profile could not be triangulated")
        for (i, j, k) in tris {
            let a = b.vertex(Point3(x:profile[i].0, y:y, z:profile[i].1)), c1 = b.vertex(Point3(x:profile[j].0, y:y, z:profile[j].1)), c2 = b.vertex(Point3(x:profile[k].0, y:y, z:profile[k].1))
            b.triangles.append(facing < 0 ? Triangle(a:a, b:c1, c:c2) : Triangle(a:a, b:c2, c:c1))
        }
    }
    /// A convex face as a fan from its first point.
    private static func fan(_ b: inout CloudMeshBuilder, _ profile: [CableClip.P2], y: Double, facing: Double) {
        let p0 = b.vertex(Point3(x:profile[0].0, y:y, z:profile[0].1))
        for i in 1..<profile.count-1 {
            let p1 = b.vertex(Point3(x:profile[i].0, y:y, z:profile[i].1)), p2 = b.vertex(Point3(x:profile[i+1].0, y:y, z:profile[i+1].1))
            b.triangles.append(facing < 0 ? Triangle(a:p0, b:p1, c:p2) : Triangle(a:p0, b:p2, c:p1))
        }
    }
    /// Walls along the cable for every edge of a counterclockwise profile between two stations.
    private static func walls(_ b: inout CloudMeshBuilder, _ profile: [CableClip.P2], from y0: Double, to y1: Double, skipping: Set<Int> = []) {
        for i in profile.indices where !skipping.contains(i) {
            let p0 = profile[i], p1 = profile[(i+1)%profile.count]
            quad(&b, b.vertex(Point3(x:p0.0, y:y0, z:p0.1)), b.vertex(Point3(x:p0.0, y:y1, z:p0.1)),
                 b.vertex(Point3(x:p1.0, y:y1, z:p1.1)), b.vertex(Point3(x:p1.0, y:y0, z:p1.1)))
        }
    }

    static func clip(_ c: CableClip, quality: BalloonGenerator.Quality) -> BalloonMesh {
        let p = c.parameters, half = p.length/2, n = quality == .export ? 48 : 24
        var b = CloudMeshBuilder()
        let full = c.fullProfile(quality:quality)
        cap(&b, full, y:-half, facing:-1)
        walls(&b, full, from:-half, to:half)
        guard let nailY = c.nailY else {
            cap(&b, full, y:half, facing:1)
            return b.mesh
        }
        // The strap's end face; then the plate's extension in three bands along the
        // cable, so the band with the hole has a plain outline. On the open side the
        // plate widens along a slant from the strap's end to the full width.
        cap(&b, c.strapProfile(quality:quality), y:half, facing:1)
        let w = c.halfWidth, t = c.plateThickness, ex = c.edgeX, fe = c.flareEnd, end = c.plateEnd
        let y1 = nailY-c.counterbore/2-0.1, y2 = nailY+c.counterbore/2+0.1
        func edge(_ y: Double) -> Double { y >= fe-1e-9 ? w : ex+(y-half)/CableClip.flare }
        func v(_ x: Double, _ y: Double, _ z: Double) -> Int { b.vertex(Point3(x:x, y:y, z:z)) }
        // Bands along the cable between every border: the strap's end, the end of the
        // slant (wherever it falls), the hole's band and the plate's end. Within a band
        // the open-side edge is straight, so every band is a trapezoid, and only the
        // hole's band needs the ear clipper.
        var ys = [half, y1, y2, end]
        if fe > half+1e-9 && fe < y1-1e-9 { ys.append(fe) }   // inside the hole's band the slant's end is a corner of its outline instead
        ys.sort()
        var xs: [Double] = []
        for x in [-w, -c.outer, -c.inner+c.fillet, ex] where xs.last.map({ abs($0-x) > 1e-9 }) ?? true { xs.append(x) }
        func holed(_ outline: [FlatRegion.Point], z: Double, radius: Double, up: Bool) {
            var points = outline
            let start = points.count
            for k in 0..<n {
                let a = -2*Double.pi*Double(k)/Double(n)
                points.append((radius*cos(a), nailY+radius*sin(a)))
            }
            let tris = FlatRegion.triangles(outline:Array(0..<start), holes:[Array(start..<start+n)], points:points) ?? []
            assert(!tris.isEmpty, "The plate's face could not be triangulated")
            for (i, j, k) in tris {
                let ids = [v(points[i].0, points[i].1, z), v(points[j].0, points[j].1, z), v(points[k].0, points[k].1, z)]
                b.triangles.append(up ? Triangle(a:ids[0], b:ids[1], c:ids[2]) : Triangle(a:ids[0], b:ids[2], c:ids[1]))
            }
        }
        for i in 0..<ys.count-1 {
            let ya = ys[i], yb = ys[i+1]
            if yb-ya < 1e-9 { continue }
            quad(&b, v(-w, ya, 0), v(-w, ya, t), v(-w, yb, t), v(-w, yb, 0))
            // The open-side wall bends where the slant ends, which may fall inside the hole's band.
            let stops = fe > ya+1e-9 && fe < yb-1e-9 ? [ya, fe, yb] : [ya, yb]
            for k in 0..<stops.count-1 {
                quad(&b, v(edge(stops[k]), stops[k], 0), v(edge(stops[k+1]), stops[k+1], 0), v(edge(stops[k+1]), stops[k+1], t), v(edge(stops[k]), stops[k], t))
            }
            if abs(ya-y1) < 1e-9 {
                var outline: [FlatRegion.Point] = [(-w, y1), (edge(y1), y1)]
                if fe > y1+1e-9 && fe < y2-1e-9 { outline.append((w, fe)) }
                outline += [(w, y2), (-w, y2)]
                holed(outline, z:t, radius:c.counterbore/2, up:true)
                holed(outline, z:0, radius:c.bore/2, up:false)
            } else if abs(ya-half) < 1e-9 {
                // The first band's top is a fan over the points where the strap's root and the plate's top meet it.
                for j in 0..<xs.count-1 { b.triangles.append(Triangle(a:v(xs[j], half, t), b:v(xs[j+1], half, t), c:v(-w, yb, t))) }
                b.triangles.append(Triangle(a:v(ex, half, t), b:v(edge(yb), yb, t), c:v(-w, yb, t)))
                quad(&b, v(-w, half, 0), v(-w, yb, 0), v(edge(yb), yb, 0), v(ex, half, 0))
            } else {
                quad(&b, v(-w, ya, t), v(edge(ya), ya, t), v(edge(yb), yb, t), v(-w, yb, t))
                quad(&b, v(-w, ya, 0), v(-w, yb, 0), v(edge(yb), yb, 0), v(edge(ya), ya, 0))
            }
        }
        fan(&b, [(-w, 0), (w, 0), (w, t), (-w, t)], y:end, facing:1)
        func ring(_ r: Double, _ z: Double) -> [Point3] {
            (0..<n).map { let a = 2*Double.pi*Double($0)/Double(n); return Point3(x:r*cos(a), y:nailY+r*sin(a), z:z) }
        }
        let floor = c.plateThickness-c.counterboreDepth
        b.bore(ring(c.counterbore/2, c.plateThickness), ring(c.counterbore/2, floor))
        let outerRing = ring(c.counterbore/2, floor), innerRing = ring(c.bore/2, floor)
        for k in 0..<n {
            let k1 = (k+1)%n
            quad(&b, b.vertex(outerRing[k]), b.vertex(outerRing[k1]), b.vertex(innerRing[k1]), b.vertex(innerRing[k]))
        }
        b.bore(ring(c.bore/2, floor), ring(c.bore/2, 0))
        return b.mesh
    }

    /// A round body along the cable, for the previews.
    static func rod(y0: Double, y1: Double, r: Double, z: Double, segments: Int = 32) -> BalloonMesh {
        var b = CloudMeshBuilder()
        func ring(_ y: Double) -> [Point3] {
            (0..<segments).map { let a = 2*Double.pi*Double($0)/Double(segments); return Point3(x:r*cos(a), y:y, z:z+r*sin(a)) }
        }
        let r0 = ring(y0), r1 = ring(y1)
        for i in 0..<segments {
            let k = (i+1)%segments
            quad(&b, b.vertex(r0[i]), b.vertex(r0[k]), b.vertex(r1[k]), b.vertex(r1[i]))
        }
        let c0 = b.vertex(Point3(x:0, y:y0, z:z)), c1 = b.vertex(Point3(x:0, y:y1, z:z))
        for i in 0..<segments {
            let k = (i+1)%segments
            b.triangles.append(Triangle(a:c0, b:b.vertex(r0[k]), c:b.vertex(r0[i])))
            b.triangles.append(Triangle(a:c1, b:b.vertex(r1[i]), c:b.vertex(r1[k])))
        }
        var mesh = b.mesh
        if signedVolume(mesh) < 0 { mesh.triangles = mesh.triangles.map { Triangle(a:$0.a, b:$0.c, c:$0.b) } }
        return mesh
    }
    static func signedVolume(_ m: BalloonMesh) -> Double {
        m.triangles.reduce(0) { $0+m.vertices[$1.a].dot(m.vertices[$1.b].cross(m.vertices[$1.c]))/6 }
    }
    /// A vertical cylinder, for the nail.
    static func post(y: Double, r: Double, z0: Double, z1: Double, segments: Int = 24) -> BalloonMesh {
        var b = CloudMeshBuilder()
        func ring(_ z: Double) -> [Point3] {
            (0..<segments).map { let a = 2*Double.pi*Double($0)/Double(segments); return Point3(x:r*cos(a), y:y+r*sin(a), z:z) }
        }
        let lower = ring(z0), upper = ring(z1)
        for i in 0..<segments {
            let k = (i+1)%segments
            quad(&b, b.vertex(lower[i]), b.vertex(lower[k]), b.vertex(upper[k]), b.vertex(upper[i]))
        }
        let c0 = b.vertex(Point3(x:0, y:y, z:z0)), c1 = b.vertex(Point3(x:0, y:y, z:z1))
        for i in 0..<segments {
            let k = (i+1)%segments
            b.triangles.append(Triangle(a:c0, b:b.vertex(lower[k]), c:b.vertex(lower[i])))
            b.triangles.append(Triangle(a:c1, b:b.vertex(upper[i]), c:b.vertex(upper[k])))
        }
        return b.mesh
    }
    static func transformed(_ m: BalloonMesh, _ f: (Point3) -> Point3) -> BalloonMesh {
        var out = m
        out.vertices = m.vertices.map(f)
        return out
    }
    static func grounded(_ m: BalloonMesh) -> BalloonMesh {
        let low = m.vertices.map(\.z).min() ?? 0
        return transformed(m) { Point3(x:$0.x, y:$0.y, z:$0.z-low) }
    }
}

/// The clip as it sits on the wall, its print view and its notes.
struct CableClipKit: Sendable {
    let parameters: CableClipParameters
    let clip: CableClip
    let mesh: BalloonMesh

    static func generate(_ input: CableClipParameters, quality: BalloonGenerator.Quality = .preview) -> CableClipKit {
        let clip = CableClip(input)
        return CableClipKit(parameters:clip.parameters, clip:clip, mesh:CableClipGenerator.clip(clip, quality:quality))
    }

    /// Standing on the strap's end, the profile on the bed, so the strap
    /// flexes within its layers; or lying on the plate if asked.
    var printView: BalloonMesh {
        if parameters.flat { return CableClipGenerator.grounded(mesh) }
        return CableClipGenerator.grounded(CableClipGenerator.transformed(mesh) { Point3(x:$0.x, y:-$0.z, z:$0.y) })
    }
    /// A length of cable through the clip.
    func cable() -> BalloonMesh {
        let reach = max(clip.length*1.3, 12)
        return CableClipGenerator.rod(y0:-reach, y1:reach, r:clip.radius, z:clip.center)
    }
    /// The nail in its hole: shaft to the wall, head in the counterbore.
    func nail() -> [BalloonMesh] {
        guard let y = clip.nailY else { return [] }
        let p = parameters, floor = clip.plateThickness-clip.counterboreDepth
        return [CableClipGenerator.post(y:y, r:p.nailDiameter/2, z0:-0.5, z1:floor+0.01),
                CableClipGenerator.post(y:y, r:p.nailHeadDiameter/2, z0:floor, z1:floor+p.nailHeadHeight)]
    }
    /// Clip (0), cable (2) and nail (3) together.
    func assembly() -> (mesh: BalloonMesh, colors: [Int]) {
        var parts: [(BalloonMesh, Int)] = [(mesh, 0), (cable(), 2)]
        parts += nail().map { ($0, 3) }
        var out = BalloonMesh(vertices:[], triangles:[], maxOverhang:0), colors: [Int] = []
        for (part, color) in parts {
            let offset = out.vertices.count
            out.vertices += part.vertices
            out.triangles += part.triangles.map { Triangle(a:$0.a+offset, b:$0.b+offset, c:$0.c+offset) }
            colors += Array(repeating:color, count:part.triangles.count)
        }
        return (out, colors)
    }
    var fitsP2S: Bool { clip.length+16 <= 256 }

    var notes: String {
        func mm(_ v: Double, _ digits: Int = 1) -> String { String(format:"%.\(digits)f", locale:Locale(identifier:"en_US_POSIX"), v) }
        let p = parameters, c = clip
        let fixing = p.mount == .nail
            ? "Nail: a \(mm(p.nailDiameter)) mm nail with a \(mm(p.nailHeadDiameter)) mm head through the \(mm(c.bore)) mm bore in the plate's extension, \(mm(c.counterbore)) × \(mm(c.counterboreDepth)) mm counterbore, under the cable, \(mm((c.nailY ?? 0)-c.counterbore/2-p.length/2)) mm past the strap. The hammer meets only the flat plate. Finish with a nail punch."
            : "Adhesive: a pad of thin double-sided tape cut to \(mm(c.width)) × \(mm(c.length)) mm, or a crumb of mounting putty, under the plate."
        return """
        Cable clip for a \(p.cableText) mm cable: one piece, \(mm(c.width)) × \(mm(c.length)) × \(mm(c.height)) mm. \
        The strap (\(mm(p.wall)) mm, \(mm(p.length)) mm long) is fixed on one side and ends \(mm(p.overlap)) mm below \
        the cable's middle on the other; the opening under its tip is \(mm(c.opening)) mm. \(fixing) Press the cable in \
        from the open side: the strap lifts about \(mm(c.insertion)) mm, an estimated \(mm(c.snapStrain*100)) % strain. \
        Print \(p.flat ? "lying on the plate, with the arch bridged" : "standing on the strap's end, profile on the bed, with a brim"); \
        PETG bends further than PLA.
        """
    }
}
