import Foundation

extension GeometryTests {
    static func checkCloudShapes() throws {
        let legacy=try JSONDecoder().decode(CloudParameters.self,from:Data("{\"width\":188,\"depth\":28,\"clipFit\":0.45}".utf8))
        require(legacy.style == .classic && !legacy.mirrored && legacy.width==188 && legacy.depth==28 && legacy.clipFit==0.45,
                "Shape migration changed an existing cloud")
        for style in CloudStyle.allCases { for mirrored in [false,true] {
            var base=CloudParameters();base.style=style;base.mirrored=mirrored
            for width in 100...240 {
                var p=base;p.width=Double(width);p.cableDiameter=6;p.stripWidth=12;p.nailHead=10;p.clipFit=0.5
                let l=CloudGenerator.Layout(p:p)
                for rect in l.rectangles {
                    require(rect.x0 > -l.coreX && rect.x1 < l.coreX && rect.y0 > l.lowY && rect.y1 < l.highY,
                            "\(p.displayName) hardware outside core at \(width) mm: \(rect); core ±\(l.coreX), \(l.lowY)...\(l.highY)")
                }
                require(l.led.y0>=p.cableBossTop+0.99 && l.nailBoss.y0>=l.led.y1+0.99,"Shape hardware overlaps or LED rows moved")
                for i in 0...80 {
                    let t=Double(i)/80
                    for (x,y) in [(-l.coreX+2*l.coreX*t,l.lowY),(-l.coreX+2*l.coreX*t,l.highY),
                                  (-l.coreX,l.lowY+(l.highY-l.lowY)*t),(l.coreX,l.lowY+(l.highY-l.lowY)*t)] {
                        let inner=CloudGenerator.radius(atan2(y,x),inset:4.1,width:p.width,verticalScale:p.verticalScale,profile:p.profile)
                        require(inner>hypot(x,y)+0.1,"\(p.displayName) core crosses skirt at \(width) mm")
                    }
                }
            }
        } }
        print("PASS all shape core sweeps: \(141*2*CloudStyle.allCases.count) hardware/outline combinations");fflush(stdout)
        var filenames=Set<String>(),count=0
        for style in CloudStyle.allCases { for mirrored in [false,true] {
            var base=CloudParameters();base.style=style;base.mirrored=mirrored
            let restored=try JSONDecoder().decode(CloudParameters.self,from:JSONEncoder().encode(base))
            require(restored==base,"Shape or mirror lost in settings")
            require(filenames.insert(base.filename).inserted,"Different cloud shapes share an archive filename")
            var cases:[CloudParameters]=[]
            // All four outlets for every silhouette and orientation. Mirrored
            // silhouettes begin on another side, so each width meets two.
            let turn=mirrored ? 2:0
            for width in [100.0,160,188,200,230,240,500] {
                var p=base;p.width=width;p.depth=width==100 ? 16:22
                p.cableSide=CableSide.allCases[(cases.count+turn)%4];cases.append(p)
            }
            for width in [100.0,180,240] {
                var p=base;p.width=width;p.depth=16;p.cableDiameter=6;p.stripWidth=12;p.nailHead=10
                p.nailShaft=5;p.clipFit=0.5;p.diffuserThickness=2
                p.cableSide=CableSide.allCases[(cases.count+turn)%4];cases.append(p.normalized())
            }
            for (index,p) in cases.enumerated() {
                checkLEDLayout(p)
                for quality in [BalloonGenerator.Quality.preview,.export] {
                    let kit=CloudKit(p,quality:quality)
                    var parts:[BalloonMesh]=[]
                    let seal=parseSTL(try kit.seal.binarySTL())
                    for (name,mesh) in [("back",kit.back),("front",kit.front)] {
                        try mesh.validate()
                        let parsed=parseSTL(try mesh.binarySTL());try parsed.validate();parts.append(parsed)
                        require(abs(parsed.dimensions.x-p.width)<0.002 && abs(parsed.dimensions.y-p.height)<0.002,
                                "\(p.displayName) \(name) dimensions differ from readout")
                        require(parsed.vertices.allSatisfy {$0.z >= -1e-6},"Shape extends below print bed")
                        require(abs(parsed.dimensions.z-(name=="back" ? p.depth:p.diffuserThickness+12))<0.002,"Shape depth changed")
                        require(parsed.vertices.count-parsed.triangles.count/2 == (name=="back" ? 0:2),"Shape has extra holes or shells")
                        require(p.fitsP2S == (parsed.dimensions.x+16<=256.001 && parsed.dimensions.y+16<=256.001),"Shape bed-fit incorrect")
                    }
                    try checkCloudFeatures(p,back:parts[0],front:parts[1],seal:seal,full:index==0 || index==4)
                    if (index==0 || index==4) && quality == .export {
                        let folder=".build/test-output/cloud-shapes/\(style.rawValue)\(mirrored ? "-mirrored":"")\(index==0 ? "-small":"")"
                        try FileManager.default.createDirectory(atPath:folder,withIntermediateDirectories:true)
                        for (name,data) in try kit.entries() {try data.write(to:URL(fileURLWithPath:"\(folder)/\(name)"))}
                        try kit.archive().write(to:URL(fileURLWithPath:"\(folder)/\(p.filename)"))
                        require(kit.instructions.contains(p.displayName) && kit.ledPlan.svg.contains(p.displayName),"Export lost cloud identity")
                    }
                }
                count += 1
            }
            print("PASS \(base.displayName): 10 kits at both resolutions, 141 widths, fitting clearance and LED layouts")
            fflush(stdout)
        } }
        for style in CloudStyle.allCases {
            for inset in [0.0,2.4,4.1] { for i in 0..<720 {
                let a=Double(i)*Double.pi/360
                let normal=CloudGenerator.radius(a,inset:inset,width:230,profile:style.profile)
                let mirrored=CloudGenerator.radius(Double.pi-a,inset:inset,width:230,profile:style.profile.mirrored)
                require(abs(normal-mirrored)<1e-8,"Mirroring distorts the cloud outline")
            } }
        }
        // Distinct profiles must remain visibly different, including the two
        // styles with the same bounding box; a size-only preset is insufficient.
        for (i,a) in CloudStyle.allCases.enumerated() { for b in CloudStyle.allCases.dropFirst(i+1) {
            let differences=(0..<360).map { step -> Double in
                let angle=Double(step)*Double.pi/180
                return abs(CloudGenerator.radius(angle,inset:0,width:230,profile:a.profile)
                           - CloudGenerator.radius(angle,inset:0,width:230,profile:b.profile))
            }
            require(differences.max()!>10 && differences.reduce(0,+)/360>3,"Cloud variants look too similar")
        } }
        print("PASS \(count) shape kits: STL topology, dimensions, clips, mounting, mirror symmetry, distinct silhouettes and persistence")
    }
}
