import Foundation

extension GeometryTests {
    /// The strain relief, measured on the exported triangles: two posts with
    /// pilot holes in the back, bar and anvil as printed and as they sit.
    /// Dimensions are stated here, independently of the generator.
    /// `front` and `seal` are seated on the back.
    static func checkCableClamp(_ p:CloudParameters,back:BalloonMesh,front:BalloonMesh,seal:BalloonMesh,full:Bool) throws {
        func distance(_ mesh:BalloonMesh,_ o:Point3,_ d:Point3) -> Double {ray(mesh,o,d)?.0 ?? .infinity}
        let label="\(p.displayName) \(p.width) mm, depth \(p.depth), cable \(p.cableDiameter) \(p.cableSide.rawValue)"
        func close(_ actual:Double,_ expected:Double,_ message:String) {
            require(abs(actual-expected)<0.003,"\(message): \(actual) instead of \(expected), \(label)")
        }
        let o=CableOutlet(p),floor=CloudParameters.floor,cable=p.cableDiameter
        let along=o.point(1,0,0)-o.point(0,0,0),across=o.point(0,1,0)-o.point(0,0,0)
        let up=Point3(x:0,y:0,z:1),down=Point3(x:0,y:0,z:-1)
        // Two square posts of 7 mm, 3.2 mm before the pocket's mouth, with
        // 0.4 mm either side of the seal between them.
        let inner=o.sealWidth/2+0.4,outer=inner+7,end=o.seat-3.2,start=end-7
        let screwT=start+3.5,screwH=inner+3.5
        // The cable's underside is 1.6 mm above the floor. Under the ribs
        // it keeps 80% of its diameter. The posts are 6 mm tall or more.
        let rest=1.6,flat=floor+rest+0.8*cable,postTop=max(floor+6,flat),rib=min(0.6,max(0.4,0.1*cable))
        guard let clamp=CableClamp(p) else {
            // Without the clamp the floor is as it was.
            for side in [-1.0,1] {
                close(distance(back,o.point(screwT,side*screwH,p.depth+1),down),p.depth+1-floor,"Floor without a strain relief")
            }
            return
        }
        close(o.axisZ-cable/2-floor,rest,"Cable above the floor")
        // Faces of the back around the clamp. Those of a large floor reach far.
        let here=o.point(screwT,0,0),reach=outer+12
        var near=back
        near.triangles=back.triangles.filter { t in
            let x=[t.a,t.b,t.c].map {back.vertices[$0].x},y=[t.a,t.b,t.c].map {back.vertices[$0].y}
            return x.min()!<here.x+reach && x.max()!>here.x-reach && y.min()!<here.y+reach && y.max()!>here.y-reach
        }

        // The posts.
        for side in [-1.0,1] {
            for (t,h) in [(start+0.7,inner+0.7),(end-0.7,inner+0.7),(start+0.7,outer-0.7),(end-0.7,outer-0.7)] {
                close(distance(near,o.point(t,side*h,p.depth+1),down),p.depth+1-postTop,"Height of the posts")
            }
            for z in [floor+0.4,postTop-0.4] {
                close(distance(near,o.point(screwT+2.6,0,z),across*side),inner,"Way between the posts")
                close(distance(near,o.point(screwT-2.6,side*(outer+2),z),across*(-side)),2,"Width of the posts")
                close(distance(near,o.point(start-2,side*(screwH+2.6),z),along),2,"Inner end of the posts")
                close(distance(near,o.point(end+1.5,side*(screwH-2.6),z),along*(-1)),1.5,"Outer end of the posts")
            }
            // A blind hole of 2.8 mm, with a wider mouth, down to 1.2 mm
            // above the rear. The floor beneath it is closed.
            let axis=o.point(screwT,side*screwH,0)
            close(distance(near,axis+up*(p.depth+1),down),p.depth+1-1.2,"Depth of the pilot hole")
            close(distance(near,axis+up*(-1),up),1,"Rear of the back is open under a post")
            close(distance(near,axis+up*0.01,up),1.19,"Floor under the pilot hole")
            for step in 0..<8 {
                let a=Double(step)*Double.pi/4+0.2,d=along*cos(a)+across*sin(a)
                for z in [1.5,floor,postTop-0.7] {
                    let hit=distance(near,axis+up*z,d)
                    require(hit<1.4+0.003 && hit>1.4*cos(Double.pi/24)-0.003,"Pilot hole: \(2*hit) mm at \(z), \(label)")
                    // Printed walls of 2 mm and more around the thread.
                    let wall=distance(near,axis+up*z+d*(hit+0.01),d)
                    require(z<floor+0.01 || wall>2.05,"Wall of a post: \(wall) mm, \(label)")
                }
                let mouth=distance(near,axis+up*(postTop-0.2),d)
                require(mouth<1.55+0.003 && mouth>1.55*cos(Double.pi/24)-0.003,"Mouth of the pilot hole: \(2*mouth) mm, \(label)")
            }
        }
        // The floor around the posts, and the posts in it: no gaps, nothing
        // doubled, nothing raised.
        let steps=full ? 3:1
        for i in 0...(9*steps) { for j in 0...(26*steps) {
            let t=start-1+0.013+Double(i)/Double(steps),h = -outer-1+0.017+Double(j)/Double(steps)*(2*outer+2)/26
            let hole=hypot(t-screwT,abs(h)-screwH)
            if hole<1.75 {continue}
            let post=t>start && t<end && abs(h)>inner && abs(h)<outer
            let hits=verticalHits(near,x:o.point(t,h,0).x,y:o.point(t,h,0).y)
            require(hits.count==2 && abs(hits[0])<1e-6 && abs(hits[1]-(post ? postTop:floor))<1e-6,
                    "Floor around the posts: \(hits) at \(t-start), \(h), \(label)")
        } }
        for t in near.triangles {
            let v=[t.a,t.b,t.c].map {near.vertices[$0]},middle=(v[0]+v[1]+v[2])*(1.0/3)
            let along=o.distance(of:(middle.x,middle.y)),beside=o.offset(of:(middle.x,middle.y))
            guard v.allSatisfy({abs($0.z-floor)<1e-6}),along>start-2.5,along<end+2.5,abs(beside)<outer+2.5 else {continue}
            require((v[1]-v[0]).cross(v[2]-v[0]).z>0,"A face of the floor is turned over: \(label)")
        }

        // The seal's way between the posts, and its landing.
        for h in [-o.sealWidth/2-0.3,0,o.sealWidth/2+0.3] { for z in [floor+0.3,o.axisZ,o.cheekTop-0.1] {
            require(distance(near,o.point(o.seat-0.1,h,z),along*(-1))>12-0.1-0.003,"Posts stand in the seal's way: \(label)")
        } }
        close(distance(near,o.point(screwT,0,p.depth+1),down),p.depth+1-floor,"Floor between the posts")

        // Bar and anvil as printed: closed bodies on the bed, without supports.
        let bar=parseSTL(try CableClampGenerator.bar(p).binarySTL()),anvil=parseSTL(try CableClampGenerator.anvil(p).binarySTL())
        try bar.validate();try anvil.validate()
        require(bar.vertices.count-bar.triangles.count/2 == -2,"Bar must be one body with two screw holes: \(label)")
        require(anvil.vertices.count-anvil.triangles.count/2 == 2,"Anvil must be one closed body: \(label)")
        let tongue=postTop-flat
        close(bar.dimensions.x,2*outer,"Length of the bar")
        close(bar.dimensions.y,3+2.6+tongue+rib,"Height of the bar")
        close(bar.dimensions.z,7,"Width of the bar")
        close(anvil.dimensions.x,7+2*(0.3+1.5),"Length of the anvil")
        close(anvil.dimensions.y,2*(inner+3),"Width of the anvil")
        close(anvil.dimensions.z,rest+cable/2,"Height of the anvil")
        for (name,mesh) in [("bar",bar),("anvil",anvil)] {
            close(mesh.vertices.map(\.z).min()!,0,"The \(name) does not lie on the bed")
            for t in mesh.triangles {
                let v=[t.a,t.b,t.c].map {mesh.vertices[$0]},normal=(v[1]-v[0]).cross(v[2]-v[0]).unit
                if normal.z > -0.7072 || v.allSatisfy({abs($0.z)<1e-6}) {continue}
                // The bar's screw holes lie: small bridges, as in any print.
                let hole=name == "bar" && v.allSatisfy { p in hypot(abs(p.x)-screwH,p.z-3.5)<1.7+0.003 }
                require(hole,"The \(name) needs supports: \(v), \(label)")
            }
        }

        // Seated.
        let seatedAnvil=CableClampGenerator.placedAnvil(anvil,parameters:p),seatedBar=CableClampGenerator.placedBar(bar,parameters:p)
        func frame(_ v:Point3) -> (t:Double,h:Double,z:Double) {(o.distance(of:(v.x,v.y)),o.offset(of:(v.x,v.y)),v.z)}
        let anvilPoints=seatedAnvil.vertices.map(frame),barPoints=seatedBar.vertices.map(frame)
        close(anvilPoints.map(\.z).min()!,floor,"The anvil does not lie on the floor")
        close(anvilPoints.map(\.t).min()!,start-1.8,"Inner end of the anvil")
        close(anvilPoints.map(\.t).max()!,end+1.8,"Outer end of the anvil")
        for q in anvilPoints {
            // 0.3 mm of play around the posts.
            require(abs(q.h)<inner-0.3+1e-6 || q.t<start-0.3+1e-6 || q.t>end+0.3-1e-6,"The anvil meets a post: \(q), \(label)")
            if abs(q.z-floor)<1e-6 {
                let v=o.point(q.t,q.h*0.999,floor+0.5)
                close(distance(near,v,down),0.5,"The anvil does not lie on free floor")
            }
        }
        close(barPoints.filter {abs($0.h)>inner+0.01}.map(\.z).min()!,postTop,"The bar does not rest on the posts")
        close(barPoints.map(\.t).min()!,start,"Inner edge of the bar")
        close(barPoints.map(\.t).max()!,end,"Outer edge of the bar")
        close(barPoints.map {abs($0.h)}.max()!,outer,"Ends of the bar")
        for q in barPoints where q.z<postTop-1e-6 {
            require(abs(q.h)<cable/2+0.4+1e-6,"The bar's tongue is wider than the way between the rails: \(q), \(label)")
        }
        // The tongue passes between the anvil's rails, which end below the bar.
        let rails=anvilPoints.filter {$0.z>floor+rest+1e-6}
        require(rails.allSatisfy {abs($0.h)>cable/2+0.7-1e-6 && abs($0.h)<cable/2+1.7+1e-6 && $0.z<postTop-0.5},"Rails of the anvil: \(label)")
        close(rails.map(\.z).max()!,floor+rest+cable/2,"Height of the rails")
        var parts=seatedBar
        parts.vertices += seatedAnvil.vertices
        parts.triangles += seatedAnvil.triangles.map {Triangle(a:$0.a+seatedBar.vertices.count,b:$0.b+seatedBar.vertices.count,c:$0.c+seatedBar.vertices.count)}
        // Ribs of the anvil and of the bar by turns, 1.5 mm apart. Each
        // leaves the cable 80% of its diameter.
        for (u,below,above) in [(0.5,rest,flat-floor),(2,rest-rib,flat-floor-rib),(3.5,rest,flat-floor),(5,rest-rib,flat-floor-rib),(6.5,rest,flat-floor)] {
            let middle=o.point(start+u,0.05,floor+(below+above)/2)
            close(distance(parts,middle,down),(above-below)/2,"Rib under the cable at \(u)")
            close(distance(parts,middle,up),(above-below)/2,"Rib over the cable at \(u)")
            close(above-below,0.8*cable,"Squeeze at \(u)")
        }
        // The cable's axis is free from end to end.
        require(ray(parts,o.point(start-4,0,o.axisZ),along) == nil,"The clamp blocks the cable: \(label)")
        // The screws: through the bar into the posts, their heads on the bar.
        var assembly=near
        assembly.vertices += parts.vertices
        assembly.triangles += parts.triangles.map {Triangle(a:$0.a+near.vertices.count,b:$0.b+near.vertices.count,c:$0.c+near.vertices.count)}
        for side in [-1.0,1] {
            let axis=o.point(screwT,side*screwH,p.depth+5)
            close(distance(assembly,axis,down),p.depth+5-1.2,"Screw's way into the post")
            for step in 0..<8 {
                let a=Double(step)*Double.pi/4+0.2,d=along*cos(a)+across*sin(a)
                // A shaft of 3 mm passes the bar. A head of 6 mm sits on it.
                require(distance(parts,axis+d*1.55,down)>100,"Screw hole of the bar: \(label)")
                close(distance(parts,axis+d*1.9,down),p.depth+5-postTop-3,"Seat of the screw head")
                close(distance(parts,axis+d*2.9,down),p.depth+5-postTop-3,"Seat of the screw head")
            }
        }
        // M3 × 10: 7 mm of thread in the post, and room beneath its tip.
        let engagement=10.0-3,depth=postTop-1.2
        require(engagement>=2*3 && depth>=engagement+0.5,"Thread of \(engagement) mm in a hole of \(depth) mm: \(label)")
        require(clamp.engagement==engagement && abs(clamp.holeDepth-depth)<1e-9,"Readout of the thread: \(label)")
        // Under the front, inside its skirt, clear of the seal.
        let top=postTop+3+2.6
        require(top<=p.depth-0.4+1e-9 && abs(clamp.top-top)<1e-9,"Screw heads reach the diffuser: \(top) of \(p.depth) mm, \(label)")
        close(barPoints.map(\.z).max()!,top,"The bar's crown is level with the screw heads")
        let sealStart=seal.vertices.map {o.distance(of:($0.x,$0.y))}.min()!
        require(anvilPoints.map(\.t).max()!<sealStart-0.4+0.003,"The anvil meets the seal: \(label)")
        for v in seatedBar.vertices+seatedAnvil.vertices {
            let skirt=CloudGenerator.radius(atan2(v.y,v.x),inset:CloudParameters.wall+p.clipFit+2.0,width:p.width,
                                            verticalScale:p.verticalScale,profile:p.profile)
            require(hypot(v.x,v.y)<skirt-0.65,"The clamp meets the reinforced root: \(skirt-hypot(v.x,v.y)) mm, \(label)")
            let beam=CloudGenerator.radius(atan2(v.y,v.x),inset:CloudParameters.wall+p.clipFit+1.6,width:p.width,
                                           verticalScale:p.verticalScale,profile:p.profile)
            require(hypot(v.x,v.y)<beam-1.05,"The clamp blocks the reinforced spring tab: \(label)")
        }
        for v in front.vertices {
            let q=frame(v)
            if q.t>start-2.3 && q.t<end+2.3 && abs(q.h)<outer+0.5 {
                require(q.z>top+0.39,"The front meets the clamp: \(q), \(label)")
            }
        }
        // Clear of the nail pocket, by 1.5 mm and more.
        let boss=CloudGenerator.Layout(p:p).nailBoss
        for q in seatedBar.vertices+seatedAnvil.vertices {
            require(!boss.expanded(1.499).contains(q.x,q.y),"The clamp meets the nail pocket: \(label)")
        }
        // No LEDs under the clamp.
        let keep=clamp.keepOut
        for v in seatedBar.vertices+seatedAnvil.vertices {
            require(v.x>=keep.x0-1e-5 && v.x<=keep.x1+1e-5 && v.y>=keep.y0-1e-5 && v.y<=keep.y1+1e-5,"LED keep-out misses the clamp: \(label)")
        }
    }

