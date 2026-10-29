import Foundation

/// A screwed strain relief, just behind the cable seal. Two posts on the
/// floor flank the way the seal slides in. With the seal home, an anvil
/// drops between the posts, under the cable, and a bar is screwed down onto
/// the posts. Staggered ribs on bar and anvil hold the jacket. The posts
/// stop the bar: the cable is squeezed by a set amount, however hard the
/// screws are turned.
///
/// The clamp stands on the floor the seal keeps free anyway. Window, pocket,
/// seal and front are the same with and without it.
///
/// Dimensions use the outlet's frame: `t` along the cable from the lamp's
/// origin, `h` across it, and Z from the wall side of the back. The clamp's
/// own `u` runs along the cable from the inner end of the posts.
struct CableClamp: Sendable {
    /// Two M3 screws with a pan or a button head form their own thread.
    static let screw = 3.0
    static let screwLength = 10.0
    static let headDiameter = 6.0
    static let headHeight = 2.6
    /// Printed hole the thread is formed in, and its wider mouth.
    static let pilot = 2.8
    static let mouth = 3.4
    static let mouthDepth = 0.4
    /// Hole through the bar.
    static let passage = 3.4
    /// Floor left beneath a pilot hole.
    static let holeFloor = 1.2
    /// Square posts, and their least height above the floor.
    static let post = 7.0
    static let postHeight = 6.0
    /// Floor between the posts and the pocket's mouth.
    static let gap = 3.2
    /// Either side of the seal on its way between the posts.
    static let play = 0.4
    /// The bar under the screw heads. Between them it is as tall as they are.
    static let bar = 3.0
    /// The ribs squeeze the cable to this share of its diameter.
    static let pinch = 0.8
    /// Flat tip of a rib, with flanks at 45°, and the distance from an
    /// anvil's rib to the next one on the bar.
    static let ribTip = 0.6
    static let ribPitch = 1.5
    /// Anvil: play around the posts, its cross bars before and behind
    /// them, and how far these reach beside the channel.
    static let fit = 0.3
    static let crossBar = 1.5
    static let shoulder = 3.0
    /// Rails on the anvil keep the cable in line with the seal's bore.
    static let rail = 1.0
    static let railRoom = 0.7
    /// The bar's tongue passes between the rails.
    static let tongueRoom = 0.4
    /// Clearance to the ordinary skirt and nail pocket, and under the diffuser.
    static let skirtRoom = 1.5
    /// The 0.8 mm inward root reinforcement uses part of the original skirt
    /// clearance. Keep 0.7 mm at the root and 1.1 mm at the working beam,
    /// preserving the existing clamp placement and matching printed backs.
    static let clipRoom = 0.7
    static let headRoom = 0.4
    /// The floor's surface is laid anew this far around the posts.
    static let ground = 0.5
    static let segments = 24

    let parameters: CloudParameters
    let outlet: CableOutlet

    /// Nil where the lamp has no room for it, or where it is not wanted.
    init?(_ p: CloudParameters) {
        guard p.strainRelief else { return nil }
        self.init(unchecked:p)
        guard fits else { return nil }
    }
    /// The clamp as it would be, whether or not the lamp has room for it.
    init(unchecked p: CloudParameters) {
        parameters = p
        outlet = CableOutlet(p)
    }

    var cable: Double { parameters.cableDiameter }
    /// Way between the posts.
    var channel: Double { outlet.sealWidth+2*Self.play }
    var inner: Double { channel/2 }
    var outer: Double { inner+Self.post }
    /// The posts along the cable.
    var end: Double { outlet.seat-Self.gap }
    var start: Double { end-Self.post }
    /// Axis of a screw: along the cable, and to either side of it.
    var screwT: Double { start+Self.post/2 }
    var screwH: Double { inner+Self.post/2 }

