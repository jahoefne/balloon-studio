import Foundation

extension GeometryTests {
    static func checkLampSurfaces() throws {
        for kind in [WallLampKind.cloud, .sun] {
            let legacy = try JSONDecoder().decode(CloudParameters.self, from:Data("{\"kind\":\"\(kind.rawValue)\",\"width\":188}".utf8))
            require(legacy.surface == .flat && legacy.surfaceDepth == 18 && legacy.width == 188, "Legacy lamp gained a sculpted surface")
            var bad = kind.defaults
            bad.surface = .sculpted; bad.width = bad.minimumWidth; bad.surfaceDepth = .infinity
            require(bad.normalized().surfaceDepth == min(18, bad.maximumSurfaceDepth), "Invalid depth has no safe default")
            bad.surfaceDepth = 100
            require(bad.normalized().surfaceDepth == bad.maximumSurfaceDepth, "Depth exceeds size limit")
            bad.surfaceDepth = -1
            require(bad.normalized().surfaceDepth == 2, "Negative surface depth accepted")
        }
        var designs: [CloudParameters] = []
        for style in CloudStyle.allCases { for mirrored in [false,true] {
            var p = CloudParameters(); p.style = style; p.mirrored = mirrored; designs.append(p)
        } }
        designs += suns
        var count = 0
        let smoke = CommandLine.arguments.contains("surface-smoke")
        let environment=ProcessInfo.processInfo.environment
        for design in smoke ? Array(designs.prefix(1)) : designs {
            if let filter=environment["LAMP_SURFACE_FILTER"], !design.displayName.lowercased().contains(filter) { continue }
            for variant in smoke ? [0] : [0,1,2,3] {
                if let filter=environment["LAMP_SURFACE_VARIANT"], String(variant) != filter { continue }
                var p = design; p.surface = .sculpted
                if variant == 1 {
                    p.width = p.minimumWidth; p.surfaceDepth = 30; p.diffuserThickness = 0.8
                    p.depth = 16; p.clipFit = 0.5; p.cableDiameter = 6; p.nailHead = 10
                } else if variant == 2 {
                    p.width = 500; p.surfaceDepth = 30; p.diffuserThickness = 2; p.depth = 40
                } else if variant == 3 {
                    p.surfaceDepth = 2; p.diffuserThickness = 2; p.depth = 16
                }
                p.cableSide = CableSide.allCases[(variant + designs.firstIndex(of:design)! + 1) % 4]
                p = p.normalized()
                require(p.normalized() == p, "Surface normalization is not idempotent")
                let restored = try JSONDecoder().decode(CloudParameters.self, from:JSONEncoder().encode(p))
                require(restored == p, "Surface settings did not persist")
                var flat = p; flat.surface = .flat
                require(p.filename != flat.filename && p.filename.contains("-3d-"), "Flat and sculpted export names collide")
                for quality in [BalloonGenerator.Quality.preview, .export] {
                    let kit = CloudKit(p, quality:quality)
                    let front = parseSTL(try kit.front.binarySTL())
                    try front.validate()
                    require(front.vertices.count-front.triangles.count/2 == 2, "Sculpted face has extra shells or holes")
                    require(abs(front.dimensions.x-p.width) < 0.002 && abs(front.dimensions.y-p.height) < 0.002, "Sculpting changed the silhouette")
                    require(abs(front.dimensions.z-(12+p.diffuserThickness+p.surfaceDepth)) < 0.003, "Sculpted front depth is incorrect")
                    require(abs(front.vertices.map(\.z).min()!) < 1e-6, "Sculpted clips are not on the print bed")
                    let placed = kit.placedFront()
                    require(abs(kit.assembly().dimensions.z-p.totalDepth) < 0.003, "Assembled depth readout is incorrect")
                    require(abs(placed.vertices.map(\.z).min()!-(p.depth-12)) < 0.003, "Surface changed clip seating")
                    require(zip(placed.vertices,kit.placedFront(exploded:true).vertices).allSatisfy { abs($0.1.z-$0.0.z-32) < 1e-8 }, "Exploded transform distorts the surface")
                    try checkCloudFeatures(p, back:kit.back, front:front, seal:kit.seal, full:variant == 1)
                    checkDiffuserShell(front, parameters:p, label:"\(p.displayName) \(p.width) \(quality)", exported:quality == .export)
                    if variant == 0 && quality == .export {
                        let flatBack = CloudGenerator.generate(flat, front:false, quality:quality)
                        let backData = try kit.back.binarySTL(), flatData = try flatBack.binarySTL()
                        require(backData == flatData, "Sculpting changed the matching back")
                        require(kit.instructions.contains("curved face up, clips down") && kit.instructions.contains("supports"), "Sculpted kit has flat printing instructions")
                        require(!kit.instructions.contains("printed face-down") && !kit.instructions.contains("flat print face"), "Sculpted guide promises a flat print face")
                        let folder = ".build/test-output/surfaces/\(p.kind.rawValue)-\(p.kind == .sun ? p.sunStyle.rawValue : p.style.rawValue)\(p.mirrored ? "-mirrored" : "")"
                        try FileManager.default.createDirectory(atPath:folder, withIntermediateDirectories:true)
                        for (name,data) in try kit.entries() { try data.write(to:URL(fileURLWithPath:"\(folder)/\(name)")) }
                    }
                }
                count += 1
                print("PASS sculpted \(p.displayName), \(Int(p.width)) mm, \(p.surfaceDepth) mm relief: both resolutions, shell thickness, clips and print orientation"); fflush(stdout)
            }
        }
        // Mirror the relief with the silhouette; the sun's rays remain symmetric.
        for style in CloudStyle.allCases {
            var a=CloudParameters(); a.surface = .sculpted; a.style=style
            var b=a; b.mirrored=true
            for x in stride(from:-110.0,through:110,by:7) { for y in stride(from:-40.0,through:100,by:7) {
                let ha=LampSurfaceGenerator.height(at:Point3(x:x,y:y,z:0),parameters:a)
                let hb=LampSurfaceGenerator.height(at:Point3(x:-x,y:y,z:0),parameters:b)
                require(abs(ha-hb) < 1e-9, "Mirroring changed cloud relief")
            } }
        }
        for sun in suns {
            var p=sun; p.surface = .sculpted
            for r in [0.0,30,55,75,85] { for i in 0..<120 {
                let a=Double(i)*Double.pi/60, b=a+p.sunStyle.sector
                let ha=LampSurfaceGenerator.height(at:Point3(x:r*cos(a),y:r*sin(a),z:0),parameters:p)
                let hb=LampSurfaceGenerator.height(at:Point3(x:r*cos(b),y:r*sin(b),z:0),parameters:p)
                require(abs(ha-hb) < 1e-8, "Sculpted sun lost ray symmetry")
            } }
            let tip=LampSurfaceGenerator.height(at:Point3(x:80,y:0,z:0),parameters:p)
            require(tip > 0.2, "\(p.displayName) rays have no sculpted relief")
        }
        // The front is a rounded body, not a relief on a plate: it rolls up
        // directly from the outline, without a flat border around the domes.
        for design in designs { for width in [design.minimumWidth,design.width,500] {
            var p=design; p.surface = .sculpted; p.width=width; p=p.normalized()
            for i in 0..<360 {
                let a=Double(i)*Double.pi/180
                let r=CloudGenerator.radius(a,inset:p.width*0.03,width:p.width,verticalScale:p.verticalScale,profile:p.profile)
                let h=LampSurfaceGenerator.height(at:Point3(x:r*cos(a),y:r*sin(a),z:0),parameters:p)
                require(h > 0.12*p.surfaceDepth, "\(p.displayName) \(width) has a flat border at \(i)°: \(h)")
            }
        } }
        // Puffs of different sizes stand at different heights instead of
        // merging into one mound; a sun's center stands above its rays.
        for style in CloudStyle.allCases {
            var p=CloudParameters(); p.surface = .sculpted; p.style=style
            let peaks=p.profile.lobes.map { LampSurfaceGenerator.height(at:Point3(x:$0.0*p.width,y:$0.1*p.width,z:0),parameters:p) }
            require(peaks.max()!-peaks.min()! > 0.2*p.surfaceDepth, "\(style.title) cloud has no distinct puffs")
        }
        // A sun's middle stands above its rays. Each ray is a body of its
        // own: its ridge stands well above the notches beside it, and it
        // falls towards its tip.
        for sun in suns {
            var p=sun; p.surface = .sculpted
            let style=p.sunStyle
            func height(_ radius:Double,_ angle:Double) -> Double {
                LampSurfaceGenerator.height(at:Point3(x:radius*p.width*cos(angle),y:radius*p.width*sin(angle),z:0),parameters:p)
            }
            let center=height(0,0), root=height(style.notchRadius,0), middle=height((style.notchRadius+0.5)/2,0)
            let valley=height(style.notchRadius-0.01,style.notchAngles[0])
            require(center > 0.95*p.surfaceDepth && root < 0.8*center, "\(p.displayName) has no domed center above its rays")
            require(root > 0.35*p.surfaceDepth && root-valley > 0.2*p.surfaceDepth, "\(p.displayName) has no rays standing above its notches")
            require(middle > 0.12*p.surfaceDepth && middle < 0.8*root, "\(p.displayName) rays do not fall towards their tips")
        }
        print("PASS \(count) sculpted kits, settings migration, symmetry, rounded outline and export guides")
    }