    /// Where the clamp fits, and what it leaves alone.
    /// `bash scripts/test.sh clamp`
    static func checkClamps() throws {
        // A region with holes, laid out in triangles.
        let points:[(Double,Double)]=[(0,0),(5,0),(10,0),(10,4),(10,8),(4,8),(0,8),(0,3),
                                      (2,2),(4,2),(4,6),(2,6),(6,2),(8,2),(8,6),(6,6)]
        guard let faces=FlatRegion.triangles(outline:Array(0..<8),holes:[[11,10,9,8],[15,14,13,12]],points:points) else {
            fatalError("No triangles for a plate with two holes")
        }
        let area=faces.reduce(0.0) { sum,f in
            let a=points[f.0],b=points[f.1],c=points[f.2],twice=(b.0-a.0)*(c.1-a.1)-(b.1-a.1)*(c.0-a.0)
            require(twice>1e-9,"A triangle is turned over or flat")
            return sum+twice/2
        }
        require(abs(area-(80-2*8))<1e-9 && faces.count==points.count+2*2-2,"Triangles do not cover the plate: \(area)")

        var designs:[CloudParameters]=[]
        for style in CloudStyle.allCases { for mirrored in [false,true] {
            var p=CloudParameters();p.style=style;p.mirrored=mirrored;designs.append(p)
        } }
        designs += suns
        var fitted=0,count=0,smallest:[String:Double]=[:]
        for design in designs { for side in CableSide.allCases {
            for width in stride(from:design.minimumWidth,through:500,by:10) { for cable in [2.0,3,6] { for depth in [16.0,40] {
                var p=design;p.cableSide=side;p.width=width;p.cableDiameter=cable;p.depth=depth
                p.nailHead=cable==2 ? 5:cable==3 ? 8:10;p.stripWidth=cable==2 ? 3.5:cable==3 ? 8:12;p.clipFit=cable==2 ? 0.2:0.5
                p=p.normalized();count += 1
                let label="\(p.displayName) \(width) mm, cable \(cable) \(side.rawValue)"
                guard let clamp=CableClamp(p) else {
                    // Only small lamps have no room for it: at the top, where
                    // the nail pocket is close, and in the narrow ends of a Twin.
                    // Every sun has room on all four sides.
                    let small=p.kind == .cloud && width<190 && (side == .top || (p.style == .twin && side != .bottom && width<=135))
                    require(small,"No room for the strain relief: \(label)")
                    smallest["\(p.displayName), \(side.rawValue)"]=max(smallest["\(p.displayName), \(side.rawValue)"] ?? 0,width)
                    continue
                }
                fitted += 1
                require(clamp.top<=16-0.4 && clamp.postTop>=9 && clamp.holeDepth>=7.8,"Height of the clamp: \(label)")
                // The outlet itself stays as it is.
                var plain=p;plain.strainRelief=false
                let o=CableOutlet(p),other=CableOutlet(plain)
                require(o.angle==other.angle && o.seat==other.seat && o.landing==12,"The strain relief moved the outlet: \(label)")
                require(CableClamp(plain) == nil,"A clamp that was not wanted: \(label)")
                let l=CloudGenerator.Layout(p:p),plainLayout=CloudGenerator.Layout(p:plain)
                require(l.lowY==plainLayout.lowY && l.highY==plainLayout.highY && l.coreX==plainLayout.coreX && p.height==plain.height
                        && p.ledCenterY==plain.ledCenterY && p.nailCenterY==plain.nailCenterY,"The strain relief moved the fittings: \(label)")
            } } }
        } }
        print("PASS \(fitted) of \(count) lamps have room for the strain relief. Without, up to: \(smallest.sorted {$0.key<$1.key}.map {"\($0.key) \(Int($0.value)) mm"}.joined(separator:"; "))");fflush(stdout)

        // Backs on every silhouette and side, from the smallest lamp on.
        var kits=0
        for design in designs where !design.mirrored { for side in CableSide.allCases {
            let least=design.minimumWidth
            for (index,width) in [least,least+20,least+40,least+70,design.width,300,500].enumerated() { for large in [false,true] {
                var p=design;p.cableSide=side;p.width=width
                p.cableDiameter=large ? 6:2;p.nailHead=large ? 10:5;p.nailShaft=large ? 5:2
                p.stripWidth=large ? 12:3.5;p.clipFit=large ? 0.5:0.2
                p.depth=large == (index%2==0) ? 16:30
                if index == 4 && !large {p=design;p.cableSide=side}
                p=p.normalized()
                guard CableClamp(p) != nil else {continue}
                checkLEDLayout(p)
                let quality:BalloonGenerator.Quality=index == 4 ? .export:.preview
                let kit=CloudKit(p,quality:quality)
                let back=parseSTL(try kit.back.binarySTL())
                try back.validate()
                require(back.vertices.count-back.triangles.count/2 == 0,"The posts changed the back's topology: \(p.displayName) \(width) \(side.rawValue)")
                var placed=kit.front
                placed.vertices=kit.front.vertices.map {Point3(x:$0.x,y:-$0.y,z:p.totalDepth-$0.z)}
                try checkCableClamp(p,back:back,front:placed,seal:kit.placedSeal(),full:index == 4 && !large)
                // Front and seal are the same without the strain relief.
                var plain=p;plain.strainRelief=false
                let other=CloudKit(plain,quality:quality)
                let same=try other.front.binarySTL() == kit.front.binarySTL() && other.seal.binarySTL() == kit.seal.binarySTL()
                require(same,"The strain relief changed the front or the seal: \(p.displayName) \(width) \(side.rawValue)")
                require(other.clamp == nil && other.bar == nil && other.printedParts==3 && kit.printedParts==5,"Parts of the kit")
                try checkCableClamp(plain,back:parseSTL(try other.back.binarySTL()),front:placed,seal:kit.placedSeal(),full:false)
                kits += 1
                if index == 4 && !large {
                    // The default kits, with their small parts as they sit,
                    // for scripts/verify-cloud-blender.py.
                    let name=p.kind == .sun ? "sun-\(p.sunStyle.rawValue)" : "cloud-\(p.style.rawValue)"
                    let folder=".build/test-output/clamp/\(name)-\(side.rawValue)"
                    try FileManager.default.createDirectory(atPath:folder,withIntermediateDirectories:true)
                    for (name,data) in try kit.entries() {try data.write(to:URL(fileURLWithPath:"\(folder)/\(name)"))}
                    let seated=kit.placedClamp()
                    for (name,mesh) in [("seal",kit.placedSeal()),("anvil",seated[0]),("bar",seated[1])] {
                        try mesh.binarySTL().write(to:URL(fileURLWithPath:"\(folder)/seated-\(name).stl"))
                    }
                }
            } }
            print("PASS \(design.displayName), cable at the \(side.rawValue): posts, pilot holes, floor, bar, anvil, screws, skirt and LED layout");fflush(stdout)
        } }
        try checkClampSettings()
        print("PASS \(kits) kits with a strain relief, each against the same kit without")
    }

