import Foundation

/// Individual solids are exported; the combined meshes are assembly previews only.
struct SegmentedRingKit:Sendable {
    let parameters:RingParameters
    let guided:BalloonMesh
    let plain:BalloonMesh
    let plate:BalloonMesh
    let pin:BalloonMesh
    static let plateThickness=4.0
    static let plateLength=60.0
    static let pinWidth=4.0
    static let pinOffset=14.0
    var pinAngle:Double {Self.pinOffset/parameters.holeRadius}
    var pinLength:Double {parameters.height+Self.plateThickness-0.4}

    init(_ input:RingParameters,quality:BalloonGenerator.Quality = .preview) {
        var value=input;value.segmented=true
        let p=value.normalized()
        parameters=p
        let angle=Double.pi/6,pinAngle=Self.pinOffset/p.holeRadius
        let pinHoles=[-angle+pinAngle,angle-pinAngle].map {
            RingArc.Hole(angle:$0,clearance:Self.pinWidth+p.jointFit,bevel:0.4)
        }
        guided=RingArc.generate(p,halfAngle:angle,holes:pinHoles+[RingArc.Hole(angle:0,clearance:p.cordClearance,bevel:0.8)],plate:false,quality:quality)
        plain=RingArc.generate(p,halfAngle:angle,holes:pinHoles,plate:false,quality:quality)
        plate=RingArc.generate(p,halfAngle:Self.plateLength/(2*p.holeRadius),holes:[-pinAngle,pinAngle].map {
            RingArc.Hole(angle:$0,clearance:Self.pinWidth+p.jointFit,bevel:0.4)
        },plate:true,quality:quality)
        pin=RingArc.pin(width:Self.pinWidth,length:p.height+Self.plateThickness-0.4)
    }

    var printParts:[(name:String,quantity:Int,mesh:BalloonMesh)] {[
        ("A-cord-guide-print-3.stl",3,Self.onBed(guided,rotation:.pi/4)),
        ("B-plain-section-print-3.stl",3,Self.onBed(plain,rotation:.pi/4)),
        ("C-underside-plate-print-6.stl",6,Self.onBed(plate,rotation:.pi/2)),
        ("D-alignment-pin-print-12.stl",12,pin)
    ]}

    static func transform(_ mesh:BalloonMesh,rotation:Double=0,offset:Point3 = .zero) -> BalloonMesh {
        var copy=mesh
        let c=cos(rotation),s=sin(rotation)
        copy.vertices=mesh.vertices.map {Point3(x:$0.x*c-$0.y*s+offset.x,y:$0.x*s+$0.y*c+offset.y,z:$0.z+offset.z)}
        return copy
    }
    static func onBed(_ mesh:BalloonMesh,rotation:Double) -> BalloonMesh {
        let rotated=transform(mesh,rotation:rotation)
        let xs=rotated.vertices.map(\.x),ys=rotated.vertices.map(\.y),zs=rotated.vertices.map(\.z)
        return transform(rotated,offset:Point3(x:-(xs.min()!+xs.max()!)/2,y:-(ys.min()!+ys.max()!)/2,z:-zs.min()!))
    }
    func assembly(exploded:Bool=false) -> BalloonMesh {
        var output=BalloonMesh(vertices:[],triangles:[],maxOverhang:0)
        func add(_ mesh:BalloonMesh) {
            let start=output.vertices.count
            output.vertices.append(contentsOf:mesh.vertices)
            output.triangles.append(contentsOf:mesh.triangles.map {Triangle(a:$0.a+start,b:$0.b+start,c:$0.c+start)})
        }
        for i in 0..<6 {
            let angle=Double(i)*Double.pi/3,seam=angle+Double.pi/6
            let spread=exploded ? 10.0:0
            add(Self.transform(i%2 == 0 ? guided:plain,rotation:angle,
                               offset:Point3(x:spread*cos(angle),y:spread*sin(angle),z:Self.plateThickness+(exploded ? 12:0))))
            add(Self.transform(plate,rotation:seam))
            for theta in [seam-pinAngle,seam+pinAngle] {
                add(Self.transform(pin,rotation:theta,offset:Point3(x:parameters.holeRadius*cos(theta),y:parameters.holeRadius*sin(theta),z:0.2)))
            }
        }
        return output
    }
    func entries() throws -> [(String,Data)] {
        var entries:[(String,Data)]=[]
        var parts:[[String:Any]]=[]
        for part in printParts {
            let d=part.mesh.dimensions
            guard d.x+16<=256.001,d.y+16<=256.001,d.z<=256 else {throw MeshError.invalid("a ring part does not fit the P2S with an 8 mm brim")}
            entries.append((part.name,try part.mesh.binarySTL()))
            parts.append(["file":part.name,"quantity":part.quantity,"dimensions_mm":[d.x,d.y,d.z]])
        }
        let settings=try JSONSerialization.jsonObject(with:StableJSON.encode(parameters))
        let manifest:[String:Any]=["format_version":2,"units":"millimetres","parameters":settings,"parts":parts,
                                   "led_mount":parameters.reflectedLED ? "vertical_outer_wall_with_white_45_degree_reflector":"flat_top_channel",
                                   "load_rated":false,"rigging":"Three continuous main cords from rated ceiling hardware to the balloons; ring holes guide the cords."]
        entries.append(("kit-manifest.json",try JSONSerialization.data(withJSONObject:manifest,options:[.prettyPrinted,.sortedKeys])))
        entries.append(("ASSEMBLY.md",Data(instructions.utf8)))
        return entries
    }
    func archive() throws -> Data {StoredZIP.archive(try entries())}

