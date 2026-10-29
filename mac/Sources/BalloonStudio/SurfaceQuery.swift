import Foundation

/// A triangle BVH for distance queries. Used to hollow the actual fluted surface,
/// rather than scaling a duplicate (which makes the neck and sloping walls thin).
struct SurfaceQuery {
    private struct Box {
        var lo=Point3(x:.infinity,y:.infinity,z:.infinity)
        var hi=Point3(x:-.infinity,y:-.infinity,z:-.infinity)
        mutating func include(_ p:Point3) {
            lo=Point3(x:min(lo.x,p.x),y:min(lo.y,p.y),z:min(lo.z,p.z))
            hi=Point3(x:max(hi.x,p.x),y:max(hi.y,p.y),z:max(hi.z,p.z))
        }
        func distanceSquared(_ p:Point3) -> Double {
            let x=max(lo.x-p.x,max(0,p.x-hi.x))
            let y=max(lo.y-p.y,max(0,p.y-hi.y))
            let z=max(lo.z-p.z,max(0,p.z-hi.z))
            return x*x+y*y+z*z
        }
    }
    private struct Face {
        let a:Point3
        let b:Point3
        let c:Point3
        let center:Point3
    }
    private struct Node {
        var box:Box
        var start:Int
        var count:Int
        var left = -1
        var right = -1
    }
    private var faces:[Face]
    private var order:[Int]
    private var nodes:[Node]=[]

    init(vertices:[Point3],triangles:[Triangle]) {
        faces=triangles.map { t in
            let a=vertices[t.a],b=vertices[t.b],c=vertices[t.c]
            return Face(a:a,b:b,c:c,center:(a+b+c)*Double(1.0/3.0))
        }
        order=Array(faces.indices)
        nodes.reserveCapacity(faces.count/4)
        if !faces.isEmpty { _=build(0,faces.count) }
    }
    private mutating func build(_ start:Int,_ end:Int) -> Int {
        var box=Box()
        for i in start..<end {
            let f=faces[order[i]]
            box.include(f.a);box.include(f.b);box.include(f.c)
        }
        let index=nodes.count
        nodes.append(Node(box:box,start:start,count:end-start))
        if end-start>12 {
            let extent=box.hi-box.lo
            let axis=extent.x>extent.y ? (extent.x>extent.z ? 0:2) : (extent.y>extent.z ? 1:2)
            // Keep an immutable reference while mutating the independent index array.
            let faceData=faces
            order[start..<end].sort {
                let a=faceData[$0].center,b=faceData[$1].center
                switch axis {case 0:return a.x<b.x;case 1:return a.y<b.y;default:return a.z<b.z}
            }
            let middle=(start+end)/2
            let left=build(start,middle),right=build(middle,end)
            nodes[index].left=left
            nodes[index].right=right
        }
        return index
    }
    func isCloser(than distance:Double,to point:Point3) -> Bool {
        !nodes.isEmpty && visit(0,point,distance*distance)
    }
    private func visit(_ index:Int,_ p:Point3,_ limit:Double) -> Bool {
        let n=nodes[index]
        if n.box.distanceSquared(p)>=limit {return false}
        if n.left>=0 {
            return visit(n.left,p,limit) || visit(n.right,p,limit)
        }
        for i in n.start..<(n.start+n.count) {
            let f=faces[order[i]]
            if Self.distanceSquared(p,f.a,f.b,f.c)<limit {return true}
        }
        return false
    }
    /// Closest point on a triangle, including edge and vertex Voronoi regions.
    static func distanceSquared(_ p:Point3,_ a:Point3,_ b:Point3,_ c:Point3) -> Double {
        let ab=b-a,ac=c-a,ap=p-a
        let d1=ab.dot(ap),d2=ac.dot(ap)
        if d1<=0 && d2<=0 {return ap.dot(ap)}
        let bp=p-b,d3=ab.dot(bp),d4=ac.dot(bp)
        if d3>=0 && d4<=d3 {return bp.dot(bp)}
        let vc=d1*d4-d3*d2
        if vc<=0 && d1>=0 && d3<=0 {
            let delta=p-(a+ab*(d1/(d1-d3)))
            return delta.dot(delta)
        }
        let cp=p-c,d5=ab.dot(cp),d6=ac.dot(cp)
        if d6>=0 && d5<=d6 {return cp.dot(cp)}
        let vb=d5*d2-d1*d6
        if vb<=0 && d2>=0 && d6<=0 {
            let delta=p-(a+ac*(d2/(d2-d6)))
            return delta.dot(delta)
        }
        let va=d3*d6-d5*d4
        if va<=0 && d4-d3>=0 && d5-d6>=0 {
            let delta=p-(b+(c-b)*((d4-d3)/((d4-d3)+(d5-d6))))
            return delta.dot(delta)
        }
        let denominator=1/(va+vb+vc)
        let delta=p-(a+ab*(vb*denominator)+ac*(vc*denominator))
        return delta.dot(delta)
    }
}
