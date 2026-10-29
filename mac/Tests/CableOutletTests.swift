import Foundation

extension GeometryTests {
    /// Two, three or four outlets on different sides: all six pairs, the
    /// four triples and all four sides. `bash scripts/test.sh chained-outlets`
    static func checkChainedOutlets() throws {
        let all=CableSide.allCases
        func subsets(_ size:Int,from start:Int) -> [[CableSide]] {
            size==0 ? [[]] : (start..<all.count).flatMap { i in subsets(size-1,from:i+1).map { [all[i]]+$0 } }
        }
        let sets=(2...all.count).flatMap { subsets($0,from:0) }
        for kind in [WallLampKind.cloud,.sun] {
            let legacy=try JSONDecoder().decode(CloudParameters.self,from:Data("{\"kind\":\"\(kind.rawValue)\",\"cableSide\":\"top\"}".utf8))
            require(legacy.cableSides == [.top] && legacy.secondCableSide == nil,"Legacy lamp acquired a second outlet")
            let pair=try JSONDecoder().decode(CloudParameters.self,from:Data("{\"kind\":\"\(kind.rawValue)\",\"cableSide\":\"top\",\"secondCableSide\":\"left\"}".utf8))
            require(pair.cableSides == [.top,.left] && pair.thirdCableSide == nil && pair.fourthCableSide == nil,"Lamp with two outlets changed")
            let saved=String(decoding:try JSONEncoder().encode(pair),as:UTF8.self)
            require(!saved.contains("third") && !saved.contains("fourth"),"Settings of two outlets gained keys")
            var names=Set<String>()
            for set in sets {
                var p=kind.defaults;p.cableSides=set
                let restored=try LampSettingsFile.decode(JSONEncoder().encode(p))
                require(restored==p && p.normalized()==p && restored.cableSides==set,"Every cable side must persist in exported settings")
                require(names.insert(p.filename).inserted,"Different sets of outlets share a kit name")
                // Moving the first outlet onto another's side swaps the two.
                p.selectCableSide(set.last!)
                require(p.cableSides==[set.last!]+set.dropFirst().dropLast()+[set.first!] && p.filename==restored.filename,"Selecting a used side must swap outlets")
                p.selectCableSide(set.last!,outlet:set.count-1)
                require(p.cableSides==set,"Selecting a used side for a later outlet must swap outlets")
                var duplicate=p,unique=kind.defaults
                if set.count<4 {duplicate.fourthCableSide=duplicate.cableSide;unique.cableSides=set}
                else {duplicate.thirdCableSide=duplicate.secondCableSide;unique.cableSides=[set[0],set[1],set[3]]}
                require(duplicate.normalized()==unique,"Duplicate sides must not create coincident fittings")
                if set.count==3 {
                    // A gap closes up: the third outlet becomes the second.
                    var gap=p;gap.secondCableSide=nil
                    require(gap.normalized().cableSides==[set[0],set[2]] && gap.normalized().thirdCableSide==nil,"An outlet after a gap was lost")
                }
                var more=p;more.setCableOutletCount(4)
                require(more.cableSides.count==4 && Set(more.cableSides).count==4 && Array(more.cableSides.prefix(set.count))==set,"Adding outlets moved the others")
                p.setCableOutletCount(set.count-1)
                require(p.cableSides==Array(set.dropLast()),"Turning off the last outlet changed the others")
                p.setCableOutletCount(1)
                require(p.cableSides==[set[0]] && p.secondCableSide==nil && p.thirdCableSide==nil && p.fourthCableSide==nil,"Turning off the outlets lost the first")
            }
            var single=kind.defaults
            for (count,expected) in [(2,[CableSide.right,.left]),(3,[.right,.left,.bottom]),(4,[.right,.left,.bottom,.top])] {
                single.setCableOutletCount(count)
                require(single.cableSides==expected,"New outlets start on unexpected sides: \(single.cableSides)")
            }
        }
        var designs:[CloudParameters]=[]
        for style in CloudStyle.allCases { for mirrored in [false,true] {
            var p=CloudParameters();p.style=style;p.mirrored=mirrored;designs.append(p)
        } }
        designs += suns
        var count=0
        for (designIndex,design) in designs.enumerated() { for (setIndex,set) in sets.enumerated() {
            for variant in 0..<3 {
                // Each outlet comes first somewhere: the mesher takes them in turn.
                let turn=(designIndex+variant)%set.count
                var p=design;p.cableSides=Array(set[turn...]+set[..<turn])
                if variant==0 {p.width=p.minimumWidth;p.depth=16;p.cableDiameter=6;p.nailHead=10;p.nailShaft=5;p.clipFit=0.5}
                if variant==2 {p.width=500;p.depth=40;p.cableDiameter=2;p.strainRelief=false}
                // Exercise both print orientations, including both skirt notches.
                if variant==0 && (designIndex+setIndex)%2==0 {p.surface = .sculpted}
                p=p.normalized()
                let label="\(p.displayName), \(Int(p.width)) mm, \(p.cableSides.map(\.rawValue).joined(separator:"+")), \(p.surface.rawValue)"
                checkLEDLayout(p)
                for quality in [BalloonGenerator.Quality.preview,.export] {
                    let kit=CloudKit(p,quality:quality)
                    do {
                        let back=parseSTL(try kit.back.binarySTL()),front=parseSTL(try kit.front.binarySTL())
                        try back.validate();try front.validate()
                        require(back.vertices.count-back.triangles.count/2 == 2-2*set.count,"Back must have one cable through-path per outlet: \(label)")
                        require(front.vertices.count-front.triangles.count/2 == 2,"Front must remain one closed shell: \(label)")
                        require(abs(back.dimensions.x-p.width)<0.003 && abs(back.dimensions.y-p.height)<0.003,"Several outlets changed dimensions: \(label)")
                        require(kit.cables.count==set.count && kit.printedParts==2+set.count+2*kit.clampCount,"Wrong parts count with several outlets")
                        require(kit.clampCount==p.cableConfigurations.compactMap({CableClamp($0)}).count,"A clamp lost its posts: \(label)")
                        require(kit.assembly().triangles.count==kit.assemblyColors.count,"Assembly colors miss an outlet")
                        require(kit.backWithLEDGuides.triangles.count==kit.backColors.count,"Back preview colors miss an outlet")
                        let placed=kit.placedFront()
                        for cable in kit.cables {
                            let seal=parseSTL(try cable.seal.binarySTL())
                            try checkCableOutlet(cable.parameters,back:back,front:placed,seal:seal,full:false,
                                                 otherClamps:kit.cables.compactMap(\.clamp))
                            if variant != 2 {
                                try checkCableClamp(cable.parameters,back:back,front:placed,seal:cable.placedSeal(),full:false)
                            }
                            require(kit.instructions.contains(cable.sealFilename),"Assembly guide misses a seal")
                            require(kit.instructions.contains("## \(cable.parameters.cableSide.title) cable outlet"),"Assembly guide misses an outlet")
                            require(kit.ledPlan.svg.contains(cable.parameters.cableSide.title),"LED plan misses an outlet")
                        }
                        if variant==1 && quality == .export {
                            let entries=try kit.entries()
                            require(Set(entries.map(\.0)).count==entries.count,"Outlet parts overwrite each other")
                            require(entries.filter {$0.0.hasSuffix(".stl")}.count==kit.printedParts,"Wrong STL count")
                            for cable in kit.cables {
                                require(entries.contains {$0.0==cable.sealFilename},"Export lacks a side-specific seal")
                            }
                            if designIndex==0 && (setIndex==0 || set.count==4) {
                                let folder=".build/test-output/chained-outlets\(set.count==4 ? "-four" : "")"
                                try FileManager.default.createDirectory(atPath:folder,withIntermediateDirectories:true)
                                for (name,data) in entries {try data.write(to:URL(fileURLWithPath:"\(folder)/\(name)"))}
                                try kit.archive().write(to:URL(fileURLWithPath:"\(folder)/\(p.filename)"))
                            }
                        }
                    } catch {print("FAIL \(label), \(quality): \(error)");throw error}
                }
                count += 1
                print("PASS chained outlets \(count): \(label), preview and export");fflush(stdout)
            }
        } }
        print("PASS \(count) chained lamp kits: all six side pairs, four triples and all four sides, seals, clamps, notches, LED clearance, settings and exports")
    }

