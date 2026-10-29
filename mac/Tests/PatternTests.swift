import Foundation
import CoreText

@main struct PatternTests {
    static func check(_ value:Bool,_ message:String) {if !value {fatalError(message)}}
    static func motifCount(_ painted:PaintedBalloon)->Int {
        var parents=Array(painted.mesh.vertices.indices),used=Set<Int>()
        func root(_ i:Int)->Int {var n=i;while parents[n] != n {parents[n]=parents[parents[n]];n=parents[n]};return n}
        for (i,t) in painted.mesh.triangles.enumerated() where painted.colors[i]==1 {
            let a=root(t.a),b=root(t.b),c=root(t.c);parents[b]=a;parents[c]=a
            used.formUnion([t.a,t.b,t.c])
        }
        return Set(used.map {root($0)}).count
    }
    static func main() throws {
        setbuf(stdout,nil)
        try FileManager.default.createDirectory(atPath:".build/pattern-tests",withIntermediateDirectories:true)
        if CommandLine.arguments.contains("night-flight") {try checkNightFlight();return}
        if CommandLine.arguments.contains("summit-cable-car") {try checkSummitCableCar();return}
        let p=BalloonParameters.classic,raw=BalloonGenerator.generate(p,quality:.export)
        var settings=PatternSettings()
        for style in BalloonPattern.allCases {
            settings.style=style
            let painted=PaintedBalloon.make(raw,parameters:p,settings:settings)
            try painted.mesh.validate()
            let e=PurgeEstimate.calculate(painted,settings:PurgeSettings())
            if style == .none {check(e.maximumChanges==0,"Solid must not change filament")}
            else {
                check(Set(painted.colors)==Set([0,1]),"Both filaments must be painted")
                if style.hasRelief {
                    check(e.minimumChanges==1 && e.maximumChanges==1 && e.mixedLayers==0,"\(style) must switch the whole layer once")
                } else if style == .stripes {
                    check(e.minimumChanges==5 && e.maximumChanges==5 && e.mixedLayers==0,"Six stripes should change exactly five times")
                    check(abs(e.maximumGrams-2.48)<1e-8,"mm³ to grams conversion failed")
                } else if style == .text {
                    check(e.mixedLayers>0,"Text should have mixed layers")
                } else {
                    check(e.mixedLayers>0 && e.minimumChanges>5,"Motifs should have mixed layers")
                    check(motifCount(painted)==settings.rows*settings.repeats,"Export lost or joined motifs")
                }
                try painted.threeMF(settings:settings,purge:PurgeSettings()).write(to:URL(fileURLWithPath:".build/pattern-tests/\(style).3mf"))
            }
            print("PASS \(style): \(e.minimumChanges)–\(e.maximumChanges) changes, \(e.minimumGrams)–\(e.maximumGrams) g")
        }
        let small=BalloonParameters(height:80,diameter:60,panels:8).normalized()
        let smallMesh=BalloonGenerator.generate(small)
        for style in [BalloonPattern.hearts,.dots,.diamonds] {
            var dense=PatternSettings();dense.style=style;dense.repeats=24;dense.rows=6;dense.size=3
            let painted=PaintedBalloon.make(smallMesh,parameters:small,settings:dense)
            try painted.mesh.validate()
            check(motifCount(painted)==144,"Small preview lost or joined \(style) motifs: \(motifCount(painted))")
            dense.repeats=1;dense.rows=1;dense.size=18
            let single=PaintedBalloon.make(smallMesh,parameters:small,settings:dense)
            check(motifCount(single)==1,"Single motif control failed")
        }
        settings.style = .stripes;settings.bands=24
        for hollow in [false,true] {
            var rig=p;rig.hollow=hollow;rig.hangingLoop=true;rig.stringHoles=true
            let painted=PaintedBalloon.make(BalloonGenerator.generate(rig),parameters:rig,settings:settings)
            try painted.mesh.validate()
            check(abs(painted.mesh.dimensions.z-rig.totalHeight)<1e-8,"Stripe splitting changed attachments")
        }
        settings.style = .dots;settings.rows=1
        let singleRow=PaintedBalloon.make(raw,parameters:p,settings:settings)
        let one=PurgeEstimate.calculate(singleRow,settings:PurgeSettings())
        settings.rows=3
        let three=PurgeEstimate.calculate(PaintedBalloon.make(raw,parameters:p,settings:settings),settings:PurgeSettings())
        check(three.maximumChanges>one.maximumChanges,"More occupied rows must increase waste")
        var purge=PurgeSettings();purge.layerHeight=0.1
        check(PurgeEstimate.calculate(singleRow,settings:purge).maximumChanges>one.maximumChanges,"Finer layers must increase changes")
        purge=PurgeSettings();purge.baseToDetail=100;purge.detailToBase=700;purge.multiplier=0.5
        settings.style = .stripes;settings.bands=6
        let directional=PurgeEstimate.calculate(PaintedBalloon.make(raw,parameters:p,settings:settings),settings:purge)
        check(abs(directional.maximumGrams-(3*100+2*700)*0.5*1.24/1000)<1e-8,"Directional flushing or multiplier wrong")
        settings.detail=settings.base
        check(PurgeEstimate.calculate(PaintedBalloon.make(raw,parameters:p,settings:settings),settings:purge).maximumChanges==0,"Same colors must not purge")
        settings.size = .nan;settings.rows=Int.max;settings.repeats=Int.min;settings.bands=Int.max
        let normalized=settings.normalized(p)
        check(normalized.size.isFinite && normalized.rows==6 && normalized.repeats==1 && normalized.bands==24,"Normalization failed")
        let restored=try JSONDecoder().decode(PatternSettings.self,from:JSONEncoder().encode(normalized))
        check(restored==normalized,"Pattern persistence failed")
        try checkTextPatterns()
        try checkNightFlight()
        try checkSummitCableCar()
        print("All pattern topology, scheduling, directional purge, normalization, and persistence checks passed.")
    }

