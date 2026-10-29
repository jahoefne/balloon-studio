import Foundation

extension GeometryTests {
    /// Intersect the actual triangulated surface, including interpolation between
    /// vertices. This catches lost detail beneath holes and preview undersampling.
    static func basketSection(_ mesh:BalloonMesh,z:Double) -> [(Point3,Point3)] {
        mesh.triangles.compactMap {t in
            let points=[mesh.vertices[t.a],mesh.vertices[t.b],mesh.vertices[t.c]]
            var hits:[Point3]=[]
            for i in 0..<3 {
                let a=points[i],b=points[(i+1)%3]
                if (a.z<=z && b.z>z) || (b.z<=z && a.z>z) {
                    hits.append(a+(b-a)*((z-a.z)/(b.z-a.z)))
                }
            }
            return hits.count==2 ? (hits[0],hits[1]):nil
        }
    }
    static func basketRadius(_ section:[(Point3,Point3)],theta:Double) -> Double {
        let direction=Point3(x:cos(theta),y:sin(theta),z:0)
        func cross(_ a:Point3,_ b:Point3) -> Double {a.x*b.y-a.y*b.x}
        var result=0.0
        for (a,b) in section {
            let edge=b-a,denominator=cross(direction,edge)
            if abs(denominator)<1e-12 {continue}
            let t=cross(a,edge)/denominator,s=cross(a,direction)/denominator
            if s>=0 && s<=1 {result=max(result,t)}
        }
        require(result>0,"Missing basket section")
        return result
    }
    static func checkWicker() throws {
        var p=BasketParameters(texture:1)
        let corner=p.depth*0.16
        let perimeter=2*(p.width+p.depth)-8*corner+2*Double.pi*corner
        let pitch=perimeter/Double(Int((perimeter/3.6/4).rounded())*4)
        var samples:[[Double]]=[]
        for quality:BalloonGenerator.Quality in [.preview,.export] {
            let start=Date(),mesh=BasketGenerator.generate(p,quality:quality)
            try mesh.validate()
            var sections:[Double:[(Point3,Point3)]]=[:]
            func relief(_ y:Double,_ z:Double) -> Double {
                let theta=atan2(y,p.width/2)
                if sections[z]==nil {sections[z]=basketSection(mesh,z:z)}
                let base=p.width/2*(0.86+0.14*z/p.height)/cos(theta)
                return basketRadius(sections[z]!,theta:theta)-base
            }
            // One reed goes over at one row, under at the next; the crossing
            // vertical reed alternates the other way on neighboring columns.
            let hUnder=relief(pitch*0.35,12.017),hOver=relief(pitch*0.35,14.417)
            let vOver=relief(0,12.857),vUnder=relief(pitch,12.857)
            require(hOver-hUnder>0.18,"Horizontal reeds lost their alternating crossings")
            require(vOver-vUnder>0.18,"Vertical reeds lost their alternating crossings")
            // The old hole layout left a broad, flat strip along this seam.
            let section=basketSection(mesh,z:13.217)
            let seam=basketRadius(section,theta:0)
            let left=basketRadius(section,theta:2*Double.pi-0.001)
            let right=basketRadius(section,theta:0.001)
            require(abs(left-right)<0.015 && abs(seam-(left+right)/2)<0.015,"Wicker has a visible wrap seam")
            let profile=(0...40).map {relief(Double($0)*pitch/40,12.857)}
            require(profile.max()!-profile.min()!>0.35,"Fine weave disappeared below the cord hole")
            samples.append(profile)
            print("PASS Wicker \(quality): alternating reeds, detailed wall beneath holes, continuous seam (\(mesh.triangles.count) faces; \(String(format:"%.2f",Date().timeIntervalSince(start))) s including checks)")
        }
        require(zip(samples[0],samples[1]).allSatisfy {abs($0-$1)<0.13},"Preview and export weave diverge")
        p.texture=0
        let smooth=BasketGenerator.generate(p)
        let section=basketSection(smooth,z:12.857)
        require(abs(basketRadius(section,theta:0)-p.width/2*(0.86+0.14*12.857/p.height))<0.001,"Zero detail must leave a smooth wall")
        // Exercise the dense-to-hole-band transition and STL precision at the
        // largest relief, thin walls, and strongly rectangular outlines.
        for (name,input) in [
            ("wide",BasketParameters(width:100,depth:30,height:70,wallThickness:1.6,cordClearance:5,texture:1)),
            ("deep",BasketParameters(width:40,depth:90,height:24,wallThickness:1.6,cordClearance:5,texture:1))
        ] {
            for quality:BalloonGenerator.Quality in [.preview,.export] {
                let mesh=BasketGenerator.generate(input,quality:quality)
                let data=try mesh.binarySTL(),parsed=parseSTL(data)
                try parsed.validate()
                require(parsed.vertices.count-parsed.triangles.count/2 == -6,"Wicker transition changed the four cord holes")
                checkBasketHoles(parsed,parameters:input)
                require(abs(parsed.dimensions.x-input.width)<0.001 && abs(parsed.dimensions.y-input.depth)<0.001 && abs(parsed.dimensions.z-input.height)<0.001,"Detailed wicker exceeded its dimensions")
                if quality == .export {try data.write(to:URL(fileURLWithPath:".build/test-output/wicker-detail-\(name).stl"))}
            }
        }
        print("PASS Wicker preview/export agreement, zero detail, thin walls and rectangular extremes")
    }
}
