import Foundation

enum CableSide: String, Codable, CaseIterable, Identifiable, Sendable {
    case left, right, top, bottom
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var opposite: Self {
        switch self {
        case .left: return .right
        case .right: return .left
        case .top: return .bottom
        case .bottom: return .top
        }
    }
    /// Outward, seen from the front of the lamp.
    var center: Double {
        switch self {
        case .right: return 0
        case .top: return Double.pi/2
        case .left: return Double.pi
        case .bottom: return 3*Double.pi/2
        }
    }
    /// The clips sit closer to the sides than to the top and the bottom.
    var nearestClip: Double { self == .left || self == .right ? Double.pi/6 : Double.pi/3 }
    var place: String {
        self == .left || self == .right ? "on the \(rawValue) as you face the lamp" : "at the \(rawValue) of the lamp"
    }
}

/// The cable leaves through a window in the outer wall, low enough for the
/// lamp to sit flat on the wall. Behind the window, two cheeks on the floor
/// hold a flexible seal that grips the cable and closes the window to light.
///
/// Dimensions use the cable's own frame: `t` along the cable from the lamp's
/// origin, `h` across it, and Z from the wall side of the back.
struct CableOutlet: Sendable {
    /// Printed walls beside the seal.
    static let cheek = 1.6
    /// Shortest length of seal held between the cheeks.
    static let seatLength = 6.0
    /// The seal stands this far out of its pocket, to push and to pull it.
    static let handle = 1.0
    /// The bore is smaller than the cable, the seal larger than its seat.
    static let grip = 0.3
    static let squeeze = 0.2
    /// Flexible wall around the cable where it passes the printed wall.
    static let sleeve = 0.8
    /// Opened to lay the cable in. The pocket presses it shut.
    static let slit = 0.4
    /// The nozzle ends just inside the outer surface.
    static let recess = 0.4
    /// Narrower leading edge, to start the seal between the cheeks.
    static let lead = 0.4
    /// Free floor in front of the pocket to slide the seal in.
    static let landing = 12.0
    /// Floor between the meshing core and the pocket's mouth.
    static let clearance = 2.0

    private struct Axis: Sendable {
        let width: Double, verticalScale: Double, profile: CloudProfile
        let cosine: Double, sine: Double, start: Double

        init(_ p: CloudParameters, profile: CloudProfile, angle: Double) {
            width = p.width; verticalScale = p.verticalScale; self.profile = profile
            cosine = cos(angle); sine = sin(angle)
            let x = p.coreHalfWidth/max(abs(cosine), 1e-15)
            let y = (sine >= 0 ? p.coreHighY : -p.coreLowY)/max(abs(sine), 1e-15)
            start = 0.9*min(x, y)
        }
        func point(_ t: Double, _ h: Double) -> (Double, Double) {
            (t*cosine-h*sine, t*sine+h*cosine)
        }
        func inside(_ t: Double, _ h: Double, _ inset: Double) -> Bool {
            let (x, y) = point(t, h)
            return hypot(x, y) < CloudGenerator.radius(atan2(y, x), inset:inset, width:width,
                                                       verticalScale:verticalScale, profile:profile)
        }
        /// Where a line along the cable first leaves an inset outline.
        func reach(_ h: Double, inset: Double) -> Double {
            var low = start
            while low > 0 && !inside(low, h, inset) { low = max(0, low-2) }
            var high = low+0.5
            while high < 1.2*width*max(1, verticalScale) && inside(high, h, inset) { low = high; high += 0.5 }
            for _ in 0..<48 {
                let middle = (low+high)/2
                if inside(middle, h, inset) { low = middle } else { high = middle }
            }
            return low
        }
    }

    let parameters: CloudParameters
    /// Outward direction of the cable, through the lamp's origin.
    let angle: Double
    /// Mouth of the pocket, measured along the cable.
    let seat: Double
    private let axis: Axis

