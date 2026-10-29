import Foundation

extension PatternTests {
    // Every sculpted panorama must behave the same on all nine shapes: raised geometry only,
    // nothing against the cap, a protected cavity and attachments, one cap color change.
    static func checkReliefShapes(_ style:BalloonPattern,label:String,file:String) throws {
        var settings=PatternSettings();settings.style=style
        let cases:[(String,BalloonParameters,Double,Double)]=[
            ("classic",.classic,2.4,18),
            ("round",.round,2.4,18),
            ("wide-with-fine-panels",BalloonParameters(height:242,diameter:239,panels:32,panelDepth:4,neckDiameter:50,neckHeight:12.86,shoulder:63,stringHoles:true,hangingLoop:true,hangingClearance:3.5),2.4,18),
            ("tall",.tall,1.2,10),
            ("compact",BalloonParameters(height:80,diameter:60,panels:8),4,28),
            ("wide",BalloonParameters(height:80,diameter:240,panels:8,panelDepth:8,shoulder:75),4,28),
            ("narrow",BalloonParameters(height:250,diameter:60,panels:8,panelDepth:0),4,10),
            ("filled-attachments",BalloonParameters(stringHoles:true,hangingLoop:true),4,18),
            ("hollow-attachments",BalloonParameters(hollow:true,wallThickness:0.8,stringHoles:true,hangingLoop:true),2.4,18)
        ]
        for (name,input,depth,cap) in cases {
            let p=input.normalized()
            settings.reliefDepth=depth;settings.capHeight=cap
            for quality:BalloonGenerator.Quality in [.preview,.export] {
                let original=BalloonGenerator.generate(p,quality:quality)
                let relief=NightFlightRelief(settings:settings,parameters:p,mesh:original)
                for x in 0..<360 {
                    let angle=Double(x)*Double.pi/180
                    let edge=Point3(x:80*cos(angle),y:80*sin(angle),z:relief.bottom+relief.height*0.999)
                    check(relief.artworkHeight(at:edge)<0.01,"Artwork clipped against cap: \(name)")
                }
                let painted=PaintedBalloon.make(original,parameters:p,settings:settings)
                try painted.mesh.validate()
                check(painted.mesh.triangles.count<2_500_000,"Relief refinement created an excessive mesh: \(name)")
                var changed=0,originalVolume=0.0,newVolume=0.0
                for t in original.triangles {
                    originalVolume += original.vertices[t.a].dot(original.vertices[t.b].cross(original.vertices[t.c]))/6
                }
                for (i,t) in painted.mesh.triangles.enumerated() {
                    let a=painted.mesh.vertices[t.a],b=painted.mesh.vertices[t.b],c=painted.mesh.vertices[t.c]
                    newVolume += a.dot(b.cross(c))/6
                    let capZ=settings.capBoundary(p)
                    if painted.colors[i]==0 {check(max(a.z,b.z,c.z)<=capZ+1e-8,"Body color above cap: \(name)")}
                    else {check(min(a.z,b.z,c.z)>=capZ-1e-8,"Cap color below its single layer boundary: \(name)")}
                }
                check(newVolume>originalVolume,"Relief must be actual added material: \(name)")
                // Refinement retains the original vertex indices. Cavities and attachments
                // must stay exactly where they were, while exterior relief only grows outward.
                for i in original.vertices.indices {
                    let a=original.vertices[i],b=painted.mesh.vertices[i]
                    check(a.z==b.z,"Relief changed vertical geometry")
                    let delta=hypot(b.x,b.y)-hypot(a.x,a.y)
                    check(delta >= -1e-9 && delta<=depth+p.diameter*p.panelDepth/200+0.1,"Relief cut the shell or exceeded its depth")
                    if delta>1e-6 {changed+=1}
                    if original.innerVertexRange?.contains(i)==true || a.z<relief.bottom || a.z>relief.bottom+relief.height {
                        check((a-b).length<1e-10,"Relief moved the cavity, neck or hanger: \(name)")
                    }
                }
                check(changed>10,"Missing geometric motifs: \(name)")
                check(abs(painted.mesh.dimensions.z-p.totalHeight)<1e-8,"Relief altered print height")
                check(painted.mesh.dimensions.x<=p.diameter+2*depth+1e-8 && painted.mesh.dimensions.y<=p.diameter+2*depth+1e-8,"Unexpected relief bounds")
                for layerHeight in [0.08,0.20,0.32] {
                    var purge=PurgeSettings();purge.layerHeight=layerHeight
                    let estimate=PurgeEstimate.calculate(painted,settings:purge)
                    check(estimate.minimumChanges==1 && estimate.maximumChanges==1 && estimate.mixedLayers==0,
                          "\(label) has unnecessary color changes: \(name)")
                }
                // A binary STL round trip independently welds float coordinates and validates
                // triangles, catching relief facets that collapse at actual export precision.
                if quality == .export {
                    try validateFlightSTL(painted.mesh.binarySTL())
                    if name=="classic" {
                        try painted.threeMF(settings:settings,purge:PurgeSettings()).write(to:URL(fileURLWithPath:".build/pattern-tests/\(file).3mf"))
                        try painted.mesh.binarySTL().write(to:URL(fileURLWithPath:".build/pattern-tests/\(file).stl"))
                    }
                }
                print("PASS \(label) \(name) \(quality): raised geometry, protected cavity/attachments, one color change, \(painted.mesh.triangles.count) faces")
            }
        }
    }