    /// The printed shell is held to a tight tolerance. A sun's preview has
    /// a coarser mesh, which cuts the corner at a sharp seam or ridge that
    /// crosses it: there the shown shell may be off by a little more.
    static func checkDiffuserShell(_ mesh: BalloonMesh, parameters p: CloudParameters, label: String, exported: Bool = true) {
        let thickness=p.diffuserThickness, coarse=p.kind == .sun && !exported
        let thin=coarse ? 0.2 : 0.08, thick=coarse ? 0.4 : 0.25
        let outer = mesh.triangles.filter { t in
            let a=mesh.vertices[t.a],b=mesh.vertices[t.b],c=mesh.vertices[t.c]
            return min(a.z,b.z,c.z) >= 12+thickness-0.0001 && (b-a).cross(c-a).unit.z > 0.01
        }
        let inner = mesh.triangles.filter { t in
            let a=mesh.vertices[t.a],b=mesh.vertices[t.b],c=mesh.vertices[t.c]
            return min(a.z,b.z,c.z) >= 12-0.0001 && (b-a).cross(c-a).unit.z < -0.01
        }
        require(!outer.isEmpty && !inner.isEmpty, "Missing sculpted shell faces")
        let outside=SurfaceQuery(vertices:mesh.vertices,triangles:outer)
        for index in stride(from:0,to:inner.count,by:max(1,inner.count/1000)) {
            let t=inner[index],a=mesh.vertices[t.a],b=mesh.vertices[t.b],c=mesh.vertices[t.c]
            for point in [a,(a+b+c)*(1.0/3)] {
                require(!outside.isCloser(than:thickness-thin,to:point), "Diffuser becomes thin on slopes: \(label), \(point)")
                // The rim over the seating ledge and skirt is solid. Inside
                // the skirt the light passes an even shell.
                let skirt=CloudGenerator.radius(atan2(point.y,point.x),inset:CloudParameters.wall+p.clipFit+2.0+0.5,
                                                width:p.width,verticalScale:p.verticalScale,profile:p.profile)
                if hypot(point.x,point.y) < skirt {
                    require(outside.isCloser(than:thickness+thick,to:point), "Diffuser became a thick solid: \(label), \(point)")
                }
            }
        }
        let center=Point3(x:0.173,y:0.217,z:1)
        let hit=ray(mesh,center,Point3(x:0,y:0,z:1))
        require((hit?.0 ?? 0) >= 10.99, "Sculpted front filled the LED cavity")
    }
}