    /// Triangle order is preserved by print orientation and assembly transforms.
    func ledFaces(_ mesh:BalloonMesh) -> [Int] {
        parameters.ledFaces(in:mesh)
    }
    var partFaceColors:[[Int]] {[ledFaces(guided),ledFaces(plain),Array(repeating:0,count:plate.triangles.count),Array(repeating:0,count:pin.triangles.count)]}
    var assemblyFaceColors:[Int] {
        let colors=partFaceColors
        return (0..<6).flatMap {colors[$0%2]+colors[2]+colors[3]+colors[3]}
    }

    var instructions:String {
        let p=parameters
        func mm(_ value:Double) -> String {String(format:"%.1f",locale:Locale(identifier:"en_US_POSIX"),value)}
        return """
        # \(Int(p.diameter)) mm mobile ring — six-section PLA prototype

        All STL dimensions are in millimetres. Import at 100%; do not scale the parts.
        The assembled ring is larger than the print bed. Each exported part is already
        centred, rotated to fit a 256 × 256 mm bed, and placed at Z = 0.

        ## Print quantities
        - A-cord-guide-print-3.stl: 3 copies, each with one large central cord guide.
        - B-plain-section-print-3.stl: 3 copies, with only the two small alignment holes.
        - C-underside-plate-print-6.stl: 6 copies, one beneath every seam.
        - D-alignment-pin-print-12.stl: 12 copies, two for each plate.
        There are four unique STL files and 24 physical printed pieces.

        Ring band: \(mm(p.bandWidth)) mm wide × \(mm(p.height)) mm base thickness.
        Full section height including the light mount: \(mm(p.totalHeight)) mm.
        Plates: 60 mm arc length at the pin radius × \(mm(p.bandWidth-2)) mm wide × 4 mm thick.
        Each plate overlaps about 30 mm either side of a seam.
        Assembled height at plates: \(mm(p.totalHeight+4)) mm.
        Guide throat clearance: \(mm(p.cordClearance)) mm, with 0.8 mm bevels at both openings.
        Alignment pins: 4 mm across flats × \(mm(pinLength)) mm long; hole fit allowance
        is \(mm(p.jointFit)) mm total across flats. Pins align the glue-up; they are not locking fasteners.

        ## Print and fit
        Print A and B flat, LED channel up; C flat; D upright on its small flat end.
        No modeled overhang requires support. Inspect the sliced result before printing.
        A starting PLA prototype profile is 0.2 mm layers, 6 walls, 6 top/bottom layers,
        and 40% infill for A/B. Make C/D solid using a slicer modifier or 100% infill.
        These settings are a starting point, not a strength rating.
        Print one C plate and one D pin first to check fit. Adjust Joint fit in the app
        if needed and re-export the entire matching kit. Never force a tight pin into PLA.

        ## Permanent assembly
        1. Dry-fit A–B–A–B–A–B around the circle with all LED channels up. The three
           large cord guides will be 120° apart. Small end holes are for alignment pins only.
        2. Centre a C plate below each seam. Its two holes align with one small hole
           in each neighbouring section. Insert two D pins; they should sit about
           0.2 mm below the outer faces when centred through the plate and ring.
        3. Bond the broad plate-to-ring surfaces, seam faces and alignment pins with
           an adhesive explicitly compatible with your PLA. Follow the adhesive
           manufacturer's surface preparation, bond-gap, clamping and full-cure directions.
           Keep glue out of the three large cord guides and the LED channel.
        4. Hold the assembly flat and circular while curing. Check every seam and
           channel transition. The pins are for registration, not proof of joint strength.

        ## Continuous-cord suspension — read before loading
        Intended arrangement: three balloons estimated at 1 kg each, plus ring and LEDs.
        This is NOT a tested or rated 3 kg assembly.
        Run three separate, continuous main cords from suitable rated ceiling hardware,
        through the three LARGE guides in the A sections, down to the respective balloons.
        Each main cord must stay unbroken through the guide; do not terminate it on the
        printed ring and start a separate balloon cord underneath. Use a stopper/retainer
        below each guide to locate and support the ring's own weight on the main cords.
        Follow the cord maker's guidance for terminations, knots and working loads.
        Keep the three upper legs reasonably steep and balanced: shallow legs increase
        tension and inward guide forces. Allow for ring/LED weight and unequal loading.
        The ring still carries its own weight and lateral guide forces, despite the
        direct cord connection to the balloons. Keep every cord clear of LED components.
        Use proven attachments on each balloon and basket; existing printed eyelets in
        Balloon Studio have NOT been validated for a 1 kg balloon assembly.

        Test the actual printed, bonded and fully rigged assembly at low height over a
        clear area before overhead use. Check joints, cord wear, deformation and LED
        operating temperature under sustained load. Mesh checks only verify geometry;
        they do not establish strength or lifetime. PLA can creep under sustained load.

        ## LED strip
        \(ledInstructions)

        kit-manifest.json records the exact settings and quantities. Settings are saved
        in the app; the balloon STL importer cannot reopen ring parts or this ZIP.
        """
    }

