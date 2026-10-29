import Foundation

enum CloudStyle: String, Codable, CaseIterable, Identifiable, Sendable {
    case classic, drift, billow, twin, breeze, cotton
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var subtitle: String {
        switch self {
        case .classic: return "Soft & familiar"
        case .drift: return "Low & flowing"
        case .billow: return "Tall & pillowy"
        case .twin: return "Two gentle peaks"
        case .breeze: return "Trailing in the wind"
        case .cotton: return "A crown of little puffs"
        }
    }
    // All profiles share rounded lobes, a quiet flat base and a unit width.
    // The original profile stays exact so existing printed pairs still match.
    var profile: CloudProfile {
        switch self {
        case .classic:
            return CloudProfile(lobes: [(-0.31,-0.02,0.19),(-0.20,0.10,0.17),(0.02,0.11,0.26),(0.30,-0.005,0.20)],
                                body: .init(x0:-0.31,x1:0.30,y0:-0.21,y1:0.10))
        case .drift:
            return CloudProfile(lobes: [(-0.335,-0.045,0.165),(-0.19,0.02,0.205),(0.045,0.065,0.215),(0.255,0.015,0.165),(0.345,-0.055,0.155)],
                                body: .init(x0:-0.335,x1:0.345,y0:-0.21,y1:0.06))
        case .billow:
            return CloudProfile(lobes: [(-0.32,-0.03,0.18),(-0.075,0.195,0.305),(0.27,0.02,0.23)],
                                body: .init(x0:-0.32,x1:0.27,y0:-0.21,y1:0.10))
        case .twin:
            return CloudProfile(lobes: [(-0.33,-0.04,0.17),(-0.19,0.125,0.235),(0.135,0.14,0.23),(0.335,-0.045,0.165)],
                                body: .init(x0:-0.33,x1:0.335,y0:-0.21,y1:0.10))
        // A big head, its puffs stepping down towards the other end as if
        // blown along. The end puff stays full: a cable seal and its clamp
        // need its room, and so does the clip on its shoulder.
        case .breeze:
            return CloudProfile(lobes: [(-0.32,-0.03,0.18),(-0.12,0.12,0.24),(0.12,0.09,0.195),(0.265,0.03,0.165),(0.322,-0.032,0.178)],
                                body: .init(x0:-0.32,x1:0.322,y0:-0.21,y1:0.06))
        // An arc of small puffs on a full body of large ones. The ends, the
        // middle and the highest puff are large enough for the fittings and
        // the cable's way out; the small ones only shape the outline.
        case .cotton:
            return CloudProfile(lobes: [(-0.32,-0.03,0.18),(0.32,-0.03,0.18),(-0.13,0.06,0.21),(0.13,0.06,0.21),(0.0,0.14,0.21),
                                        (-0.30,0.13,0.095),(-0.21,0.23,0.10),(-0.10,0.30,0.10),(0.03,0.28,0.13),(0.16,0.27,0.10),
                                        (0.27,0.18,0.10),(0.335,0.08,0.09)],
                                body: .init(x0:-0.32,x1:0.32,y0:-0.21,y1:0.06))
        }
    }
}

struct CloudProfile: Sendable {
    let lobes: [(Double, Double, Double)]
    let body: CloudGenerator.Rect
    var polygons: [SunPolygon] = []
    var lowY: Double { min(body.y0, (lobes.map { $0.1 - $0.2 } + polygons.flatMap { $0.points.map(\.y) }).min()!) }
    var highY: Double { max(body.y1, (lobes.map { $0.1 + $0.2 } + polygons.flatMap { $0.points.map(\.y) }).max()!) }
    var mirrored: Self {
        Self(lobes: lobes.map { (-$0.0, $0.1, $0.2) },
             body: .init(x0:-body.x1,x1:-body.x0,y0:body.y0,y1:body.y1),
             polygons: polygons.map { SunPolygon(points:$0.points.reversed().map { SIMD2(-$0.x,$0.y) }) })
    }
}

struct CloudParameters: Codable, Equatable, Sendable {
    var kind: WallLampKind = .cloud
    var style: CloudStyle = .classic
    var sunStyle: SunStyle = .softStar
    var mirrored = false
    var width = 230.0
    var depth = 22.0
    var diffuserThickness = 1.2
    var surface: LampSurface = .flat
    var surfaceDepth = 18.0
    var stripWidth = 8.0
    var stripThickness = 3.0
    var stripCutLength = 16.0
    var ledRowSpacing = 14.0
    var clipFit = 0.2
    var cableDiameter = 3.0
    var cableSide: CableSide = .right
    var secondCableSide: CableSide? = nil
    var thirdCableSide: CableSide? = nil
    var fourthCableSide: CableSide? = nil
    var strainRelief = true
    var nailHead = 8.0
    var nailShaft = 3.5
    /// The slot insert for a nail whose head would slip through the slot,
    /// and that nail as measured.
    var nailInsert = false
    var nailDiameter = 1.8
    var nailHeadDiameter = 3.3

    init() {}