    var rib: Double { min(0.6, max(0.4, 0.1*cable)) }
    /// The cable's underside above the floor, in line with the seal's bore.
    var rest: Double { outlet.axisZ-cable/2-CloudParameters.floor }
    /// Flat of the bar's tongue, with the bar down on the posts.
    var barFlat: Double { CloudParameters.floor+rest+Self.pinch*cable }
    var postTop: Double {
        let least = CloudParameters.floor+Self.postHeight
        return barFlat > least-0.2 ? barFlat : least
    }
    var tongue: Double { postTop-barFlat }
    var tongueHalfWidth: Double { cable/2+Self.tongueRoom }
    var holeDepth: Double { postTop-Self.holeFloor }
    /// Thread in the post with the bar down.
    var engagement: Double { Self.screwLength-Self.bar }
    /// Top of the screw heads.
    var top: Double { postTop+Self.bar+Self.headHeight }

    // Anvil, in the clamp's own frame.
    var anvilStart: Double { -Self.fit-Self.crossBar }
    var anvilEnd: Double { Self.post+Self.fit+Self.crossBar }
    var anvilHalfWidth: Double { inner-Self.fit }
    var shoulderHalfWidth: Double { inner+Self.shoulder }
    var railInner: Double { cable/2+Self.railRoom }
    var railTop: Double { rest+cable/2 }
    var anvilRibs: [Double] { [0.5, 3.5, 6.5] }
    var barRibs: [Double] { [2, 5] }

    private func rectangle(_ t: ClosedRange<Double>, _ h: ClosedRange<Double>) -> [(Double, Double)] {
        [outlet.point(t.lowerBound, h.lowerBound), outlet.point(t.upperBound, h.lowerBound),
         outlet.point(t.upperBound, h.upperBound), outlet.point(t.lowerBound, h.upperBound)]
    }
    /// The posts as seen from the front, counterclockwise.
    var posts: [[(Double, Double)]] { [rectangle(start...end, inner...outer), rectangle(start...end, (-outer)...(-inner))] }
    var anvilOutline: [(Double, Double)] {
        rectangle((start+anvilStart)...(start+anvilEnd), (-shoulderHalfWidth)...shoulderHalfWidth)
    }
    /// Posts and anvil, for the LED plan.
    var outlines: [[(Double, Double)]] {
        posts+[rectangle((start+anvilStart)...(start+anvilEnd), (-anvilHalfWidth)...anvilHalfWidth)]
    }
    /// Floor under the bar, and a little around it.
    private var groundOutline: [(Double, Double)] {
        rectangle((start-Self.ground)...(end+Self.ground), (-outer-Self.ground)...(outer+Self.ground))
    }
    /// No LEDs under the clamp, nor where the seal is slid in.
    var keepOut: CloudGenerator.Rect {
        let pocket = outlet.keepOut, half = outer+0.5
        let corners = rectangle((outlet.seat-CableOutlet.landing)...outlet.seat, (-half)...half)
        return .init(x0:min(pocket.x0, corners.map(\.0).min()!), x1:max(pocket.x1, corners.map(\.0).max()!),
                     y0:min(pocket.y0, corners.map(\.1).min()!), y1:max(pocket.y1, corners.map(\.1).max()!))
    }

    /// Whether two convex outlines share a point.
    private static func overlap(_ a: [(Double, Double)], _ b: [(Double, Double)]) -> Bool {
        for outline in [a, b] { for i in outline.indices {
            let p = outline[i], q = outline[(i+1)%outline.count], x = -(q.1-p.1), y = q.0-p.0
            guard hypot(x, y) > 1e-12 else { continue }
            let first = a.map { $0.0*x+$0.1*y }, second = b.map { $0.0*x+$0.1*y }
            if first.max()! < second.min()! || second.max()! < first.min()! { return false }
        } }
        return true
    }
    /// A face of the floor that the posts' ground takes over.
    func stands(on face: [Point3]) -> Bool { Self.overlap(face.map { ($0.x, $0.y) }, groundOutline) }

