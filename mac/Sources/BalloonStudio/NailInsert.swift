import Foundation

/// A slider that narrows the keyhole's slot for a nail with a small head.
/// It goes in through the square entry, flat face towards the wall, and
/// slides up behind the retaining lip into the chamber above. Its own slot
/// is a little wider than the shaft, so the head bears on its plate instead
/// of slipping through the lamp's slot. Two fingers at its sides spring
/// against the chamber's walls and keep it up while the lamp is hung; then
/// the nail holds it against the top of the chamber.
///
/// In its own frame X runs across, Y up the slot from its open end, and Z
/// from the flat face, which rests on the lip, towards the cap. That is how
/// it prints too: flat face on the bed, fingers up.
struct NailInsert: Sendable {
    /// Between the body and the chamber's side walls.
    static let clearance = 0.2
    /// Shorter than the entry is wide, to pass through it.
    static let endPlay = 0.6
    /// The head bears on it.
    static let plate = 1.0
    /// The fingers' reach towards the cap. The plate keeps 0.3 mm of play.
    static let depth = CloudGenerator.Layout.headSpace-0.3
    static let finger = 0.7
    /// Between a finger and the plate, at the finger's root.
    static let slit = 0.6
    /// How far the relaxed finger tips stand beyond the chamber's walls.
    static let spring = 0.2
    /// Around the shaft, either side.
    static let play = 0.2
    /// Off the fingers' outer back edges and the top's front edge: they
    /// start the insert into the entry and behind the lip.
    static let chamfer = 0.4
    /// Lead-in for the head on the plate's lower back edge.
    static let ramp = 0.5
    /// Over this height the slot's mouth narrows from the lamp's slot.
    static let mouth = 1.0
    /// Plate above the end of the slot.
    static let crown = 1.8
    /// Solid band the fingers and the plate hang from.
    static let band = 1.5
    /// Least overlap of the head on the plate, either side.
    static let grip = 0.3
    /// Beside the slot, and at the mouth.
    static let cheekWidth = 0.8
    static let mouthCheek = 0.5

    let parameters: CloudParameters
    /// Half the body's width, clear of the chamber's walls.
    let halfWidth: Double
    /// Half the width across the relaxed finger tips.
    let tipHalfWidth: Double
    let height: Double
    let slotHalfWidth: Double
    let mouthHalfWidth: Double
    /// Outer edge of the plate beside the slot.
    let cheek: Double
    /// Half the lamp's own slot.
    private let lampSlot: Double
    /// The top of the chamber, in the back's frame. The insert's top rests
    /// against it.
    let top: Double

    /// Nil where the pocket is too small for the insert, or where the nail
    /// does not need it or cannot use it.
    init?(_ p: CloudParameters) {
        self.init(unchecked:p)
        if problem != nil { return nil }
    }
    private init(unchecked p: CloudParameters) {
        let l = CloudGenerator.Layout(p:p)
        parameters = p
        let entry = l.head.x1-l.head.x0
        halfWidth = entry/2-Self.clearance
        tipHalfWidth = entry/2+Self.spring
        height = min(entry-Self.endPlay, CloudGenerator.Layout.slotLength)
        slotHalfWidth = p.nailDiameter/2+Self.play
        cheek = halfWidth-Self.finger-Self.slit
        lampSlot = (l.slot.x1-l.slot.x0)/2
        mouthHalfWidth = min(lampSlot, cheek-Self.mouthCheek)
        top = l.slot.y1
    }

    static func problem(_ p: CloudParameters) -> String? { Self(unchecked:p).problem }
    /// Why the insert does not suit this keyhole and nail, if it does not.
    var problem: String? {
        func mm(_ v: Double) -> String { String(format:"%.1f", locale:Locale(identifier:"en_US_POSIX"), v) }
        let p = parameters, head = p.nailHeadDiameter/2
        if slotHalfWidth+0.25 > lampSlot {
            return "A \(mm(p.nailDiameter)) mm shaft is too thick for the insert to narrow the \(mm(p.nailShaft)) mm slot."
        }
        if head-slotHalfWidth < Self.grip {
            return "A \(mm(p.nailHeadDiameter)) mm head is too small for a \(mm(p.nailDiameter)) mm shaft: the insert needs a head of \(mm(2*(slotHalfWidth+Self.grip))) mm or more."
        }
        if cheek-slotHalfWidth < Self.cheekWidth || mouthHalfWidth <= slotHalfWidth || slotCenter-Self.mouth < 0.3 {
            return "The keyhole is too small for the insert. Give it a larger head clearance, 8 mm for instance."
        }
        if head+0.3 > cheek || nailY-head-(top-height) < Self.ramp {
            return "A head over \(mm(2*(cheek-0.3))) mm does not fit between the insert's fingers in this keyhole."
        }
        return nil
    }