    // Missing shape/row settings preserve clouds saved by older versions.
    // A sun saved with one of the former designs opens as the first sun.
    // Their rear outlet becomes an outlet in the wall on the right, and
    // they get the strain relief wherever the lamp has room for it.
    enum CodingKeys: String, CodingKey {
        case kind, style, sunStyle, mirrored, width, depth, diffuserThickness, surface, surfaceDepth, stripWidth, stripThickness, stripCutLength,
             ledRowSpacing, clipFit, cableDiameter, cableSide, secondCableSide, thirdCableSide, fourthCableSide, strainRelief, nailHead, nailShaft,
             nailInsert, nailDiameter, nailHeadDiameter
    }
    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decodeIfPresent(WallLampKind.self, forKey: .kind) ?? .cloud
        width = kind == .sun ? 200 : width
        style = try c.decodeIfPresent(CloudStyle.self, forKey: .style) ?? style
        sunStyle = ((try? c.decodeIfPresent(String.self, forKey: .sunStyle)) ?? nil).flatMap(SunStyle.init(rawValue:)) ?? sunStyle
        mirrored = try c.decodeIfPresent(Bool.self, forKey: .mirrored) ?? mirrored
        width = try c.decodeIfPresent(Double.self, forKey: .width) ?? width
        depth = try c.decodeIfPresent(Double.self, forKey: .depth) ?? depth
        diffuserThickness = try c.decodeIfPresent(Double.self, forKey: .diffuserThickness) ?? diffuserThickness
        surface = try c.decodeIfPresent(LampSurface.self, forKey: .surface) ?? .flat
        surfaceDepth = try c.decodeIfPresent(Double.self, forKey: .surfaceDepth) ?? surfaceDepth
        stripWidth = try c.decodeIfPresent(Double.self, forKey: .stripWidth) ?? stripWidth
        stripThickness = try c.decodeIfPresent(Double.self, forKey: .stripThickness) ?? stripThickness
        stripCutLength = try c.decodeIfPresent(Double.self, forKey: .stripCutLength) ?? stripCutLength
        ledRowSpacing = try c.decodeIfPresent(Double.self, forKey: .ledRowSpacing) ?? ledRowSpacing
        clipFit = try c.decodeIfPresent(Double.self, forKey: .clipFit) ?? clipFit
        cableDiameter = try c.decodeIfPresent(Double.self, forKey: .cableDiameter) ?? cableDiameter
        cableSide = try c.decodeIfPresent(CableSide.self, forKey: .cableSide) ?? cableSide
        secondCableSide = try c.decodeIfPresent(CableSide.self, forKey: .secondCableSide)
        thirdCableSide = try c.decodeIfPresent(CableSide.self, forKey: .thirdCableSide)
        fourthCableSide = try c.decodeIfPresent(CableSide.self, forKey: .fourthCableSide)
        strainRelief = try c.decodeIfPresent(Bool.self, forKey: .strainRelief) ?? strainRelief
        nailHead = try c.decodeIfPresent(Double.self, forKey: .nailHead) ?? nailHead
        nailShaft = try c.decodeIfPresent(Double.self, forKey: .nailShaft) ?? nailShaft
        nailInsert = try c.decodeIfPresent(Bool.self, forKey: .nailInsert) ?? nailInsert
        nailDiameter = try c.decodeIfPresent(Double.self, forKey: .nailDiameter) ?? nailDiameter
        nailHeadDiameter = try c.decodeIfPresent(Double.self, forKey: .nailHeadDiameter) ?? nailHeadDiameter
    }

    static let floor = 3.0
    static let wall = 2.4
    static let skirt = 12.0
    /// The first outlet, then up to three more, each on a side of its own.
    var cableSides: [CableSide] {
        get {
            [cableSide, secondCableSide, thirdCableSide, fourthCableSide].compactMap { $0 }
                .reduce(into: []) { sides, side in if !sides.contains(side) { sides.append(side) } }
        }
        set {
            cableSide = newValue.first ?? cableSide
            secondCableSide = newValue.count > 1 ? newValue[1] : nil
            thirdCableSide = newValue.count > 2 ? newValue[2] : nil
            fourthCableSide = newValue.count > 3 ? newValue[3] : nil
        }
    }
    /// Individual fittings retain the original single-outlet dimensions.
    var cableConfigurations: [Self] {
        cableSides.map { side in
            var p = self
            p.cableSides = [side]
            return p
        }
    }
    /// Moves an outlet to another side. An outlet already there takes its
    /// place, so no two outlets share a side.
    mutating func selectCableSide(_ side: CableSide, outlet index: Int = 0) {
        var sides = cableSides
        guard sides.indices.contains(index) else { return }
        if let other = sides.firstIndex(of: side) { sides[other] = sides[index] }
        sides[index] = side
        cableSides = sides
    }
    /// Adds outlets, or removes the last ones, until there are `count`. A new
    /// outlet faces the one before it where that side is free, else it goes
    /// to the first free side of bottom, top, right and left.
    mutating func setCableOutletCount(_ count: Int) {
        var sides = Array(cableSides.prefix(max(1, count)))
        while sides.count < min(count, CableSide.allCases.count) {
            let candidates = [sides.last!.opposite] + CableSide.allCases.reversed()
            sides.append(candidates.first { !sides.contains($0) }!)
        }
        cableSides = sides
    }
    var profile: CloudProfile { kind == .sun ? sunStyle.profile : mirrored ? style.profile.mirrored : style.profile }
    var height: Double { layoutHeightBasis * (profile.highY - profile.lowY) }
    var reliefDepth: Double { surface == .sculpted ? surfaceDepth : 0 }
    var maximumSurfaceDepth: Double { min(30, width*0.12) }
    var totalDepth: Double { depth + diffuserThickness + reliefDepth }
    // Keep real hardware clearances at 100 mm width by making the silhouette
    // taller when necessary. The LEDs and blind cap are never scaled down.
    // The band of the former rear duct still counts, so outlines and LED rows
    // of existing lamps stay as they are.
    // A sun's middle is small: below 160 mm the nail pocket stands in the
    // way of a cable seal at the top.
    var minimumWidth: Double { kind == .sun ? 160 : 100 }
    var layoutHeightBasis: Double {
        if kind == .sun { return width }
        let cableHeight = 2 * cableClearance + 7.2
        let nailHeight = nailHead + 12.8
        return max(width, ceil((cableHeight + ledChannelWidth + nailHeight + 3.6) / (coreHighFraction - coreLowFraction)))
    }
    var verticalScale: Double { layoutHeightBasis / width }
    var compactBlend: Double { min(1, max(0, (width - 160) / 40)) }
    // A sun's core stays in its small middle, clear of the seals' pockets
    // in the notches around it.
    static let sunCore = 0.15
    /// Top of a sun's nail pocket above the middle, as a fraction of the
    /// width. Below it a seal at the top has its whole way in.
    static let sunNailTop = 0.118
    private var coreLowFraction: Double { kind == .sun ? -Self.sunCore : -(0.15 + 0.03 * compactBlend) }
    private var coreHighFraction: Double { kind == .sun ? Self.sunCore : min(0.22 - 0.07 * compactBlend, profile.highY - 0.15) }
    var coreLowY: Double { layoutHeightBasis * coreLowFraction }
    var coreHighY: Double { layoutHeightBasis * coreHighFraction }
    var coreHalfWidth: Double {
        let desired = width * (kind == .sun ? Self.sunCore : (0.18 + 0.12 * compactBlend))
        // Keep the Cartesian core inside the innermost skirt contour, including
        // the scallop between the upper lobe and right lobe during the transition.
        return min(desired, CloudGenerator.horizontalReach(coreLowY / verticalScale, width: width, profile: profile),
                   CloudGenerator.horizontalReach(coreHighY / verticalScale, width: width, profile: profile))
    }
    var cableStartY: Double { kind == .sun ? coreLowY + 3.2 : max(-layoutHeightBasis * 0.16, coreLowY + 3.2) }
    var cableBossTop: Double { cableStartY + 2 * cableClearance + 4.8 }
    var nailCenterY: Double {
        // A sun has no band of a former rear duct to keep. Its nail pocket
        // sits around the middle, the first LED row right below it.
        if kind == .sun { return width * Self.sunNailTop - 10.4 - nailHead / 2 }
        let preferred = min(layoutHeightBasis * 0.06, coreHighY - nailHead / 2 - 10.4 - 1)
        return max(preferred, ledCenterY + ledChannelWidth / 2 + 1 + nailHead / 2 + 2.4)
    }
    var ledCenterY: Double {
        if kind == .sun { return nailCenterY - nailHead / 2 - 2.4 - 1 - ledChannelWidth / 2 }
        let preferred = min(-layoutHeightBasis * 0.015, coreHighY - ledChannelWidth / 2 - nailHead - 14.8)
        return max(preferred, cableBossTop + 1 + ledChannelWidth / 2)
    }
    var ledLength: Double { 2 * coreHalfWidth - 4.8 }
    var ledChannelWidth: Double { stripWidth + 0.6 }
    var cableClearance: Double { cableDiameter + 0.8 }
    var fitsP2S: Bool { width + 16 <= 256.001 && height + 16 <= 256.001 }
    var displayName: String { kind == .sun ? "Sun · \(sunStyle.title)" : "\(style.title)\(mirrored ? " · mirrored" : "")" }
    var frontFilename: String { kind == .sun ? "B-sun-front-diffuser.stl" : "B-cloud-front-white-PLA.stl" }
    static let sealFilename = "C-cable-seal-TPU.stl"
    static let barFilename = "D-cable-clamp-bar.stl"
    static let anvilFilename = "E-cable-clamp-anvil.stl"
    static let insertFilename = "F-nail-slot-insert.stl"
    var filename: String {
        let surfaceSuffix = surface == .sculpted ? "-3d-\(String(format:"%.1f",locale:Locale(identifier:"en_US_POSIX"),surfaceDepth))mm" : ""
        let cableSuffix = cableSides.count > 1 ? "-cable-\(cableSides.map(\.rawValue).sorted().joined(separator:"-"))"
            : cableSide == .right ? "" : "-cable-\(cableSide.rawValue)"
        if kind == .sun { return "Sun-Lamp-\(sunStyle.rawValue)-\(Int(width))mm\(surfaceSuffix)\(cableSuffix)-kit.zip" }
        let variant = style == .classic && !mirrored ? "" : "-\(style.rawValue)\(mirrored ? "-mirrored" : "")"
        return "Cloud-Lamp\(variant)-\(Int(width))mm\(surfaceSuffix)\(cableSuffix)-kit.zip"
    }

    func normalized() -> Self {
        var p = self
        func clamp(_ x: Double, _ a: Double, _ b: Double, _ fallback: Double) -> Double {
            min(b, max(a, x.isFinite ? x : fallback))
        }
        p.diffuserThickness = clamp(diffuserThickness, 0.8, 2, 1.2)
        p.stripWidth = clamp(stripWidth, 3.5, 12, 8)
        p.stripThickness = clamp(stripThickness, 1, 6, 3)
        p.stripCutLength = clamp(stripCutLength, 5, 100, 16)
        p.ledRowSpacing = clamp(ledRowSpacing, p.stripWidth + 4, 40, 14)
        p.clipFit = clamp(clipFit, 0.2, 0.5, 0.2)
        p.cableDiameter = clamp(cableDiameter, 2, 6, 3)
        p.cableSides = cableSides
        p.nailHead = clamp(nailHead, 5, 10, 8)
        p.nailShaft = clamp(nailShaft, 2, min(5, p.nailHead - 2), 3)
        p.nailDiameter = clamp(nailDiameter, 1, 4, 1.8)
        p.nailHeadDiameter = clamp(nailHeadDiameter, 2, 8, 3.3)
        p.width = clamp(width, p.minimumWidth, 500, kind == .sun ? 200 : 230)
        p.surfaceDepth = clamp(surfaceDepth, 2, p.maximumSurfaceDepth, 18)
        if kind == .sun { p.style = .classic; p.mirrored = false } else { p.sunStyle = .softStar }
        // The 12 mm skirt needs a full 3 mm floor plus 1 mm tip clearance.
        p.depth = clamp(depth, 16, 40, 22)
        return p
    }
}