    /// Room under the diffuser and inside the skirt, on free floor away
    /// from the nail pocket, with the seal's whole way in before it.
    var fits: Bool {
        let p = parameters, boss = CloudGenerator.Layout(p:p).nailBoss.expanded(Self.skirtRoom)
        guard top <= p.depth-Self.headRoom, outlet.landing >= CableOutlet.landing-1e-9 else { return false }
        let nail = [(boss.x0, boss.y0), (boss.x1, boss.y0), (boss.x1, boss.y1), (boss.x0, boss.y1)]
        guard !Self.overlap(nail, groundOutline), !Self.overlap(nail, anvilOutline) else { return false }
        let inset = CloudParameters.wall+p.clipFit+LampClipGeometry.rootThickness+Self.clipRoom
        let areas = [(start...end, outer), ((start+anvilStart)...(start+anvilEnd), shoulderHalfWidth)]
        for (along, half) in areas {
            let steps = Int(ceil(max(along.upperBound-along.lowerBound, 2*half)))
            for i in 0...steps {
                let u = Double(i)/Double(steps), t = along.lowerBound+(along.upperBound-along.lowerBound)*u
                for (t, h) in [(t, -half), (t, half), (along.lowerBound, half*(2*u-1)), (along.upperBound, half*(2*u-1))] {
                    guard t > 0, outlet.inside(t, h, inset:inset) else { return false }
                }
            }
        }
        return true
    }

    /// The narrowest lamp of this design that has room for the clamp.
    static func minimumWidth(_ p: CloudParameters) -> Double? {
        var q = p
        q.strainRelief = true
        for width in stride(from:p.minimumWidth, through:500, by:1) {
            q.width = width
            if CableClamp(q.normalized()) != nil { return width }
        }
        return nil
    }

    /// Lays the floor's surface anew around the posts and stands them in
    /// it, each with a blind hole for a screw to form its thread in.
    /// `ground` holds the faces the floor's cells have left out.
    func stand(on ground: [[Point3]], in builder: inout CloudMeshBuilder) {
        struct Edge: Hashable { let a: Int, b: Int }
        let floor = CloudParameters.floor
        // Points within the ground are left out: they take no part in the mesh.
        var found: [Point3] = [], known: [CloudMeshBuilder.Key: Int] = [:]
        let faces = ground.map { face in
            face.map { point -> Int in
                let key = CloudMeshBuilder.Key(x:Int64((point.x*1e7).rounded()), y:Int64((point.y*1e7).rounded()),
                                               z:Int64((point.z*1e7).rounded()))
                if let index = known[key] { return index }
                known[key] = found.count
                found.append(point)
                return found.count-1
            }
        }
        var edges = Set<Edge>()
        for face in faces { for i in face.indices {
            let edge = Edge(a:face[i], b:face[(i+1)%face.count])
            if edges.remove(Edge(a:edge.b, b:edge.a)) == nil { edges.insert(edge) }
        } }
        var next: [Int: Int] = [:]
        for edge in edges { next[edge.a] = edge.b }
        var outline: [Int] = []
        // Start at the same point every time: a set has no order of its own,
        // and the triangles of the floor depend on where the outline begins.
        if let first = edges.map(\.a).min(), next.count == edges.count {
            var at = first
            repeat { outline.append(at); at = next[at] ?? first } while at != first && outline.count <= edges.count
        }
        let corners = posts.map { $0.map { Point3(x:$0.0, y:$0.1, z:floor) } }
        var points = outline.map { (found[$0].x, found[$0].y) }
        let holes = posts.map { post -> [Int] in
            points += post
            return Array(((points.count-4)..<points.count).reversed())
        }
        guard outline.count == edges.count,
              let triangles = FlatRegion.triangles(outline:Array(outline.indices), holes:holes, points:points) else {
            // Without room for them the floor stays as it was.
            assertionFailure("No ground for the strain relief")
            for face in ground {
                let ids = face.map { builder.vertex($0) }
                builder.triangles += [Triangle(a:ids[0], b:ids[1], c:ids[2]), Triangle(a:ids[0], b:ids[2], c:ids[3])]
            }
            return
        }
        let ids = (outline.map { found[$0] }+corners.flatMap { $0 }).map { builder.vertex($0) }
        builder.triangles += triangles.map { Triangle(a:ids[$0.0], b:ids[$0.1], c:ids[$0.2]) }
        for (index, post) in corners.enumerated() {
            let top = post.map { Point3(x:$0.x, y:$0.y, z:postTop) }
            for i in post.indices {
                let k = (i+1)%post.count
                let wall = [post[i], post[k], top[k], top[i]].map { builder.vertex($0) }
                builder.triangles += [Triangle(a:wall[0], b:wall[1], c:wall[2]), Triangle(a:wall[0], b:wall[2], c:wall[3])]
            }
            let h = index == 0 ? screwH : -screwH
            let center = outlet.point(screwT, h)
            func circle(_ diameter: Double, _ z: Double) -> [(Point3, Double)] {
                CableClampGenerator.circle(diameter/2, u:screwT, h:h, z:z).map { (outlet.point($0.0.x, $0.0.y, z), $0.1+outlet.angle) }
            }
            let mouth = circle(Self.mouth, postTop), neck = circle(Self.pilot, postTop-Self.mouthDepth)
            let bottom = circle(Self.pilot, Self.holeFloor)
            builder.annulus(top.map { ($0, atan2($0.y-center.1, $0.x-center.0)) }, mouth)
            builder.bore(mouth.map(\.0), neck.map(\.0))
            builder.bore(neck.map(\.0), bottom.map(\.0))
            builder.disk(bottom.map(\.0), center:Point3(x:center.0, y:center.1, z:Self.holeFloor))
        }
    }
}