    /// The outlet in the wall, its pocket and the flexible seal, measured on
    /// the exported triangles. `front` is seated on the back.
    static func checkCableOutlet(_ p:CloudParameters,back:BalloonMesh,front:BalloonMesh,seal:BalloonMesh,full:Bool,
                                 otherClamps:[CableClamp]=[]) throws {
        func distance(_ mesh:BalloonMesh,_ o:Point3,_ d:Point3) -> Double {ray(mesh,o,d)?.0 ?? .infinity}
        func close(_ actual:Double,_ expected:Double,_ message:String) {
            require(abs(actual-expected)<0.003,"\(message): \(actual) instead of \(expected), \(p.displayName) \(p.width) mm, cable \(p.cableDiameter) \(p.cableSide.rawValue)")
        }
        let o=CableOutlet(p),wall=CloudParameters.wall,floor=CloudParameters.floor
        let along=o.point(1,0,0)-o.point(0,0,0),across=o.point(0,1,0)-o.point(0,0,0)
        let up=Point3(x:0,y:0,z:1),down=Point3(x:0,y:0,z:-1)
        let label="\(p.displayName) \(p.width) mm, cable \(p.cableDiameter) \(p.cableSide.rawValue)"

        // The chosen side, within 30° of it, clear of the clips' columns.
        let clips=LampClips(p),sun=p.kind == .sun
        let outward:[CableSide:Point3]=[.right:Point3(x:1,y:0,z:0),.left:Point3(x:-1,y:0,z:0),
                                        .top:Point3(x:0,y:1,z:0),.bottom:Point3(x:0,y:-1,z:0)]
        require(along.dot(outward[p.cableSide]!)>0.86,"Cable leaves on the wrong side: \(label)")
        let strip=atan(o.notchHalfWidth/o.seat)
        for clip in sun ? clips.centers : [Double.pi/6,5*Double.pi/6,7*Double.pi/6,11*Double.pi/6] {
            let apart=abs((o.angle-clip).remainder(dividingBy:2*Double.pi))
            require(apart>strip+(sun ? clips.half+clips.slit : 6/(p.width*0.4))+0.01,"Cable outlet crosses a clip: \(label)")
        }

        // Nothing is left of the rear outlet. The floor is closed beneath the pocket too.
        let c=p.cableClearance,former=(1.5+0.5*p.compactBlend)*c+3+p.compactBlend
        let clamp=CableClamp(p)
        for point in [Point3(x:-former+c/2,y:p.cableStartY+c/2,z:-1),o.point(o.seat+3,0,-1),o.point(o.seat-5,0,-1)] {
            close(distance(back,point,up),1,"Rear of the back is not flat")
            // In a small lamp a post of the strain relief may stand
            // where the rear outlet was.
            if (otherClamps+(clamp.map {[$0]} ?? [])).contains(where: { fitting in
                let t=fitting.outlet.distance(of:(point.x,point.y)),h=abs(fitting.outlet.offset(of:(point.x,point.y)))
                return t>fitting.start-0.01 && t<fitting.end+0.01 && h>fitting.inner-0.01 && h<fitting.outer+0.01
            }) {continue}
            close(distance(back,Point3(x:point.x,y:point.y,z:floor+0.5),down),0.5,"Floor is open or raised")
        }

        // A clear way out for the cable's whole jacket.
        let reachIn=o.reach(0,inset:wall),reachOut=o.reach(0,inset:0)
        let jacket=p.cableDiameter/2+0.2
        for (h,z) in [(0.0,0.0),(jacket,0),(-jacket,0),(0,jacket),(0,-jacket)] {
            require(ray(back,o.point(o.seat-4,h,o.axisZ+z),along) == nil,"Cable route is blocked: \(label)")
        }
        let middle=o.point((reachIn+reachOut)/2,0,o.axisZ)
        close(distance(back,middle,up),o.windowZ.upperBound-o.axisZ,"Window height")
        close(distance(back,middle,down),o.axisZ-o.windowZ.lowerBound,"Window sill")
        for side in [-1.0,1] {
            let h=side*o.window/2,t=(o.reach(h,inset:wall)+o.reach(h,inset:0))/2
            close(distance(back,o.point(t,0,o.axisZ),across*side),o.window/2,"Window width")
            // Around the window the wall is whole, without the clips' groove.
            // Between two columns it is a chord of the outline, which shows
            // most where the outline runs along the cable, beside a ray.
            let beside=side*(o.window/2+0.4)
            let inside=o.point(o.reach(beside,inset:wall)-1,beside,o.axisZ),outside=o.point(o.reach(beside,inset:0)+1,beside,o.axisZ)
            let behind=distance(back,inside,along),facing=distance(back,outside,along*(-1))
            require(abs(behind-1)<0.5 && abs(facing-1)<0.5,"Wall beside the window: \(behind), \(facing), \(label)")
            let lift=Point3(x:0,y:0,z:p.depth-10.25-o.axisZ)
            close(distance(back,inside+lift,along),behind,"Groove behind the flange")
            close(distance(back,outside+lift,along*(-1)),facing,"Wall beside the window")
            require(o.reach(beside,inset:0)+1-facing-(o.reach(beside,inset:wall)-1+behind)>wall-0.01,"Wall beside the window is thin: \(label)")
        }

        // The pocket: two cheeks on the floor, open above and to the cavity.
        let seated=o.point(o.seat+3,0,o.axisZ)
        close(distance(back,seated,down),o.axisZ-floor,"Pocket floor")
        require(ray(back,seated,up) == nil,"Pocket is closed above: \(label)")
        // Room to slide the seal in, across the whole strip. Only the nail
        // pocket above a small cloud's top outlet may shorten it.
        let landing=o.landing
        require(landing>=7 && landing<=12,"No room to slide the seal in: \(landing) mm, \(label)")
        require(landing==12 || (p.kind == .cloud && p.cableSide == .top && p.width<140),"Landing is short without need: \(landing) mm, \(label)")
        require(distance(back,seated,along*(-1))>landing+3-0.003,"Seal's way into the pocket is blocked: \(label)")
        // The posts of a strain relief stand beside the seal's way.
        let beside=clamp == nil ? [o.pocketWidth/2+CableOutlet.cheek/2,o.notchHalfWidth-0.1] : [o.sealWidth/2+0.1,o.sealWidth/2+0.3]
        for h in beside.map({-$0})+[0]+beside {
            for z in [floor+0.3,o.axisZ,o.cheekTop-0.1] {
                require(distance(back,o.point(o.seat-0.1,h,z),along*(-1))>landing-0.1-0.003,"Floor in front of the pocket is not free: \(label)")
            }
        }
        for side in [-1.0,1] {
            close(distance(back,seated,across*side),o.pocketWidth/2,"Pocket width")
            let outside=side*(o.pocketWidth/2+CableOutlet.cheek+2)
            close(distance(back,o.point(o.seat+3,outside,floor+1),across*(-side)),2,"Cheek thickness")
            let center=side*(o.pocketWidth/2+CableOutlet.cheek/2)
            close(distance(back,o.point(o.seat+3,center,p.depth+1),down),p.depth+1-o.cheekTop,"Cheek height")
            close(distance(back,o.point(o.seat-2,center,floor+1),along),2,"Pocket mouth")
        }

        // The seal as printed: one closed body, standing on its flat end.
        try seal.validate()
        require(seal.vertices.count-seal.triangles.count/2 == 2,"Seal must be one body with an open slit: \(label)")
        let lo=seal.vertices.reduce(Point3(x:.infinity,y:.infinity,z:.infinity)) {Point3(x:min($0.x,$1.x),y:min($0.y,$1.y),z:min($0.z,$1.z))}
        require(abs(lo.z)<1e-6,"Seal does not stand on the bed: \(label)")
        close(seal.dimensions.x,o.sealWidth,"Seal width")
        close(seal.dimensions.y,o.sealHeight,"Seal height")
        // The nozzle's end follows the outline from inside.
        let tips=(-20...20).map {o.reach(Double($0)*o.nozzle/40,inset:CableOutlet.recess)}
        require(seal.dimensions.z<tips.max()!-o.sealStart+0.003 && seal.dimensions.z>tips.min()!-o.sealStart-0.1,
                "Seal length: \(seal.dimensions.z), between \(tips.min()!-o.sealStart) and \(tips.max()!-o.sealStart), \(label)")
        require(seal.dimensions.z>=CableOutlet.handle+CableOutlet.seatLength+wall-CableOutlet.recess-0.01,"Seal too short: \(label)")
        // Just past the flange only the nozzle is left, as wide as it is tall.
        let lower=o.nozzleZ-floor-o.sealHeight/2
        for side in [-1.0,1] {
            let past=o.reach(side*o.nozzle/2,inset:wall)-o.sealStart+0.2
            close(distance(seal,Point3(x:side*20,y:lower+o.nozzle/2,z:past),Point3(x:-side,y:0,z:0)),20-o.nozzle/2,"Nozzle width")
        }
        let above=o.reach(0.8,inset:wall)-o.sealStart+0.2
        close(distance(seal,Point3(x:0.8,y:20,z:above),Point3(x:0,y:-1,z:0)),20-lower-o.nozzle,"Nozzle height")
        close(distance(seal,Point3(x:0.8,y:-20,z:above),Point3(x:0,y:1,z:0)),20+lower,"Nozzle position")
        // Oversize where it is held, undersize around the cable.
        close(o.nozzle-o.window,CableOutlet.squeeze,"Nozzle squeeze")
        close(o.sealWidth-o.pocketWidth,CableOutlet.slit+CableOutlet.squeeze,"Pocket must close the slit")
        close(p.cableDiameter-o.bore,CableOutlet.grip,"Bore grip")
        require(o.cheekTop<=p.depth-3 && o.windowZ.lowerBound>floor+0.5,"Outlet leaves its wall: \(label)")

        // Seated in the back.
        let placed=CableSealGenerator.placed(seal,parameters:p)
        close(placed.vertices.map(\.z).min()!,floor,"Seal rests on the floor")
        close(placed.vertices.map(\.z).max()!,o.cheekTop,"Seal is level with the cheeks")
        for v in placed.vertices {
            let outline=CloudGenerator.radius(atan2(v.y,v.x),inset:CableOutlet.recess-0.01,width:p.width,verticalScale:p.verticalScale,profile:p.profile)
            require(hypot(v.x,v.y)<outline+1e-4,"Seal stands out of the wall: \(label)")
        }
        require(ray(placed,o.point(o.sealStart-1,0,o.axisZ),along) == nil,"Bore is blocked: \(label)")
        let radius=o.bore/2
        for step in [0,1,2,3,4,5,7] {
            let a=Double(step)*Double.pi/4,d=across*cos(a)+up*sin(a)
            let hit=distance(placed,o.point(o.seat+2,0,o.axisZ),d)
            require(hit<radius+0.003 && hit>radius*0.975-0.003,"Bore diameter: \(hit*2) instead of \(o.bore), \(label)")
        }
        close(distance(placed,o.point(o.seat+2,0,o.axisZ-radius-0.2),across),CableOutlet.slit/2,"Slit width")
        close(distance(placed,o.point(o.seat+2,0,o.axisZ-radius-0.2),across*(-1)),CableOutlet.slit/2,"Slit width")
        // Seen from outside, the nozzle fills the window just inside the surface.
        let opening:(Double,Double) -> Bool = {h,z in hypot(h,z-o.axisZ)<radius+0.02 || (abs(h)<CableOutlet.slit/2+0.02 && z<o.axisZ)}
        let steps=full ? 9:5
        for i in 0..<steps { for j in 0..<steps {
            let h=(o.window/2-0.05)*(2*Double(i)/Double(steps-1)-1)
            let z=o.windowZ.lowerBound+0.05+(o.window-0.1)*Double(j)/Double(steps-1)
            if opening(h,z) {continue}
            let outside=o.point(o.reach(h,inset:0)+1,h,z)
            // Inside the outline, with most of its length in the wall.
            let hit=distance(placed,outside,along*(-1)),through=o.reach(h,inset:0)-o.reach(h,inset:wall)
            require(hit>1+0.25 && hit<1+through-1.2,"Nozzle does not fill the window: ends \(hit-1) mm inside a wall of \(through) mm, \(label)")
            require(hit<distance(back,outside,along*(-1)),"Window is open beside the nozzle: \(label)")
        } }
        // The flange lies against the wall around the window. Beside a ray,
        // where the wall runs away along the cable, it stays level.
        for (h,z) in [(o.window/2+0.6,o.axisZ),(-o.window/2-0.6,o.axisZ),(0.8,o.windowZ.upperBound+0.45),(0.8,o.windowZ.lowerBound-0.45)] {
            let inside=o.point(o.sealStart+0.05,h,z)
            let flange=distance(placed,inside,along),face=distance(back,inside,along)
            let level=abs(h)<=o.nozzle/2 ? o.reach(h,inset:wall) : min(o.reach(h,inset:wall),o.reach(h<0 ? -o.nozzle/2:o.nozzle/2,inset:wall))
            require(flange<level-o.sealStart-0.05+0.05,"Flange stands \(flange-(level-o.sealStart-0.05)) mm into the wall: \(label)")
            require(face>flange-0.3,"Flange meets the wall \(flange-face) mm early: \(label)")
            // Level wall: the flange lies against it.
            let nearby=[-0.6,-0.3,0,0.3,0.6].map {o.reach(h+$0,inset:wall)}
            if nearby.max()!-nearby.min()!<0.2 {
                require(abs(flange-face)<0.4,"Flange misses the wall by \(face-flange): \(label)")
            }
        }

        // Light: no straight line from the cavity leaves through the outlet,
        // except along the bore, which the cable fills, and the pressed slit.
        let here=o.point(o.seat+3,0,0)
        var outlet=back
        outlet.triangles=back.triangles.filter { t in
            [t.a,t.b,t.c].contains {hypot(back.vertices[$0].x-here.x,back.vertices[$0].y-here.y)<o.notchHalfWidth+30}
        }
        let offset=outlet.vertices.count
        outlet.vertices += placed.vertices
        outlet.triangles += placed.triangles.map {Triangle(a:$0.a+offset,b:$0.b+offset,c:$0.c+offset)}
        let lamps=full ? 6:3,exits=full ? 5:3
        for a in 0..<lamps { for b in 0..<lamps { for i in 0..<exits { for j in 0..<exits {
            let from=o.point(o.sealStart-2,o.notchHalfWidth*(2*Double(a)/Double(lamps-1)-1),
                             floor+0.3+(o.cheekTop+3-floor)*Double(b)/Double(lamps-1))
            let h=(o.window/2-0.05)*(2*Double(i)/Double(exits-1)-1)
            let to=o.point(o.reach(h,inset:0)+0.3,h,o.windowZ.lowerBound+0.05+(o.window-0.1)*Double(j)/Double(exits-1))
            let d=to-from
            if distance(outlet,from,d.unit)<d.length {continue}
            // Open: only along the bore or the slit, from end to end.
            for t in [o.sealStart,o.reach(0,inset:wall)] {
                let u=(t-o.distance(of:(from.x,from.y)))/(o.distance(of:(to.x,to.y))-o.distance(of:(from.x,from.y)))
                let q=from+d*u
                require(opening(o.offset(of:(q.x,q.y)),q.z),"Light passes the cable seal: \(label)")
            }
        } } } }

        // The skirt stays clear of the pocket and the seal.
        for v in front.vertices {
            let h=o.offset(of:(v.x,v.y)),t=o.distance(of:(v.x,v.y))
            if abs(h)<o.pocketWidth/2+CableOutlet.cheek+0.5 && t>o.sealStart-0.5 {
                require(v.z>o.cheekTop+0.45,"Skirt meets the seal's pocket: \(label)")
            }
        }
        require(o.notchesSkirt == (p.depth-12<o.notchTop),"Skirt notch readout: \(label)")
    }