    /// Center of the slot's round end, in the insert's frame.
    var slotCenter: Double { height-Self.crown-slotHalfWidth }
    /// The shaft at rest against the end of the slot, in the back's frame.
    var nailY: Double { top-Self.crown-parameters.nailDiameter/2 }
    /// The underside of the head stands this far off the wall at least,
    /// with the plate on the lip.
    var nearestHead: Double { CloudGenerator.Layout.lip+Self.plate }
    /// Room for the head behind the plate, to the cap.
    var headRoom: Double { CloudGenerator.Layout.headSpace-Self.plate }

    /// As it sits in the back, flat face on the lip, top against the top of
    /// the chamber. Exploded, it waits behind the wall side.
    func placed(_ mesh: BalloonMesh, exploded: Bool = false) -> BalloonMesh {
        var m = mesh
        let dy = top-height, dz = CloudGenerator.Layout.lip-(exploded ? 14 : 0)
        m.vertices = mesh.vertices.map { Point3(x:$0.x, y:$0.y+dy, z:$0.z+dz) }
        return m
    }
}

/// Hexahedral cells on a mapped grid, in two layers: the plate, and the
/// fingers above it. Columns follow the leaning fingers, the slits, the
/// slot's flared mouth and its round end; rows are horizontal lines.
enum NailInsertGenerator {
    static func generate(_ insert: NailInsert) -> BalloonMesh {
        let a=insert.slotHalfWidth, h=insert.height, rise=h-NailInsert.band, center=insert.slotCenter
        let rows=[0,NailInsert.ramp,NailInsert.mouth,center,rise,h-NailInsert.chamfer,h]
        // The slot's round end is the row at its center, bent up over these columns.
        let arc=12, arcRow=3, last=rows.count-1
        func outer(_ y:Double) -> Double { insert.halfWidth+(insert.tipHalfWidth-insert.halfWidth)*max(0,1-y/rise) }
        func mouth(_ y:Double) -> Double {
            y >= NailInsert.mouth ? a : insert.mouthHalfWidth+(a-insert.mouthHalfWidth)*y/NailInsert.mouth
        }
        // From the outside in: finger tip, chamfer, finger's inner edge, plate's edge.
        let side:[(Double)->Double]=[outer,{outer($0)-NailInsert.chamfer},{outer($0)-NailInsert.finger},{_ in insert.cheek}]
        let slotStart=side.count, slotEnd=slotStart+arc, lines=2*side.count+arc+1
        // Above the round end the slot's lines rise straight from it, so its
        // cells keep convex faces.
        func point(_ i:Int,_ r:Int) -> (Double,Double) {
            let y=rows[r]
            if i >= slotStart && i <= slotEnd {
                let angle=Double.pi*(1-Double(i-slotStart)/Double(arc))
                if r == arcRow { return (a*cos(angle),center+a*sin(angle)) }
                if r > arcRow || (i > slotStart && i < slotEnd) { return (a*cos(angle),y) }
                return (i == slotStart ? -mouth(y) : mouth(y),y)
            }
            return i < slotStart ? (-side[i](y),y) : (side[lines-1-i](y),y)
        }
        func z(_ i:Int,_ r:Int,_ level:Int) -> Double {
            switch level {
            case 0: return r == last ? NailInsert.chamfer : 0
            case 1: return r == 0 && i >= slotStart-1 && i <= slotEnd+1 ? NailInsert.plate-NailInsert.ramp : NailInsert.plate
            default: return i == 0 || i == lines-1 ? NailInsert.depth-NailInsert.chamfer : NailInsert.depth
            }
        }
        // Columns: finger (two), slit, plate, the slot's columns, and mirrored.
        let columns=lines-1, band=rows.firstIndex(of:rise)!
        func solid(_ c:Int,_ r:Int,_ k:Int) -> Bool {
            guard c >= 0 && c < columns && r >= 0 && r < rows.count-1 && k >= 0 && k < 2 else { return false }
            let fromEdge=min(c,columns-1-c)
            switch fromEdge {
            case 0,1: return true
            case 2: return r >= band
            case 3: return k == 0
            default: return k == 0 && r >= arcRow
            }
        }
        var builder=CloudMeshBuilder()
        for k in 0..<2 { for r in 0..<rows.count-1 { for c in 0..<columns where solid(c,r,k) {
            let corners=[(c,r),(c+1,r),(c+1,r+1),(c,r+1)]
            let v=[k,k+1].flatMap { level in corners.map { i,row in
                let (x,y)=point(i,row)
                return Point3(x:x,y:y,z:z(i,row,level))
            } }
            builder.cell(v,neighbors:[solid(c,r,k-1),solid(c,r,k+1),solid(c,r-1,k),solid(c+1,r,k),solid(c,r+1,k),solid(c-1,r,k)])
        } } }
        return builder.mesh
    }
}