/// Triangles of a flat region with holes in it, by ear clipping. Only
/// the points given are used, so the faces around the region stay whole.
enum FlatRegion {
    typealias Point = (Double, Double)
    private static let near = 1e-7

    private static func cross(_ a: Point, _ b: Point, _ c: Point) -> Double {
        (b.0-a.0)*(c.1-a.1)-(b.1-a.1)*(c.0-a.0)
    }
    private static func same(_ a: Point, _ b: Point) -> Bool { abs(a.0-b.0) < near && abs(a.1-b.1) < near }
    /// On the segment, its ends included.
    private static func on(_ a: Point, _ b: Point, _ p: Point) -> Bool {
        let length = hypot(b.0-a.0, b.1-a.1)
        guard length > near else { return same(a, p) }
        let along = ((p.0-a.0)*(b.0-a.0)+(p.1-a.1)*(b.1-a.1))/length
        return abs(cross(a, b, p))/length < near && along > -near && along < length+near
    }
    private static func meet(_ a: Point, _ b: Point, _ c: Point, _ d: Point) -> Bool {
        let s = (cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b))
        if s.0*s.1 < 0 && s.2*s.3 < 0 { return true }
        return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)
    }
    private static func inside(_ p: Point, _ outline: [Point]) -> Bool {
        var inside = false
        for i in outline.indices {
            let a = outline[i], b = outline[(i+1)%outline.count]
            if (a.1 > p.1) != (b.1 > p.1) && p.0 < a.0+(b.0-a.0)*(p.1-a.1)/(b.1-a.1) { inside.toggle() }
        }
        return inside
    }
    /// A corner that stands out of the line through its neighbors.
    private static func corner(_ a: Point, _ b: Point, _ c: Point) -> Bool {
        cross(a, b, c) > 1e-6*max(hypot(c.0-a.0, c.1-a.1), hypot(b.0-a.0, b.1-a.1), hypot(c.0-b.0, c.1-b.1), 1e-3)
    }
    /// In the triangle or on its sides.
    private static func within(_ p: Point, _ a: Point, _ b: Point, _ c: Point) -> Bool {
        func side(_ a: Point, _ b: Point) -> Double { cross(a, b, p)/max(hypot(b.0-a.0, b.1-a.1), near) }
        return side(a, b) > -near && side(b, c) > -near && side(c, a) > -near
    }

    /// The outline runs counterclockwise, the holes clockwise, each a
    /// list of indices into `points`. Nil where no triangles can be found.
    static func triangles(outline: [Int], holes: [[Int]], points: [Point]) -> [(Int, Int, Int)]? {
        var ring = outline
        // A cut from each hole to the outline makes one ring of them.
        for (index, hole) in holes.enumerated() {
            let others = holes[index...].flatMap { hole in
                hole.indices.map { (hole[$0], hole[($0+1)%hole.count]) }
            }
            let sides = ring.indices.map { (ring[$0], ring[($0+1)%ring.count]) }+others
            var cuts: [(Double, Int, Int)] = []
            for i in hole.indices { for j in ring.indices where ring.filter({ same(points[$0], points[ring[j]]) }).count == 1 {
                let a = points[hole[i]], b = points[ring[j]]
                cuts.append((hypot(a.0-b.0, a.1-b.1), i, j))
            } }
            guard let cut = cuts.sorted(by:{ $0.0 < $1.0 }).first(where: { _, i, j in
                let a = points[hole[i]], b = points[ring[j]], middle = ((a.0+b.0)/2, (a.1+b.1)/2)
                guard inside(middle, ring.map { points[$0] }), !inside(middle, hole.map { points[$0] }) else { return false }
                return !sides.contains { side in
                    let c = points[side.0], d = points[side.1]
                    if same(c, a) || same(d, a) || same(c, b) || same(d, b) { return false }
                    return meet(a, b, c, d)
                }
            }) else { return nil }
            let turned = (0...hole.count).map { hole[(cut.1+$0)%hole.count] }
            ring = Array(ring[...cut.2])+turned+Array(ring[cut.2...])
        }
        var result: [(Int, Int, Int)] = []
        while ring.count > 3 {
            let n = ring.count
            let ear = (0..<n).first { i in
                let a = points[ring[(i+n-1)%n]], b = points[ring[i]], c = points[ring[(i+1)%n]]
                guard corner(a, b, c) else { return false }
                return !ring.contains { index in
                    let p = points[index]
                    return !same(p, a) && !same(p, b) && !same(p, c) && within(p, a, b, c)
                }
            }
            guard let ear else { return nil }
            result.append((ring[(ear+n-1)%n], ring[ear], ring[(ear+1)%n]))
            ring.remove(at:ear)
        }
        guard corner(points[ring[0]], points[ring[1]], points[ring[2]]) else { return nil }
        result.append((ring[0], ring[1], ring[2]))
        return result
    }
}