    static func checkNightFlight() throws {
        try checkReliefShapes(.nightFlight,label:"Night Flight",file:"night-flight")
        var settings=PatternSettings();settings.style = .nightFlight
        let raw=BalloonGenerator.generate(.classic)
        let relief=NightFlightRelief(settings:settings,parameters:.classic,mesh:raw)
        func at(_ u:Double,_ v:Double,radius:Double=80)->Point3 {
            let angle=NightFlightRelief.origin+(u-0.5)*2*Double.pi
            return Point3(x:radius*cos(angle),y:radius*sin(angle),z:relief.bottom+v*relief.height)
        }
        let scale=min(180*0.006,relief.height*0.0105)
        func plane(_ x:Double,_ y:Double,center:Double=0.52)->Point3 {
            let dx=(cos(0.25)*x-sin(0.25)*y)*scale,dy=(sin(0.25)*x+cos(0.25)*y)*scale
            return at(center+dx/relief.width,0.52+dy/relief.height)
        }
        // Check recognizable parts, distinct height layers and recessed cockpit details.
        let body=relief.artworkHeight(at:plane(-15,-3)),cockpit=relief.artworkHeight(at:plane(10,15))
        check(body>1.8 && cockpit>0.7 && cockpit<body-0.5,"Cockpit lost its crisp recess")
        check(relief.artworkHeight(at:plane(-2,-16))>2,"Foreground wing missing")
        check(relief.artworkHeight(at:plane(-5,26))>1.3,"Far wing missing")
        check(relief.artworkHeight(at:plane(52,12))>1.5,"Propeller missing")
        check(relief.artworkHeight(at:plane(37.7,3))>2.2,"Engine cowling missing")
        check(relief.artworkHeight(at:plane(13,14))>2.1,"Canopy divider missing")
        check(relief.artworkHeight(at:plane(22,-21))>1.4,"Landing wheel missing")
        check(relief.artworkHeight(at:plane(-12,-27))>relief.artworkHeight(at:plane(-15.2,-27))+0.35,"Wing roundel lost its relief")
        check(relief.artworkHeight(at:plane(37.7,3))>relief.artworkHeight(at:plane(35.2,3))+0.4,"Engine cooling slots missing")
        let moonRadius=min(relief.height*0.115,180*0.085)
        check(relief.artworkHeight(at:at(0.40-moonRadius*0.65/relief.width,0.87))>1.8,"Moon missing")
        check(relief.artworkHeight(at:at(0.40+moonRadius*0.48/relief.width,0.87+moonRadius*0.28/relief.height))<0.01,"Crescent cutout filled in")
        // Probe the erased side of the outer circle, including its antialiased rim.
        // Checking only the center of the cutout misses disconnected moon fragments.
        for i in 0...80 {for offset in [-0.25,0.0,0.25] {
            let angle = -0.2+Double(i)*1.4/80,r=moonRadius+offset
            let x=cos(angle)*r,y=sin(angle)*r
            if hypot(x-moonRadius*0.48,y-moonRadius*0.28)<moonRadius*0.89-0.8 {
                check(relief.artworkHeight(at:at(0.40+x/relief.width,0.87+y/relief.height))<0.015,
                      "Stray relief remains around the crescent's open edge")
            }
        }}
        check(relief.artworkHeight(at:at(0.50,0.93))>1.5,"Star missing")
        check(relief.artworkHeight(at:at(0.31,0.64))>1.4,"Cloud missing")
        // The cloud faces must be smooth where the previous engraved puff lines were.
        for (u,v,size,mirror) in [(0.31,0.62,0.90,false),(0.55,0.81,0.85,true),(0.64,0.21,0.88,false),
                                  (0.20,0.68,0.75,true),(0.82,0.73,1.0,false),(0.94,0.15,0.62,true)] {
            let s=min(size*scale,relief.height*(0.97-v)/28,relief.height*(v-0.03)/10)
            func cloudHeight(_ x:Double,_ y:Double)->Double {
                relief.artworkHeight(at:at(u+(mirror ? -x:x)*s/relief.width,v+y*s/relief.height))
            }
            for (x,y) in [(-17.0,8.0),(-15,10),(-12,12),(16,8),(18,6)] {
                let h=cloudHeight(x,y)
                check(h>1.6,"Cloud face has an inset line")
                for (dx,dy) in [(0.8,0.0),(0.0,0.8)] {
                    check(abs(cloudHeight(x-dx,y-dy)+cloudHeight(x+dx,y+dy)-2*h)<0.12,
                          "Cloud face has a sharp interior groove")
                }
            }
        }
        // Both planes stay full size, with their centers exactly half a turn apart.
        check(relief.height>220*0.65 && scale*104>180*0.6,"Composition shrank into a small badge")
        var sectors=Set<Int>()
        for x in 0..<120 {for y in 1..<39 {
            if relief.artworkHeight(at:at(Double(x)/120,Double(y)/40))>0.5 {sectors.insert(x/15)}
        }}
        check(sectors.count==8,"Panoramic scene does not wrap around the balloon")
        check(relief.artworkHeight(at:at(0.27,0.52))<0.1 && relief.artworkHeight(at:at(0.77,0.52))<0.1,"Unexpected planes between the opposite pair")
        for center in [0.02,0.52] {
            for (x,y) in [(-15.0,-3.0),(-2,-16),(-5,26),(52,12),(37.7,3),(13,14),(22,-21),(-12,-27)] {
                check(relief.artworkHeight(at:plane(x,y,center:center))>1.3,"Opposite plane is incomplete")
                check(abs(relief.artworkHeight(at:plane(x,y,center:center))-relief.artworkHeight(at:plane(x,y)))<0.12,
                      "Opposite planes have different detail or scale")
            }
            check(relief.artworkHeight(at:plane(5.5,15.3,center:center))>relief.artworkHeight(at:plane(10,15,center:center))+0.55,"Pilot silhouette missing")
            check(relief.artworkHeight(at:plane(36,11.5,center:center))<relief.artworkHeight(at:plane(37.7,9,center:center))-0.35,"Cowling fastener missing")
            check(relief.artworkHeight(at:plane(-2.5,-20,center:center))>relief.artworkHeight(at:plane(-6,-22,center:center))+0.2,"Wing ribs missing")
        }
        // The rear fuselage and wing cross the panorama seam. Check both sides of
        // that seam over the full artwork height to catch a split or faded band.
        var seamSamples=0
        for row in 1..<200 {
            let v=Double(row)/200
            let left=relief.artworkHeight(at:at(1-1e-8,v)),right=relief.artworkHeight(at:at(1e-8,v))
            check(abs(left-right)<0.001,"Relief is discontinuous across the rear plane")
            if v>0.4 && v<0.7 && left>1 {seamSamples+=1}
        }
        check(seamSamples>10,"Rear plane is missing across the wrap seam")
        let a=at(0.52,0.52,radius:20),b=at(0.52,0.52,radius:30)
        check(abs(20+relief.displacement(at:a)-30-relief.displacement(at:b))<1e-8,"Grooves still deform the raised object surface")
        settings.flightCap=settings.flightBody
        let single=PaintedBalloon.make(raw,parameters:.classic,settings:settings)
        check(single.mesh.triangles.count>raw.triangles.count && !single.colors.contains(1),"Matching colors lost relief or kept the cap color")
        check(PurgeEstimate.calculate(single,settings:PurgeSettings()).maximumChanges==0,"One filament must not purge")
        settings.reliefDepth = .nan;settings.capHeight = .infinity
        let normalized=settings.normalized(.classic)
        check(normalized.flightCompositionVersion==3 && normalized.reliefDepth==2.4 && normalized.capHeight==18,"Night Flight normalization failed")
        let restored=try JSONDecoder().decode(PatternSettings.self,from:JSONEncoder().encode(normalized))
        check(restored==normalized,"Night Flight settings failed to persist")
        let legacy=try JSONDecoder().decode(PatternSettings.self,from:Data(#"{"style":"Text","text":"Milo","textFont":"Serif","textRepeats":2,"base":"Rose","detail":"Cream"}"#.utf8))
        check(legacy.style == .text && legacy.text=="Milo" && legacy.textFont == .serif && legacy.baseColor == .rose,"Night Flight upgrade lost the existing design")
        check(legacy.flightBody == .cream && legacy.flightCap == .midnight,"Night Flight colors did not migrate")
        let oldFlight=try JSONDecoder().decode(PatternSettings.self,from:Data(#"{"style":"Night Flight","flightRepeats":3,"reliefDepth":1.2,"capHeight":22,"flightCap":"Blue"}"#.utf8))
        check(oldFlight.flightCompositionVersion==3 && oldFlight.reliefDepth==2.4 && oldFlight.capHeight==22 && oldFlight.flightCap == .blue,"Old repeated scene did not migrate without losing cap settings")
        let previous=try JSONDecoder().decode(PatternSettings.self,from:Data(#"{"style":"Night Flight","flightCompositionVersion":2,"reliefDepth":1.6,"capHeight":17,"flightBody":"Cream","flightCap":"Blue"}"#.utf8))
        check(previous.flightCompositionVersion==3 && previous.reliefDepth==1.6 && previous.capHeight==17 && previous.flightCap == .blue,"Two-plane upgrade changed saved relief or cap settings")
        print("PASS Night Flight opposite planes, wrapped details, clean moon/clouds, groove bridging and settings migration")
    }

    static func validateFlightSTL(_ data:Data) throws {
        func u32(_ offset:Int)->UInt32 {UInt32(data[offset]) | UInt32(data[offset+1])<<8 | UInt32(data[offset+2])<<16 | UInt32(data[offset+3])<<24}
        struct Key:Hashable {let x:UInt32;let y:UInt32;let z:UInt32}
        let count=Int(u32(80));check(data.count==84+50*count,"Malformed relief STL")
        var lookup:[Key:Int]=[:],vertices:[Point3]=[],faces:[Triangle]=[]
        for i in 0..<count {
            var ids:[Int]=[]
            for j in 0..<3 {
                let o=84+i*50+12+j*12,key=Key(x:u32(o),y:u32(o+4),z:u32(o+8))
                if let index=lookup[key] {ids.append(index)}
                else {
                    ids.append(vertices.count);lookup[key]=vertices.count
                    vertices.append(Point3(x:Double(Float(bitPattern:key.x)),y:Double(Float(bitPattern:key.y)),z:Double(Float(bitPattern:key.z))))
                }
            }
            faces.append(Triangle(a:ids[0],b:ids[1],c:ids[2]))
        }
        try BalloonMesh(vertices:vertices,triangles:faces,maxOverhang:0).validate()
    }
}