    private var ledInstructions:String {
        let p=parameters
        func mm(_ v:Double) -> String {String(format:"%.1f",locale:Locale(identifier:"en_US_POSIX"),v)}
        let common="""
        Install after gluing and full cure. Smooth the mounting face across every seam.
        Green in the preview marks the mounting surface, not a supplied LED component.
        Approximate mounting path: \(Int(p.stripPathLength.rounded())) mm; final strip length
        must follow its marked cut points. Leave an end gap rather than overlapping or
        folding the tape. Route the lead over the outer rim, secure it against pulling,
        and keep all wiring and joints clear of the suspension cords.
        Check the strip maker's bending, adhesive and cooling requirements. PLA is not
        a heat sink. Test operating temperature with the actual strip and adhesive.
        """
        if !p.reflectedLED {
            return """
            Flat channel: \(mm(p.channelWidth)) mm wide × \(mm(p.channelDepth)) mm deep for
            a \(mm(p.stripWidth)) mm strip. A normal strip cannot follow this curve sideways:
            use a strip explicitly made for that bend direction, or wired straight pieces.
            \(common)
            """
        }
        return """
        CONTINUOUS STRIP / REFLECTED UPLIGHT
        Strip width: \(mm(p.stripWidth)) mm. Vertical mounting allowance: \(mm(p.channelWidth)) mm.
        Thickness allowance: \(mm(p.stripThickness)) mm INCLUDING LEDs, coating and adhesive.
        A 1 mm-high ledge supports the lower edge. The 2.4 mm outer wall and the raised
        inner lip enclose an open-topped trough above the solid \(mm(p.height)) mm base.

        Mount the tape UPRIGHT against the inside of the OUTER wall, with the LEDs
        facing inward toward the white 45° slope. Keep the strip's long edges level:
        it wraps a vertical cylinder in its natural bending direction. Do not stick
        it onto the slope, twist it, or bend it flat around the top of the ring.
        One continuous run bridges all six printed sections after assembly.

        Use white PLA for the reflecting surface. It scatters light broadly; it is
        not a mirror and the drawing is not a prediction of beam angle or brightness.
        The floor and inner lip obstruct direct sight of the LEDs from below. White
        PLA may transmit some glow: hiding the chips does not guarantee a dark underside.
        Print and light one B section first to check clearance, opacity and temperature.
        If the underside must be completely dark, a suitable opaque lining/coating
        may be needed; keep any conductive lining insulated from electrical contacts.

        Use the LED manufacturer's mounting method on the vertical wall. The ledge
        supports the edge but is not a snap lock. Adhesive must suit both the strip and
        PLA. The default 3 mm thickness is an assumption: measure your strip and change
        the app setting before printing if needed. Do not mix parts from older kits;
        changing band width or the light mount also changes pin and guide locations.
        \(common)
        """
    }
}

