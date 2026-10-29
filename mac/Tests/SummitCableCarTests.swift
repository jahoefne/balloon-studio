import Foundation

extension PatternTests {
    static func checkSummitCableCar() throws {
        try checkReliefShapes(.summitCableCar,label:"Summit Cable Car",file:"summit-cable-car")
        var settings=PatternSettings();settings.style = .summitCableCar
        let raw=BalloonGenerator.generate(.classic)
        let relief=NightFlightRelief(settings:settings,parameters:.classic,mesh:raw)
        check(abs(relief.width-SummitCableCarArtwork.designWidth)<0.1 && abs(relief.height-SummitCableCarArtwork.designHeight)<0.1,
              "The classic artwork no longer matches the canvas the scene was drawn on")
        // Probe points in the artwork's own terms: panorama position u, millimetres above the
        // bottom edge and millimetres sideways from that meridian, warped by the crest radius.
        var rings:[Double:Double]=[:]
        for (i,v) in raw.vertices.enumerated() where raw.innerVertexRange?.contains(i) != true && v.z<=220 {
            rings[v.z]=max(rings[v.z] ?? 0,hypot(v.x,v.y))
        }
        let profile=rings.sorted {$0.key<$1.key},reach=relief.width/(2*Double.pi)
        func radius(_ y:Double)->Double {
            let z=relief.bottom+y
            guard let j=profile.firstIndex(where:{$0.key>=z}),j>0 else {return z<=profile[0].key ? profile[0].value:profile.last!.value}
            let a=profile[j-1],b=profile[j];return a.value+(b.value-a.value)*(z-a.key)/(b.key-a.key)
        }
        func at(_ u:Double,_ y:Double,_ x:Double=0,radius r:Double=80)->Point3 {
            let angle=NightFlightRelief.origin+(u+x*reach/max(8,radius(y))/relief.width-0.5)*2*Double.pi
            return Point3(x:r*cos(angle),y:r*sin(angle),z:relief.bottom+y)
        }
        func h(_ u:Double,_ y:Double,_ x:Double=0)->Double {relief.artworkHeight(at:at(u,y,x))}
        var heroes:[[Double]]=[]
        for hero in [0.02,0.52] {
            let station=hero+0.07,low=station-0.25,cabin=hero-0.075
            check(h(station,132.5,-6)>2.0,"Summit station missing")
            check(h(station,124.5,10.5)>2.0,"Bullwheel missing")
            check(h(station,124.5,10.5)>h(station,125.5,12.23)+0.4,"Bullwheel rim lost its recess")
            check(h(station,146.5,0.8)>1.9,"Station flag missing")
            check(h(low,92.5)>1.6,"Cable missing at the bottom of its swag")
            check(h(low,86)<0.05 && h(low,99)<0.05,"Sky around the cable is not clear")
            check(h(cabin,94)>1.9,"Cabin hanger missing")
            check(h(cabin,98.6)<h(cabin,97.3)-0.4,"Hanger pivot lost its recess")
            let body=h(cabin,72.2,-5.9),glass=h(cabin,75.5,-8.4)
            check(body>1.9,"Cabin body missing")
            check(glass<1.6 && glass<body-0.4,"Cabin windows lost their recess")
            check(h(cabin,100-35.6*0.84)>glass+0.4,"Passenger missing from the middle window")
            check(h(station,107,-10)>1.8,"Snow missing on the lit face")
            check(h(station,100,22)>1.6 && h(station,100,22)>h(station,86,22)+0.6,"Snow hem does not step above the summit's body")
            let lit=h(station,60,-16),shoulder=h(station,24,-40),deep=h(station,45,40),spur=h(station,40,56)
            check(lit>1.1 && lit<1.6,"Lit mountain face missing")
            check(shoulder>0.95 && shoulder<lit-0.08,"Buttress does not step below the lit face")
            check(deep>0.5 && deep<0.8,"Shadow face missing")
            check(spur>deep+0.08 && spur<lit,"Shadow-side spur missing")
            // The hiking trail is a dashed groove in the lit face; follow its first bend.
            var groove=10.0
            for i in 1...19 {
                let f=Double(i)/20,u=1-f
                let x=u*u*u*(-8)+3*u*u*f*8+3*u*f*f*(-40)+f*f*f*(-24)
                let y=u*u*u*26+3*u*u*f*36+3*u*f*f*42+f*f*f*54
                groove=min(groove,h(station,y,x))
            }
            check(groove<1.05,"Hiking trail groove missing")
            check(h(hero-0.125,132,-7.2)>1.8,"Moon missing")
            check(h(hero-0.125,135.1,5.3)<0.01,"Crescent cutout filled in")
            check(h(hero-0.03,145)>1.5,"Star missing")
            check(h(hero+0.215,63.5)>1.5,"Cloud missing")
            check(h(hero-0.175,21.5,-7)>1.7,"Chalet missing")
            check(h(hero-0.235,21)>1.4,"Fir missing")
            heroes.append([h(station,132.5,-6),h(station,124.5,10.5),h(low,92.5),body,glass,h(station,107,-10),lit,deep,
                           h(hero-0.125,132,-7.2),h(hero-0.03,145),h(hero+0.215,63.5),h(hero-0.175,21.5,-7),h(hero-0.235,21)])
        }
        for (a,b) in zip(heroes[0],heroes[1]) {check(abs(a-b)<0.12,"Opposite halves have different detail or scale")}
        // The scene wraps: the ground and the first mountain's foot cross the panorama seam.
        var seamSamples=0
        for row in 1..<200 {
            let v=Double(row)/200
            let left=relief.artworkHeight(at:at(1-1e-8,v*relief.height)),right=relief.artworkHeight(at:at(1e-8,v*relief.height))
            check(abs(left-right)<0.001,"Relief is discontinuous across the seam")
            if v>0.03 && v<0.3 && left>0.4 {seamSamples+=1}
        }
        check(seamSamples>10,"Landscape is missing across the wrap seam")
        var sectors=Set<Int>()
        for x in 0..<120 {for y in 1..<39 {
            if relief.artworkHeight(at:at(Double(x)/120,Double(y)/40*relief.height))>0.5 {sectors.insert(x/15)}
        }}
        check(sectors.count==8,"Panoramic scene does not wrap around the balloon")
        let a=at(0.445,72.2,radius:20),b=at(0.445,72.2,radius:30)
        check(abs(20+relief.displacement(at:a)-30-relief.displacement(at:b))<1e-8,"Grooves still deform the raised cabin")
        // Other envelopes keep the station on its summit and the cable between the stations.
        for (name,p) in [("round",BalloonParameters.round),("tall",.tall)] {
            let mesh=BalloonGenerator.generate(p)
            let scaled=NightFlightRelief(settings:settings,parameters:p,mesh:mesh)
            let sy=scaled.height/SummitCableCarArtwork.designHeight,sm=min(sy,scaled.width/SummitCableCarArtwork.designWidth)
            func z(_ y:Double)->Double {scaled.bottom+y}
            func probe(_ u:Double,_ y:Double)->Double {
                let angle=NightFlightRelief.origin+(u-0.5)*2*Double.pi
                return scaled.artworkHeight(at:Point3(x:80*cos(angle),y:80*sin(angle),z:z(y)))
            }
            check(probe(0.59,118.5*sy+12.2*sm)>2.0,"Summit station missing on the \(name) envelope")
            check(probe(0.34,118.5*sy+10*sm-36*sy)>1.6,"Cable missing on the \(name) envelope")
            check(probe(0.34,118.5*sy+10*sm-36*sy+6.5*sm+2)<0.05,"Sky above the cable is not clear on the \(name) envelope")
            check(probe(0.395-7.2*sm/scaled.width,132*sy)>1.8,"Moon missing on the \(name) envelope")
        }
        settings.flightCap=settings.flightBody
        let single=PaintedBalloon.make(raw,parameters:.classic,settings:settings)
        check(single.mesh.triangles.count>raw.triangles.count && !single.colors.contains(1),"Matching colors lost relief or kept the cap color")
        check(PurgeEstimate.calculate(single,settings:PurgeSettings()).maximumChanges==0,"One filament must not purge")
        let restored=try JSONDecoder().decode(PatternSettings.self,from:JSONEncoder().encode(settings.normalized(.classic)))
        check(restored.style == .summitCableCar && restored==settings.normalized(.classic),"Summit Cable Car settings failed to persist")
        let saved=try JSONDecoder().decode(PatternSettings.self,from:Data(#"{"style":"Summit Cable Car","reliefDepth":3,"capHeight":22,"flightCap":"Charcoal"}"#.utf8))
        check(saved.style == .summitCableCar && saved.reliefDepth==3 && saved.capHeight==22 && saved.detailColor == .charcoal && saved.baseColor == .cream,
              "Saved Summit Cable Car settings did not restore")
        let flight=try JSONDecoder().decode(PatternSettings.self,from:Data(#"{"style":"Night Flight","reliefDepth":1.6}"#.utf8))
        check(flight.style == .nightFlight,"Adding the cable car changed saved Night Flight settings")
        print("PASS Summit Cable Car opposite stations and cabins, faceted summits, clear sky, wrapped landscape, scaled envelopes and settings")
    }
}