/// Each outlet gets its own seal, since its ends follow that side's wall.
struct CloudCableParts: Sendable {
    let parameters: CloudParameters
    let seal: BalloonMesh
    let clamp: CableClamp?
    let bar: BalloonMesh?
    let anvil: BalloonMesh?
    let labeled: Bool

    init(_ p: CloudParameters, back: BalloonMesh, quality: BalloonGenerator.Quality, labeled: Bool) {
        parameters = p
        self.labeled = labeled
        seal = CableSealGenerator.generate(p, quality: quality)
        clamp = CableClamp(p).flatMap { clamp in
            let corner = clamp.posts[0][0]
            return back.vertices.contains {
                abs($0.z-clamp.postTop)<1e-6 && abs($0.x-corner.0)<1e-6 && abs($0.y-corner.1)<1e-6
            } ? clamp : nil
        }
        bar = clamp == nil ? nil : CableClampGenerator.bar(p)
        anvil = clamp == nil ? nil : CableClampGenerator.anvil(p)
    }
    private func filename(_ original: String) -> String {
        labeled ? String(original.dropLast(4))+"-\(parameters.cableSide.rawValue).stl" : original
    }
    var sealFilename: String { filename(CloudParameters.sealFilename) }
    var barFilename: String { filename(CloudParameters.barFilename) }
    var anvilFilename: String { filename(CloudParameters.anvilFilename) }
    func placedSeal(exploded: Bool = false) -> BalloonMesh {
        CableSealGenerator.placed(seal, parameters:parameters, lifted:exploded ? 14 : 0)
    }
    func placedClamp(exploded: Bool = false) -> [BalloonMesh] {
        guard let bar, let anvil else { return [] }
        return [CableClampGenerator.placedAnvil(anvil, parameters:parameters, lifted:exploded ? 6 : 0),
                CableClampGenerator.placedBar(bar, parameters:parameters, lifted:exploded ? 18 : 0),
                CableClampGenerator.placedScrews(parameters:parameters, lifted:exploded ? 28 : 0)]
    }
    var clampPrintView: BalloonMesh? {
        guard let bar, let anvil else { return nil }
        return CableClampGenerator.printView(bar:bar, anvil:anvil)
    }
}

/// Connected solids, each exported in its print orientation: back, front
/// and seal, the clamp's bar and anvil where the lamp has a strain relief,
/// and the slot insert where it is wanted. Assembly is preview only.
struct CloudKit: Sendable {
    let parameters: CloudParameters
    let back: BalloonMesh
    let front: BalloonMesh
    let cables: [CloudCableParts]
    var seal: BalloonMesh { cables[0].seal }
    var clamp: CableClamp? { cables[0].clamp }
    var bar: BalloonMesh? { cables[0].bar }
    var anvil: BalloonMesh? { cables[0].anvil }
    var clampCount: Int { cables.filter { $0.clamp != nil }.count }
    let ledPlan: CloudLEDPlan
    /// Nil unless it is wanted and the pocket and the nail suit it.
    let nailInsert: NailInsert?
    let insertMesh: BalloonMesh?

    init(_ input: CloudParameters, quality: BalloonGenerator.Quality = .preview) {
        let p = input.normalized()
        parameters = p
        ledPlan = CloudLEDPlan(p)
        back = CloudGenerator.generate(p, front: false, quality: quality)
        front = CloudGenerator.generate(p, front: true, quality: quality)
        let mesh = back
        cables = p.cableConfigurations.map {
            CloudCableParts($0, back:mesh, quality:quality, labeled:p.cableSides.count > 1)
        }
        nailInsert = p.nailInsert ? NailInsert(p) : nil
        insertMesh = nailInsert.map(NailInsertGenerator.generate)
    }
    /// In its pocket, or waiting behind the wall side.
    func placedInsert(exploded: Bool = false) -> [BalloonMesh] {
        guard let nailInsert, let insertMesh else { return [] }
        return [nailInsert.placed(insertMesh, exploded:exploded)]
    }
    /// The back turned over to the wall side, with the insert in its pocket.
    var rear: BalloonMesh {
        var mesh = back
        for part in placedInsert() {
            let offset = mesh.vertices.count
            mesh.vertices += part.vertices
            mesh.triangles += part.triangles.map { Triangle(a: $0.a + offset, b: $0.b + offset, c: $0.c + offset) }
        }
        mesh.vertices = mesh.vertices.map { Point3(x:$0.x, y:-$0.y, z:parameters.depth-$0.z) }
        return mesh
    }
    var rearColors: [Int] {
        insertMesh.map { Array(repeating:0, count:back.triangles.count) + Array(repeating:3, count:$0.triangles.count) } ?? []
    }
    /// Exploded, the seal waits in front of its pocket.
    func placedSeal(exploded: Bool = false) -> BalloonMesh {
        cables[0].placedSeal(exploded:exploded)
    }
    /// Anvil, bar and screws. Exploded, they wait above the posts, in the
    /// order they go in. The screws are shown only.
    func placedClamp(exploded: Bool = false) -> [BalloonMesh] {
        cables.flatMap { $0.placedClamp(exploded:exploded) }
    }
    var clampPrintView: BalloonMesh? {
        let parts=cables.compactMap(\.clampPrintView)
        return parts.isEmpty ? nil : Self.printView(parts)
    }
    var sealPrintView: BalloonMesh { Self.printView(cables.map(\.seal)) }
    private static func printView(_ parts: [BalloonMesh]) -> BalloonMesh {
        guard parts.count > 1 else { return parts[0] }
        var mesh=BalloonMesh(vertices:[],triangles:[],maxOverhang:0)
        let widths=parts.map(\.dimensions.x), gap=5.0
        var x = -(widths.reduce(0,+)+gap*Double(parts.count-1))/2
        for (index,part) in parts.enumerated() {
            let offset=mesh.vertices.count, origin=part.vertices.map(\.x).min()!
            mesh.vertices += part.vertices.map { Point3(x:$0.x-origin+x,y:$0.y,z:$0.z) }
            mesh.triangles += part.triangles.map { Triangle(a:$0.a+offset,b:$0.b+offset,c:$0.c+offset) }
            x += widths[index]+gap
        }
        return mesh
    }

