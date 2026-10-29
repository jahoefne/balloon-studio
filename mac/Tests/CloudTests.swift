import Foundation

extension GeometryTests {
    static func checkClouds() throws {
        var small=CloudParameters();small.width=100;small.depth=16
        var cases=[CloudParameters(),small]
        // Pairwise extremes plus each mechanical tolerance independently.
        // The outlet goes round with the widths, so every side meets every
        // pair of fit and cable.
        for (turn,width) in [100.0,125,160,180,188,192,200,240,500].enumerated() {
            for fit in [0.2,0.5] {
                for cable in [2.0,6] {
                    var p=CloudParameters()
                    p.width=width;p.clipFit=fit;p.cableDiameter=cable
                    p.cableSide=CableSide.allCases[(cases.count+turn)%4]
                    p.nailHead=cable==2 ? 5:10;p.nailShaft=cable==2 ? 2:5
                    p.diffuserThickness=fit==0.2 ? 0.8:2
                    p.depth=fit==0.2 ? 16:20;p.stripWidth=cable==2 ? 3.5:12
                    p.stripThickness=cable==2 ? 1:6
                    cases.append(p)
                }
            }
        }
        for (index,p) in cases.enumerated() {
            checkLEDLayout(p)
            for quality in [BalloonGenerator.Quality.preview,.export] {
                let kit=CloudKit(p,quality:quality)
                var meshes:[BalloonMesh]=[]
                let seal=parseSTL(try kit.seal.binarySTL())
                for (name,mesh) in [("back",kit.back),("front",kit.front)] {
                    try mesh.validate()
                    let parsed=parseSTL(try mesh.binarySTL())
                    try parsed.validate();meshes.append(parsed)
                    require(abs(parsed.dimensions.x-p.width)<0.002,"Cloud width changed")
                    require(abs(parsed.dimensions.y-p.height)<0.002,"Cloud height changed")
                    require(parsed.vertices.allSatisfy {$0.z >= -1e-6},"Cloud part below bed")
                    let expected=name == "back" ? p.depth:p.diffuserThickness+12
                    require(abs(parsed.dimensions.z-expected)<0.002,"Cloud part height changed")
                    let euler=parsed.vertices.count-parsed.triangles.count/2
                    require(euler == (name == "back" ? 0:2),"Cloud back needs exactly one cable through-path; front must be a single closed shell")
                    require(p.fitsP2S == (parsed.dimensions.x+16<=256.001 && parsed.dimensions.y+16<=256.001),"Cloud bed-fit readout mismatch")
                }
                try checkCloudFeatures(p,back:meshes[0],front:meshes[1],seal:seal,full:index<2)
                if index<2 && quality == .export {
                    let folder=index==0 ? ".build/test-output/cloud" : ".build/test-output/cloud-small"
                    try FileManager.default.createDirectory(atPath:folder,withIntermediateDirectories:true)
                    for (name,data) in try kit.entries() {
                        try data.write(to:URL(fileURLWithPath:"\(folder)/\(name)"))
                    }
                    try kit.archive().write(to:URL(fileURLWithPath:"\(folder)/\(p.filename)"))
                }
            }
        }
        // Sweep the compact/regular transition with the largest fittings. This
        // catches concave-outline crossings between the mesh test dimensions.
        for width in 100...230 {
            var p=CloudParameters();p.width=Double(width);p.cableDiameter=6;p.stripWidth=12;p.nailHead=10;p.clipFit=0.5
            let l=CloudGenerator.Layout(p:p)
            for rect in l.rectangles {
                require(rect.x0 > -l.coreX && rect.x1<l.coreX && rect.y0>l.lowY && rect.y1<l.highY,"Compact hardware outside meshing core at \(width)")
            }
            require(l.led.y0>=p.cableBossTop+0.99 && l.nailBoss.y0>=l.led.y1+0.99,"Compact features overlap or LED rows moved at \(width)")
            for i in 0...40 {
                let t=Double(i)/40
                let points=[(-l.coreX+2*l.coreX*t,l.lowY),(-l.coreX+2*l.coreX*t,l.highY),
                            (-l.coreX,l.lowY+(l.highY-l.lowY)*t),(l.coreX,l.lowY+(l.highY-l.lowY)*t)]
                for (x,y) in points {
                    let wall=CloudGenerator.radius(atan2(y,x),inset:4.1,width:p.width,verticalScale:p.verticalScale)
                    require(wall>hypot(x,y)+0.1,"Compact core crosses skirt at \(width)")
                }
            }
        }
        let p=CloudParameters()
        var requestedSmall=p;requestedSmall.width=100;requestedSmall.depth=16
        let acceptedSmall=requestedSmall.normalized()
        require(acceptedSmall.width==100 && acceptedSmall.depth==16 && acceptedSmall.stripWidth==8 && acceptedSmall.cableDiameter==3 && acceptedSmall.nailHead==8,"100 mm cloud shrank the fittings or changed requested size")
        require(acceptedSmall.height>58,"Small cloud did not leave room for the fittings")
        let restored=try JSONDecoder().decode(CloudParameters.self,from:JSONEncoder().encode(p))
        require(restored==p,"Cloud settings lost in persistence")
        let legacyData=Data("{\"width\":100,\"depth\":16,\"diffuserThickness\":0.8,\"stripThickness\":4}".utf8)
        let legacy=try JSONDecoder().decode(CloudParameters.self,from:legacyData)
        require(legacy.width==100 && legacy.depth==16 && legacy.diffuserThickness==0.8 && legacy.stripThickness==4 && legacy.stripCutLength==16 && legacy.ledRowSpacing==14,"New LED settings erased saved print dimensions")
        for width in [100.0,160,230,500] { for cut in [15.625,16,25,50,100] { for spacing in [12.0,16,25,40] {
            var q=p;q.width=width;q.stripCutLength=cut;q.ledRowSpacing=spacing
            checkLEDLayout(q)
        } } }
        let compact=CloudLEDPlan(small),large=CloudLEDPlan(p)
        require(compact.sections.count>=3 && compact.sections.contains {$0.length>=48},"100 mm lamp still restricted to the tiny former recess")
        require(large.rowCount>compact.rowCount && large.totalLength>compact.totalLength,"LED coverage does not scale with cloud size")
        let zipEntries=try CloudKit(small).entries()
        require(zipEntries.filter {$0.0.hasSuffix(".stl")}.count==5 && zipEntries.contains {$0.0=="LED-LAYOUT.svg"},"LED guides must export as a plan, not as a printed part")
        try checkCableSettings()
        print("LED layouts: 100 mm \(compact.sections.map(\.length)), total \(compact.totalLength) mm; 230 mm \(large.sections.count) sections, \(large.rowCount) rows, total \(large.totalLength) mm")
        let suite="BalloonStudio.CloudTests.\(UUID().uuidString)",prefs=UserDefaults(suiteName:suite)!
        defer {prefs.removePersistentDomain(forName:suite)}
        prefs.set(try JSONEncoder().encode(p),forKey:"BalloonStudio.cloud.v1")
        let persisted=try JSONDecoder().decode(CloudParameters.self,from:prefs.data(forKey:"BalloonStudio.cloud.v1")!)
        require(persisted==p,"Cloud preferences did not restore")
        var bad=p
        bad.width = .nan;bad.depth = .infinity;bad.diffuserThickness = -1;bad.clipFit=10
        bad.nailHead=5;bad.nailShaft=100;bad.cableDiameter = .nan
        let normalized=bad.normalized()
        require(normalized.width==230 && normalized.depth==22 && normalized.diffuserThickness==0.8 && normalized.clipFit==0.5 && normalized.nailShaft==3 && normalized.cableDiameter==3,"Cloud normalization failed")
        require(normalized.normalized()==normalized,"Cloud normalization not idempotent")
        print("PASS \(cases.count) cloud kits at preview and export resolution: connected STL solids, dimensions, blind nail chamber, closed floor, cable outlet on all four sides, cable seal fit and blocked sightlines, seated clip clearances, flat LED floor, diffuser and migrated settings; 80 cut-pitch / spacing layouts")
    }

