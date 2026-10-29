import Foundation

enum BasketStyle:String,Codable,CaseIterable,Identifiable,Sendable {
    case wicker, ribbed, voyager
    var id:String {rawValue}
    var title:String {rawValue.capitalized}
    var subtitle:String {
        switch self {
        case .wicker:return "Rounded rectangle · woven texture"
        case .ribbed:return "Round basket · vertical fluting"
        case .voyager:return "Faceted sides · broad bands"
        }
    }
    var symbol:String {
        switch self {case .wicker:return "basket";case .ribbed:return "cylinder";case .voyager:return "shippingbox"}
    }
}

struct BasketParameters:Codable,Equatable,Sendable {
    var style:BasketStyle = .wicker
    var width:Double = 64
    var depth:Double = 48
    var height:Double = 42
    var wallThickness:Double = 2.4
    var cordClearance:Double = 3
    var texture:Double = 0.7
    var actualDepth:Double {style == .ribbed ? width : depth}
    var floorThickness:Double {max(2.4,wallThickness)}
    var holeCenter:Double {height-max(3,wallThickness*1.5)-cordClearance/sqrt(2)}
    var filename:String {"Basket-\(style.rawValue)-\(Int(width))x\(Int(actualDepth))x\(Int(height))mm.stl"}
    func normalized() -> Self {
        var p=self
        func clamp(_ value:Double,_ low:Double,_ high:Double,_ fallback:Double) -> Double {
            value.isFinite ? max(low,min(high,value)) : fallback
        }
        p.width=clamp(width,40,100,64)
        p.depth=clamp(depth,30,90,48)
        p.height=clamp(height,24,70,42)
        p.wallThickness=clamp(wallThickness,1.6,3.2,2.4)
        p.cordClearance=clamp(cordClearance,2,5,3)
        p.texture=clamp(texture,0,1,0.7)
        return p
    }
}

enum BasketGenerator {
    /// Distance along the rounded outline, so reeds retain their spacing on
    /// flat faces and around corners. An angular texture stretches on rectangles.
    static func wickerDistance(_ theta:Double,a:Double,b:Double) -> Double {
        let tau=2*Double.pi
        let angle=(theta.truncatingRemainder(dividingBy:tau)+tau).truncatingRemainder(dividingBy:tau)
        let quadrant=min(3,Int(angle/(Double.pi/2)))
        let local=angle-Double(quadrant)*Double.pi/2
        let aa=quadrant.isMultiple(of:2) ? a:b,bb=quadrant.isMultiple(of:2) ? b:a
        let corner=min(a,b)*0.32,cx=aa-corner,cy=bb-corner
        let quarter=a+b-2*corner+Double.pi*corner/2
        let r=radius(local,a:aa,b:bb,inset:0,style:.wicker)
        let x=r*cos(local),y=r*sin(local)
        let distance:Double
        if y<=cy {distance=y}
        else if x<=cx {distance=cy+Double.pi*corner/2+cx-x}
        else {distance=cy+corner*atan2(y-cy,x-cx)}
        return Double(quadrant)*quarter+distance
    }

    static func wickerRelief(distance:Double,z:Double,perimeter:Double) -> Double {
        // A multiple of four closes the alternating over/under weave at the
        // seam and keeps the same phase on opposite faces at every basket size.
        let strands=max(4,Int((perimeter/3.6/4).rounded())*4)
        let u=distance/perimeter*Double(strands),v=z/2.4
        let across=u-u.rounded(),up=v-v.rounded()
        func ribbon(_ offset:Double) -> Double {
            let t=min(1,abs(offset)/0.46)
            return pow(max(0,0.5+0.5*cos(Double.pi*t)),0.65)
        }
        let over=0.5+0.5*cos(Double.pi*u)*cos(Double.pi*v)
        // Rounded reed edges, alternating crossings, and a shallow lengthwise
        // groove are real surface geometry in both the preview and the STL.
        let horizontal=ribbon(up)*(0.38+0.64*over-0.08*exp(-pow(up*2.4/0.20,2)))
        let vertical=ribbon(across)*(1.02-0.64*over-0.08*exp(-pow(across*perimeter/Double(strands)/0.20,2)))
        return max(horizontal,vertical)
    }