extension CloudMeshBuilder {
    /// A flat face between an outline and a round hole in it. Both run
    /// counterclockwise as seen against the face, each point with its
    /// angle around the hole. `flipped` faces the other way.
    mutating func annulus(_ outline: [(Point3, Double)], _ hole: [(Point3, Double)], flipped: Bool = false) {
        let turn = 2*Double.pi, m = outline.count, n = hole.count
        func ahead(_ a: Double, of b: Double) -> Double {
            let d = (a-b).truncatingRemainder(dividingBy:turn)
            return d < 0 ? d+turn : d
        }
        let origin = outline[0].1
        let first = hole.indices.min {
            abs((hole[$0].1-origin).remainder(dividingBy:turn)) < abs((hole[$1].1-origin).remainder(dividingBy:turn))
        }!
        let base = (hole[first].1-origin).remainder(dividingBy:turn)
        let outer = (0...m).map { $0 == m ? turn : ahead(outline[$0].1, of:origin) }
        let inner = (0...n).map { $0 == n ? base+turn : base+ahead(hole[(first+$0)%n].1, of:hole[first].1) }
        func face(_ a: Point3, _ b: Point3, _ c: Point3) {
            let ids = (flipped ? [a, c, b] : [a, b, c]).map { vertex($0) }
            triangles.append(Triangle(a:ids[0], b:ids[1], c:ids[2]))
        }
        // Each point of the hole goes to the nearest point of the outline.
        var i = 0, j = 0
        while i < m || j < n {
            if j < n && (i == m || inner[j+1] <= (outer[i]+outer[i+1])/2) {
                face(outline[i%m].0, hole[(first+j+1)%n].0, hole[(first+j)%n].0)
                j += 1
            } else {
                face(outline[i%m].0, outline[(i+1)%m].0, hole[(first+j)%n].0)
                i += 1
            }
        }
    }
    /// The wall of a round hole between two of its rims, facing the axis.
    mutating func bore(_ upper: [Point3], _ lower: [Point3]) {
        for i in upper.indices {
            let k = (i+1)%upper.count
            let ids = [upper[i], upper[k], lower[k], lower[i]].map { vertex($0) }
            triangles.append(Triangle(a:ids[0], b:ids[1], c:ids[2]))
            triangles.append(Triangle(a:ids[0], b:ids[2], c:ids[3]))
        }
    }
    /// The closed end of a blind hole, facing up.
    mutating func disk(_ rim: [Point3], center: Point3) {
        let c = vertex(center)
        for i in rim.indices {
            triangles.append(Triangle(a:c, b:vertex(rim[i]), c:vertex(rim[(i+1)%rim.count])))
        }
    }
}