    static func checkLEDLayout(_ input:CloudParameters) {
        let p=input.normalized(),plan=CloudLEDPlan(p),l=CloudGenerator.Layout(p:p)
        for (i,s) in plan.sections.enumerated() {
            require(s.length>=p.stripCutLength && abs(s.length/p.stripCutLength-(s.length/p.stripCutLength).rounded())<1e-8,"LED section misses a marked cut")
            // Include soldering space and sample the full rectangle, not just corners:
            // a concave cloud scallop may intrude between corners that are inside.
            let area=CloudGenerator.Rect(x0:s.x-s.length/2-3,x1:s.x+s.length/2+3,y0:s.y-p.stripWidth/2-0.5,y1:s.y+p.stripWidth/2+0.5)
            let fittings=p.cableConfigurations.flatMap { q in
                [CableOutlet(q).keepOut]+(CableClamp(q).map {[$0.keepOut]} ?? [])
            }
            for boss in [l.nailBoss]+fittings {
                require(area.x1<=boss.x0 || area.x0>=boss.x1 || area.y1<=boss.y0 || area.y0>=boss.y1,"LED or solder pads cross the nail pocket, the cable seal or its clamp")
            }
            for ix in 0...Int(ceil(area.x1-area.x0)) { for iy in 0...Int(ceil(area.y1-area.y0)) {
                let x=area.x0+(area.x1-area.x0)*Double(ix)/ceil(area.x1-area.x0)
                let y=area.y0+(area.y1-area.y0)*Double(iy)/ceil(area.y1-area.y0)
                let inner=CloudGenerator.radius(atan2(y,x),inset:CloudParameters.wall+p.clipFit+2.0,width:p.width,verticalScale:p.verticalScale,profile:p.profile)
                require(hypot(x,y)<inner-1,"LED or wire landing crosses the skirt")
            } }
            for other in plan.sections.dropFirst(i+1) {
                require(abs(s.y-other.y)>=p.stripWidth+3.99 || abs(s.x-other.x)>=(s.length+other.length)/2+6,"LED mounting envelopes overlap")
            }
        }
    }