    func placedFront(exploded: Bool = false) -> BalloonMesh {
        // Rotate about X, not mirror, to retain outward triangle winding.
        var m = front
        if parameters.surface == .sculpted {
            m.vertices = front.vertices.map {
                Point3(x:$0.x,y:$0.y,z:$0.z + parameters.depth - CloudParameters.skirt + (exploded ? 32 : 0))
            }
            return m
        }
        m.vertices = front.vertices.map {
            Point3(x: $0.x, y: -$0.y, z: parameters.totalDepth - $0.z + (exploded ? 32 : 0))
        }
        return m
    }
    func assembly(exploded: Bool = false) -> BalloonMesh {
        var mesh = back
        for part in [placedFront(exploded: exploded)] + cables.map({$0.placedSeal(exploded:exploded)}) + placedClamp(exploded: exploded)
                + placedInsert(exploded: exploded) {
            let offset = mesh.vertices.count
            mesh.vertices += part.vertices
            mesh.triangles += part.triangles.map { Triangle(a: $0.a + offset, b: $0.b + offset, c: $0.c + offset) }
        }
        return mesh
    }
    var assemblyColors: [Int] {
        Array(repeating: 0, count: back.triangles.count) + Array(repeating: 1, count: front.triangles.count)
            + Array(repeating: 2, count: cables.reduce(0) { $0+$1.seal.triangles.count }) + clampColors
            + Array(repeating: 3, count: insertMesh?.triangles.count ?? 0)
    }
    /// Bar and anvil in the clamp's color, the screws in the back's.
    private var clampColors: [Int] {
        cables.flatMap { cable in
            cable.placedClamp().enumerated().flatMap { Array(repeating: $0.offset == 2 ? 0 : 3, count: $0.element.triangles.count) }
        }
    }
    // Colored placement guides are preview only. The STL has a continuous flat floor.
    var backWithLEDGuides: BalloonMesh {
        var mesh = back
        for s in ledPlan.sections {
            let r = s.footprint(width: parameters.stripWidth), i = mesh.vertices.count
            mesh.vertices += [Point3(x:r.x0,y:r.y0,z:3.02),Point3(x:r.x1,y:r.y0,z:3.02),
                              Point3(x:r.x1,y:r.y1,z:3.02),Point3(x:r.x0,y:r.y1,z:3.02)]
            mesh.triangles += [Triangle(a:i,b:i+1,c:i+2),Triangle(a:i,b:i+2,c:i+3)]
        }
        for seated in cables.map({$0.placedSeal()}) + placedClamp() {
            let offset = mesh.vertices.count
            mesh.vertices += seated.vertices
            mesh.triangles += seated.triangles.map { Triangle(a: $0.a + offset, b: $0.b + offset, c: $0.c + offset) }
        }
        return mesh
    }
    var backColors: [Int] {
        Array(repeating:0,count:back.triangles.count) + Array(repeating:1,count:ledPlan.sections.count*2)
            + Array(repeating:2,count:cables.reduce(0) {$0+$1.seal.triangles.count}) + clampColors
    }
    var printedParts: Int { 2+cables.count+2*clampCount+(insertMesh == nil ? 0 : 1) }
    func entries() throws -> [(String, Data)] {
        var parts = [("A-\(parameters.kind.rawValue)-back-opaque.stl", try back.binarySTL()),
                     (parameters.frontFilename, try front.binarySTL())]
        for cable in cables {
            parts.append((cable.sealFilename,try cable.seal.binarySTL()))
            if let bar=cable.bar, let anvil=cable.anvil {
                parts += [(cable.barFilename,try bar.binarySTL()),(cable.anvilFilename,try anvil.binarySTL())]
            }
        }
        if let insertMesh { parts.append((CloudParameters.insertFilename,try insertMesh.binarySTL())) }
        return parts + [("LED-LAYOUT.svg", Data(ledPlan.svg.utf8)),
                        ("ASSEMBLY.md", Data(instructions.utf8)),
                        ("\(parameters.kind.rawValue)-settings.json", try JSONEncoder().encode(parameters))]
    }
    func archive() throws -> Data { StoredZIP.archive(try entries()) }

