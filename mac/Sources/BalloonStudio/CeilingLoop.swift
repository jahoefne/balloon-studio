import Foundation

/// A stitched lifting lug for the ceiling cord: a thick eyelet with a round,
/// bevelled bore, rounded edges and a concave fillet into the crown pad. Its
/// open underside replaces a crown patch, so there are no intersecting solids.
///
/// The balloon prints upright, so the cord's pull runs across the layer lines,
/// the weakest direction of brittle PLA. Every loaded section is therefore kept
/// thick and free of notches: the bore has no corners, the edges are rounded,
/// and the lug flares into the crown instead of meeting it at a sharp corner.
enum CeilingLoop {
    /// Rounding of the lug's outer edges.
    static let edgeRadius=2.0
    /// Chamfer at each bore mouth, where the cord bends up toward the ceiling.
    static let bevel=0.8

    /// Keep the chamfered bore above the fillet even at the largest flare.
    static func foot(parameters p:BalloonParameters) -> Double {p.hangingFillet+2}
    /// Height of the lug above the crown pad.
    static func height(parameters p:BalloonParameters) -> Double {foot(parameters:p)+p.hangingClearance+p.hangingWall}
    /// How far the filleted foot reaches from the balloon's axis.
    static func reach(parameters p:BalloonParameters) -> Double {
        hypot(p.hangingClearance/2+p.hangingWall-edgeRadius,p.hangingThickness/2-edgeRadius)+edgeRadius+p.hangingFillet
    }
    /// Flat crown radius the foot needs, allowing for 8 % panel grooves.
    static func padRadius(parameters p:BalloonParameters) -> Double {max(10,(reach(parameters:p)+1)/0.92)}