    static func checkTextPatterns() throws {
        let p=BalloonParameters.classic
        var text=PatternSettings();text.style = .text;text.text="F"
        let raw=BalloonGenerator.generate(p)
        var masks=Set<[UInt8]>()
        for font in BalloonTextFont.allCases {
            let installed=CTFontCreateWithName(font.postScriptName as CFString,100,nil)
            check(CTFontCopyPostScriptName(installed) as String == font.postScriptName,"Missing font: \(font.postScriptName)")
            text.textFont=font
            let mask=BalloonTextMask(text:"F",font:font)!
            masks.insert(mask.pixels)
            // F has more ink in its upper half and its stem on the left in every font.
            let ink=mask.pixels.indices.filter {mask.pixels[$0]>0}
            let centerX=ink.reduce(0.0) {$0+Double($1%mask.width)/Double(mask.width)}/Double(ink.count)
            let centerY=ink.reduce(0.0) {$0+Double($1/mask.width)/Double(mask.height)}/Double(ink.count)
            check(centerX<0.5 && centerY>0.52,"Lettering flipped or mirrored: \(font)")
            let painted=PaintedBalloon.make(raw,parameters:p,settings:text)
            try painted.mesh.validate()
            check(motifCount(painted)==text.textRepeats,"Preview lost or joined text copies: \(font), \(motifCount(painted))")
            check(abs(painted.mesh.dimensions.z-raw.dimensions.z)<1e-9,"Text changed balloon height")
            print("PASS text font \(font.rawValue): upright glyphs and \(text.textRepeats) closed-mesh copies")
        }
        check(masks.count==BalloonTextFont.allCases.count,"Font choices must produce different lettering")
        text.textFont = .rounded
        for repeats in [1,2,7,24] {
            text.textRepeats=repeats
            let layout=BalloonTextLayout(settings:text,parameters:p)!
            for copy in 0..<repeats {
                // Sample one known painted point, including copies crossing the atan2 seam.
                let angle=BalloonTextLayout.origin+Double(copy)*layout.step+0.2*layout.angularWidth
                let point=Point3(x:80*cos(angle),y:80*sin(angle),z:layout.bottom+0.92*layout.height)
                check(layout.color(at:point,normal:point)==1,"Missing repeated text at \(copy)/\(repeats)")
                check(layout.color(at:point,normal:point * -1)==0,"Text painted the cavity")
            }
            let quality:BalloonGenerator.Quality=repeats==7 ? .export:.preview
            let painted=PaintedBalloon.make(BalloonGenerator.generate(p,quality:quality),parameters:p,settings:text)
            try painted.mesh.validate()
            check(motifCount(painted)==repeats,"Incorrect rendered text repeat count: \(repeats), got \(motifCount(painted))")
            print("PASS text repeats \(repeats), including wrap seam")
        }
        let ring=BalloonTextMask(text:"O",font:.sans)!
        check(!ring.contains(x:0.5,y:0.5) && ring.contains(x:0.05,y:0.5),"Glyph counters must remain open")
        check(BalloonTextMask(text:"Zoë & Léa",font:.serif) != nil,"Accented text was lost")
        check(BalloonTextMask(text:"東京",font:.rounded) != nil,"Fallback glyphs were lost")
        text.text="Zoë & Léa <3";text.textFont = .serif;text.textRepeats=2
        for hollow in [false,true] {
            var rig=p;rig.hollow=hollow;rig.stringHoles=true;rig.hangingLoop=true
            let painted=PaintedBalloon.make(BalloonGenerator.generate(rig),parameters:rig,settings:text)
            try painted.mesh.validate()
            check(painted.colors.contains(1),"Text missing on attached balloon")
            for (i,t) in painted.mesh.triangles.enumerated() where painted.colors[i]==1 {
                let a=painted.mesh.vertices[t.a],b=painted.mesh.vertices[t.b],c=painted.mesh.vertices[t.c]
                let center=(a+b+c)*(1.0/3),normal=(b-a).cross(c-a)
                check(center.z>rig.neckHeight && center.z<rig.height*0.9 && normal.x*center.x+normal.y*center.y>0,
                      "Text leaked onto cavity, neck or hanger")
            }
        }
        text.text="   "
        let empty=PaintedBalloon.make(raw,parameters:p,settings:text)
        check(!empty.colors.contains(1) && empty.mesh.triangles.count==raw.triangles.count,"Empty text must leave the balloon plain")
        check(PurgeEstimate.calculate(empty,settings:PurgeSettings()).maximumChanges==0,"Empty text must not purge")
        text.text="Hello";text.detail=text.base
        check(!PaintedBalloon.make(raw,parameters:p,settings:text).colors.contains(1),"Matching text colors must use one filament")
        text.detail = .cream;text.text=String(repeating:"Wide message ",count:20)+"\n"
        text.textRepeats=Int.max;text.textHeight = .nan
        let normalized=text.normalized(p)
        check(normalized.text.count==64 && normalized.textRepeats==24 && normalized.textHeight==24,"Invalid text settings not normalized")
        text.text="Hello\nworld\t!"
        check(text.normalized(p).text=="Hello world !","Pasted multiline text must become one line")
        let fitted=BalloonTextLayout(settings:normalized,parameters:p)!
        check(fitted.angularWidth<=fitted.step*0.78+1e-9,"Long text copies overlap")
        let small=BalloonParameters(height:80,diameter:60,panels:8).normalized()
        let dense=PaintedBalloon.make(BalloonGenerator.generate(small),parameters:small,settings:normalized)
        try dense.mesh.validate()
        let restored=try JSONDecoder().decode(PatternSettings.self,from:JSONEncoder().encode(normalized))
        check(restored==normalized,"Text, font or repeat count failed to persist")
        let old=Data(#"{"style":"Hearts","bands":10,"repeats":5,"rows":3,"size":12,"base":"Rose","detail":"Cream"}"#.utf8)
        let legacy=try JSONDecoder().decode(PatternSettings.self,from:old)
        check(legacy.style == .hearts && legacy.repeats==5 && legacy.rows==3 && legacy.base == .rose && legacy.size==12,
              "Text upgrade discarded old pattern settings")
        check(legacy.text=="Hello" && legacy.textRepeats==3 && legacy.textFont == .rounded,"Text defaults failed to migrate")
        print("PASS text fitting, empty input, accents, cavity/attachment exclusion, persistence and legacy migration")
    }
}