    init(_ p: CloudParameters) {
        parameters = p
        let profile = p.profile, center = p.cableSide.center
        let preferred = (Self.preferredAngle(p, profile:profile)-center).remainder(dividingBy:2 * .pi)
        let strip = Self.notchHalfWidth(p.cableDiameter), outer = Self.pocketWidth(p.cableDiameter)/2+Self.cheek
        func mouth(_ axis: Axis) -> Double {
            (-4...4).map { axis.reach(Double($0)*outer/4, inset:CloudParameters.wall) }.min()!-Self.seatLength
        }
        // Clip beams and their relief slots keep their own columns. Turn the
        // cable away from them where a small lamp leaves too little room.
        let clip = 6/(p.width*0.4)+0.02
        var direction = center+preferred
        // A sun's clips are a ray away from every cable exit.
        for _ in 0..<(p.kind == .sun ? 0 : 4) {
            let limit = max(0, p.cableSide.nearestClip-clip-atan(strip/mouth(Axis(p, profile:profile, angle:direction))))
            direction = center+min(limit, max(-limit, preferred))
        }
        let turn = 2*Double.pi, wrapped = direction.truncatingRemainder(dividingBy:turn)
        angle = wrapped < 0 ? wrapped+turn : wrapped
        axis = Axis(p, profile:profile, angle:angle)
        seat = mouth(axis)
    }

    /// Clouds: the widest or the highest point of the outline, or the middle
    /// of the flat base. Suns: between two rays, clockwise of the ray on
    /// that side, so the four exits are a quarter turn apart.
    private static func preferredAngle(_ p: CloudParameters, profile: CloudProfile) -> Double {
        if p.kind == .sun {
            return p.cableSide.center-p.sunStyle.outletOffset(width:p.width, strip:notchHalfWidth(p.cableDiameter))
        }
        switch p.cableSide {
        case .right:
            let lobe = profile.lobes.max { $0.0+$0.2 < $1.0+$1.2 }!
            return atan2(lobe.1*p.verticalScale, lobe.0+lobe.2)
        case .left:
            let lobe = profile.lobes.min { $0.0-$0.2 < $1.0-$1.2 }!
            return atan2(lobe.1*p.verticalScale, lobe.0-lobe.2)
        case .top:
            let lobe = profile.lobes.max { $0.1+$0.2 < $1.1+$1.2 }!
            return atan2((lobe.1+lobe.2)*p.verticalScale, lobe.0)
        case .bottom:
            return 3*Double.pi/2
        }
    }
    private static func pocketWidth(_ cable: Double) -> Double { cable+2*sleeve+3.2-slit-squeeze }
    private static func notchHalfWidth(_ cable: Double) -> Double { pocketWidth(cable)/2+cheek+0.6 }

    // Flexible seal.
    var bore: Double { parameters.cableDiameter-Self.grip }
    /// Square section of the nozzle that fills the window.
    var nozzle: Double { parameters.cableDiameter+2*Self.sleeve }
    var sealWidth: Double { nozzle+3.2 }
    var sealHeight: Double { nozzle+1.8 }
    var nozzleZ: Double { CloudParameters.floor+0.8 }
    var axisZ: Double { nozzleZ+nozzle/2 }
    /// Flat inner end of the seal, in front of the pocket's mouth.
    var sealStart: Double { seat-Self.handle }

    // Printed back and front.
    var window: Double { nozzle-Self.squeeze }
    var windowZ: ClosedRange<Double> { (nozzleZ+Self.squeeze/2)...(nozzleZ+nozzle-Self.squeeze/2) }
    var pocketWidth: Double { Self.pocketWidth(parameters.cableDiameter) }
    var cheekTop: Double { CloudParameters.floor+sealHeight }
    /// Half width of the strip whose columns run along the cable.
    var notchHalfWidth: Double { Self.notchHalfWidth(parameters.cableDiameter) }
    /// The front's skirt is cut back to here where it would meet the pocket.
    var notchTop: Double { cheekTop+0.5 }
    var notchesSkirt: Bool { parameters.depth-CloudParameters.skirt < notchTop }

    func point(_ t: Double, _ h: Double) -> (Double, Double) { axis.point(t, h) }
    func point(_ t: Double, _ h: Double, _ z: Double) -> Point3 {
        let (x, y) = axis.point(t, h)
        return Point3(x:x, y:y, z:z)
    }
    func offset(of point: (Double, Double)) -> Double { point.1*axis.cosine-point.0*axis.sine }
    func distance(of point: (Double, Double)) -> Double { point.0*axis.cosine+point.1*axis.sine }
    func reach(_ h: Double, inset: Double) -> Double { axis.reach(h, inset:inset) }
    func inside(_ t: Double, _ h: Double, inset: Double) -> Bool { axis.inside(t, h, inset) }