    static func attach(to mesh:inout BalloonMesh,ringStart:Int,columns:Int,outerTop:Int,parameters p:BalloonParameters) {
        let firstRemoved=ringStart+columns
        mesh.triangles.removeAll {t in [t.a,t.b,t.c].contains {$0>=firstRemoved && $0<=outerTop}}
        // Local coordinates: the crown pad is z = 0, the bore runs along y.
        func vertex(_ x:Double,_ y:Double,_ z:Double)->Int {
            let index=mesh.vertices.count
            mesh.vertices.append(Point3(x:x,y:y,z:p.height+z))
            return index
        }
        func triangle(_ a:Int,_ b:Int,_ c:Int) {mesh.triangles.append(Triangle(a:a,b:b,c:c))}
        // Stitch two convex loops using their angular progression. Both run CCW;
        // the resulting annulus runs forward outside and backward inside.
        func annulus(_ outer:[Int],_ inner:[Int],_ outerAngles:[Double],_ innerAngles:[Double],reverse:Bool=false) {
            var i=0,j=0
            func emit(_ a:Int,_ b:Int,_ c:Int) {reverse ? triangle(a,c,b):triangle(a,b,c)}
            while i<outer.count || j<inner.count {
                let nextOuter=i<outer.count ? (i+1<outer.count ? outerAngles[i+1]:2*Double.pi):Double.infinity
                let nextInner=j<inner.count ? (j+1<inner.count ? innerAngles[j+1]:2*Double.pi):Double.infinity
                if nextOuter<=nextInner {
                    emit(outer[i%outer.count],outer[(i+1)%outer.count],inner[j%inner.count]);i += 1
                } else {
                    emit(outer[i%outer.count],inner[(j+1)%inner.count],inner[j%inner.count]);j += 1
                }
            }
        }
        // Quads between two loops of equal length. `lower` comes first along the
        // surface's outward orientation (below, or earlier around the top arc).
        func band(_ lower:[Int],_ upper:[Int],closed:Bool) {
            let n=lower.count
            for j in 0..<(closed ? n:n-1) {
                let k=(j+1)%n
                triangle(lower[j],lower[k],upper[k]);triangle(lower[j],upper[k],upper[j])
            }
        }
        let wall=p.hangingWall,filletRadius=p.hangingFillet
        let r=p.hangingClearance/2,c=foot(parameters:p)+r,half=p.hangingThickness/2
        let flatX=r+wall-edgeRadius,flatY=half-edgeRadius
        let segments=4,fillets=4,arcs=16,bore=24
        let quarter=Double.pi/2
        func angle(_ index:Int) -> Double {
            let v=mesh.vertices[index]
            let a=atan2(v.z-p.height-c,v.x)
            return a < -1e-9 ? a+2*Double.pi:max(0,a)
        }

        // Horizontal slice: a rounded rectangle, counter-clockwise from the +x/-y
        // corner, with `sides` extra points along each flat face. The corner
        // centres never move; only the corner radius grows with the fillet's
        // spread, which keeps the slices' vertices aligned.
        func slice(spread e:Double,z:Double,sides:Int) -> [Int] {
            let rho=edgeRadius+e
            var ring:[Int]=[]
            for corner in 0..<4 {
                let cx=corner<2 ? flatX:-flatX,cy=(corner==1||corner==2) ? flatY:-flatY
                for s in 0...segments {
                    let a=quarter*(Double(corner)+Double(s)/Double(segments))-quarter
                    ring.append(vertex(cx+rho*cos(a),cy+rho*sin(a),z))
                }
                if (corner==1 || corner==3) && sides>0 {
                    // Along the +y face from +x to -x, and back along the -y face.
                    for s in 1...sides {
                        let x=flatX*(1-2*Double(s)/Double(sides+1))
                        ring.append(vertex(corner==1 ? x:-x,corner==1 ? half+e:-(half+e),z))
                    }
                }
            }
            return ring
        }
        // Foot fillet, then the straight body up to the bore's centre line. The
        // fillet slices carry extra points along the faces, so the faces fan out
        // evenly around the bore from the top of the fillet.
        let sides=3
        var rings:[[Int]]=[]
        for s in 0...fillets {
            let psi=quarter*Double(s)/Double(fillets)
            rings.append(slice(spread:filletRadius*(1-sin(psi)),z:filletRadius*(1-cos(psi)),sides:sides))
        }
        let base=rings[fillets]
        let crest=slice(spread:0,z:c,sides:0)
        for i in 0..<fillets {band(rings[i],rings[i+1],closed:true)}
        // The straight body: only its rounded sides. The flat faces are stitched
        // separately, around the bore, from the top of the fillet upward.
        let perHalf=2*(segments+1)
        band(Array(base[0..<perHalf]),Array(crest[0..<perHalf]),closed:false)
        band(Array(base[(perHalf+sides)..<(2*perHalf+sides)]),Array(crest[perHalf...]),closed:false)

        // Rounded top: the body's edge rounding swept around a semicircle. Each
        // arc runs from the -y face over the outer edge to the +y face; the first
        // and last arcs are the two halves of the crest slice.
        func arc(_ k:Int) -> [Int] {
            if k==0 {return Array(crest[0..<perHalf])}
            if k==arcs {return Array(crest[perHalf...].reversed())}
            let theta=Double.pi*Double(k)/Double(arcs)
            let ex=flatX*cos(theta),ez=c+flatX*sin(theta)
            var ring:[Int]=[]
            for side in [-1.0,1.0] {
                for s in 0...segments {
                    let phi=quarter*(Double(s)/Double(segments)+(side<0 ? -1:0))
                    ring.append(vertex(ex+edgeRadius*cos(phi)*cos(theta),side*flatY+edgeRadius*sin(phi),ez+edgeRadius*cos(phi)*sin(theta)))
                }
            }
            return ring
        }
        var front:[Int]=[],back:[Int]=[]
        var previous=arc(0)
        front.append(previous[0]);back.append(previous[perHalf-1])
        for k in 1...arcs {
            let ring=arc(k)
            band(previous,ring,closed:false)
            front.append(ring[0]);back.append(ring[perHalf-1])
            previous=ring
        }
        // The flat faces: semicircle, then down the sides and along the top of the fillet.
        front.append(base[2*perHalf+sides-1])
        front.append(contentsOf:base[(2*perHalf+sides)...])
        front.append(base[0])
        back.append(base[perHalf+sides])
        back.append(contentsOf:base[perHalf..<(perHalf+sides)].reversed())
        back.append(base[perHalf-1])

        // Round bore with a chamfer at each mouth.
        func circle(radius:Double,y:Double) -> [Int] {
            (0..<bore).map {m in
                let a=2*Double.pi*Double(m)/Double(bore)
                return vertex(radius*cos(a),y,c+radius*sin(a))
            }
        }
        let mouthFront=circle(radius:r+bevel,y:-half),boreFront=circle(radius:r,y:-half+bevel)
        let boreBack=circle(radius:r,y:half-bevel),mouthBack=circle(radius:r+bevel,y:half)
        annulus(front,mouthFront,front.map(angle),mouthFront.map(angle))
        annulus(back,mouthBack,back.map(angle),mouthBack.map(angle),reverse:true)
        for (near,far) in [(mouthFront,boreFront),(boreFront,boreBack),(boreBack,mouthBack)] {
            for m in 0..<bore {
                let n=(m+1)%bore
                triangle(near[m],near[n],far[n]);triangle(near[m],far[n],far[m])
            }
        }

        // Lift the attachment pad above the original curved crown. A direct
        // chord to the lug would shave the shell on tall, narrow balloons.
        let raised=(0..<columns).map {j -> Int in
            let point=mesh.vertices[ringStart+j]
            return vertex(point.x,point.y,0)
        }
        for j in 0..<columns {
            let k=(j+1)%columns
            triangle(ringStart+j,ringStart+k,raised[k])
            triangle(ringStart+j,raised[k],raised[j])
        }
        // The raised crown ring follows the panel grooves, so it is not convex.
        // A round ring just outside the foot keeps the flat stitching between
        // convex loops; the grooved ring joins it with plain quads.
        let ringRadius=reach(parameters:p)+0.5
        let pad=(0..<columns).map {j -> Int in
            let a=2*Double.pi*Double(j)/Double(columns)
            return vertex(ringRadius*cos(a),ringRadius*sin(a),0)
        }
        for j in 0..<columns {
            let k=(j+1)%columns
            triangle(raised[j],raised[k],pad[k]);triangle(raised[j],pad[k],pad[j])
        }
        // Start the pad ring at the column just before the footprint's first
        // vertex, so both loops progress from angle zero.
        let footprint=rings[0]
        let origin=atan2(mesh.vertices[footprint[0]].y,mesh.vertices[footprint[0]].x)
        let startAngle=origin<0 ? origin+2*Double.pi:origin
        let start=Int(floor(startAngle/(2*Double.pi)*Double(columns)))%columns
        let reference=2*Double.pi*Double(start)/Double(columns)
        let crown=(0..<columns).map {pad[(start+$0)%columns]}
        let crownAngles=(0..<columns).map {2*Double.pi*Double($0)/Double(columns)}
        let footprintAngles=footprint.map {index -> Double in
            let point=mesh.vertices[index]
            // The reference can exceed the vertex angle by more than a turn.
            let a=(atan2(point.y,point.x)-reference).truncatingRemainder(dividingBy:2*Double.pi)
            return a < -1e-9 ? a+2*Double.pi:max(0,a)
        }
        annulus(crown,footprint,crownAngles,footprintAngles)
    }
}