    static func checkCableSettings() throws {
        for kind in [WallLampKind.cloud,.sun] {
            let legacy=try JSONDecoder().decode(CloudParameters.self,from:Data("{\"kind\":\"\(kind.rawValue)\",\"width\":188,\"cableDiameter\":4}".utf8))
            require(legacy.cableSide == .right && legacy.cableDiameter==4 && legacy.width==188,"Saved lamp lost its settings with the side outlet")
            var names=Set<String>()
            for side in CableSide.allCases {
                var p=kind.defaults;p.cableSide=side
                let restored=try JSONDecoder().decode(CloudParameters.self,from:JSONEncoder().encode(p))
                require(restored==p && restored.cableSide==side,"Cable side did not persist")
                require(p.normalized().cableSide==side,"Normalization changed the cable side")
                require(names.insert(p.filename).inserted,"Left and right kits share a filename")
                let kit=CloudKit(p)
                let entries=try kit.entries().map(\.0)
                require(entries.filter {$0.hasSuffix(".stl")}.count==kit.printedParts && entries.contains(CloudParameters.sealFilename),"Kit must contain the cable seal")
                let place:[CableSide:String]=[.left:"side wall, on the left as you face the lamp",.right:"side wall, on the right as you face the lamp",
                                              .top:"outer wall, at the top of the lamp",.bottom:"outer wall, at the bottom of the lamp"]
                require(kit.instructions.contains(place[side]!) && kit.instructions.contains("TPU"),"Guide does not describe the outlet")
                require(place.values.filter {kit.instructions.contains($0)}.count==1,"Guide describes several outlets")
                require(kit.clamp != nil && !kit.instructions.contains("fix the lead to the wall"),"The clamp carries the cable, at the top too")
                var plain=p;plain.strainRelief=false
                require(CloudKit(plain).instructions.contains("fix the lead to the wall") == (side == .top),"Guide must tell to relieve a cable that leaves at the top")
                let suffix:[CableSide:String]=[.left:"-cable-left-kit.zip",.right:"mm-kit.zip",.top:"-cable-top-kit.zip",.bottom:"-cable-bottom-kit.zip"]
                require(p.filename.hasSuffix(suffix[side]!),"Kit is not named after its outlet: \(p.filename)")
                require(!kit.instructions.contains("spacers at least") && !kit.instructions.contains("U-shaped"),"Guide still describes the rear outlet")
            }
            require(kind.defaults.filename == (kind == .sun ? "Sun-Lamp-soft-star-200mm-kit.zip":"Cloud-Lamp-230mm-kit.zip"),"Default kit was renamed")
        }
        require(CableSide.allCases.count==4 && Set(CableSide.allCases.map(\.rawValue))==["left","right","top","bottom"],"Cable exits changed")
        // Left is the mirror image of right for a cloud together with its
        // mirrored silhouette. Top and bottom turn over with a cloud's
        // silhouette too. A sun's exits are a quarter turn apart instead.
        for sun in suns { for width in [sun.minimumWidth,200,500] { for cable in [2.0,6] {
            var a=sun;a.width=width;a.cableDiameter=cable
            let right=CableOutlet(a.normalized())
            for (turns,side) in [CableSide.top,.left,.bottom].enumerated() {
                a.cableSide=side
                let turned=CableOutlet(a.normalized())
                require(abs((turned.angle-right.angle-Double(turns+1)*Double.pi/2).remainder(dividingBy:2*Double.pi))<1e-9 && abs(turned.seat-right.seat)<1e-6,
                        "A sun's exits are not a quarter turn apart: \(a.displayName) \(width) \(side.rawValue)")
                for h in [-3.0,0,3] {
                    require(abs(turned.reach(h,inset:0)-right.reach(h,inset:0))<1e-6,"A sun's exits meet different walls")
                }
            }
        } } }
        var designs:[(CloudParameters,CloudParameters)]=[]
        for style in CloudStyle.allCases { for width in [100.0,230,500] { for cable in [2.0,6] {
            var a=CloudParameters();a.style=style;a.width=width;a.cableDiameter=cable
            var b=a;b.cableSide = .left;b.mirrored=true
            designs.append((a,b))
            for side in [CableSide.top,.bottom] {
                a.cableSide=side;b.cableSide=side
                designs.append((a,b))
            }
        } } }
        for (right,left) in designs {
            let a=CableOutlet(right.normalized()),b=CableOutlet(left.normalized())
            require(abs((a.angle+b.angle-Double.pi).remainder(dividingBy:2*Double.pi))<1e-9 && abs(a.seat-b.seat)<1e-6,
                    "Mirrored outlet is not the mirror image: \(right.displayName) \(right.width) \(right.cableSide.rawValue)")
            for h in [-3.0,0,3] {
                require(abs(a.reach(h,inset:0)-b.reach(-h,inset:0))<1e-6,"Mirrored outlet meets a different wall")
            }
        }
        try checkOutletPlacement()
        print("PASS cable exit: persistence, migration from the rear outlet, kit names and contents, mirrored outlets, placement on all four sides")
    }