    var instructions: String {
        instructions(for:cables[0], includeGeneral:true)
    }
    private func instructions(for cable: CloudCableParts, includeGeneral: Bool) -> String {
        let p = cable.parameters, outlet = CableOutlet(p), clamp = cable.clamp
        func mm(_ v: Double) -> String { String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), v) }
        let relief: String, printing: String
        if clampCount > 0 {
            printing = """

            D, E: The filament of the back, or PETG where the lamp runs warm. Print
            both as supplied, without supports: the bar on its side, with its
            screw holes lying and the ribs rising at 45°, the anvil flat with its
            ribs up. Print them solid, with 0.2 mm layers or finer. Keep supports
            out of the holes of the two posts in the back as well.
            """
        } else { printing = "" }
        if let clamp {
            relief = """
            ## \(cable.labeled ? p.cableSide.title+" strain relief" : "Strain relief")
            Behind the seal two posts stand on the floor, \(mm(clamp.channel)) mm apart. The anvil
            (\(cable.anvilFilename)) and the bar (\(cable.barFilename)) clamp the lead between them. You need
            two screws M3 × \(mm(CableClamp.screwLength)) mm with a pan head or a button head: machine
            screws, or screws for plastic of 3 mm. Heads up to \(mm(CableClamp.headDiameter)) mm wide and
            \(mm(CableClamp.headHeight)) mm tall fit under the front. The screws form their own thread in
            the posts' \(mm(CableClamp.pilot)) mm holes, which are \(mm(clamp.holeDepth)) mm deep: longer screws
            reach the bottom before the bar is down.
            Fit the clamp once the seal is seated:
            1. Lift the lead and drop the anvil between the posts, ribs up. Its
               cross bars lie before and behind the posts. It fits either way round.
            2. Lay the lead between the two rails of the anvil.
            3. Set the bar across the posts, its tongue on the lead. It fits
               either way round too.
            4. Turn the screws in by turns, a little at a time, until the bar
               rests on both posts. Stop there. The posts set how far the lead
               is squeezed: to \(mm(CableClamp.pinch*p.cableDiameter)) mm under the ribs, from \(mm(p.cableDiameter)) mm. More
               torque only strains the thread.
            5. Pull the lead from outside. It must not move in the seal.
            The ribs are made for a lead of \(mm(p.cableDiameter)) mm. A thinner lead slips, a
            thicker one keeps the bar off the posts: measure the lead and set
            its diameter in the app. Back, seal, bar and anvil are made for it.
            To take the lead out, remove bar and anvil first, then the seal.
            The thread is formed in the print and holds for a few assemblies:
            take the clamp apart only when needed.
            """
        } else if p.strainRelief {
            relief = """
            ## \(cable.labeled ? p.cableSide.title+" strain relief" : "Strain relief")
            This lamp has no room for the screwed strain relief behind its
            cable outlet: the nail pocket or the wall stands in its way.
            \(CableClamp.minimumWidth(p).map { "From a width of \(mm($0)) mm it fits. " } ?? "")Choose another cable exit in the
            app, or secure the lead outside the lamp.
            """
        } else { relief = "" }
        let outletGuide = """
        ## \(cable.labeled ? p.cableSide.title+" cable outlet and light seal" : "Cable outlet and light seal")
        The cable leaves through a \(mm(outlet.window)) mm square window low in the
        \(p.cableSide == .top || p.cableSide == .bottom ? "outer" : "side") wall, \(p.cableSide.place). Its center is \(mm(outlet.axisZ)) mm
        above the rear face, so the back sits flat on the wall without spacers.
        The floor has no opening. Inside, two printed cheeks form a pocket for
        the flexible seal (\(cable.sealFilename)). The seal does the work of the former duct,
        baffle and sealant:
        - Its \(mm(outlet.bore)) mm bore is \(mm(CableOutlet.grip)) mm smaller than the nominal \(mm(p.cableDiameter)) mm
          cable and closes around the jacket.
        - Its \(mm(outlet.nozzle)) mm nozzle fills the window, \(mm(CableOutlet.squeeze)) mm oversize, and ends \(mm(CableOutlet.recess)) mm
          inside the outer surface.
        - Its flange covers the wall around the window from the inside.
        - The pocket is \(mm(outlet.sealWidth-outlet.pocketWidth)) mm narrower than the seal and presses the slit shut.
        Fit it before the LEDs go in:
        1. Pass the bare end of the lead through the window from outside and
           pull through as much as the wiring needs, with some slack.
        2. Open the seal's slit and press the lead into the bore. The nozzle
           points to the window, the slit to the floor.
        3. Pinch the seal and slide it along the floor between the cheeks, until
           the nozzle is in the window and the flange rests against the wall.
           A gentle pull on the lead from outside helps to seat it.\(outlet.landing < CableOutlet.landing ? "\n   The nail pocket stands \(mm(outlet.landing)) mm behind the cheeks. Set the seal down\n   right in front of it, tilted if need be, and push it home from there." : "")
        4. Look at the window from outside: the nozzle fills it all round.
        Use a round, flexible lead. The seal cannot close around a flat or
        ribbed cable, or around one much thinner than the diameter set in the
        app. The seal holds the lead lightly; \(clamp == nil ? "secure the lead outside the lamp\nif it can be pulled" : "the clamp behind it takes the\npull"). Do not glue the seal, so the lamp stays serviceable.
        The floor in front of the pocket stays free of LEDs to slide the seal in.\(p.cableSide != .top ? "" : clamp == nil ? "\nWith the outlet at the top, lead the cable up or to the side. The seal\nholds it lightly and is no strain relief: fix the lead to the wall close\nto the lamp, so its weight does not hang on the seal." : "\nWith the outlet at the top, lead the cable up or to the side. The clamp\ncarries its weight.")

        \(relief)
        """
        guard includeGeneral else { return outletGuide }
        let insertGuide=nailInsert.map { insert in
            let slot=2*insert.slotHalfWidth,overlap=p.nailHeadDiameter/2-insert.slotHalfWidth
            return """

            ## Slot insert for a small nail head
            \(CloudParameters.insertFilename) narrows the \(mm(p.nailShaft)) mm shaft slot to \(mm(slot)) mm, for a nail of
            \(mm(p.nailDiameter)) mm with a \(mm(p.nailHeadDiameter)) mm head. The head then bears on the insert's
            \(mm(NailInsert.plate)) mm plate, \(mm(overlap)) mm either side of its slot, and the plate on the lip.
            Fit it before hanging the lamp:
            1. Lay the lamp on its front. Hold the insert flat face up, fingers down,
               the open end of its slot towards the bottom of the lamp.
            2. Press it into the square entry until the fingers touch the bottom of
               the pocket. Their chamfered tips squeeze in; pinch them with tweezers
               if it is tight.
            3. Push it up behind the lip until it stops at the top of the chamber.
               The fingers spring against the chamber's walls and hold it there.
               Through the lamp's slot you now see the insert's narrow one.
            4. Set the nail so that the underside of its head stands \(mm(insert.nearestHead+0.1)) to \(mm(insert.nearestHead+0.4)) mm
               off the wall: \(mm(CloudGenerator.Layout.lip)) mm of lip and \(mm(NailInsert.plate)) mm of plate. Any more lets the
               top of the lamp lean off the wall by as much. Heads up to 1.2 mm
               thick fit behind the plate.
            5. Hang the lamp: the head goes in through the square entry, then slide
               the lamp down. The slot's flared mouth leads the shaft in, and a ramp
               on the plate's lower edge leads the head behind it.
            To take the insert out, lift the lamp off and slide it back down and out
            of the entry with a toothpick.

            """
        } ?? ""
        let cableGuides=([outletGuide]+cables.dropFirst().map { instructions(for:$0,includeGeneral:false) }).joined(separator:"\n\n")
        let printList=(cables.map { cable in
            "- \(cable.sealFilename)"+(cable.clamp == nil ? "" : "\n- \(cable.barFilename)\n- \(cable.anvilFilename)")
        }+(nailInsert == nil ? [] : ["- \(CloudParameters.insertFilename)"])).joined(separator:"\n")
        let insertPrinting=nailInsert == nil ? "" : """

        F: PLA or PETG. Print it as supplied: flat face on the bed, fingers up,
        solid, with 0.2 mm layers or finer and without supports. Its fingers are
        \(mm(NailInsert.finger)) mm wide, so use a 0.4 mm nozzle. Turn on elephant foot compensation,
        or trim a flared first layer with a blade: the insert fits its pocket
        to tenths of a millimetre.
        """
        return """
        # \(p.kind.title) wall lamp · \(mm(p.width)) × \(mm(p.height)) × \(mm(p.totalDepth)) mm

        Shape: \(p.displayName). Keep the parts of this kit together: different
        shapes, mirrored outlines and cable exits need their own matching parts.
        Surface: \(p.surface.title)\(p.surface == .sculpted ? " · \(mm(p.surfaceDepth)) mm raised depth" : "").

        Print one back, one front and one of each fitting listed below:
        \(printList)
        \(cables.count < 2 ? "" : "The \(["two","three","four"][cables.count-2]) outlets are for chaining lamps. Match each seal to its named side; the seals follow different wall contours. \(cables.count == 2 ? "Both" : "All") leads use the selected cable diameter.\n")All STLs are in millimetres,
        at 100% scale, with their lowest point at Z = 0. Do not scale in the
        slicer: change the dimensions in Balloon Studio to preserve the cable,
        nail and clip fit.
        \(p.fitsP2S ? "All pieces fit the P2S with an 8 mm brim." : "This size exceeds the P2S bed with an 8 mm brim. Choose a width of 240 mm or less in the app for a P2S print.")

        ## Materials and printing
        A: Use opaque filament for the back, or an opaque coating on its outside
        and keyhole pocket. A white back can transmit light. A white reflective
        lining may be added inside the main light chamber, keeping the seal's
        pocket, the cable window and all mating surfaces clear.
        B: \(p.kind == .sun ? "White or translucent yellow PLA" : "White PLA"), \(mm(p.diffuserThickness)) mm nominal shell thickness.
        \(p.surface == .sculpted ? "Print curved face up, clips down, in the supplied orientation. The skirt tips are at Z = 0. Use a brim and supports from the build plate under the diffuser, including its outer ledge. Keep support contacts off the spring tabs, catches and relief slots, and remove all supports through the open rear before assembly. Inspect the first layers, unsupported ledges and curved inner roof in your slicer. Fine or adaptive layers keep the gently sloping crowns of the domes smooth. The front is a hollow shell with a solid rolled rim; do not fill the light cavity. This orientation protects the visible curved face from support scars. Prototype the support setup and clip fit before a full-size print." : "Print the flat diffuser face down, with the skirt and four clips pointing up.")
        \(outlet.notchesSkirt ? "The skirt has a notch at each cable outlet, where it passes over the seal's pocket. Keep supports out of it." : "The skirt passes above the seals' pockets without a notch.")
        Print the shell material fully solid to avoid an infill pattern showing
        through the face. Begin with 0.2 mm layers and enough walls to fill the
        1.6 mm clip beams, their 2.0 mm roots and 2.4 mm back walls. Keep supports out of the cable
        window, nail pocket, retention groove and clip slots. Inspect the short
        bridges over the window (\(mm(outlet.window)) mm) and nail chamber (\(mm(p.nailHead)) mm)
        in the slicer. They must print cleanly; internal support is hard to remove.
        C: Flexible TPU, about 95A, in black or another fully opaque color. White
        or translucent TPU glows and must not be used. Print the seal as
        supplied: standing on its flat end, nozzle up, without supports. Print
        it solid, with 0.2 mm layers or finer, slowly enough for a clean bore
        and an open slit. If the \(mm(CableOutlet.slit)) mm slit has fused, open it with a sharp blade.\(printing)\(insertPrinting)

        ## LED strip
        Attach straight sections to the flat 3 mm floor, with LEDs facing the
        diffuser. The colored rectangles
        in the app are placement guides, not printed pockets or extra parts.
        LED-LAYOUT.svg is a numbered, full-size placement template; print at 100%
        and check its 50 mm scale bar. All section lengths are multiples of the
        selected \(mm(p.stripCutLength)) mm cut interval. Confirm that interval on
        your actual strip and cut ONLY at its marked copper pads; online listings
        for Aclorol B0BP7SVX5T have varied. The Amazon.de listing checked on
        2026-09-28 specifies 8 mm width, 5 V, 320 LEDs/m, 9 W/m and 16 mm cuts.
        Source: https://www.amazon.de/dp/B0BP7SVX5T

        \(ledPlan.cutList)

        Row centers are \(mm(p.ledRowSpacing)) mm apart. Layout reserves 3 mm at
        each section end for soldered flexible wire links and keeps strips clear
        of the skirt, the nail pocket, every cable seal\(clampCount == 0 ? "" : " and clamp"). Test the layout loose behind your printed
        front before sticking it down. Keep wires low on the floor and away from
        clips; bulky solderless connectors may need more space than this plan.
        For this single-color 5 V strip, connect all + pads to +5 V and all - pads
        to ground (electrically parallel), using insulated flexible wire. Do not
        connect a section's + to another section's - as an electrical series chain.
        Solder and insulate the links outside the lamp, then attach the sections.

        Selected strip thickness including LEDs and tape: \(mm(p.stripThickness)) mm.
        Minimum LED-to-front gap: \(mm(p.depth - 3 - p.stripThickness)) mm\(p.surface == .sculpted ? "; the raised surface adds space above this" : ""). The row layout is
        a starting point, not an optical simulation: \(p.kind == .sun ? "ray tips" : "lobes") and the raised fittings
        may still show brightness differences. Adjust row spacing and test your
        actual PLA; 22 mm back depth provides more mixing room than 16 mm.
        A matte white inner finish over an opaque backing helps recycle light;
        keep the seal's pocket and the mating surfaces clear.

        Total strip: \(mm(ledPlan.totalLength)) mm. At the listing's nominal 9 W/m,
        full-power demand is approximately \(mm(ledPlan.nominalWatts)) W / \(mm(ledPlan.nominalWatts / 5)) A at 5 V.
        \(ledPlan.totalLength > 1000 ? "This layout needs more than one 1 m strip; the original USB lead/supply must not be assumed sufficient." : "Check the USB supply and lead ratings against this demand.")
        These estimates do not validate cooling or wiring. Use dimming to reduce
        output and heat, size the supply and wiring for the installed load, and
        keep the supply outside. Larger layouts may need separate power feeds and
        a suitable heat-spreading mount; PLA is not a heat sink. Check the closed
        lamp at the intended brightness until its temperature stabilizes.

        \(cableGuides)

        ## Blind nail pocket
        On the rear, a square \(mm(p.nailHead)) mm entry opens into a captive head
        chamber, with a \(mm(p.nailShaft)) mm shaft slot extending upward by 8 mm.
        Settings are clear dimensions: include printing allowance around your
        actual nail. The retaining lip is 2.4 mm thick and head space is 3 mm deep.
        A solid 3 mm cap isolates the entire pocket from the light chamber.
        Fit the head in the entry and slide the lamp down into the narrow slot.
        The back rests on the wall. \(nailInsert == nil ? "Set nail projection for the 2.4 mm retaining\nlip and actual head thickness (under 3 mm); verify engagement before use." : "With the slot insert, set the nail as described\nbelow and verify engagement before use.")
        The mount supports this lamp only; hang the balloons independently.
        \(insertGuide)
        ## Clip the front on
        Align the \(p.kind.rawValue) outlines with the keyhole at the top. Four slotted, 1.6 mm-thick spring tabs engage
        the groove inside the back. Each tab thickens inward to a 2.0 mm root,
        tapering to the working thickness over 4 mm. Their lead-in ramps deflect the
        tabs inward; their shoulders retain the front. The radial running fit is
        \(mm(p.clipFit)) mm and nominal catch interference is 0.35 mm. The skirt
        overlaps the opaque sidewall by 12 mm to hide the seam and clip slots.
        Press gently near each tab until seated. Test fit before installing LEDs;
        PLA clips can crack if forced. Adjust clip fit in the app and reprint if
        needed. For occasional removal, carefully ease the front out one catch
        at a time; these are prototype clips, not validated for repeated cycling.

        ## Check the actual print
        Geometry is checked for connected, closed material before export. Physical
        clip strength, nail retention, the seal's fit,\(clampCount == 0 ? "" : " the clamp's hold,") opacity, light uniformity
        and temperature have not been validated. Illuminate the assembled lamp
        in a dark room and check the cable outlet, the side walls and the rear
        surface. Light at the outlet means the seal is not seated, the slit is
        open or the cable is thinner than set: reseat it or print a seal for the
        measured diameter. Correct any pinholes or translucent areas before
        wall mounting.
        """
    }
}