    /// Offsets of the columns that carry the outlet's faces.
    var columns: [Double] {
        let half = [window/2, pocketWidth/2, pocketWidth/2+Self.cheek, notchHalfWidth]
        return [0]+half+half.map { -$0 }
    }
    /// A column is named by the angle of its point on the pocket's mouth.
    func column(at h: Double) -> Double {
        let turn = 2*Double.pi, a = (angle+atan(h/seat)).truncatingRemainder(dividingBy:turn)
        return a < 0 ? a+turn : a
    }
    func offset(ofColumn a: Double) -> Double? {
        let d = (a-angle).remainder(dividingBy:2 * .pi)
        guard abs(d) < Double.pi/2 else { return nil }
        let h = seat*tan(d)
        return abs(h) <= notchHalfWidth+0.002 ? h : nil
    }

    /// Footprint of the cheeks, from the pocket's mouth to the wall.
    var pocketOutline: [(Double, Double)] {
        let h = pocketWidth/2+Self.cheek
        return [point(seat, -h), point(reach(-h, inset:CloudParameters.wall), -h), point(reach(0, inset:CloudParameters.wall), 0),
                point(reach(h, inset:CloudParameters.wall), h), point(seat, h)]
    }
    /// Free floor in front of the pocket. At the top of a small cloud the
    /// nail pocket stands closer than the seal would like.
    var landing: Double { landing(within:notchHalfWidth) }
    /// The same, across a wider strip than the pocket's own.
    func landing(within notchHalfWidth: Double) -> Double {
        let boss = CloudGenerator.Layout(p:parameters).nailBoss
        var outline = [(boss.x0, boss.y0), (boss.x1, boss.y0), (boss.x1, boss.y1), (boss.x0, boss.y1)].map {
            (distance(of:$0), offset(of:$0))
        }
        // What is left of the nail pocket within the strip.
        for side in [1.0, -1] {
            var clipped: [(Double, Double)] = []
            for (i, a) in outline.enumerated() {
                let b = outline[(i+1)%outline.count]
                let da = notchHalfWidth-side*a.1, db = notchHalfWidth-side*b.1
                if da >= 0 { clipped.append(a) }
                if (da > 0) != (db > 0) && da != db {
                    let u = da/(da-db)
                    clipped.append((a.0+(b.0-a.0)*u, a.1+(b.1-a.1)*u))
                }
            }
            outline = clipped
        }
        guard let nearest = outline.map(\.0).filter({ $0 < seat }).max() else { return Self.landing }
        return min(Self.landing, seat-nearest)
    }
    /// The highest point of the pocket's mouth, in the lamp's frame.
    var mouthTop: Double { max(point(seat, -notchHalfWidth).1, point(seat, notchHalfWidth).1) }
    /// No LEDs on the pocket, nor where the cable and its seal are slid in.
    var keepOut: CloudGenerator.Rect {
        let far = max(reach(-notchHalfWidth, inset:0), reach(0, inset:0), reach(notchHalfWidth, inset:0))
        let landing = self.landing
        let corners = [(seat-landing, -notchHalfWidth), (seat-landing, notchHalfWidth),
                       (far, -notchHalfWidth), (far, notchHalfWidth)].map { point($0.0, $0.1) }
        return .init(x0:corners.map(\.0).min()!, x1:corners.map(\.0).max()!,
                     y0:corners.map(\.1).min()!, y1:corners.map(\.1).max()!)
    }
}