private enum RingArc {
    struct Hole {let angle:Double;let clearance:Double;let bevel:Double}
    static func generate(_ p:RingParameters,halfAngle:Double,holes:[Hole],plate:Bool,quality:BalloonGenerator.Quality) -> BalloonMesh {
        let r=p.holeRadius,height=plate ? SegmentedRingKit.plateThickness:p.height
        let inner=p.innerRadius+(plate ? 1:0),outer=p.diameter/2-(plate ? 1:0)
        let flangeOuter=plate ? outer:p.flangeOuterRadius
        let spans=holes.map {atan(($0.clearance+2*$0.bevel)/sqrt(2)/r)}
        let steps=Int(ceil(halfAngle/Double.pi*Double(quality == .export ? 720:360)))
        var angles=(0...steps).map {-halfAngle+2*halfAngle*Double($0)/Double(steps)}.filter {angle in
            !zip(holes,spans).contains {abs(angle-$0.0.angle)<$0.1+1e-8}
        }
        for (hole,span) in zip(holes,spans) {angles.append(contentsOf:[hole.angle-span,hole.angle,hole.angle+span])}
        angles.sort()
        let n=angles.count
        var halves=Array(repeating:2.0,count:n),straighten=Array(repeating:0.0,count:n)
        let columns=holes.map {hole in angles.firstIndex {abs($0-hole.angle)<1e-8}!}
        for (i,column) in columns.enumerated() {
            for j in (column-1)...(column+1) {halves[j]=(holes[i].clearance+2*holes[i].bevel)/sqrt(2)}
            straighten[column-1]=spans[i];straighten[column+1]=spans[i]
        }
        var vertices:[Point3]=[],triangles:[Triangle]=[]
        func ring(_ z:Double,radius:(Int)->Double) -> [Int] {
            angles.enumerated().map {j,theta in
                let index=vertices.count,rad=radius(j)
                vertices.append(Point3(x:rad*cos(theta),y:rad*sin(theta),z:z))
                return index
            }
        }
        func rows(_ z:Double) -> [[Int]] {[
            ring(z){_ in inner},ring(z){r-halves[$0]},ring(z){r/cos(straighten[$0])},
            ring(z){r+halves[$0]},ring(z){_ in flangeOuter}
        ]}
        let bottom=rows(0),top=rows(height)
        func join(_ a:[Int],_ b:[Int],reverse:Bool=false) {
            for j in 0..<(n-1) {
                let faces=[Triangle(a:a[j],b:a[j+1],c:b[j+1]),Triangle(a:a[j],b:b[j+1],c:b[j])]
                triangles.append(contentsOf:reverse ? faces.map {Triangle(a:$0.a,b:$0.c,c:$0.b)}:faces)
            }
        }
        for row in 0..<4 {join(bottom[row],bottom[row+1]);join(top[row],top[row+1],reverse:true)}
        join(top[0],bottom[0])
        let profile:[[Int]]
        if plate {profile=[bottom[4],top[4]]}
        else {
            profile=[bottom[4]]+p.outerProfile.dropFirst().dropLast().map {point in ring(point.z){_ in point.radius}}+[top[4]]
        }
        for i in 0..<(profile.count-1) {join(profile[i],profile[i+1])}
        // Close each end by triangulating the actual cross section, including
        // all collinear flange vertices and the concave LED channel.
        for col in [0,n-1] {
            let perimeter=bottom.map {$0[col]}+profile.dropFirst().map {$0[col]}+top.dropLast().reversed().map {$0[col]}
            for face in cap(perimeter,vertices:vertices) {
                triangles.append(col==0 ? face:Triangle(a:face.a,b:face.c,c:face.b))
            }
        }
        for (i,column) in columns.enumerated() {
            let lower=StringHoles.patch(row:2,column:column,columns:n,index:{bottom[$0][$1]})
            let upper=StringHoles.patch(row:2,column:column,columns:n,index:{top[$0][$1]})
            triangles.removeAll {[$0.a,$0.b,$0.c].contains(lower.center) || [$0.a,$0.b,$0.c].contains(upper.center)}
            triangles.append(contentsOf:[Triangle(a:lower.bottomLeft,b:lower.bottom,c:lower.left),Triangle(a:lower.right,b:lower.topRight,c:lower.top),
                                         Triangle(a:upper.bottomLeft,b:upper.left,c:upper.bottom),Triangle(a:upper.right,b:upper.top,c:upper.topRight)])
            let center=vertices[lower.center],h=holes[i],ratio=h.clearance/(h.clearance+2*h.bevel)
            func throat(_ z:Double) -> [Int] {
                lower.loop.map {index in
                    let point=vertices[index],new=vertices.count
                    vertices.append(Point3(x:center.x+(point.x-center.x)*ratio,y:center.y+(point.y-center.y)*ratio,z:z))
                    return new
                }
            }
            let loops=[lower.loop,throat(h.bevel),throat(height-h.bevel),upper.loop]
            for layer in 0..<3 {
                for j in 0..<4 {
                    let k=(j+1)%4,a=loops[layer][j],b=loops[layer][k],c=loops[layer+1][k],d=loops[layer+1][j]
                    triangles.append(contentsOf:[Triangle(a:a,b:b,c:c),Triangle(a:a,b:c,c:d)])
                }
            }
        }
        var mesh=BalloonMesh(vertices:vertices,triangles:triangles,maxOverhang:45)
        StringHoles.compact(&mesh)
        return mesh
    }