    /// Where the outlet is, stated independently of the generator: on a
    /// cloud at the widest and the highest point and in the middle of the
    /// base, on a sun between two rays.
    /// The meshing core keeps the fittings and ends before the pocket.
    static func checkOutletPlacement() throws {
        let degree=Double.pi/180
        func apart(_ a:Double,_ b:Double) -> Double {abs((a-b).remainder(dividingBy:2*Double.pi))}
        let center:[CableSide:Double]=[.right:0,.top:90*degree,.left:180*degree,.bottom:270*degree]
        var count=0
        for sun in suns { for width in stride(from:sun.minimumWidth,through:500,by:20) { for cable in [2.0,6] { for side in CableSide.allCases {
            var p=sun;p.width=width;p.cableDiameter=cable;p.cableSide=side
            p.nailHead=cable==2 ? 5:10;p.stripWidth=cable==2 ? 3.5:12
            p=p.normalized()
            let o=CableOutlet(p),label="\(p.displayName) \(width) mm, cable \(cable) \(side.rawValue)"
            // Between two rays, clockwise of the ray on that side, at every
            // size: in the notch. A pinwheel's notch is 7.5° from that ray:
            // its outlet is there in a large lamp, and up to midway
            // between the rays in a small one.
            let style=p.sunStyle,between=360*degree/Double(style.rayCount)/2
            let turned=(center[side]!-o.angle).remainder(dividingBy:360*degree)
            if style == .pinwheel {
                require(turned>7.5*degree-1e-9 && turned<between+1e-9,"Pinwheel's outlet is not between its notch and the middle: \(turned/degree)°, \(label)")
                require(width<300 || turned<7.5*degree+1e-9,"A large pinwheel's outlet is not in its notch: \(turned/degree)°, \(label)")
            } else {
                require(abs(turned-between)<1e-9 && style.notchAngles.contains { apart(o.angle,$0)<1e-9 },"Sun's outlet is not in the notch between two rays: \(o.angle/degree)°, \(label)")
            }
            // The ridges and tips of both rays are outside the outlet's strip.
            for ray in [center[side]!,center[side]!-2*between] {
                require(o.seat*sin(apart(o.angle,ray))>o.notchHalfWidth+0.3,"Sun's outlet reaches under a ray: \(label)")
            }
            try checkCore(p,o,label);count += 1
        } } } }
        for style in CloudStyle.allCases { for mirrored in [false,true] { for width in stride(from:100.0,through:500,by:10) { for cable in [2.0,6] { for side in CableSide.allCases {
            var p=CloudParameters();p.style=style;p.mirrored=mirrored;p.width=width;p.cableDiameter=cable;p.cableSide=side
            p.nailHead=cable==2 ? 5:10;p.stripWidth=cable==2 ? 3.5:12
            p=p.normalized()
            let o=CableOutlet(p),label="\(p.displayName) \(width) mm, cable \(cable) \(side.rawValue)"
            let outline={(a:Double) in CloudGenerator.radius(a,inset:0,width:p.width,verticalScale:p.verticalScale,profile:p.profile)}
            let tip=outline(o.angle),x=tip*cos(o.angle),y=tip*sin(o.angle)
            switch side {
            case .top:
                require(abs(y-p.profile.highY*p.layoutHeightBasis)<1e-6,"Cloud's top outlet is not at its highest point: \(label)")
            case .bottom:
                require(abs(x)<1e-6 && abs(y-p.profile.lowY*p.layoutHeightBasis)<1e-6,"Cloud's bottom outlet is not in the middle of its base: \(label)")
                // The base is flat across the whole pocket.
                for h in [-o.notchHalfWidth,o.notchHalfWidth] {
                    require(abs(o.reach(h,inset:0)-o.reach(0,inset:0))<1e-6,"Cloud's base is not flat at the outlet: \(label)")
                }
            case .left,.right:
                if width>=200 {require(abs(abs(x)-p.width/2)<0.5,"Cloud's side outlet is not at its widest point: \(label)")}
            }
            require(apart(o.angle,center[side]!)<30*degree,"Cloud's outlet is on the wrong side: \(label)")
            try checkCore(p,o,label);count += 1
        } } } } }
        print("PASS \(count) outlet placements: position on the outline, fittings inside the meshing core, floor between core and pocket")
    }