/// A block with a round bore, a nozzle on its outer face and a slit beneath
/// the bore. It is swept along the cable on rings around the bore. Flange
/// and nozzle follow the wall they meet, from the inside: between two of
/// its vertices the seal never stands proud of the printed wall, even
/// where the outline turns a corner beside a ray.
enum CableSealGenerator {
    /// Printed standing on its flat inner end, nozzle up: X across the cable,
    /// Y along the lamp's depth, Z along the cable.
    static func generate(_ p: CloudParameters, quality: BalloonGenerator.Quality) -> BalloonMesh {
        let outlet = CableOutlet(p), detail = quality == .export ? 2 : 1
        // Half the underside, a side, the top, a side, half the underside.
        // Fine steps across the cable, where the ends follow the wall.
        let spacing = 0.5, half = Int(ceil(outlet.sealWidth/2/spacing))
        let counts = [half, 4*detail, 2*half, 4*detail, half], total = counts.reduce(0, +)
        let gap = CableOutlet.slit/2
        func rectangle(_ width: Double, _ z0: Double, _ z1: Double) -> [(Double, Double)] {
            let corners = [(gap, z0), (width/2, z0), (width/2, z1), (-width/2, z1), (-width/2, z0), (-gap, z0)]
            return counts.enumerated().flatMap { side, count in
                (0..<count).map { i -> (Double, Double) in
                    let a = corners[side], b = corners[side+1], u = Double(i)/Double(count)
                    return (a.0+(b.0-a.0)*u, a.1+(b.1-a.1)*u)
                }
            }+[corners[5]]
        }
        let radius = outlet.bore/2, open = asin(gap/radius), quarter = Double.pi/4
        let turns = [-2*quarter+open, -quarter, quarter, 3*quarter, 5*quarter, 6*quarter-open]
        let bore = counts.enumerated().flatMap { side, count in
            (0..<count).map { turns[side]+(turns[side+1]-turns[side])*Double($0)/Double(count) }
        }+[turns[5]]
        let floor = CloudParameters.floor, top = floor+outlet.sealHeight
        let rings = [bore.map { (radius*cos($0), outlet.axisZ+radius*sin($0)) },
                     rectangle(outlet.nozzle, outlet.nozzleZ, outlet.nozzleZ+outlet.nozzle),
                     rectangle(outlet.sealWidth, floor, top),
                     rectangle(outlet.sealWidth-2*CableOutlet.lead, floor, top)]

        // The nearest wall within a step to either side.
        let step = 0.1, samples = Int(ceil((outlet.sealWidth/2+spacing)/step)), within = Int(ceil(spacing/step))+1
        let insets = [CloudParameters.wall, CableOutlet.recess]
        let walls = insets.map { inset in
            (-samples...samples).map { outlet.reach(Double($0)*step, inset:inset) }
        }
        var corners: [[Int: Double]] = [[:], [:]]
        func reach(_ h: Double, _ index: Int) -> Double {
            let center = Int((h/step).rounded())+samples
            let lower = max(0, center-within), upper = min(2*samples, center+within)
            let least = (lower...upper).min { walls[index][$0] < walls[index][$1] }!
            // A corner of the wall may lie between two samples, beside the
            // notch of a pinwheel: look for it there.
            guard least > lower && least < upper else { return walls[index][least] }
            if let known = corners[index][least] { return known }
            var a = Double(least-1-samples)*step, b = Double(least+1-samples)*step
            for _ in 0..<40 {
                let first = a+(b-a)/3, second = b-(b-a)/3
                if outlet.reach(first, inset:insets[index]) < outlet.reach(second, inset:insets[index]) { b = second } else { a = first }
            }
            let corner = outlet.reach((a+b)/2, inset:insets[index])
            let value = corner < walls[index][least]-1e-7 ? corner : walls[index][least]
            corners[index][least] = value
            return value
        }
        // The flange follows a wall that curves towards it. Where the wall
        // runs away, along the flank of a ray, it stays level.
        let edge = outlet.nozzle/2
        func flange(_ h: Double) -> Double {
            abs(h) <= edge ? reach(h, 0) : min(reach(h, 0), reach(h < 0 ? -edge : edge, 0))
        }
        func vertex(_ i: Int, _ ring: Int, _ station: Int) -> Point3 {
            let (h, z) = rings[ring == 2 && station == 2 ? 3 : ring][i]
            let t: Double
            switch station {
            case 0: t = outlet.sealStart
            case 1: t = flange(h)-CableOutlet.lead
            case 2: t = flange(h)
            default: t = reach(h, 1)
            }
            return Point3(x:h, y:z-floor-outlet.sealHeight/2, z:t-outlet.sealStart)
        }
        // The block ends at the wall. Only the sleeve around the bore goes on.
        func solid(_ ring: Int, _ station: Int) -> Bool { ring == 0 || station < 2 }
        var builder = CloudMeshBuilder()
        for station in 0..<3 { for ring in 0..<2 where solid(ring, station) { for i in 0..<total {
            let v = [station, station+1].flatMap { s in
                [vertex(i, ring, s), vertex(i, ring+1, s), vertex(i+1, ring+1, s), vertex(i+1, ring, s)]
            }
            builder.cell(v, neighbors:[station > 0, station < 2 && solid(ring, station+1), i > 0,
                                       ring == 0 && solid(1, station), i+1 < total, ring == 1])
        } } }
        return builder.mesh
    }

    /// From the print orientation to the seal's seat in the back.
    static func placed(_ mesh: BalloonMesh, parameters p: CloudParameters, lifted: Double = 0) -> BalloonMesh {
        let outlet = CableOutlet(p)
        var placed = mesh
        placed.vertices = mesh.vertices.map {
            outlet.point($0.z+outlet.sealStart-lifted, $0.x, $0.y+CloudParameters.floor+outlet.sealHeight/2+lifted)
        }
        return placed
    }
}