    /// Radial intersection with circles, rounded rectangles, or chamfered rectangles.
    static func radius(_ angle:Double,a:Double,b:Double,inset:Double,style:BasketStyle) -> Double {
        let x=abs(cos(angle)),y=abs(sin(angle))
        if style == .ribbed {return a-inset}
        let ai=a-inset,bi=b-inset
        let flat=min(ai/max(x,1e-12),bi/max(y,1e-12))
        if style == .voyager {
            let diagonal=a+b-min(a,b)*0.30-sqrt(2)*inset
            return min(flat,diagonal/(x+y))
        }
        let corner=max(0.1,min(a,b)*0.32-inset)
        let cx=ai-corner,cy=bi-corner
        if flat*x<=cx+1e-9 || flat*y<=cy+1e-9 {return flat}
        let projection=x*cx+y*cy
        return projection+sqrt(max(0,projection*projection-cx*cx-cy*cy+corner*corner))
    }

    static func generate(_ input:BasketParameters,quality:BalloonGenerator.Quality = .preview) -> BalloonMesh {
        let p=input.normalized()
        // Leave a surface patch around the circular mouth and its 0.35 mm bevel.
        let halfHole=max(p.cordClearance/sqrt(2),p.cordClearance/2+0.85)
        let a=p.width/2,b=p.actualDepth/2
        func taper(_ z:Double) -> Double {0.86+0.14*z/p.height}
        // Compensate for the wall's outward taper when applying a horizontal inset.
        let wall=p.wallThickness*sqrt(1+pow(max(a,b)*0.14/p.height,2))
        func baseRadius(_ theta:Double,_ z:Double,_ inside:Bool) -> Double {
            radius(theta,a:a*taper(z),b:b*taper(z),inset:inside ? wall:0,style:p.style)
        }
        let layout=StringHoles.layout(samples:quality == .export ? 384:240,clearance:halfHole*sqrt(2)) {
            baseRadius($0,p.holeCenter-halfHole,true)
        }
        let angles=layout.angles,n=angles.count
        let zBottom=p.holeCenter-halfHole,zTop=p.holeCenter+halfHole
        let woven=p.style == .wicker && p.texture>0
        let spacing=quality == .export ? 0.20:0.32
        let perimeter=4*(a+b-2*min(a,b)*0.32+Double.pi*min(a,b)*0.32/2)
        var detailedAngles:[Double]=[]
        if woven {
            // Fill even the wide angular spans reserved for the cord holes.
            // The reinforced hole band keeps the original layout.
            for i in angles.indices {
                let start=angles[i],end=i+1<n ? angles[i+1]:2*Double.pi
                let length=wickerDistance(end==2*Double.pi ? 0:end,a:a,b:b)
                    - wickerDistance(start,a:a,b:b)
                let count=max(1,Int(ceil((length<0 ? length+perimeter:length)/spacing)))
                for j in 0..<count {detailedAngles.append(start+(end-start)*Double(j)/Double(count))}
            }
        } else {detailedAngles=angles}
        let steps=Int(ceil(p.height/(woven ? spacing:(quality == .export ? 0.40:0.65))))
        let uniform:[Double]=(0...steps).map {p.height*Double($0)/Double(steps)}
        var levels:[Double]=uniform.filter {z in
            !(z>zBottom-0.00000001 && z<zTop+0.00000001) && abs(z-p.floorThickness)>0.00000001
        }
        levels.append(contentsOf:[p.floorThickness,zBottom,p.holeCenter,zTop])
        levels.sort()
        let floorRow=levels.firstIndex {abs($0-p.floorThickness)<1e-8}!
        let holeRow=levels.firstIndex {abs($0-p.holeCenter)<1e-8}!
        func smooth(_ t:Double) -> Double {let s=max(0,min(1,t));return s*s*(3-2*s)}
        func relief(_ theta:Double,_ z:Double) -> Double {
            let fade=smooth(z/2)*smooth((zBottom-1-z)/2)
            let detail:Double
            switch p.style {
            case .wicker:
                detail=wickerRelief(distance:wickerDistance(theta,a:a,b:b),z:z,perimeter:perimeter)
            case .ribbed:
                detail=0.9*pow(0.5+0.5*cos(24*theta),2)
            case .voyager:
                let first=exp(-pow((z-p.height*0.25)/0.9,2))
                let second=exp(-pow((z-p.height*0.53)/0.9,2))
                detail=0.85*max(first,second)
            }
            // A continuous broad top band reinforces the cord holes.
            let rim=0.65*smooth((z-zBottom+2)/2)*smooth((p.height-z)/1.2)
            return detail*p.texture*fade+rim
        }
        var vertices:[Point3]=[],triangles:[Triangle]=[]
        let rowAngles=levels.map {$0<zBottom-1e-8 ? detailedAngles:angles}
        var outerStarts:[Int]=[]
        for (row,z) in levels.enumerated() {
            outerStarts.append(vertices.count)
            for theta in rowAngles[row] {
                let maximum=radius(theta,a:a,b:b,inset:0,style:p.style)
                let r=min(maximum,baseRadius(theta,z,false)+relief(theta,z))
                vertices.append(Point3(x:r*cos(theta),y:r*sin(theta),z:z))
            }
        }
        let innerStart=vertices.count
        for z in levels[floorRow...] {
            for theta in angles {
                let r=baseRadius(theta,z,true)
                vertices.append(Point3(x:r*cos(theta),y:r*sin(theta),z:z))
            }
        }
        func outer(_ row:Int,_ col:Int) -> Int {outerStarts[row]+col}
        func inner(_ row:Int,_ col:Int) -> Int {innerStart+(row-floorRow)*n+col}
        for row in 0..<(levels.count-1) {
            // Stitch the fine woven wall into the coarser reinforced hole band
            // without T-junctions, preserving the opening patches' boundaries.
            let lower=rowAngles[row],upper=rowAngles[row+1]
            var i=0,j=0
            while i<lower.count || j<upper.count {
                let nextLower=i+1<lower.count ? lower[i+1]:2*Double.pi
                let nextUpper=j+1<upper.count ? upper[j+1]:2*Double.pi
                let a=outer(row,i%lower.count),d=outer(row+1,j%upper.count)
                if abs(nextLower-nextUpper)<1e-10 {
                    let b=outer(row,(i+1)%lower.count),c=outer(row+1,(j+1)%upper.count)
                    triangles.append(contentsOf:[Triangle(a:a,b:b,c:c),Triangle(a:a,b:c,c:d)])
                    i += 1;j += 1
                } else if nextLower<nextUpper {
                    triangles.append(Triangle(a:a,b:outer(row,(i+1)%lower.count),c:d));i += 1
                } else {
                    triangles.append(Triangle(a:a,b:outer(row+1,(j+1)%upper.count),c:d));j += 1
                }
            }
            for j in 0..<n {
                let k=(j+1)%n
                if row>=floorRow {
                    let a=inner(row,j),b=inner(row,k),c=inner(row+1,k),d=inner(row+1,j)
                    triangles.append(contentsOf:[Triangle(a:a,b:c,c:b),Triangle(a:a,b:d,c:c)])
                }
            }
        }
        let bottom=vertices.count;vertices.append(.zero)
        let floor=vertices.count;vertices.append(Point3(x:0,y:0,z:p.floorThickness))
        let top=levels.count-1
        for j in rowAngles[0].indices {
            triangles.append(Triangle(a:bottom,b:outer(0,(j+1)%rowAngles[0].count),c:outer(0,j)))
        }
        for j in 0..<n {
            let k=(j+1)%n
            triangles.append(Triangle(a:floor,b:inner(floorRow,j),c:inner(floorRow,k)))
            triangles.append(Triangle(a:outer(top,j),b:outer(top,k),c:inner(top,k)))
            triangles.append(Triangle(a:outer(top,j),b:inner(top,k),c:inner(top,j)))
        }
        var mesh=BalloonMesh(vertices:vertices,triangles:triangles,maxOverhang:atan(max(a,b)*0.14/p.height)*180/Double.pi)
        roundCordHoles(&mesh,parameters:p,row:holeRow,layout:layout,outer:outer,inner:inner) {theta,z,inside in
            if inside {return baseRadius(theta,z,true)}
            return min(radius(theta,a:a,b:b,inset:0,style:p.style),baseRadius(theta,z,false)+relief(theta,z))
        }
        return mesh
    }