    /// Top and bottom outlets on every silhouette, at the sizes and fittings
    /// that leave them the least room. `bash scripts/test.sh outlets`
    static func checkOutlets() throws {
        var designs:[CloudParameters]=[]
        for style in CloudStyle.allCases { for mirrored in [false,true] {
            var p=CloudParameters();p.style=style;p.mirrored=mirrored;designs.append(p)
        } }
        designs += suns
        var count=0
        for design in designs { for side in [CableSide.top,.bottom] {
            // Mirrored clouds repeat the outlines: they get the two extremes.
            let widths=design.mirrored ? [design.minimumWidth,500] : [design.minimumWidth,design.minimumWidth+25,design.width,500]
            for (index,width) in widths.enumerated() { for large in [false,true] {
                var p=design;p.cableSide=side;p.width=width
                p.cableDiameter=large ? 6:2;p.nailHead=large ? 10:5;p.nailShaft=large ? 5:2
                p.stripWidth=large ? 12:3.5;p.clipFit=large ? 0.5:0.2
                p.depth=large == (index%2==0) ? 16:26
                if index == 2 && !large {p=design;p.cableSide=side}
                p=p.normalized()
                checkLEDLayout(p)
                for quality in [BalloonGenerator.Quality.preview,.export] {
                    let kit=CloudKit(p,quality:quality)
                    var parts:[BalloonMesh]=[]
                    for (name,mesh) in [("back",kit.back),("front",kit.front)] {
                        let parsed=parseSTL(try mesh.binarySTL());try parsed.validate();parts.append(parsed)
                        require(abs(parsed.dimensions.x-p.width)<0.002 && abs(parsed.dimensions.y-p.height)<0.002,
                                "\(p.displayName) \(name) dimensions differ from readout with the cable at the \(side.rawValue)")
                        require(parsed.vertices.count-parsed.triangles.count/2 == (name=="back" ? 0:2),"Extra holes or shells with the cable at the \(side.rawValue)")
                    }
                    let full=index == 2 && !large
                    try checkCloudFeatures(p,back:parts[0],front:parts[1],seal:parseSTL(try kit.seal.binarySTL()),full:full)
                    if full && quality == .export {
                        let name=p.kind == .sun ? "sun-\(p.sunStyle.rawValue)" : "cloud-\(p.style.rawValue)\(p.mirrored ? "-mirrored":"")"
                        let folder=".build/test-output/outlets/\(name)-\(side.rawValue)"
                        try FileManager.default.createDirectory(atPath:folder,withIntermediateDirectories:true)
                        for (name,data) in try kit.entries() {try data.write(to:URL(fileURLWithPath:"\(folder)/\(name)"))}
                    }
                }
                count += 1
            } }
            print("PASS \(design.displayName), cable at the \(side.rawValue): \(widths.map {Int($0)}) mm, small and large fittings, both resolutions");fflush(stdout)
        } }
        print("PASS \(count) kits with the cable at the top or the bottom: STL topology, dimensions, window, pocket, seal, sightlines, skirt, clips and LED layout")
    }