/// Bar and anvil are boxes on a grid, with tapered ribs and round holes.
/// Both are built where they sit, in the clamp's frame, then laid down
/// for printing.
enum CableClampGenerator {
    private static func unique(_ values: [Double]) -> [Double] {
        values.sorted().reduce(into:[]) { result, value in
            if result.last.map({ abs($0-value) > 1e-7 }) ?? true { result.append(value) }
        }
    }
    /// Ribs across the cable, in one layer of the grid. Their flanks rise
    /// at 45° to a narrower face, above or below.
    private struct Ribs {
        let spans: [ClosedRange<Double>]
        let layer: ClosedRange<Double>
        let halfWidth: Double
        let flank: Double
        let narrowAbove: Bool
        func contains(_ u: Double, _ h: Double, _ z: Double) -> Bool {
            layer.contains(z) && abs(h) < halfWidth && spans.contains { $0.contains(u) }
        }
        /// Where a grid line of the wide face meets the narrow one.
        func narrowed(_ u: Double, within center: Double) -> Double {
            let span = spans.first { $0.contains(center) }!, width = span.upperBound-span.lowerBound
            return span.lowerBound+flank+(u-span.lowerBound)*(width-2*flank)/width
        }
    }
    /// `open` leaves a cell's lower and upper face to a round hole.
    private static func blocks(_ us: [Double], _ hs: [Double], _ zs: [Double], ribs: Ribs,
                               solid: (Double, Double, Double) -> Bool,
                               open: (Double, Double, Double) -> Bool = { _, _, _ in false }) -> CloudMeshBuilder {
        let us = unique(us+ribs.spans.flatMap { [$0.lowerBound, $0.upperBound] }), hs = unique(hs), zs = unique(zs)
        let nu = us.count-1, nh = hs.count-1, nz = zs.count-1
        func center(_ i: Int, _ j: Int, _ k: Int) -> (Double, Double, Double) {
            ((us[i]+us[i+1])/2, (hs[j]+hs[j+1])/2, (zs[k]+zs[k+1])/2)
        }
        func filled(_ i: Int, _ j: Int, _ k: Int) -> Bool {
            guard i >= 0, j >= 0, k >= 0, i < nu, j < nh, k < nz else { return false }
            let c = center(i, j, k)
            return ribs.contains(c.0, c.1, c.2) || solid(c.0, c.1, c.2)
        }
        var builder = CloudMeshBuilder()
        for k in 0..<nz { for j in 0..<nh { for i in 0..<nu where filled(i, j, k) {
            let c = center(i, j, k), hole = open(c.0, c.1, c.2)
            var low = [us[i], us[i+1]], high = low
            if ribs.contains(c.0, c.1, c.2) {
                let narrow = low.map { ribs.narrowed($0, within:c.0) }
                if ribs.narrowAbove { high = narrow } else { low = narrow }
            }
            let v = [(low[0], hs[j], zs[k]), (low[1], hs[j], zs[k]), (low[1], hs[j+1], zs[k]), (low[0], hs[j+1], zs[k]),
                     (high[0], hs[j], zs[k+1]), (high[1], hs[j], zs[k+1]), (high[1], hs[j+1], zs[k+1]),
                     (high[0], hs[j+1], zs[k+1])].map { Point3(x:$0.0, y:$0.1, z:$0.2) }
            builder.cell(v, neighbors:[hole || filled(i, j, k-1), hole || filled(i, j, k+1), filled(i, j-1, k),
                                       filled(i+1, j, k), filled(i, j+1, k), filled(i-1, j, k)])
        } } }
        return builder
    }
    private static func spans(_ centers: [Double], _ c: CableClamp) -> [ClosedRange<Double>] {
        centers.map { ($0-CableClamp.ribTip/2-c.rib)...($0+CableClamp.ribTip/2+c.rib) }
    }
    static func circle(_ radius: Double, u: Double, h: Double, z: Double) -> [(Point3, Double)] {
        (0..<CableClamp.segments).map {
            let a = (Double($0)+0.5)*2*Double.pi/Double(CableClamp.segments)
            return (Point3(x:u+radius*cos(a), y:h+radius*sin(a), z:z), a)
        }
    }