    /// Replace each rectangular wall patch with a circular annulus, a bevel on
    /// each mouth, and a coaxial bore. Shared angular columns would instead make
    /// the outside opening wider than the inside and distort the tunnel.
    private static func roundCordHoles(_ mesh:inout BalloonMesh,parameters p:BasketParameters,
                                       row:Int,layout:StringHoles.Layout,
                                       outer:(Int,Int)->Int,inner:(Int,Int)->Int,
                                       surface:(Double,Double,Bool)->Double) {
        let count=64,bevel=0.35,n=layout.angles.count
        // Circumscribe the requested clearance, including between polygon edges.
        let bore=p.cordClearance/2/cos(Double.pi/Double(count)),mouth=bore+bevel
        var patchVertices=Set<Int>()
        var frames:[([Int],[Int])]=[]
        for column in layout.centers {
            func frame(_ index:(Int,Int)->Int) -> [Int] {
                let left=(column+n-1)%n,right=(column+1)%n
                let boundary=[index(row-1,column),index(row-1,right),index(row,right),index(row+1,right),
                              index(row+1,column),index(row+1,left),index(row,left),index(row-1,left)]
                patchVertices.formUnion(boundary);patchVertices.insert(index(row,column))
                return boundary
            }
            frames.append((frame(outer),frame(inner)))
        }
        mesh.triangles.removeAll {patchVertices.contains($0.a) && patchVertices.contains($0.b) && patchVertices.contains($0.c)}
        func face(_ a:Int,_ b:Int,_ c:Int,reverse:Bool=false) {
            mesh.triangles.append(reverse ? Triangle(a:a,b:c,c:b):Triangle(a:a,b:b,c:c))
        }
        for (side,frames) in frames.enumerated() {
            let center=Double(side)*Double.pi/2
            let normal=Point3(x:cos(center),y:sin(center),z:0)
            let tangent=Point3(x:-sin(center),y:cos(center),z:0)
            func ring(radius:Double,inside:Bool,inset:Double) -> [Int] {
                (0..<count).map {i in
                    let phase=2*Double.pi*Double(i)/Double(count)
                    let u=radius*sin(phase),z=p.holeCenter-radius*cos(phase)
                    // Intersect the actual tapered/curved surface at a fixed
                    // tangential coordinate. Both bore ends share the same u,z.
                    var low = -Double.pi/4,high=Double.pi/4
                    for _ in 0..<40 {
                        let mid=(low+high)/2
                        if surface(center+mid,z,inside)*sin(mid)<u {low=mid} else {high=mid}
                    }
                    let angle=(low+high)/2
                    let depth=surface(center+angle,z,inside)*cos(angle)+inset
                    let index=mesh.vertices.count
                    mesh.vertices.append(normal*depth+tangent*u+Point3(x:0,y:0,z:z))
                    return index
                }
            }
            let outside=ring(radius:mouth,inside:false,inset:0)
            let outerBore=ring(radius:bore,inside:false,inset:-bevel)
            let innerBore=ring(radius:bore,inside:true,inset:bevel)
            let inside=ring(radius:mouth,inside:true,inset:0)
            for (frame,hole,reverse) in [(frames.0,outside,false),(frames.1,inside,true)] {
                for sector in 0..<8 {
                    let first=sector*count/8,last=(sector+1)*count/8
                    let a=frame[sector],b=frame[(sector+1)%8]
                    face(a,b,hole[last%count],reverse:reverse)
                    for j in first..<last {face(a,hole[(j+1)%count],hole[j],reverse:reverse)}
                }
            }
            for (start,end) in [(outside,outerBore),(outerBore,innerBore),(innerBore,inside)] {
                for j in 0..<count {
                    let k=(j+1)%count
                    face(start[j],start[k],end[k]);face(start[j],end[k],end[j])
                }
            }
        }
        StringHoles.compact(&mesh)
    }
}
