import Foundation

@main
struct GeometryTests {
    static func require(_ condition: @autoclosure () -> Bool,_ message:String) {
        guard condition() else {fatalError(message)}
    }
    static func parseSTL(_ data:Data) -> BalloonMesh {
        func u32(_ offset:Int) -> UInt32 {
            UInt32(data[offset]) | UInt32(data[offset+1])<<8 | UInt32(data[offset+2])<<16 | UInt32(data[offset+3])<<24
        }
        func float(_ offset:Int) -> Double {Double(Float(bitPattern:u32(offset)))}
        let count=Int(u32(80))
        require(data.count == 84+50*count,"Incorrect binary STL length")
        struct Key:Hashable { let x:UInt32;let y:UInt32;let z:UInt32 }
        var lookup:[Key:Int]=[:]
        var vertices:[Point3]=[]
        var triangles:[Triangle]=[]
        for i in 0..<count {
            let start=84+50*i
            var face:[Int]=[]
            for j in 0..<3 {
                let o=start+12+j*12
                let key=Key(x:u32(o),y:u32(o+4),z:u32(o+8))
                if let index=lookup[key] {face.append(index)}
                else {
                    lookup[key]=vertices.count
                    face.append(vertices.count)
                    vertices.append(Point3(x:float(o),y:float(o+4),z:float(o+8)))
                }
            }
            let normal=Point3(x:float(start),y:float(start+4),z:float(start+8))
            let actual=(vertices[face[1]]-vertices[face[0]]).cross(vertices[face[2]]-vertices[face[0]]).unit
            require(normal.dot(actual)>0.999,"STL face normal does not match its vertices (face \(i), dot \(normal.dot(actual)), points \(face.map {vertices[$0]}))")
            triangles.append(Triangle(a:face[0],b:face[1],c:face[2]))
        }
        return BalloonMesh(vertices:vertices,triangles:triangles,maxOverhang:0)
    }
    static func main() throws {
        let selected=Array(CommandLine.arguments.dropFirst())
        try FileManager.default.createDirectory(atPath:".build/test-output",withIntermediateDirectories:true)
        if selected.isEmpty || selected.contains("figures") {try checkFigures()}
        if selected.isEmpty || selected.contains("lamp-settings") {try checkLampSettings()}
        if selected.isEmpty || selected.contains("lamp-surfaces") {try checkLampSurfaces()}
        if selected.isEmpty || selected.contains("sun") {try checkSuns()}
        if selected.isEmpty || selected.contains("cloud") {try checkClouds()}
        if selected.isEmpty || selected.contains("cloud") || selected.contains("cloud-shapes") {try checkCloudShapes()}
        if selected.contains("outlets") {try checkCableSettings();try checkOutlets()}
        if selected.isEmpty || selected.contains("chained-outlets") {try checkChainedOutlets()}
        if selected.contains("clamp") {try checkClamps()}
        if selected.isEmpty || selected.contains("nail-insert") {try checkNailInserts()}
        if selected.isEmpty || selected.contains("cable-clip") {try checkCableClips()}
        if selected.isEmpty || selected.contains("ring") {try checkRings()}
        if selected.isEmpty || selected.contains("split-ring") {try checkSplitRings()}
        if selected.isEmpty || selected.contains("uplight") {try checkSplitRings(reflector:true)}
        if selected.isEmpty || selected.contains("solid-uplight") {try checkSolidUplight()}
        if selected.isEmpty || selected.contains("basket") || selected.contains("wicker") {try checkWicker()}
        for style in BasketStyle.allCases where selected.isEmpty || selected.contains("basket") {
            for (name,input) in [
                ("default",BasketParameters(style:style)),
                ("small",BasketParameters(style:style,width:40,depth:30,height:24,wallThickness:3.2,cordClearance:5,texture:1)),
                ("large",BasketParameters(style:style,width:100,depth:90,height:70,wallThickness:1.6,cordClearance:2,texture:0))
            ] {
                let p=input.normalized()
                let preview=BasketGenerator.generate(p)
                try preview.validate()
                checkBasketHoles(preview,parameters:p)
                let mesh=BasketGenerator.generate(p,quality:.export)
                let data=try mesh.binarySTL(),parsed=parseSTL(data)
                try parsed.validate()
                checkBasketHoles(parsed,parameters:p)
                let dims=parsed.dimensions
                require(abs(dims.x-p.width)<0.001 && abs(dims.y-p.actualDepth)<0.001 && abs(dims.z-p.height)<0.001,"Basket dimensions changed")
                require(parsed.vertices.count-parsed.triangles.count/2 == -6,"Basket must have exactly four through-holes")
                require(parsed.vertices.allSatisfy {$0.z>=0},"Basket below bed")
                try data.write(to:URL(fileURLWithPath:".build/test-output/basket-\(style.rawValue)-\(name).stl"))
                print("PASS basket \(style.title) \(name): four round beveled holes, clear bores, connected watertight mesh, correct dimensions")
            }
        }
        var cases:[(String,BalloonParameters)]=[("classic",.classic),("round",.round),("tall",.tall)]
        for height in [80.0,250.0] {
            for diameter in [60.0,240.0] {
                for shoulder in [50.0,75.0] {
                    cases.append(("bounds-\(Int(height))-\(Int(diameter))-\(Int(shoulder))",
                                  BalloonParameters(height:height,diameter:diameter,panels:32,panelDepth:8,
                                                    neckDiameter:80,neckHeight:20,shoulder:shoulder)))
                }
            }
        }
        cases.append(("smooth",BalloonParameters(panels:8,panelDepth:0)))
        cases.append(("panel-count-normalization",BalloonParameters(panels:17,panelDepth:7.5)))
        cases.append(("minimum-neck",BalloonParameters(neckDiameter:12,neckHeight:3)))
        cases.append(("hollow-classic",BalloonParameters(hollow:true)))
        cases.append(("hollow-thin-small",BalloonParameters(height:80,diameter:60,panels:32,panelDepth:8,neckDiameter:12,neckHeight:3,shoulder:75,hollow:true,wallThickness:0.8)))
        cases.append(("hollow-thick-tall",BalloonParameters(height:250,diameter:60,panels:32,panelDepth:8,neckDiameter:12,neckHeight:3,shoulder:50,hollow:true,wallThickness:2.4)))
        cases.append(("hollow-thick-wide",BalloonParameters(height:80,diameter:240,panels:32,panelDepth:8,neckDiameter:80,neckHeight:12,shoulder:75,hollow:true,wallThickness:2.4)))
        cases.append(("tethered-classic",BalloonParameters(hollow:true,stringHoles:true)))
        cases.append(("tethered-small",BalloonParameters(height:80,diameter:60,panels:32,panelDepth:8,neckDiameter:12,neckHeight:3,shoulder:75,hollow:true,wallThickness:0.8,stringHoles:true,cordClearance:5)))
        cases.append(("tethered-tall",BalloonParameters(height:250,diameter:60,panels:32,panelDepth:8,neckDiameter:12,neckHeight:3,shoulder:50,hollow:true,wallThickness:2.4,stringHoles:true,cordClearance:5)))
        for hollow in [false,true] {
            for tethers in [false,true] {
                cases.append(("hanger-\(hollow ? "hollow":"filled")-\(tethers ? "tethers":"plain")",BalloonParameters(hollow:hollow,stringHoles:tethers,hangingLoop:true)))
            }
        }
        cases.append(("filled-tethers",BalloonParameters(stringHoles:true)))
        cases.append(("hanger-small",BalloonParameters(height:80,diameter:60,panels:32,panelDepth:8,neckDiameter:12,neckHeight:3,shoulder:75,hollow:true,wallThickness:0.8,stringHoles:true,cordClearance:5,hangingLoop:true,hangingClearance:5)))
        cases.append(("hanger-tall",BalloonParameters(height:250,diameter:60,panels:8,panelDepth:8,hollow:true,wallThickness:2.4,stringHoles:true,hangingLoop:true,hangingClearance:2)))
        cases.append(("hanger-wide",BalloonParameters(height:80,diameter:240,panels:32,panelDepth:8,shoulder:75,hollow:true,wallThickness:2.4,hangingLoop:true,hangingClearance:5)))
        // Cross the independent dimensions at their extremes, on the narrowest
        // balloon with the deepest grooves. Exercise both filled and hollow crowns.
        for thickness in [8.0,16.0] {
            for wall in [4.0,8.0] {
                for flare in [2.5,5.0] {
                    cases.append(("hanger-adjusted-\(thickness)-\(wall)-\(flare)",
                        BalloonParameters(height:thickness==8 ? 80:250,diameter:60,panels:32,panelDepth:8,shoulder:75,
                                          hollow:wall==8,wallThickness:0.8,stringHoles:true,hangingLoop:true,
                                          hangingClearance:flare==5 ? 5:2,hangingThickness:thickness,hangingWall:wall,
                                          hangingFillet:flare,hangingCrownThickness:thickness==8 ? 3.4:8)))
                }
            }
        }
        cases.append(("filled-tethers-small",BalloonParameters(height:80,diameter:60,panels:8,neckDiameter:12,stringHoles:true,cordClearance:5)))
        cases.append(("filled-tethers-wide-neck",BalloonParameters(height:80,diameter:240,panels:32,neckDiameter:80,neckHeight:20,stringHoles:true,cordClearance:2,hangingLoop:true)))
        for (name,input) in cases where selected.isEmpty || selected.contains("balloon") || selected.contains(name) || (selected.contains("hanger") && name.hasPrefix("hanger-")) {
            let p=input.normalized()
            let preview=BalloonGenerator.generate(p)
            try preview.validate()
            let full=BalloonGenerator.generate(p,quality:.export)
            let data=try full.binarySTL()
            let parsed=parseSTL(data)
            try parsed.validate()
            let dims=parsed.dimensions
            require(abs(dims.x-p.diameter)<0.001 && abs(dims.y-p.diameter)<0.001 && abs(dims.z-p.totalHeight)<0.001,"Dimensions changed in export for \(name)")
            require(abs(preview.maxOverhang-full.maxOverhang)<0.1,"Preview overhang differs from export for \(name): \(preview.maxOverhang) / \(full.maxOverhang)")
            require(parsed.vertices.allSatisfy {$0.z >= 0},"Model extends below the bed")
            require(p.fitsPrinter && p.fitsWithBrim,"Allowed parameters must fit P2S")
            require(parsed.vertices.count-parsed.triangles.count/2 == (p.hasStringHoles ? (p.hollow ? -6:-4):2)-(p.hangingLoop ? 2:0),"Unexpected number of balloon attachment holes")
            if p.hangingLoop {
                // The lug's round bore is clear, and the lug is its full thickness
                // beside and above the bore, with flat faces for the cord to leave.
                let bore=p.hangingClearance/2,center=p.height+p.hangingFillet+2+bore
                for sample in 0...16 {
                    let a=2*Double.pi*Double(sample)/16,offset=sample<16 ? bore*0.98:0
                    require(lateralHits(parsed,x:cos(a)*offset,z:center+sin(a)*offset).isEmpty,"Eyelet bore is obstructed for \(name)")
                }
                let inset=bore+p.hangingWall*0.4
                for (x,z) in [(0.0,center+inset),(inset,center),(-inset,center)] {
                    let faces=lateralHits(parsed,x:x,z:z)
                    require(faces.count==2 && abs(faces[0]+p.hangingThickness/2)<1e-3 && abs(faces[1]-p.hangingThickness/2)<1e-3,
                            "Eyelet is not \(p.hangingThickness) mm thick around its bore for \(name): \(faces)")
                }
                // The foot flares into the crown pad instead of meeting it at a corner.
                let flare=lateralHits(parsed,x:0,z:p.height+0.3)
                require(flare.count==2 && flare[0] < -p.hangingThickness/2-1 && flare[1] > p.hangingThickness/2+1,"Eyelet foot has no fillet for \(name): \(flare)")
                let reachX=bore+p.hangingWall+p.hangingFillet,reachY=p.hangingThickness/2+p.hangingFillet
                require(parsed.vertices.filter {$0.z>p.height+1e-6}.allSatisfy {abs($0.x)<=reachX+1e-5 && abs($0.y)<=reachY+1e-5},"Eyelet exceeds its footprint for \(name)")
                require(abs(dims.z-(p.height+p.hangingFillet+2+p.hangingClearance+p.hangingWall))<0.001,"Adjusted hanger height is incorrect: \(name)")
                if p.hollow {
                    let crown=verticalHits(parsed,x:0,y:0)
                    require(abs(crown[0]-(p.height-p.hangingCrownThickness))<0.001,"Adjusted crown thickness is incorrect: \(name)")
                }
                // The crown pad around the foot is stitched flat, without folded triangles.
                var padTriangles=0
                for t in full.triangles {
                    let a=full.vertices[t.a],b=full.vertices[t.b],c=full.vertices[t.c]
                    guard [a,b,c].allSatisfy({abs($0.z-p.height)<1e-9}) else {continue}
                    padTriangles += 1
                    require((b-a).cross(c-a).z>1e-9,"Crown pad triangle folded over at \(a.x), \(a.y) for \(name)")
                }
                require(padTriangles>100,"Crown pad is missing for \(name)")
            }
            if !p.hollow {
                let base=parsed.triangles.filter {t in [t.a,t.b,t.c].allSatisfy {abs(parsed.vertices[$0].z)<1e-6}}
                let area=base.reduce(0.0) {sum,t in
                    sum+(parsed.vertices[t.b]-parsed.vertices[t.a]).cross(parsed.vertices[t.c]-parsed.vertices[t.a]).length/2
                }
                require(area>Double.pi*pow(p.neckDiameter/2,2)*0.98,"Filled neck must retain its entire flat bottom: \(name)")
                require(parsed.vertices.contains {abs($0.x)+abs($0.y)+abs($0.z)<1e-6},"Filled neck bottom center is missing")
            }
            if p.hollow {
                let onBase=parsed.vertices.filter {abs($0.z)<1e-6}
                let minBaseRadius=onBase.map {hypot($0.x,$0.y)}.min()!
                require(abs(2*minBaseRadius-p.openingDiameter)<0.001,"LED opening has the wrong diameter")
                require(!parsed.triangles.contains {t in
                    let a=parsed.vertices[t.a],b=parsed.vertices[t.b],c=parsed.vertices[t.c]
                    return abs(a.z)+abs(b.z)+abs(c.z)<1e-6 && hypot((a.x+b.x+c.x)/3,(a.y+b.y+c.y)/3)<p.openingDiameter*0.48
                },"The LED opening has been capped")
                let innerRange=full.innerVertexRange!
                let innerStart=innerRange.lowerBound
                let surface=SurfaceQuery(vertices:full.vertices,triangles:full.triangles.filter {[ $0.a,$0.b,$0.c ].allSatisfy {!innerRange.contains($0)}})
                for i in stride(from:innerStart,to:innerRange.upperBound,by:37) {
                    require(!surface.isCloser(than:p.wallThickness-0.01,to:full.vertices[i]),"Shell thinner than requested for \(name) at \(i): \(full.vertices[i])")
                }
                for i in stride(from:full.triangles.count/2,to:full.triangles.count,by:101) {
                    let t=full.triangles[i]
                    guard [t.a,t.b,t.c].allSatisfy({innerRange.contains($0)}) else {continue}
                    let center=(full.vertices[t.a]+full.vertices[t.b]+full.vertices[t.c])*Double(1.0/3.0)
                    require(!surface.isCloser(than:p.wallThickness-0.03,to:center),"An inner triangle cuts into the shell for \(name) at \(i)")
                }
                try data.write(to:URL(fileURLWithPath:".build/test-output/\(name).stl"))
            }
            try data.write(to:URL(fileURLWithPath:".build/test-output/\(name).stl"))
            if name == "classic" {
                try FileManager.default.createDirectory(atPath:".build/test-output",withIntermediateDirectories:true)
                try data.write(to:URL(fileURLWithPath:".build/test-output/classic.stl"))
                require(full.maxOverhang<45,"Default should have gentle outward overhangs")
            }
            print("PASS \(name): \(parsed.triangles.count) triangles, watertight STL, \(Int(dims.x)) × \(Int(dims.y)) × \(Int(dims.z)) mm")
        }
        let invalid=BalloonParameters(height:.nan,diameter:.infinity,panels:Int.max,panelDepth:-2,neckDiameter:-5,neckHeight:500,shoulder:1000).normalized()
        require(invalid.height==220 && invalid.diameter==180 && invalid.panels==32 && invalid.neckDiameter==12 && invalid.neckHeight==20,"Input normalization failed")
        try BalloonGenerator.generate(invalid).validate()
        let legacy=Data(#"{"height":215,"diameter":175,"panels":24,"panelDepth":5,"neckDiameter":30,"neckHeight":7,"shoulder":67}"#.utf8)
        let migrated=try JSONDecoder().decode(BalloonParameters.self,from:legacy)
        require(migrated.height==215 && migrated.diameter==175 && !migrated.hollow && migrated.wallThickness==1.2,"Old settings were not preserved")
        require(migrated.hangingThickness==12 && migrated.hangingWall==6 && migrated.hangingFillet==4 && migrated.hangingCrownThickness==5,"Legacy settings did not receive reinforced hanger defaults")
        let oldHanger=try JSONDecoder().decode(BalloonParameters.self,from:Data(#"{"height":244,"hangingLoop":true,"hangingClearance":4}"#.utf8)).normalized()
        require(oldHanger.height==240 && oldHanger.totalHeight==256 && oldHanger.hangingLoop,"Legacy hanger must remain enabled and fit the printer")
        let badHanger=BalloonParameters(height:250,hangingLoop:true,hangingClearance:.nan,hangingThickness:.infinity,hangingWall:100,hangingFillet:-2,hangingCrownThickness:.nan).normalized()
        require(badHanger.hangingClearance==4 && badHanger.hangingThickness==12 && badHanger.hangingWall==8 && badHanger.hangingFillet==2.5 && badHanger.hangingCrownThickness==5 && badHanger.totalHeight<=256,"Invalid hanger dimensions were not normalized before height")
        require(badHanger.normalized()==badHanger,"Hanger normalization is not stable")
        var saved=migrated
        saved.hollow=true;saved.wallThickness=0.8
        let restored=try JSONDecoder().decode(BalloonParameters.self,from:JSONEncoder().encode(saved))
        require(restored == saved,"Shell settings did not round-trip")
        var rigged=saved;rigged.stringHoles=true;rigged.cordClearance=4.5;rigged.hangingLoop=true;rigged.hangingClearance=5
        rigged.hangingThickness=14.5;rigged.hangingWall=7;rigged.hangingFillet=3.5;rigged.hangingCrownThickness=6.2
        let restoredRig=try JSONDecoder().decode(BalloonParameters.self,from:JSONEncoder().encode(rigged))
        require(restoredRig==rigged,"String-hole settings did not round-trip")
        var damaged=BalloonGenerator.generate(.classic)
        damaged.triangles.removeLast()
        do {try damaged.validate();fatalError("Missing face was accepted")} catch is MeshError {}
        damaged=BalloonGenerator.generate(.classic)
        let first=damaged.triangles[0]
        damaged.triangles[0]=Triangle(a:first.a,b:first.c,c:first.b)
        do {try damaged.validate();fatalError("Reversed face was accepted")} catch is MeshError {}
        print("PASS invalid-input normalization and rejection of open / reversed meshes")
        print("All selected geometry, STL round-trip and settings checks passed.")
    }

    /// Intersect a line parallel to Y, for the crown eyelet's bore and thickness.
    static func lateralHits(_ mesh:BalloonMesh,x:Double,z:Double) -> [Double] {
        var hits:[Double]=[]
        for t in mesh.triangles {
            let a=mesh.vertices[t.a],b=mesh.vertices[t.b],c=mesh.vertices[t.c]
            let determinant=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z)
            if abs(determinant)<1e-10 {continue}
            let u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/determinant
            let v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/determinant
            let w=1-u-v
            if min(u,min(v,w)) >= -1e-8 {hits.append(u*a.y+v*b.y+w*c.y)}
        }
        return hits.sorted().reduce(into:[]) {result,value in
            if result.last.map({abs($0-value)>1e-4}) ?? true {result.append(value)}
        }
    }
    /// Intersect a vertical line using XY barycentric coordinates, independently
    /// of the generator's polar grid and topology checks.
    static func verticalHits(_ mesh:BalloonMesh,x:Double,y:Double) -> [Double] {
        var hits:[Double]=[]
        for t in mesh.triangles {
            let a=mesh.vertices[t.a],b=mesh.vertices[t.b],c=mesh.vertices[t.c]
            let determinant=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y)
            if abs(determinant)<1e-10 {continue}
            let u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/determinant
            let v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/determinant
            let w=1-u-v
            if min(u,min(v,w)) >= -1e-8 {hits.append(u*a.z+v*b.z+w*c.z)}
        }
        return hits.sorted().reduce(into:[]) {result,value in
            if result.last.map({abs($0-value)>1e-4}) ?? true {result.append(value)}
        }
    }

    static func checkRings() throws {
        var cases:[(String,RingParameters)]=[("default",RingParameters())]
        for diameter in [140.0,240.0] {
            for height in [4.0,10.0] {
                for cord in [2.0,5.0] {
                    for band in [0.0,28.0] {
                        for allowance in [0.2,1.0] {
                            for depth in [0.6,3.0] {
                                let p=RingParameters(diameter:diameter,bandWidth:band,height:height,cordClearance:cord,ledClearance:allowance,channelDepth:depth)
                                cases.append(("bounds-\(cases.count)",p))
                            }
                        }
                    }
                }
            }
        }
        for (name,input) in cases {
            let p=input.normalized()
            let preview=RingGenerator.generate(p)
            try preview.validate()
            let mesh=RingGenerator.generate(p,quality:.export)
            let data=try mesh.binarySTL(),parsed=parseSTL(data)
            try parsed.validate()
            require(abs(parsed.dimensions.x-p.diameter)<0.001 && abs(parsed.dimensions.y-p.diameter)<0.001 && abs(parsed.dimensions.z-p.height)<0.001,"Ring dimensions changed: \(name)")
            require(parsed.vertices.allSatisfy {$0.z>=0},"Ring extends below bed")
            require(parsed.vertices.count-parsed.triangles.count/2 == -12,"Ring must have one central opening and six through-holes")
            require(p.floorThickness>=3 && p.diameter+16<=256,"Ring floor or bed clearance too small")
            let expected=Double.pi*(pow(p.diameter/2,2)-pow(p.innerRadius,2))*p.height
                - Double.pi*(pow(p.channelOuterRadius,2)-pow(p.channelInnerRadius,2))*p.channelDepth
                - 6*pow(p.cordClearance,2)*p.height
            let volume=parsed.triangles.reduce(0.0) {sum,t in
                sum+parsed.vertices[t.a].dot(parsed.vertices[t.b].cross(parsed.vertices[t.c]))/6
            }
            require(abs(volume-expected)/expected<0.001,"Unexpected ring volume: \(name)")
            require(verticalHits(parsed,x:0,y:0).isEmpty,"Ring centre is blocked")
            for hole in 0..<6 {
                let theta=Double(hole)*Double.pi/3
                for sample in 0..<17 {
                    let angle=Double(sample)*Double.pi/8
                    let offset=sample == 16 ? 0:p.cordClearance*0.49
                    let x=p.holeRadius*cos(theta)+offset*cos(angle)
                    let y=p.holeRadius*sin(theta)+offset*sin(angle)
                    require(verticalHits(parsed,x:x,y:y).isEmpty,"Ring cord bore obstructed: \(name), hole \(hole)")
                }
            }
            for sample in 0..<18 {
                let theta=(Double(sample)+0.37)*Double.pi/9
                for offset in [-0.48,0,0.48] {
                    let r=p.channelRadius+p.channelWidth*offset
                    let hits=verticalHits(parsed,x:r*cos(theta),y:r*sin(theta))
                    require(hits.count==2 && abs(hits[0])<0.001 && abs(hits[1]-p.floorThickness)<0.001,"LED channel width/depth or floor incorrect: \(name)")
                }
                for r in [p.innerRadius+0.8,p.channelInnerRadius-0.8,p.diameter/2-0.8] {
                    let hits=verticalHits(parsed,x:r*cos(theta),y:r*sin(theta))
                    require(hits.count==2 && abs(hits[1]-p.height)<0.001,"Missing ring rim: \(name)")
                }
            }
            if name == "default" || name == "bounds-1" || name == "bounds-64" {
                try data.write(to:URL(fileURLWithPath:".build/test-output/ring-\(name).stl"))
            }
        }
        let invalid=RingParameters(diameter:.nan,bandWidth:-1,height:.infinity,cordClearance:100,ledClearance:-1,channelDepth:100).normalized()
        require(invalid.diameter==240 && invalid.height==6 && invalid.cordClearance==5 && invalid.ledClearance==0.2 && invalid.channelDepth==3 && invalid.bandWidth==invalid.minimumBandWidth,"Ring input normalization failed")
        try RingGenerator.generate(invalid).validate()
        let restored=try JSONDecoder().decode(RingParameters.self,from:JSONEncoder().encode(invalid))
        require(restored==invalid,"Ring settings did not persist")
        print("PASS \(cases.count) ring cases: connected watertight STLs, six clear cord bores, LED channel, floor thickness, dimensions and settings")
    }

    static func checkSplitRings(reflector:Bool=false) throws {
        var cases:[RingParameters]=[reflector ? .large:RingParameters(diameter:450,bandWidth:24,height:12,cordClearance:6,segmented:true)]
        if reflector {
            for diameter in [300.0,600.0] {for width in [0.0,60.0] {for height in [8.0,16.0] {for cord in [4.0,8.0] {
                for strip in [3.5,12.0] {for thickness in [1.0,6.0] {for fit in [0.2,0.6] {
                    cases.append(RingParameters(diameter:diameter,bandWidth:width,height:height,cordClearance:cord,ledClearance:1,
                                                segmented:true,jointFit:fit,reflectedLED:true,stripWidth:strip,stripThickness:thickness))
                }}}
            }}}}
        } else {
        for diameter in [300.0,600.0] {
            for width in [0.0,36.0] {
                for height in [8.0,16.0] {
                    for cord in [4.0,8.0] {
                        for depth in [0.6,3.0] {
                            for fit in [0.2,0.6] {
                                cases.append(RingParameters(diameter:diameter,bandWidth:width,height:height,cordClearance:cord,
                                                            ledClearance:1,channelDepth:depth,segmented:true,jointFit:fit))
                            }
                        }
                    }
                }
            }
        }
        }
        func volume(_ mesh:BalloonMesh) -> Double {
            mesh.triangles.reduce(0) {sum,t in sum+mesh.vertices[t.a].dot(mesh.vertices[t.b].cross(mesh.vertices[t.c]))/6}
        }
        func boreVolume(_ clearance:Double,_ bevel:Double,_ height:Double) -> Double {
            let opening=clearance+2*bevel
            return clearance*clearance*(height-2*bevel)+2*bevel/3*(opening*opening+opening*clearance+clearance*clearance)
        }
        for (caseIndex,input) in cases.enumerated() {
            let kit=SegmentedRingKit(input,quality:.export),p=kit.parameters
            let preview=SegmentedRingKit(input)
            for mesh in [preview.guided,preview.plain,preview.plate,preview.pin] {try mesh.validate()}
            for (i,part) in kit.printParts.enumerated() {
                let parsed=parseSTL(try part.mesh.binarySTL())
                try parsed.validate()
                require(parsed.vertices.count-parsed.triangles.count/2 == [-4,-2,-2,2][i],"Wrong number of holes in split part \(part.name)")
                let d=parsed.dimensions
                require(d.x+16<=256.001 && d.y+16<=256.001 && d.z<=256,"Split ring part exceeds bed with brim")
                require(abs(parsed.vertices.map(\.z).min()!)<0.001,"Split part not on bed")
                for coordinate in [parsed.vertices.map(\.x),parsed.vertices.map(\.y)] {
                    require(abs(coordinate.min()!+coordinate.max()!)<0.001,"Exported part not centred")
                }
            }
            let ledVolume:Double
            if reflector {
                let rise=p.stripWidth+p.ledClearance+2
                // Independent annular prisms and a triangular swept ramp.
                ledVolume=Double.pi*(pow(p.diameter/2,2)-pow(p.ledWallRadius,2))*rise
                    + Double.pi*(pow(p.ledWallRadius,2)-pow(p.ledShelfRadius,2))
                    + Double.pi*(pow(p.reflectorInnerRadius,2)-pow(p.flangeOuterRadius,2))*rise
                    + Double.pi*p.reflectorInnerRadius*rise*rise+Double.pi*pow(rise,3)/3
            } else {ledVolume = -Double.pi*(pow(p.channelOuterRadius,2)-pow(p.channelInnerRadius,2))*p.channelDepth}
            let ringVolume=Double.pi*(pow(p.diameter/2,2)-pow(p.innerRadius,2))*p.height+ledVolume
                - 12*boreVolume(4+p.jointFit,0.4,p.height)-3*boreVolume(p.cordClearance,0.8,p.height)
            require(abs(3*(volume(kit.guided)+volume(kit.plain))-ringVolume)/ringVolume<0.001,"Split ring volume or channel mismatch")
            // Every guide and registration pin has an unobstructed vertical path,
            // with the same pin positions on the section and its underside plate.
            let theta=Double.pi/6-kit.pinAngle
            for (mesh,angle,clearance) in [(kit.guided,0.0,p.cordClearance),(kit.guided,theta,4+p.jointFit),
                                            (kit.plain,-theta,4+p.jointFit),(kit.plate,kit.pinAngle,4+p.jointFit),
                                            (kit.plate,-kit.pinAngle,4+p.jointFit)] {
                for sample in 0..<17 {
                    let phi=Double(sample)*Double.pi/8,offset=sample == 16 ? 0:clearance*0.49
                    require(verticalHits(mesh,x:p.holeRadius*cos(angle)+offset*cos(phi),y:p.holeRadius*sin(angle)+offset*sin(phi)).isEmpty,
                            "Blocked guide or pin bore in split case \(caseIndex)")
                }
            }
            for i in 0..<6 {
                let seam=(Double(i)+0.5)*Double.pi/3
                for sign in [-1.0,1.0] {
                    let pinTheta=seam+sign*kit.pinAngle
                    let neighbour=Double(i)+(sign>0 ? 1:0)
                    let sectionTheta=neighbour*Double.pi/3-sign*theta
                    require(abs(cos(pinTheta)-cos(sectionTheta))+abs(sin(pinTheta)-sin(sectionTheta))<1e-9,"Plate and section pins do not align")
                }
            }
            for mesh in [kit.guided,kit.plain] {
                for angle in [-Double.pi/6, -0.23, 0.0, 0.23, Double.pi/6] {
                    let samples:[(Double,Double)] = reflector
                        ? [((p.reflectorToeRadius+p.ledShelfRadius)/2,p.height),
                           ((p.ledShelfRadius+p.ledWallRadius)/2,p.ledShelfZ),
                           (p.reflectorToeRadius-p.reflectorRise/2,p.height+p.reflectorRise/2),
                           ((p.flangeOuterRadius+p.reflectorInnerRadius)/2,p.totalHeight),
                           ((p.ledWallRadius+p.diameter/2)/2,p.totalHeight)]
                        : [-0.48,0,0.48].map {(p.channelRadius+$0*p.channelWidth,p.floorThickness)}
                    for (r,expected) in samples {
                        let hits=verticalHits(mesh,x:r*cos(angle),y:r*sin(angle))
                        require(hits.count==2 && abs(hits[0])<0.001 && abs(hits[1]-expected)<0.01,"Light mount profile must continue through both ends, case \(caseIndex)")
                    }
                }
            }
            let assembled=kit.assembly().dimensions
            require(abs(assembled.x-p.diameter)<0.001 && abs(assembled.y-p.diameter)<0.001 && abs(assembled.z-p.totalHeight-4)<0.001,"Assembly dimensions mismatch")
            require(kit.assemblyFaceColors.count==kit.assembly().triangles.count,"Assembly highlight indexing")
            if reflector {try checkLightShield(kit,full:caseIndex==0)}
            if caseIndex==0 {
                try kit.archive().write(to:URL(fileURLWithPath:".build/test-output/\(p.filename)"))
                for entry in try kit.entries() {
                    try entry.1.write(to:URL(fileURLWithPath:".build/test-output/\(entry.0)"))
                }
            }
        }
        let legacy=Data(#"{"diameter":220,"bandWidth":18,"height":6,"cordClearance":3,"ledClearance":0.4,"channelDepth":1.5}"#.utf8)
        let restoredLegacy=try JSONDecoder().decode(RingParameters.self,from:legacy)
        require(!restoredLegacy.segmented && restoredLegacy.diameter==220 && restoredLegacy.jointFit==0.3 && !restoredLegacy.reflectedLED && restoredLegacy.stripWidth==3.5,"Legacy ring settings changed")
        let restored=try JSONDecoder().decode(RingParameters.self,from:JSONEncoder().encode(RingParameters.large))
        require(restored == .large,"Split settings did not round-trip")
        let invalid=RingParameters(diameter:.nan,bandWidth:.infinity,height:.nan,cordClearance:.nan,ledClearance:.nan,channelDepth:.nan,segmented:true,jointFit:.nan).normalized()
        require(invalid.diameter==450 && invalid.bandWidth==24 && invalid.height==12 && invalid.cordClearance==6 && invalid.jointFit==0.3,"Split normalization failed")
        var badLight=RingParameters.large;badLight.stripWidth = .nan;badLight.stripThickness = .infinity;badLight.bandWidth = .nan
        require(badLight.normalized().stripWidth==8 && badLight.normalized().stripThickness==3 && badLight.normalized().bandWidth==40,"Light settings normalization")
        print("PASS \(cases.count) \(reflector ? "uplight":"flat split-ring") kits: manifold STL parts, bed fit, pin registration, clear guides, light profile, volume, assembly and settings")
    }

    // Ray/triangle queries are independent of the swept profile construction.
    static func ray(_ mesh:BalloonMesh,_ o:Point3,_ d:Point3) -> (Double,Point3)? {
            var nearest:(Double,Point3)?
            for t in mesh.triangles {
                let a=mesh.vertices[t.a],e1=mesh.vertices[t.b]-a,e2=mesh.vertices[t.c]-a
                let h=d.cross(e2),det=e1.dot(h)
                if abs(det)<1e-10 {continue}
                let s=o-a,u=s.dot(h)/det
                if u < -1e-8 || u>1+1e-8 {continue}
                let q=s.cross(e1),v=d.dot(q)/det
                if v < -1e-8 || u+v>1+1e-8 {continue}
                let distance=e2.dot(q)/det
                if distance>1e-6 && (nearest == nil || distance<nearest!.0) {nearest=(distance,e1.cross(e2).unit)}
            }
            return nearest
    }

    static func checkLightShield(_ kit:SegmentedRingKit,full:Bool) throws {
        let p=kit.parameters,mesh=kit.guided
        let z=p.ledShelfZ+p.stripWidth/2
        let front=Point3(x:p.ledWallRadius-p.stripThickness-0.05,y:0,z:z)
        let inward=ray(mesh,front,Point3(x:-1,y:0,z:0))
        require(inward != nil && inward!.1.x>0.7 && inward!.1.z>0.7,"LED must face the rising 45 degree reflector")
        require(ray(mesh,front,Point3(x:0,y:0,z:1)) == nil,"Uplight opening blocked")
        require(ray(mesh,front,Point3(x:0,y:0,z:-1)) != nil,"Missing opaque floor beneath LEDs")
        let colors=kit.ledFaces(mesh)
        let area=mesh.triangles.enumerated().reduce(0.0) {result,item in
            let t=item.element
            return result+(colors[item.offset]==1 ? (mesh.vertices[t.b]-mesh.vertices[t.a]).cross(mesh.vertices[t.c]-mesh.vertices[t.a]).length/2:0)
        }
        require(abs(area-(Double.pi/3)*p.ledWallRadius*p.channelWidth)/area<0.001,"LED mounting highlight area")
        // Check the actual assembled solids across seams, at lower/upper LED edges.
        if full {
            let assembly=kit.assembly()
            for theta in [0.0,Double.pi/6-0.001,Double.pi/6+0.001] {
                for height in [p.ledShelfZ+0.05,p.ledShelfZ+p.stripWidth-0.05] {
                    let r=p.ledWallRadius-p.stripThickness-0.05
                    let origin=Point3(x:r*cos(theta),y:r*sin(theta),z:height+4)
                    for i in 0..<16 {for drop in [0.01,0.5,3.0] {
                        let a=Double(i)*Double.pi/8
                        require(ray(assembly,origin,Point3(x:cos(a),y:sin(a),z:-drop)) != nil,"Direct view from below remains at a seam")
                    }}
                }
            }
        }
    }

    static func checkSolidUplight() throws {
        var prototype=RingParameters.solid;prototype.diameter=240
        var cases:[RingParameters]=[.solid,prototype]
        for diameter in [140.0,600.0] {for band in [0.0,60.0] {for height in [8.0,16.0] {for cord in [4.0,8.0] {
            for strip in [3.5,12.0] {for thickness in [1.0,6.0] {for allowance in [0.2,1.0] {
                cases.append(RingParameters(diameter:diameter,bandWidth:band,height:height,cordClearance:cord,ledClearance:allowance,
                                            reflectedLED:true,stripWidth:strip,stripThickness:thickness))
            }}}
        }}}}
        for (index,input) in cases.enumerated() {
            let p=input.normalized()
            require(!p.segmented && p.reflectedLED && !p.continuousCords,"Solid uplight must use separate ceiling and balloon attachments")
            let preview=RingGenerator.generate(p)
            try preview.validate()
            let mesh=RingGenerator.generate(p,quality:.export),data=try mesh.binarySTL(),parsed=parseSTL(data)
            try parsed.validate()
            for m in [preview,parsed] {
                require(m.vertices.count-m.triangles.count/2 == -12,"Solid uplight must have the central opening plus three ceiling and three balloon holes")
            }
            let dims=parsed.dimensions
            require(abs(dims.x-p.diameter)<0.001 && abs(dims.y-p.diameter)<0.001 && abs(dims.z-p.totalHeight)<0.001,"Solid uplight dimensions changed")
            require(abs(parsed.vertices.map(\.z).min()!)<0.001,"Solid ring is not on bed")
            for axis in [parsed.vertices.map(\.x),parsed.vertices.map(\.y)] {
                require(abs(axis.min()!+axis.max()!)<0.001,"Solid ring is not centred")
            }
            require(p.fitsP2S == (p.diameter<=240),"Solid bed-fit notice is wrong")
            require(p.filename.hasSuffix("solid.stl"),"Solid ring exported as a kit")
            let rise=p.stripWidth+p.ledClearance+2,opening=p.cordClearance+1.6
            let bore=p.cordClearance*p.cordClearance*(p.height-1.6)
                + 1.6/3*(opening*opening+opening*p.cordClearance+p.cordClearance*p.cordClearance)
            let expected=Double.pi*(pow(p.diameter/2,2)-pow(p.innerRadius,2))*p.height
                + Double.pi*(pow(p.diameter/2,2)-pow(p.ledWallRadius,2))*rise
                + Double.pi*(pow(p.ledWallRadius,2)-pow(p.ledShelfRadius,2))
                + Double.pi*(pow(p.reflectorInnerRadius,2)-pow(p.flangeOuterRadius,2))*rise
                + Double.pi*p.reflectorInnerRadius*rise*rise+Double.pi*pow(rise,3)/3-6*bore
            let volume=parsed.triangles.reduce(0.0) {sum,t in sum+parsed.vertices[t.a].dot(parsed.vertices[t.b].cross(parsed.vertices[t.c]))/6}
            require(abs(volume-expected)/expected<0.001,"Solid uplight volume differs from independent swept profile: \(index), \(p), error \(abs(volume-expected)/expected)")
            require(verticalHits(parsed,x:0,y:0).isEmpty,"Solid ring centre is blocked")
            // Even indices are the original ceiling holes; odd indices are
            // the added balloon holes, midway between the ceiling holes.
            for hole in 0..<6 {
                let theta=Double(hole)*Double.pi/3
                for sample in 0..<17 {
                    let a=Double(sample)*Double.pi/8,offset=sample==16 ? 0:p.cordClearance*0.49
                    require(verticalHits(parsed,x:p.holeRadius*cos(theta)+offset*cos(a),y:p.holeRadius*sin(theta)+offset*sin(a)).isEmpty,
                            "Solid ring attachment is blocked: \(index), \(hole%2==0 ? "ceiling":"balloon") hole \(hole)")
                }
            }
            let sectionSamples=[((p.reflectorToeRadius+p.ledShelfRadius)/2,p.height),
                                ((p.ledShelfRadius+p.ledWallRadius)/2,p.ledShelfZ),
                                (p.reflectorToeRadius-rise/2,p.height+rise/2),
                                ((p.flangeOuterRadius+p.reflectorInnerRadius)/2,p.totalHeight),
                                ((p.ledWallRadius+p.diameter/2)/2,p.totalHeight)]
            for theta in [0.0,0.0001,0.31,Double.pi/3,2*Double.pi/3,Double.pi,4*Double.pi/3,5*Double.pi/3,2*Double.pi-0.0001] {
                for (r,z) in sectionSamples {
                    let hits=verticalHits(parsed,x:r*cos(theta),y:r*sin(theta))
                    require(hits.count==2 && abs(hits[0])<0.001 && abs(hits[1]-z)<0.015,"Solid light profile discontinuity: \(index)")
                }
            }
            for m in [preview,mesh] {
                let front=Point3(x:p.ledWallRadius-p.stripThickness-0.05,y:0,z:p.ledShelfZ+p.stripWidth/2)
                let hit=ray(m,front,Point3(x:-1,y:0,z:0))
                require(hit != nil && hit!.1.x>0.7 && hit!.1.z>0.7,"Solid LED does not face its reflector")
                require(ray(m,front,Point3(x:0,y:0,z:1)) == nil,"Solid uplight opening is blocked")
                require(ray(m,front,Point3(x:0,y:0,z:-1)) != nil,"Solid LED has no floor")
                let colors=p.ledFaces(in:m)
                let area=m.triangles.enumerated().reduce(0.0) {sum,item in
                    let t=item.element
                    return sum+(colors[item.offset]==1 ? (m.vertices[t.b]-m.vertices[t.a]).cross(m.vertices[t.c]-m.vertices[t.a]).length/2:0)
                }
                require(abs(area-2*Double.pi*p.ledWallRadius*p.channelWidth)/area<0.001,"Solid LED highlight missing or on wrong face")
            }
            if index<2 {
                for theta in [0.0,0.1,Double.pi/3,2*Double.pi/3,Double.pi,4*Double.pi/3,5*Double.pi/3] {
                    for z in [p.ledShelfZ+0.05,p.ledShelfZ+p.stripWidth-0.05] {
                        let r=p.ledWallRadius-p.stripThickness-0.05,origin=Point3(x:r*cos(theta),y:r*sin(theta),z:z)
                        for sample in 0..<16 {for drop in [0.01,0.5,3.0] {
                            let a=Double(sample)*Double.pi/8
                            require(ray(parsed,origin,Point3(x:cos(a),y:sin(a),z:-drop)) != nil,"Solid LED has a direct sightline from below")
                        }}
                    }
                }
                try data.write(to:URL(fileURLWithPath:".build/test-output/\(p.filename)"))
            }
            let restored=try JSONDecoder().decode(RingParameters.self,from:JSONEncoder().encode(p))
            require(restored.normalized()==p,"Solid settings did not round-trip")
        }
        var invalid=RingParameters.solid;invalid.height = .nan;invalid.cordClearance = .nan
        require(invalid.normalized().height==12 && invalid.normalized().cordClearance==6,"Solid uplight fallback dimensions changed with cord routing")
        print("PASS \(cases.count) solid uplight rings: manifold STL, three ceiling and three balloon holes, full-circle light profile, highlight, shielding, dimensions, volume and settings")
    }
}