    static func checkClampSettings() throws {
        for kind in [WallLampKind.cloud,.sun] {
            let saved=try JSONDecoder().decode(CloudParameters.self,from:Data("{\"kind\":\"\(kind.rawValue)\",\"width\":188,\"cableSide\":\"left\"}".utf8))
            require(saved.strainRelief && saved.cableSide == .left && saved.width==188,"A saved lamp must get the strain relief")
            for wanted in [true,false] { for side in CableSide.allCases {
                var p=kind.defaults;p.strainRelief=wanted;p.cableSide=side
                let restored=try JSONDecoder().decode(CloudParameters.self,from:JSONEncoder().encode(p))
                require(restored==p && restored.strainRelief==wanted && p.normalized().strainRelief==wanted,"Strain relief did not persist")
                var other=p;other.strainRelief = !wanted
                require(p.filename==other.filename,"Kits with and without the clamp fit each other: one name")
                let kit=CloudKit(p),names=try kit.entries().map(\.0)
                require((kit.clamp != nil) == wanted,"The default lamps have room for the strain relief on every side")
                require(names.contains(CloudParameters.barFilename) == wanted && names.contains(CloudParameters.anvilFilename) == wanted
                        && names.filter {$0.hasSuffix(".stl")}.count==(wanted ? 5:3),"Kit and strain relief: \(names)")
                let guide=kit.instructions
                require(guide.contains("## Strain relief") == wanted && guide.contains("M3 × 10.0 mm") == wanted
                        && guide.contains("until the bar\n   rests on both posts") == wanted,"Guide and strain relief")
                require(guide.contains("secure the lead outside the lamp") != wanted,"Guide must say what holds the lead")
                require(kit.ledPlan.svg.contains("strain relief") == wanted,"LED plan and strain relief")
                require(kit.assemblyColors.count==kit.assembly().triangles.count && kit.backColors.count==kit.backWithLEDGuides.triangles.count
                        && kit.assemblyColors.count==kit.assembly(exploded:true).triangles.count,"Colors of the preview")
                require((kit.clampPrintView != nil) == wanted,"Print view of the clamp")
            } }
        }
        // Wanted, but without room: the kit says so.
        var small=CloudParameters();small.width=100;small.cableSide = .top
        let kit=CloudKit(small)
        require(kit.clamp == nil && kit.printedParts==3 && kit.instructions.contains("no room for the screwed strain relief")
                && kit.instructions.contains("fix the lead to the wall"),"A lamp without room for the clamp must say so")
        let least=CableClamp.minimumWidth(small) ?? 0
        var wider=small;wider.width=least
        var narrower=small;narrower.width=least-1
        require(least>100 && least<=160 && CableClamp(wider.normalized()) != nil && CableClamp(narrower.normalized()) == nil,"Width from which the clamp fits")
        print("PASS strain relief: persistence, saved lamps, kit contents, guide and LED plan")
    }
}
