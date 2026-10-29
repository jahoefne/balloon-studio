import Foundation

/// Diamond openings have sloped roofs and a specified inscribed cord clearance.
/// They are cut into a connected wall, not added as intersecting eyelet objects.
enum StringHoles {
    struct Layout {
        let angles:[Double]
        let centers:[Int]
    }
    struct Patch {
        let center:Int
        let bottom:Int
        let right:Int
        let top:Int
        let left:Int
        let bottomLeft:Int
        let topRight:Int
        var loop:[Int] {[bottom,right,top,left]}
    }
    static func layout(samples:Int,clearance:Double,innerRadius:(Double)->Double) -> Layout {
        let tau=2*Double.pi
        let half=clearance/sqrt(2)
        let centers=(0..<4).map {Double($0)*Double.pi/2}
        let spans=centers.map {center -> Double in
            var lo=0.0,hi=Double.pi/4-0.01
            for _ in 0..<40 {
                let mid=(lo+hi)/2
                if innerRadius(center+mid)*sin(mid)<half {lo=mid} else {hi=mid}
            }
            return hi
        }
        func wrapped(_ a:Double) -> Double {(a+tau).truncatingRemainder(dividingBy:tau)}
        func difference(_ a:Double,_ b:Double) -> Double {abs(atan2(sin(a-b),cos(a-b)))}
        var angles=(0..<samples).map {tau*Double($0)/Double(samples)}.filter {angle in
            !zip(centers,spans).contains {difference(angle,$0.0)<$0.1+1e-8}
        }
        for (center,span) in zip(centers,spans) {
            angles.append(contentsOf:[wrapped(center-span),center,wrapped(center+span)])
        }
        angles.sort()
        while angles.count<samples {
            var best = -1,bestWidth=0.0
            for i in angles.indices {
                let next=i+1<angles.count ? angles[i+1]:angles[0]+tau
                let mid=wrapped((angles[i]+next)/2)
                if zip(centers,spans).contains(where:{difference(mid,$0.0)<$0.1+1e-8}) {continue}
                if next-angles[i]>bestWidth {best=i;bestWidth=next-angles[i]}
            }
            guard best>=0 else {break}
            let next=best+1<angles.count ? angles[best+1]:angles[0]+tau
            angles.append(wrapped((angles[best]+next)/2));angles.sort()
        }
        return Layout(angles:angles,centers:centers.map {center in angles.firstIndex {abs($0-center)<1e-8}!})
    }
    static func patch(row:Int,column:Int,columns:Int,index:(Int,Int)->Int) -> Patch {
        let left=(column+columns-1)%columns,right=(column+1)%columns
        return Patch(center:index(row,column),bottom:index(row-1,column),right:index(row,right),
                     top:index(row+1,column),left:index(row,left),bottomLeft:index(row-1,left),topRight:index(row+1,right))
    }
    static func punch(_ mesh:inout BalloonMesh,pairs:[(Patch,Patch)]) {
        let removed=Set(pairs.flatMap {[$0.0.center,$0.1.center]})
        mesh.triangles.removeAll {removed.contains($0.a) || removed.contains($0.b) || removed.contains($0.c)}
        for (outer,inner) in pairs {
            mesh.triangles.append(contentsOf:[
                Triangle(a:outer.bottomLeft,b:outer.bottom,c:outer.left),
                Triangle(a:outer.right,b:outer.topRight,c:outer.top),
                Triangle(a:inner.bottomLeft,b:inner.left,c:inner.bottom),
                Triangle(a:inner.right,b:inner.top,c:inner.topRight)
            ])
            for j in 0..<4 {
                let k=(j+1)%4,a=outer.loop[j],b=outer.loop[k],c=inner.loop[k],d=inner.loop[j]
                mesh.triangles.append(Triangle(a:a,b:b,c:c))
                mesh.triangles.append(Triangle(a:a,b:c,c:d))
            }
        }
        compact(&mesh)
    }
    /// Two perpendicular, straight bores through a filled neck. Their shared
    /// intersection is stitched explicitly, leaving no internal blocking faces.
    /// The bottom cap remains intact; the only openings are the four side mouths.
    static func crossBores(_ mesh:inout BalloonMesh,patches:[Patch],clearance:Double,centerZ:Double) {
        precondition(patches.count==4)
        let removed=Set(patches.map { $0.center })
        mesh.triangles.removeAll {removed.contains($0.a) || removed.contains($0.b) || removed.contains($0.c)}
        let half=clearance/sqrt(2)
        func vertex(_ x:Double,_ y:Double,_ z:Double) -> Int {
            let index=mesh.vertices.count
            mesh.vertices.append(Point3(x:x,y:y,z:z))
            return index
        }
        let bottom=vertex(0,0,centerZ-half),top=vertex(0,0,centerZ+half)
        let corners=[vertex(half,half,centerZ),vertex(-half,half,centerZ),
                     vertex(-half,-half,centerZ),vertex(half,-half,centerZ)]
        for (i,outer) in patches.enumerated() {
            mesh.triangles.append(Triangle(a:outer.bottomLeft,b:outer.bottom,c:outer.left))
            mesh.triangles.append(Triangle(a:outer.right,b:outer.topRight,c:outer.top))
            let inner=[bottom,corners[i],top,corners[(i+3)%4]]
            for j in 0..<4 {
                let k=(j+1)%4,a=outer.loop[j],b=outer.loop[k],c=inner[k],d=inner[j]
                mesh.triangles.append(Triangle(a:a,b:b,c:c))
                mesh.triangles.append(Triangle(a:a,b:c,c:d))
            }
        }
        compact(&mesh)
    }
    static func compact(_ mesh:inout BalloonMesh) {
        var used=Array(repeating:false,count:mesh.vertices.count)
        for t in mesh.triangles {used[t.a]=true;used[t.b]=true;used[t.c]=true}
        var remap=Array(repeating:0,count:used.count),vertices:[Point3]=[]
        for i in used.indices where used[i] {remap[i]=vertices.count;vertices.append(mesh.vertices[i])}
        if let range=mesh.innerVertexRange {
            let kept=range.filter {used[$0]}
            if let first=kept.first,let last=kept.last {mesh.innerVertexRange=remap[first]..<(remap[last]+1)}
        }
        mesh.triangles=mesh.triangles.map {Triangle(a:remap[$0.a],b:remap[$0.b],c:remap[$0.c])}
        mesh.vertices=vertices
    }
}