/// Only the spring tabs grow into the cavity; the running fit and catch stay
/// on their original outer contours. The root tapers over the first 4 mm of
/// the free beam, and blends into the ordinary skirt across each relief slot.
enum LampClipGeometry {
    static let skirtThickness = 1.2
    static let beamThickness = 1.6
    static let rootThickness = 2.0
    static let rootHeight = 2.0
    static let taperEnd = 6.0
}

/// Where the four spring tabs are, as angles seen from the middle of the
/// lamp: each tab's center, half its width and the relief slot beside it.
/// A cloud has them on its rounded shoulders. A sun has them on the flanks
/// of four rays, a quarter turn apart.
struct LampClips: Sendable {
    let centers: [Double]
    let half: Double
    let slit: Double

    init(_ p: CloudParameters) {
        if p.kind == .sun {
            let clip = SunGeometry.clip(p.sunStyle, width:p.width)
            centers = (0..<4).map { clip.center+Double($0)*Double.pi/2 }
            half = clip.half; slit = clip.slit
        } else {
            centers = [Double.pi/6, 5*Double.pi/6, 7*Double.pi/6, 11*Double.pi/6]
            half = 5/(p.width*0.4); slit = 1/(p.width*0.4)
        }
    }
    func thickness(at angle: Double, height: Double) -> Double {
        let separation = centers.map { abs((angle-$0).remainder(dividingBy:2*Double.pi)) }.min()!
        let across = max(0, min(1, (half+slit-separation)/slit))
        let root = max(0, min(1, (LampClipGeometry.taperEnd-height)/(LampClipGeometry.taperEnd-LampClipGeometry.rootHeight)))
        let beam = LampClipGeometry.beamThickness+(LampClipGeometry.rootThickness-LampClipGeometry.beamThickness)*root
        return LampClipGeometry.skirtThickness+(beam-LampClipGeometry.skirtThickness)*across
    }
}

/// A conforming cell mesh avoids overlapping component shells and Boolean dependencies.
/// The Cartesian core contains the mechanical pockets. A swept cloud annulus shares
/// its exact perimeter and houses the continuous wall, groove and spring fingers.
/// Across the cable outlet its columns run along the cable instead of radially,
/// which gives the window, the seal's pocket and the skirt's notch parallel sides.
/// The outlet may be on either side, at the top or at the bottom.
/// The posts of a strain relief are no cells: they stand in the floor's
/// surface, which is laid anew around them.
enum CloudGenerator {
    struct Rect: Sendable {
        let x0: Double, x1: Double, y0: Double, y1: Double
        func contains(_ x: Double, _ y: Double) -> Bool { x > x0 && x < x1 && y > y0 && y < y1 }
        func expanded(_ d: Double) -> Self { Self(x0: x0-d, x1: x1+d, y0: y0-d, y1: y1+d) }
    }
    struct Layout {
        let p: CloudParameters
        let coreX: Double, lowY: Double, highY: Double
        init(p: CloudParameters) {
            self.p=p;coreX=p.coreHalfWidth;highY=p.coreHighY
            // A cloud's flat base is close to the core. With the cable at the
            // bottom, the core ends before the mouth of the seal's pocket.
            let bottom=p.cableConfigurations.first { $0.cableSide == .bottom }.map { CableOutlet($0) }
            lowY=bottom.map { max(p.coreLowY,$0.mouthTop+CableOutlet.clearance) } ?? p.coreLowY
        }
        /// The retaining lip on the wall side, the head's chamber behind it
        /// and the shaft's slot above the entry.
        static let lip = 2.4
        static let headSpace = 3.0
        static let slotLength = 8.0
        var head: Rect { Rect(x0: -p.nailHead/2, x1: p.nailHead/2, y0: p.nailCenterY-p.nailHead/2, y1: p.nailCenterY+p.nailHead/2) }
        var slot: Rect { Rect(x0: -p.nailShaft/2, x1: p.nailShaft/2, y0: head.y1, y1: head.y1+Self.slotLength) }
        var chamber: Rect { Rect(x0: head.x0, x1: head.x1, y0: head.y0, y1: slot.y1) }
        var nailBoss: Rect { chamber.expanded(2.4) }
        var led: Rect { Rect(x0: -p.ledLength/2, x1: p.ledLength/2, y0: p.ledCenterY-p.ledChannelWidth/2, y1: p.ledCenterY+p.ledChannelWidth/2) }
        var rectangles: [Rect] { [head, slot, chamber, nailBoss, led] }
        // The floor has no opening for the cable: it leaves through the outer wall.
        func material(_ x: Double, _ y: Double, _ z: Double) -> Bool {
            var solid = z < CloudParameters.floor
            if nailBoss.contains(x,y) && z < 8.4 { solid = true }
            if z < Self.lip && (head.contains(x,y) || slot.contains(x,y)) { solid = false }
            if z > Self.lip && z < Self.lip+Self.headSpace && chamber.contains(x,y) { solid = false }
            return solid
        }
    }

    /// Horizontal interval connected to the origin after a conservative 4.5 mm
    /// inset. Selecting that interval avoids spanning a concave gap between lobes.
    static func horizontalReach(_ y: Double, width: Double, profile: CloudProfile = CloudStyle.classic.profile) -> Double {
        let merged = horizontalIntervals(y, inset:4.5, width:width, profile:profile)
        guard let span = merged.first(where: {$0.0 <= 0 && $0.1 >= 0}) else {return 0}
        return min(-span.0, span.1)
    }