    /// Lies on the floor between the posts: Z from the floor.
    static func seatedAnvil(_ c: CableClamp) -> BalloonMesh {
        let flat = c.rest-c.rib
        let ribs = Ribs(spans:spans(c.anvilRibs, c), layer:flat...c.rest, halfWidth:c.tongueHalfWidth,
                        flank:c.rib, narrowAbove:true)
        let bars = [c.anvilStart...(-CableClamp.fit), (CableClamp.post+CableClamp.fit)...c.anvilEnd]
        let rails = c.railInner...(c.railInner+CableClamp.rail)
        let us = [c.anvilStart, c.anvilEnd]+bars.flatMap { [$0.lowerBound, $0.upperBound] }
        let halves = [c.shoulderHalfWidth, c.anvilHalfWidth, rails.upperBound, rails.lowerBound, c.tongueHalfWidth]
        return blocks(us, halves+halves.map { -$0 }, [0, flat, c.rest, c.railTop], ribs:ribs, solid: { u, h, z in
            if z < flat { return abs(h) < c.anvilHalfWidth || bars.contains { $0.contains(u) } }
            return rails.contains(abs(h))
        }).mesh
    }

    /// Rests on the posts: Z from their tops.
    static func seatedBar(_ c: CableClamp) -> BalloonMesh {
        let post = CableClamp.post, crown = CableClamp.bar+CableClamp.headHeight
        let ribs = Ribs(spans:spans(c.barRibs, c), layer:(-c.tongue-c.rib)...(-c.tongue), halfWidth:c.tongueHalfWidth,
                        flank:c.rib, narrowAbove:false)
        let halves = [c.outer, c.inner, c.tongueHalfWidth]
        let zs = [-c.tongue-c.rib, -c.tongue, 0, CableClamp.bar, crown]
        var builder = blocks([0, post], halves+halves.map { -$0 }, zs, ribs:ribs, solid: { _, h, z in
            if z > CableClamp.bar { return abs(h) < c.inner }
            return z > 0 || (z > -c.tongue && abs(h) < c.tongueHalfWidth)
        }, open: { _, h, z in
            z > 0 && z < CableClamp.bar && abs(h) > c.inner
        })
        // Round holes for the screws, through the bar's ends.
        let along = unique([0, post]+ribs.spans.flatMap { [$0.lowerBound, $0.upperBound] })
        for side in [-1.0, 1] {
            let near = side > 0 ? c.inner : -c.outer, far = side > 0 ? c.outer : -c.inner
            let h = side*c.screwH, u = post/2, radius = CableClamp.passage/2
            func outline(_ z: Double) -> [(Point3, Double)] {
                (along.map { ($0, near) }+along.reversed().map { ($0, far) }).map {
                    (Point3(x:$0.0, y:$0.1, z:z), atan2($0.1-h, $0.0-u))
                }
            }
            let upper = circle(radius, u:u, h:h, z:CableClamp.bar), lower = circle(radius, u:u, h:h, z:0)
            builder.annulus(outline(CableClamp.bar), upper)
            builder.annulus(outline(0), lower, flipped:true)
            builder.bore(upper.map(\.0), lower.map(\.0))
        }
        return builder.mesh
    }