    private static func cap(_ perimeter:[Int],vertices:[Point3]) -> [Triangle] {
        var polygon=perimeter,faces:[Triangle]=[]
        func cross(_ a:Int,_ b:Int,_ c:Int) -> Double {
            let u=vertices[a],v=vertices[b],w=vertices[c]
            return (hypot(v.x,v.y)-hypot(u.x,u.y))*(w.z-u.z)-(v.z-u.z)*(hypot(w.x,w.y)-hypot(u.x,u.y))
        }
        while polygon.count>3 {
            var found=false
            for i in polygon.indices {
                let a=polygon[(i+polygon.count-1)%polygon.count],b=polygon[i],c=polygon[(i+1)%polygon.count]
                guard cross(a,b,c)>1e-8 else {continue}
                let blocked=polygon.contains {v in
                    v != a && v != b && v != c && cross(a,b,v)>=(-1e-8) && cross(b,c,v)>=(-1e-8) && cross(c,a,v)>=(-1e-8)
                }
                if !blocked {faces.append(Triangle(a:a,b:b,c:c));polygon.remove(at:i);found=true;break}
            }
            precondition(found,"Ring cross section must be a simple polygon")
        }
        faces.append(Triangle(a:polygon[0],b:polygon[1],c:polygon[2]))
        return faces
    }

    static func pin(width:Double,length:Double) -> BalloonMesh {
        var vertices:[Point3]=[],triangles:[Triangle]=[]
        for (z,w) in [(0.0,width-0.8),(0.4,width),(length-0.4,width),(length,width-0.8)] {
            for i in 0..<4 {
                let a=Double(i)*Double.pi/2
                vertices.append(Point3(x:w/sqrt(2)*cos(a),y:w/sqrt(2)*sin(a),z:z))
            }
        }
        for row in 0..<3 {
            for j in 0..<4 {
                let k=(j+1)%4,a=row*4+j,b=row*4+k,c=(row+1)*4+k,d=(row+1)*4+j
                triangles.append(contentsOf:[Triangle(a:a,b:b,c:c),Triangle(a:a,b:c,c:d)])
            }
        }
        vertices.append(.zero);vertices.append(Point3(x:0,y:0,z:length))
        for j in 0..<4 {
            triangles.append(Triangle(a:16,b:(j+1)%4,c:j))
            triangles.append(Triangle(a:17,b:12+j,c:12+(j+1)%4))
        }
        return BalloonMesh(vertices:vertices,triangles:triangles,maxOverhang:45)
    }
}
