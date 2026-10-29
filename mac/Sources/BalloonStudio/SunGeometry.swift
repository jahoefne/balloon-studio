import Foundation

/// Both wall lamps share the tested floor, clips, nail pocket and cable duct.
/// The kind controls the outline, fitting layout and independent saved design.
enum WallLampKind: String, Codable, Sendable {
    case cloud, sun
    var title: String { rawValue.capitalized }
    var settingsKey: String { "BalloonStudio.\(rawValue).v1" }
    var defaults: CloudParameters {
        var p = CloudParameters()
        p.kind = self
        if self == .sun { p.width = 200 }
        return p
    }
}

/// Convex ray primitives use parallel inset edges. Their intersection gives
/// actual perpendicular wall clearance even at a pointed tip. Union with the
/// central disk keeps every inset contour connected and star-shaped.
struct SunPolygon: Sendable {
    struct Plane: Sendable { let x: Double, y: Double, offset: Double }
    let points: [SIMD2<Double>]
    let planes: [Plane]

    init(points: [SIMD2<Double>]) {
        self.points = points
        planes = points.indices.map { i in
            let a = points[i], b = points[(i + 1) % points.count], edge = b - a
            let length = hypot(edge.x, edge.y), nx = edge.y / length, ny = -edge.x / length
            return Plane(x:nx, y:ny, offset:nx * a.x + ny * a.y)
        }
    }
    func radius(at angle: Double, inset: Double, width: Double) -> Double {
        var low = 0.0, high = Double.infinity
        for plane in planes {
            let along = plane.x * cos(angle) + plane.y * sin(angle), limit = plane.offset * width - inset
            if abs(along) < 1e-12 {
                if limit < 0 { return 0 }
            } else if along > 0 { high = min(high, limit / along) }
            else { low = max(low, limit / along) }
        }
        return high >= low ? high : 0
    }
    func horizontalIntervals(_ y: Double, inset: Double, width: Double) -> [(Double, Double)] {
        var low = -Double.infinity, high = Double.infinity
        for plane in planes {
            let limit = plane.offset * width - inset - plane.y * y
            if abs(plane.x) < 1e-12 {
                if limit < 0 { return [] }
            } else if plane.x > 0 { high = min(high, limit / plane.x) }
            else { low = max(low, limit / plane.x) }
        }
        return high > low ? [(low, high)] : []
    }
}

/// Four suns with pointed rays. Each silhouette has its own sculpted front.
enum SunStyle: String, Codable, CaseIterable, Identifiable, Sendable {
    case softStar = "soft-star", cones, pinwheel, boldEight = "bold-eight"
    var id: String { rawValue }
    var title: String {
        switch self {
        case .softStar: return "Soft star"
        case .cones: return "Cones"
        case .pinwheel: return "Pinwheel"
        case .boldEight: return "Bold eight"
        }
    }
    var subtitle: String {
        switch self {
        case .softStar: return "Twelve plump rays that flow into the dome"
        case .cones: return "Twelve round, tapering rays around a dome"
        case .pinwheel: return "Twelve leaning rays that swirl into the middle"
        case .boldEight: return "Eight broad rays around a button dome"
        }
    }
    /// A few words under the design's picture.
    var note: String {
        switch self {
        case .softStar: return "Plump, ridged rays"
        case .cones: return "Round, tapering rays"
        case .pinwheel: return "Leaning rays, a swirl"
        case .boldEight: return "Eight broad rays"
        }
    }
    var rayCount: Int { self == .boldEight ? 8 : 12 }
    var sector: Double { 2 * .pi / Double(rayCount) }
    /// Where two neighboring rays meet, as a fraction of the width.
    var notchRadius: Double {
        switch self {
        case .softStar, .cones: return 0.27
        case .pinwheel: return 0.29
        case .boldEight: return 0.30
        }
    }
    /// A pinwheel's rays lean: their notches are turned counterclockwise.
    var lean: Double { self == .pinwheel ? .pi/24 : 0 }
    /// The cable leaves between two rays, clockwise of the ray on its
    /// side, at this angle from it: through the notch. A pinwheel's notch
    /// is close to that ray. Where a strip of the given half width around
    /// the cable would reach under the ray's ridge there, the cable leaves
    /// further from it instead, at most midway between the two rays,
    /// through the long flank of the other one.
    func outletOffset(width: Double, strip: Double) -> Double {
        let seat = (notchRadius-0.005)*width-CloudParameters.wall-CableOutlet.seatLength
        return min(sector/2, max(sector/2-lean, atan((strip+0.5)/seat)))
    }
    /// Every notch, counterclockwise from the positive X axis.
    var notchAngles: [Double] { (0..<rayCount).map { (Double($0) + 0.5) * sector + lean } }
    var profile: CloudProfile { SunGeometry.profiles[self]! }
}