    static func horizontalIntervals(_ y: Double, inset: Double, width: Double, profile: CloudProfile = CloudStyle.classic.profile) -> [(Double,Double)] {
        var intervals = profile.polygons.flatMap { $0.horizontalIntervals(y, inset: inset, width: width) }
        for (cx,cy,r) in profile.lobes {
            let radius = r * width - inset, dy = y - cy * width
            if abs(dy) < radius {
                let dx = sqrt(radius * radius - dy * dy)
                intervals.append((cx * width - dx, cx * width + dx))
            }
        }
        let body = profile.body
        if y >= body.y0 * width + inset && y <= body.y1 * width - inset {
            intervals.append((body.x0 * width + inset, body.x1 * width - inset))
        }
        var merged: [(Double, Double)] = []
        for interval in intervals.sorted(by: {$0.0 < $1.0}) {
            if let last = merged.last, interval.0 <= last.1 {
                merged[merged.count - 1].1 = max(last.1, interval.1)
            } else { merged.append(interval) }
        }
        return merged
    }

    /// Radial boundary of the profile's disks and rectangular lower body.
    /// Shrinking every primitive is conservative at the scallops: walls never
    /// get thinner there. All concentric contours stay ordered and star-shaped.
    static func radius(_ angle: Double, inset: Double, width: Double, verticalScale: Double = 1,
                       profile: CloudProfile = CloudStyle.classic.profile) -> Double {
        // Elliptical outline only: the actual pockets and cable retain their mm
        // dimensions. Insets stretch vertically too, making barriers thicker.
        let stretch = hypot(cos(angle), sin(angle) / verticalScale)
        let dx = cos(angle) / stretch, dy = sin(angle) / verticalScale / stretch
        var far = 0.0
        for polygon in profile.polygons { far = max(far, polygon.radius(at:atan2(dy,dx),inset:inset,width:width)) }
        for (cx,cy,r) in profile.lobes {
            let x=cx*width, y=cy*width, rr=r*width-inset
            let projection=x*dx+y*dy, det=rr*rr-x*x-y*y+projection*projection
            if det >= 0 { far=max(far,projection+sqrt(det)) }
        }
        let body = profile.body
        let rx = dx >= 0 ? (body.x1*width-inset)/max(dx,1e-12) : (body.x0*width+inset)/min(dx,-1e-12)
        let ry = dy >= 0 ? (body.y1*width-inset)/max(dy,1e-12) : (body.y0*width+inset)/min(dy,-1e-12)
        return max(far,min(rx,ry)) / stretch
    }