    /// A pan head screw, to show in the preview. Z from under its head.
    static func screw() -> BalloonMesh {
        let head = CableClamp.headDiameter/2-0.2, shaft = CableClamp.screw/2, tall = CableClamp.headHeight-0.2
        let profile = [(head-1, tall), (head, tall-0.8), (head, 0), (shaft, 0), (shaft, -CableClamp.screwLength+0.5),
                       (shaft-0.5, -CableClamp.screwLength)]
        let n = CableClamp.segments
        var mesh = BalloonMesh(vertices:[], triangles:[], maxOverhang:0)
        for (r, z) in profile { for i in 0..<n {
            let a = Double(i)*2*Double.pi/Double(n)
            mesh.vertices.append(Point3(x:r*cos(a), y:r*sin(a), z:z))
        } }
        for row in 0..<profile.count-1 { for i in 0..<n {
            let a = row*n+i, b = row*n+(i+1)%n, c = a+n, d = b+n
            mesh.triangles += [Triangle(a:a, b:d, c:b), Triangle(a:a, b:c, c:d)]
        } }
        let top = mesh.vertices.count, bottom = top+1, last = (profile.count-1)*n
        mesh.vertices += [Point3(x:0, y:0, z:tall), Point3(x:0, y:0, z:-CableClamp.screwLength)]
        for i in 0..<n {
            mesh.triangles.append(Triangle(a:top, b:i, c:(i+1)%n))
            mesh.triangles.append(Triangle(a:bottom, b:last+(i+1)%n, c:last+i))
        }
        return mesh
    }

    /// Printed as it lies in the lamp, ribs up.
    static func anvil(_ p: CloudParameters) -> BalloonMesh {
        let c = CableClamp(unchecked:p)
        var mesh = seatedAnvil(c)
        let middle = (c.anvilStart+c.anvilEnd)/2
        mesh.vertices = mesh.vertices.map { Point3(x:$0.x-middle, y:$0.y, z:$0.z) }
        return mesh
    }
    /// Printed on its side: X across the cable, Y along the lamp's depth,
    /// Z along the cable. The layers run along the bar, and the ribs rise
    /// at 45°.
    static func bar(_ p: CloudParameters) -> BalloonMesh {
        let c = CableClamp(unchecked:p)
        var mesh = seatedBar(c)
        mesh.vertices = mesh.vertices.map { Point3(x:$0.y, y:$0.z-barMiddle(c), z:$0.x) }
        return mesh
    }
    private static func barMiddle(_ c: CableClamp) -> Double {
        (CableClamp.bar+CableClamp.headHeight-c.tongue-c.rib)/2
    }

    /// From the print orientation to the clamp's place in the back.
    static func placedAnvil(_ mesh: BalloonMesh, parameters p: CloudParameters, lifted: Double = 0) -> BalloonMesh {
        let c = CableClamp(unchecked:p), middle = (c.anvilStart+c.anvilEnd)/2
        var placed = mesh
        placed.vertices = mesh.vertices.map {
            c.outlet.point(c.start+$0.x+middle, $0.y, CloudParameters.floor+$0.z+lifted)
        }
        return placed
    }
    static func placedBar(_ mesh: BalloonMesh, parameters p: CloudParameters, lifted: Double = 0) -> BalloonMesh {
        let c = CableClamp(unchecked:p), middle = barMiddle(c)
        var placed = mesh
        placed.vertices = mesh.vertices.map {
            c.outlet.point(c.start+$0.z, $0.x, c.postTop+$0.y+middle+lifted)
        }
        return placed
    }
    static func placedScrews(parameters p: CloudParameters, lifted: Double = 0) -> BalloonMesh {
        let c = CableClamp(unchecked:p), screw = screw()
        var placed = BalloonMesh(vertices:[], triangles:[], maxOverhang:0)
        for side in [-1.0, 1] {
            let offset = placed.vertices.count
            placed.vertices += screw.vertices.map {
                c.outlet.point(c.screwT+$0.x, side*c.screwH+$0.y, c.postTop+CableClamp.bar+$0.z+lifted)
            }
            placed.triangles += screw.triangles.map { Triangle(a:$0.a+offset, b:$0.b+offset, c:$0.c+offset) }
        }
        return placed
    }
    /// Both printed parts side by side, as they lie on the bed.
    static func printView(bar: BalloonMesh, anvil: BalloonMesh) -> BalloonMesh {
        var view = bar
        let shift = bar.dimensions.y/2+anvil.dimensions.x/2+6, offset = view.vertices.count
        view.vertices = bar.vertices.map { Point3(x:$0.x, y:$0.y+shift/2, z:$0.z) }
        view.vertices += anvil.vertices.map { Point3(x:$0.y, y:-$0.x-shift/2, z:$0.z) }
        view.triangles += anvil.triangles.map { Triangle(a:$0.a+offset, b:$0.b+offset, c:$0.c+offset) }
        return view
    }
}