    static func checkCloudFeatures(_ p:CloudParameters,back:BalloonMesh,front:BalloonMesh,seal:BalloonMesh?=nil,full:Bool) throws {
        // Dimensions are independently stated here; assertions query actual STL triangles.
        func distance(_ mesh:BalloonMesh,_ o:Point3,_ d:Point3) -> Double {ray(mesh,o,d)?.0 ?? .infinity}
        func close(_ actual:Double,_ expected:Double,_ message:String) {
            require(abs(actual-expected)<0.003,"\(message): got \(actual), expected \(expected); \(p.displayName), \(p.width) mm, fit \(p.clipFit), \(p.surface)")
        }
        let up=Point3(x:0,y:0,z:1),down=Point3(x:0,y:0,z:-1)
        let headY=p.nailCenterY,slotTop=headY+p.nailHead/2+8
        close(distance(back,Point3(x:0.173,y:headY+0.127,z:-1),up),6.4,"Nail entry lacks a blind roof")
        close(distance(back,Point3(x:0.173,y:slotTop-1,z:-1),up),6.4,"Nail slot leaks into light cavity")
        close(distance(back,Point3(x:0.173,y:headY,z:10),down),1.6,"Missing 3 mm solid nail cap")
        close(distance(back,Point3(x:p.nailShaft/2+0.5,y:slotTop-1,z:3),down),0.6,"Nail head has no retaining lip")
        close(distance(back,Point3(x:0.271,y:p.ledCenterY,z:10),down),7,"LED mounting floor must be flat, without the old recess")
        // Verify actual exported triangles beneath the planned LEDs in the wings,
        // outside the mesher's core, as well as beside the hardware bosses.
        for section in CloudLEDPlan(p).sections {
            let r=section.footprint(width:p.stripWidth)
            for (x,y) in [(section.x,section.y),(r.x0,r.y0),(r.x1,r.y1)] {
                close(distance(back,Point3(x:x,y:y,z:p.depth+1),down),p.depth-2,"LED plan has no flat mounting floor or crosses hardware")
            }
        }
        if p.surface == .flat {
            close(distance(front,Point3(x:0.173,y:0.217,z:-1),up),1,"Front not flat on bed")
            close(distance(front,Point3(x:0.173,y:0.217,z:3),down),3-p.diffuserThickness,"Diffuser thickness wrong")
            for t in front.triangles {
                let a=front.vertices[t.a],b=front.vertices[t.b],c=front.vertices[t.c]
                if [a,b,c].allSatisfy({abs($0.z)<1e-6}) {
                    require((b-a).cross(c-a).z<0,"Reinforced root folds the front's floor back over itself")
                }
            }
        }

        // Exact seated assembly transform, including winding-preserving front rotation.
        var placed=front
        placed.vertices=front.vertices.map {
            p.surface == .sculpted ? Point3(x:$0.x,y:$0.y,z:$0.z+p.depth-12)
                : Point3(x:$0.x,y:-$0.y,z:p.totalDepth-$0.z)
        }
        let tight=try seal ?? parseSTL(CableSealGenerator.generate(p,quality:.export).binarySTL())
        try checkCableOutlet(p,back:back,front:placed,seal:tight,full:full)
        try checkCableClamp(p,back:back,front:placed,seal:CableSealGenerator.placed(tight,parameters:p),full:full)
        // A cloud's tabs are 10 mm of arc at 0.4 of its width. A sun's are
        // 10 mm of a ray's flank, a quarter turn apart.
        let sun=p.kind == .sun,clips=LampClips(p)
        let centers=sun ? clips.centers : [Double.pi/6,5*Double.pi/6,7*Double.pi/6,11*Double.pi/6]
        let tab=sun ? clips.half : 5/(p.width*0.4),slot=sun ? clips.slit : 1/(p.width*0.4)
        let clamp=CableClamp(p)
        for theta in centers {
            let dx=cos(theta),dy=sin(theta),out=Point3(x:dx,y:dy,z:0)
            // On a ray the cavity ends closer to the middle than on a cloud.
            let cavity=CloudGenerator.radius(theta,inset:2.4+p.clipFit+2.0,width:p.width,verticalScale:p.verticalScale,profile:p.profile)
            let beadZ=p.depth-9.5,start=sun ? min(p.width*0.3,cavity-2) : p.width*0.3
            // A point just inside the tab edge is an exact meshing column at
            // both resolutions, independent of the coarser outline chords.
            let probeAngle=theta+tab-1e-7
            let probeDirection=Point3(x:cos(probeAngle),y:sin(probeAngle),z:0)
            func contour(_ inset:Double) -> Double {
                CloudGenerator.radius(probeAngle,inset:inset,width:p.width,verticalScale:p.verticalScale,profile:p.profile)
            }
            let running=contour(2.4+p.clipFit)
            let rootInner=contour(2.4+p.clipFit+2.0)
            let beamInner=contour(2.4+p.clipFit+1.6)
            let probeStart=max(0,min(start,rootInner-1))
            // Probe the exported inner and outer surfaces: thicker roots,
            // a continuous 4 mm taper, and the original running-fit contour.
            var previousInner:Double?
            for height in [1.0,3,4,5,7] {
                let origin=Point3(x:probeStart*probeDirection.x,y:probeStart*probeDirection.y,z:p.depth-height)
                let inside=distance(placed,origin,probeDirection)
                let outside=inside+0.01+distance(placed,origin+probeDirection*(inside+0.01),probeDirection)
                let measuredInner=probeStart+inside
                if height == 1 {close(measuredInner,rootInner,"Clip root is not 2.0 mm thick")}
                else if height == 7 {close(measuredInner,beamInner,"Clip beam is not 1.6 mm thick")}
                else {
                    // Extra slices at cable notches interpolate the curved
                    // inset contours differently, but must preserve the taper.
                    require(measuredInner>rootInner+0.003 && measuredInner<beamInner-0.003,"Clip root has an abrupt thickness step")
                }
                if let previousInner {require(measuredInner>previousInner+0.003,"Clip root taper does not thin continuously")}
                previousInner=measuredInner
                close(probeStart+outside,running,"Reinforcement changed the clip's outer fit")
                require(outside-inside>=1.6-0.003,"Spring tab is thinner than 1.6 mm")
            }
            let catchOrigin=Point3(x:probeStart*probeDirection.x,y:probeStart*probeDirection.y,z:beadZ)
            let catchInner=distance(placed,catchOrigin,probeDirection)
            let catchOuter=catchInner+0.01+distance(placed,catchOrigin+probeDirection*(catchInner+0.01),probeDirection)
            close(probeStart+catchOuter,contour(2.4-0.35),"Reinforcement changed the catch's engagement")
            let o=Point3(x:start*dx,y:start*dy,z:beadZ)
            let frontInner=distance(placed,o,out)
            // In a small lamp a post of the strain relief may stand on the
            // way: the back is measured from just inside the skirt.
            let reach=clamp == nil ? 0:max(0,frontInner-0.5)
            let backGroove=reach+distance(back,o+out*reach,out)
            // Second face after entering the finger is its outer catch surface.
            let justInside=o+out*(frontInner+0.02)
            let beadOuter=frontInner+0.02+distance(placed,justInside,out)
            require(beadOuter<backGroove-0.1,"Clip collides with seated groove at width \(p.width), depth \(p.depth), angle \(theta): catch \(beadOuter), groove \(backGroove), front inner \(frontInner)")
            let wallAtLip=reach+distance(back,Point3(x:start*dx,y:start*dy,z:p.depth-7.5)+out*reach,out)
            require(beadOuter>wallAtLip+0.25,"Clip has no positive retention")
            let tipZ=p.depth-12+0.01
            let tipOrigin=Point3(x:start*dx,y:start*dy,z:tipZ)
            let innerTip=distance(placed,tipOrigin,out)
            let tipOuter=innerTip+0.01+distance(placed,tipOrigin+out*(innerTip+0.01),out)
            require(tipOuter<wallAtLip-0.1,"Clip lacks lead-in clearance: \(p.displayName), \(p.width) mm, \(p.surface), angle \(theta), tip \(tipOuter), wall \(wallAtLip)")
            // Slots flank the beam and are open over its working length.
            let slotTheta=theta+tab+slot/2
            require(ray(placed,Point3(x:start*cos(slotTheta),y:start*sin(slotTheta),z:beadZ),Point3(x:cos(slotTheta),y:sin(slotTheta),z:0)) == nil,"Snap beam has no side relief")
        }
        if full {
            // Any sampled front point below the diffuser must be outside back material.
            // An inward ray from the cavity returns the opaque inner wall; a front
            // point beyond it would intersect the backing wall in the seated state.
            for v in placed.vertices where v.z<p.depth-0.001 && v.z>p.depth-12.001 {
                let r=hypot(v.x,v.y),d=Point3(x:v.x/r,y:v.y/r,z:0)
                let start=max(0,r-1)
                let wall=start+distance(back,Point3(x:d.x*start,y:d.y*start,z:v.z+0.00001),d)
                require(r<wall+0.003,"Assembled front intersects backing")
            }
        }
    }
}