enum SunGeometry {
    static let tipRadius = 0.5
    fileprivate static let profiles = Dictionary(uniqueKeysWithValues:SunStyle.allCases.map { ($0, profile($0)) })

    /// The notch counterclockwise (side 1) or clockwise (side -1) of a ray.
    private static func notch(_ style: SunStyle, ray: Int, side: Double) -> SIMD2<Double> {
        let angle = (Double(ray) + side/2) * style.sector + style.lean
        return SIMD2(cos(angle), sin(angle)) * style.notchRadius
    }
    private static func tip(_ style: SunStyle, ray: Int) -> SIMD2<Double> {
        let angle = Double(ray) * style.sector
        return SIMD2(cos(angle), sin(angle)) * tipRadius
    }
    /// Triangles from each tip through the two notches beside it, ending
    /// inside a central disk that reaches almost to the notches. The
    /// outline has plain V notches; inset contours round them.
    private static func profile(_ style: SunStyle) -> CloudProfile {
        let triangles = (0..<style.rayCount).map { ray -> SunPolygon in
            let t = tip(style, ray:ray)
            return SunPolygon(points:[t] + [1.0, -1.0].map { t + (notch(style, ray:ray, side:$0) - t) * 1.5 })
        }
        return CloudProfile(lobes:[(0, 0, style.notchRadius - 0.005)], body:.init(x0:0,x1:0,y0:0,y1:0), polygons:triangles)
    }

    /// The outline's radius at unit width, in fine steps of angle: for
    /// means over many directions, where exact radii would cost too much.
    struct Outline: Sendable {
        fileprivate let radii: [Double]
        func radius(_ angle: Double) -> Double {
            let turn = angle/(2 * .pi), position = (turn-turn.rounded(.down))*Double(radii.count)
            let index = Int(position) % radii.count, part = position-position.rounded(.down)
            return radii[index]+(radii[(index+1) % radii.count]-radii[index])*part
        }
    }
    private static let outlines = Dictionary(uniqueKeysWithValues:SunStyle.allCases.map { style in
        (style, Outline(radii:(0..<7200).map {
            CloudGenerator.radius(Double($0) * .pi/3600, inset:0, width:1, profile:profiles[style]!)
        }))
    })
    static func outline(_ style: SunStyle) -> Outline { outlines[style]! }

    /// Length of the spring tab along a flank, and the least width of the
    /// relief slot beside it. One angle serves both slots: the one nearer
    /// the tip comes out wider, up to half as wide again.
    static let clipLength = 10.0
    static let clipSlit = 1.0
    /// The tab's middle, from the notch towards the tip. Near the notch the
    /// ray is wide enough for the tab to flex into the cavity.
    static let clipPosition = 0.23
    /// A clip sits on the straight flank of a ray, where the skirt is a flat
    /// wall. At a tip or in a notch the tab would be a stiff corner.
    /// The flank chosen is far from the cable outlets on all four sides.
    static func clip(_ style: SunStyle, width: Double) -> (center: Double, half: Double, slit: Double) {
        let ray = style == .boldEight ? 0 : 1
        let start = notch(style, ray:ray, side:1) * width, end = tip(style, ray:ray) * width
        let length = hypot(end.x - start.x, end.y - start.y)
        func angle(_ along: Double) -> Double {
            let point = start + (end - start) * (along/length)
            return atan2(point.y, point.x)
        }
        let middle = clipPosition * length
        let a = angle(middle - clipLength/2), b = angle(middle + clipLength/2)
        let slit = max(abs(angle(middle - clipLength/2 - clipSlit) - a), abs(angle(middle + clipLength/2 + clipSlit) - b))
        return ((a + b)/2, abs(a - b)/2, slit)
    }
}