    static func checkCore(_ p:CloudParameters,_ o:CableOutlet,_ label:String) throws {
        let l=CloudGenerator.Layout(p:p)
        for r in l.rectangles {
            require(r.x0 > -l.coreX && r.x1<l.coreX && r.y0>l.lowY && r.y1<l.highY,"Fitting outside the meshing core: \(r), \(label)")
        }
        // Only an outlet at the bottom moves the core, and never the fittings.
        require(l.highY==p.coreHighY && l.coreX==p.coreHalfWidth && l.lowY>=p.coreLowY,"Meshing core grew: \(label)")
        require(l.lowY==p.coreLowY || p.cableSide == .bottom,"Meshing core moved without need: \(label)")
        var q=p;q.cableSide = .right
        require(p.ledCenterY==q.ledCenterY && p.nailCenterY==q.nailCenterY && p.height==q.height && p.layoutHeightBasis==q.layoutHeightBasis,
                "Cable exit moved the fittings or changed the outline: \(label)")
        // Floor between the core and the pocket's mouth, on every column of the strip.
        for i in -20...20 {
            let h=o.notchHalfWidth*Double(i)/20,(x,y)=o.point(o.seat,h)
            let scale=max(abs(x)/l.coreX,y>=0 ? y/l.highY : y/l.lowY)
            require(scale>1 && hypot(x,y)*(1-1/scale)>CableOutlet.clearance-1e-6,
                    "Pocket reaches into the meshing core: \(hypot(x,y)*(1-1/scale)) mm of floor, \(label)")
        }
        let landing=o.landing
        require(landing>=7 && landing<=12,"Landing of \(landing) mm: \(label)")
        require(landing==12 || (p.kind == .cloud && p.cableSide == .top && p.width<140),"Landing is short without need: \(landing) mm, \(label)")
        // The keep-out covers the landing and the pocket, up to the outline.
        let keep=o.keepOut
        for (t,h) in [(o.seat-landing,-o.notchHalfWidth),(o.seat-landing,o.notchHalfWidth),(o.reach(0,inset:0),0)] {
            let (x,y)=o.point(t,h)
            require(x>=keep.x0-1e-9 && x<=keep.x1+1e-9 && y>=keep.y0-1e-9 && y<=keep.y1+1e-9,"LED keep-out misses the outlet: \(label)")
        }
    }
}