    static func generate(_ p: CloudParameters, front: Bool, quality: BalloonGenerator.Quality) -> BalloonMesh {
        let l=Layout(p:p), outlets=p.cableConfigurations.map { CableOutlet($0) }, profile=p.profile, tau=Double.pi*2, base=front ? p.diffuserThickness : CloudParameters.floor
        // The strain relief stands in the back. The front is the same without it.
        let clamps=front ? [] : p.cableConfigurations.compactMap { CableClamp($0) }
        let sampleCount=p.kind == .sun ? (quality == .export ? 480 : 240) : (quality == .export ? 160 : 80)
        func unique(_ a:[Double]) -> [Double] { a.sorted().reduce(into:[]) { result, value in if result.last.map({abs($0-value)>1e-7}) ?? true { result.append(value) } } }
        func angle(_ x:Double,_ y:Double) -> Double { let a=atan2(y,x); return a < 0 ? a+tau : a }
        func corePoint(_ a:Double) -> (Double,Double) {
            let dx=cos(a),dy=sin(a)
            let rx=l.coreX/max(abs(dx),1e-15)
            let ry=(dy >= 0 ? l.highY : -l.lowY)/max(abs(dy),1e-15)
            let r=min(rx,ry)
            return (r*dx,r*dy)
        }
        let clips=LampClips(p), centers=clips.centers, half=clips.half, slit=clips.slit
        let edges=centers.flatMap { [$0-half-slit,$0-half,$0+half,$0+half+slit] }
        // Include every lobe's extrema so size readouts remain exact for every
        // shape and handedness, even at preview resolution.
        let extremes=profile.lobes.flatMap { x,y,r in
            [angle(x-r,y*p.verticalScale),angle(x+r,y*p.verticalScale),
             angle(x,(y-r)*p.verticalScale),angle(x,(y+r)*p.verticalScale)]
        }
        // A sun's notches get columns too: its valleys run into them.
        let corners=profile.polygons.flatMap { $0.points.map { angle($0.x,$0.y*p.verticalScale) } }
            + (p.kind == .sun ? p.sunStyle.notchAngles : [])
        let seeds=(0..<sampleCount).map {Double($0)*tau/Double(sampleCount)}+edges+extremes+corners
        var xs=[-l.coreX,l.coreX], ys=[l.lowY,l.highY]
        for r in l.rectangles { xs += [r.x0,r.x1]; ys += [r.y0,r.y1] }
        func add(_ a:Double) {
            let (x,y)=corePoint(a)
            if abs(abs(x)-l.coreX)<1e-6 { ys.append(y) } else { xs.append(x) }
        }
        func columns() -> [Double] {
            xs=unique(xs);ys=unique(ys)
            var angles:[Double]=[]
            for x in xs { angles += [angle(x,l.lowY),angle(x,l.highY)] }
            for y in ys { angles += [angle(-l.coreX,y),angle(l.coreX,y)] }
            return unique(angles)
        }
        seeds.forEach(add)
        // A column through the strip no longer aims at its point of the outline.
        // Extremes inside the strip get a column of their own to stay exact.
        for outlet in outlets {
            let exact=(extremes+corners).compactMap { a -> Double? in
                guard outlet.offset(ofColumn:a) != nil else {return nil}
                let r=radius(a,inset:0,width:p.width,verticalScale:p.verticalScale,profile:profile)
                let h=outlet.offset(of:(r*cos(a),r*sin(a)))
                return abs(h)<=outlet.notchHalfWidth ? h : nil
            }
            // Nearby existing columns take the face instead of leaving a sliver.
            var taken=columns().compactMap(outlet.offset(ofColumn:))
            for h in outlet.columns+exact where !taken.contains(where:{abs($0-h)<0.001}) {
                add(outlet.column(at:h));taken.append(h)
            }
        }
        let angles=columns()
        let n=angles.count
        let outerSkirt=CloudParameters.wall+p.clipFit, innerSkirt=outerSkirt+LampClipGeometry.skirtThickness
        // The front has no hardware in its Cartesian floor. Pull that grid
        // inward where a reinforced root needs room, keeping all perimeter
        // columns fixed so the outer fit still matches existing backs.
        let coreScale=front ? min(1,angles.map { a -> Double in
            let (x,y)=corePoint(a)
            let inset=outerSkirt+clips.thickness(at:a,height:0)
            let inner=radius(a,inset:inset,width:p.width,verticalScale:p.verticalScale,profile:profile)
            return (inner-0.2)/hypot(x,y)
        }.min()!) : 1
        if front { xs=xs.map {$0*coreScale};ys=ys.map {$0*coreScale} }
        // Seated, the skirt's tip is at depth-12. Where the seal's pocket is
        // taller, the skirt stops above it.
        let notches=outlets.filter(\.notchesSkirt).map { base+p.depth-$0.notchTop }
        let zs=unique(front ? [0,base,base+LampClipGeometry.rootHeight,base+LampClipGeometry.taperEnd,base+8.5,base+9,base+10,base+12]+notches
                      : [0,2.4,3,5.4,8.4,p.depth-12.25,p.depth-8.25,p.depth]
                        + outlets.flatMap { [$0.windowZ.lowerBound,$0.windowZ.upperBound,$0.cheekTop] })
        // Inside -> outside. The front's intermediate edge is the ramped catch.
        // The back has one more ring on its floor: the mouth of the seal's pocket.
        let wall=CloudParameters.wall
        let insets=front ? [innerSkirt,outerSkirt,0] : [wall,wall,1.6,0]
        let mouth=front ? 0:1
        func gap(_ a:Double) -> Bool { centers.contains {abs(a-$0)>half && abs(a-$0)<half+slit} }
        let strips=outlets.map { outlet in angles.map { outlet.offset(ofColumn:$0) } }
        let parallel=angles.indices.map { col -> [(Double,Double)]? in
            guard let index=outlets.indices.first(where:{strips[$0][col] != nil}),let h=strips[index][col] else {return nil}
            let outlet=outlets[index]
            return insets.indices.map { row in
                outlet.point(row<mouth ? outlet.seat : outlet.reach(h,inset:insets[row]),h)
            }
        }
        func ringPoint(_ row:Int,_ col:Int,_ z:Double) -> Point3 {
            let a=angles[col%n]
            if row == 0 { let (x,y)=corePoint(a);return Point3(x:x*coreScale,y:y*coreScale,z:z) }
            if let points=parallel[col%n] { return Point3(x:points[row-1].0,y:points[row-1].1,z:z) }
            if row<=mouth {
                // Away from the outlet the ring stays a seal's length inside
                // the wall, or halfway across a narrower floor.
                let (x,y)=corePoint(a),inner=hypot(x,y)
                let outer=radius(a,inset:wall,width:p.width,verticalScale:p.verticalScale,profile:profile)
                let r=max((inner+outer)/2,outer-CableOutlet.seatLength-1)
                return Point3(x:r*cos(a),y:r*sin(a),z:z)
            }
            var inset=insets[row-1]
            if front && row == 1 {
                inset=outerSkirt+clips.thickness(at:a,height:z-base)
            }
            // Both endpoints of a finger share its ramp; slot surfaces close it.
            if front && row == 2 && centers.contains(where:{abs(a-$0)<=half+1e-7}) {
                let h=z-base
                let ramp=max(0,min(1,min((h-8.5)/0.5,(12-h)/2)))
                inset -= (p.clipFit+0.35)*ramp
            }
            let r=radius(a,inset:inset,width:p.width,verticalScale:p.verticalScale,profile:profile)
            return Point3(x:r*cos(a),y:r*sin(a),z:z)
        }
        let nr=insets.count,nz=zs.count-1,nx=xs.count-1,ny=ys.count-1
        var core=Array(repeating:false,count:nx*ny*nz)
        func ci(_ i:Int,_ j:Int,_ k:Int) -> Int { (k*ny+j)*nx+i }
        for k in 0..<nz { for j in 0..<ny { for i in 0..<nx {
            let z=(zs[k]+zs[k+1])/2
            core[ci(i,j,k)]=front ? z<base : l.material((xs[i]+xs[i+1])/2,(ys[j]+ys[j+1])/2,z)
        } } }
        var rim=Array(repeating:false,count:n*nr*nz)
        func ri(_ i:Int,_ j:Int,_ k:Int) -> Int { (k*nr+j)*n+(i+n)%n }
        for k in 0..<nz { for j in 0..<nr { for i in 0..<n {
            let z=(zs[k]+zs[k+1])/2, a=(angles[i]+(i+1<n ? angles[i+1] : angles[0]+tau))/2
            var solid=z<base
            if front && j==1 && z>=base { solid = z<base+LampClipGeometry.rootHeight || !gap(a) }
            if !front && j>=2 { solid = j==3 || !(z>p.depth-12.25 && z<p.depth-8.25) }
            for (index,outlet) in outlets.enumerated() {
                guard let h=strips[index][i],let next=strips[index][(i+1)%n] else {continue}
                let cheek=outlet.pocketWidth/2...outlet.pocketWidth/2+CableOutlet.cheek
                let notch=outlet.notchesSkirt ? base+p.depth-outlet.notchTop : Double.infinity
                let across=abs(h+next)/2
                if front { if j==1 && z>notch && across<outlet.notchHalfWidth { solid=false } }
                else if j==1 { if z<outlet.cheekTop && cheek.contains(across) { solid=true } }
                else if j>=2 {
                    // No groove behind the seal: its flange needs a plain wall.
                    if across<cheek.upperBound { solid=true }
                    if across<outlet.window/2 && outlet.windowZ.contains(z) { solid=false }
                }
            }
            rim[ri(i,j,k)]=solid
        } } }
        var builder=CloudMeshBuilder()
        // Faces of the floor around the posts, left to the strain relief.
        var ground=Array(repeating:[[Point3]](),count:clamps.count)
        func floored(_ v:[Point3],_ neighbors:[Bool]) -> [Bool] {
            guard !neighbors[1],abs(v[4].z-base)<1e-9,
                  let index=clamps.firstIndex(where:{$0.stands(on:Array(v[4...]))}) else {return neighbors}
            ground[index].append(Array(v[4...]))
            var neighbors=neighbors
            neighbors[1]=true
            return neighbors
        }
        // Every interface has the same grid edge subdivision on both sides.
        for k in 0..<nz { for j in 0..<ny { for i in 0..<nx where core[ci(i,j,k)] {
            let v=[Point3(x:xs[i],y:ys[j],z:zs[k]),Point3(x:xs[i+1],y:ys[j],z:zs[k]),
                   Point3(x:xs[i+1],y:ys[j+1],z:zs[k]),Point3(x:xs[i],y:ys[j+1],z:zs[k]),
                   Point3(x:xs[i],y:ys[j],z:zs[k+1]),Point3(x:xs[i+1],y:ys[j],z:zs[k+1]),
                   Point3(x:xs[i+1],y:ys[j+1],z:zs[k+1]),Point3(x:xs[i],y:ys[j+1],z:zs[k+1])]
            let floorNeighbor=(zs[k]+zs[k+1])/2<base
            let neighbors=[k>0 && core[ci(i,j,k-1)],k+1<nz && core[ci(i,j,k+1)],
                           j>0 ? core[ci(i,j-1,k)] : floorNeighbor,
                           i+1<nx ? core[ci(i+1,j,k)] : floorNeighbor,
                           j+1<ny ? core[ci(i,j+1,k)] : floorNeighbor,
                           i>0 ? core[ci(i-1,j,k)] : floorNeighbor]
            builder.cell(v,neighbors:floored(v,neighbors))
        } } }
        for k in 0..<nz { for j in 0..<nr { for i in 0..<n where rim[ri(i,j,k)] {
            // Counterclockwise in XY: inner/start, outer/start, outer/end, inner/end.
            let v=[ringPoint(j,i,zs[k]),ringPoint(j+1,i,zs[k]),ringPoint(j+1,i+1,zs[k]),ringPoint(j,i+1,zs[k]),
                   ringPoint(j,i,zs[k+1]),ringPoint(j+1,i,zs[k+1]),ringPoint(j+1,i+1,zs[k+1]),ringPoint(j,i+1,zs[k+1])]
            let neighbors=[k>0 && rim[ri(i,j,k-1)],k+1<nz && rim[ri(i,j,k+1)],rim[ri(i-1,j,k)],
                           j+1<nr && rim[ri(i,j+1,k)],rim[ri(i+1,j,k)],
                           j>0 ? rim[ri(i,j-1,k)] : (zs[k]+zs[k+1])/2<base]
            builder.cell(v,neighbors:floored(v,neighbors))
        } } }
        for (index,clamp) in clamps.enumerated() { clamp.stand(on:ground[index],in:&builder) }
        var mesh=builder.mesh
        if front && p.surface == .sculpted {
            return LampSurfaceGenerator.sculpt(mesh, parameters:p, quality:quality)
        }
        // Print front face down; assembly applies the inverse proper rotation.
        if front {
            mesh.vertices=mesh.vertices.map {Point3(x:$0.x,y:-$0.y,z:$0.z)}
            mesh.triangles=mesh.triangles.map {Triangle(a:$0.a,b:$0.c,c:$0.b)}
        }
        return mesh
    }
}

struct CloudMeshBuilder {
    struct Key: Hashable { let x:Int64,y:Int64,z:Int64 }
    var vertices:[Point3]=[]
    var triangles:[Triangle]=[]
    var indices:[Key:Int]=[:]
    mutating func vertex(_ p:Point3) -> Int {
        let k=Key(x:Int64((p.x*1e7).rounded()),y:Int64((p.y*1e7).rounded()),z:Int64((p.z*1e7).rounded()))
        if let i=indices[k] { return i }
        let i=vertices.count;vertices.append(p);indices[k]=i;return i
    }
    mutating func cell(_ v:[Point3],neighbors:[Bool]) {
        let faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
        for (i,f) in faces.enumerated() where !neighbors[i] {
            let ids=f.map {vertex(v[$0])}
            triangles.append(Triangle(a:ids[0],b:ids[1],c:ids[2]))
            triangles.append(Triangle(a:ids[0],b:ids[2],c:ids[3]))
        }
    }
    var mesh:BalloonMesh {BalloonMesh(vertices:vertices,triangles:triangles,maxOverhang:0)}
}
