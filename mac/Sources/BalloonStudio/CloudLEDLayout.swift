import Foundation

/// A mounting plan on the existing floor, independent of the mesher's small
/// rectangular core. Hardware sizes, row spacing and cut pitch stay in mm.
struct CloudLEDPlan: Sendable {
    struct Section: Sendable {
        let x: Double, y: Double, length: Double
        func footprint(width:Double) -> CloudGenerator.Rect {
            .init(x0:x-length/2,x1:x+length/2,y0:y-width/2,y1:y+width/2)
        }
    }
    let parameters: CloudParameters
    let sections: [Section]
    var totalLength: Double { sections.reduce(0) {$0+$1.length} }
    var nominalWatts: Double { totalLength * 0.009 }
    var rowCount: Int { Set(sections.map(\.y)).count }

    init(_ input:CloudParameters) {
        let p=input.normalized(), l=CloudGenerator.Layout(p:p)
        parameters=p
        let halfBand=p.stripWidth/2+0.5, endSpace=3.0
        let keepOuts=[l.nailBoss.expanded(0.5)]+p.cableConfigurations.map {
            (CableClamp($0)?.keepOut ?? CableOutlet($0).keepOut).expanded(0.5)
        }
        // 2 mm beyond the thickest skirt contour also covers polygon chord error.
        let inset=CloudParameters.wall+p.clipFit+LampClipGeometry.rootThickness+2
        let low = p.profile.lowY*p.layoutHeightBasis+inset*p.verticalScale+halfBand
        let high = p.profile.highY*p.layoutHeightBasis-inset*p.verticalScale-halfBand
        let first=Int(ceil((low-p.ledCenterY)/p.ledRowSpacing))
        let last=Int(floor((high-p.ledCenterY)/p.ledRowSpacing))
        var result:[Section]=[]
        if first<=last { for row in stride(from:last,through:first,by:-1) {
            let y=p.ledCenterY+Double(row)*p.ledRowSpacing
            var spans:[(Double,Double)]=[(-p.width/2,p.width/2)]
            // Intersect the cloud across the entire strip band. This handles
            // concave scallops and disconnected intervals in the top lobes.
            let steps=Int(ceil(2*halfBand/0.25))
            for i in 0...steps {
                let yy=y-halfBand+2*halfBand*Double(i)/Double(steps)
                let outline=CloudGenerator.horizontalIntervals(yy/p.verticalScale,inset:inset,width:p.width,profile:p.profile)
                spans=spans.flatMap { a in outline.compactMap { b -> (Double,Double)? in
                    let lo=max(a.0,b.0),hi=min(a.1,b.1)
                    return hi>lo ? (lo,hi):nil
                } }
            }
            // No LEDs or solder pads on the blind nail cap, nor in the way of
            // the cable seal and its strain relief.
            for boss in keepOuts
                where y+halfBand>boss.y0 && y-halfBand<boss.y1 {
                spans=spans.flatMap { span -> [(Double,Double)] in
                    if span.1<=boss.x0 || span.0>=boss.x1 {return [span]}
                    var pieces:[(Double,Double)]=[]
                    if span.0<boss.x0 {pieces.append((span.0,boss.x0))}
                    if span.1>boss.x1 {pieces.append((boss.x1,span.1))}
                    return pieces
                }
            }
            for (lo,hi) in spans {
                let units=floor((hi-lo-2*endSpace)/p.stripCutLength)
                if units>=1 {
                    result.append(Section(x:(lo+hi)/2,y:y,length:units*p.stripCutLength))
                }
            }
        } }
        sections=result
    }

    private func mm(_ x:Double) -> String { String(format:"%.2f",locale:Locale(identifier:"en_US_POSIX"),x) }
    var cutList: String {
        guard !sections.isEmpty else {
            return "No complete strip sections fit these settings. Reduce the cut interval only if your strip allows it, or enlarge the \(parameters.kind.rawValue)."
        }
        return "Cut list (numbers match LED-LAYOUT.svg):\n" + sections.enumerated().map {
            "\($0.offset+1). \(mm($0.element.length)) mm"
        }.joined(separator:"\n")
    }

    /// Physical units and a scale bar make this usable as a paper placement guide.
    /// Y is flipped for the same cavity view as the app, with cloud lobes upward.
    var svg: String {
        let p=parameters, l=CloudGenerator.Layout(p:p)
        let w=p.width+20,h=p.height+47,tx=w/2,ty=p.profile.highY*p.layoutHeightBasis+10
        let outline=(0...720).map { i -> String in
            let a=Double(i)*2*Double.pi/720,r=CloudGenerator.radius(a,inset:0,width:p.width,verticalScale:p.verticalScale,profile:p.profile)
            return "\(i==0 ? "M":"L")\(mm(tx+r*cos(a))),\(mm(ty-r*sin(a)))"
        }.joined(separator:" ")+" Z"
        func rectangle(_ r:CloudGenerator.Rect,fill:String) -> String {
            "<rect x=\"\(mm(tx+r.x0))\" y=\"\(mm(ty-r.y1))\" width=\"\(mm(r.x1-r.x0))\" height=\"\(mm(r.y1-r.y0))\" fill=\"\(fill)\" stroke=\"#333\" stroke-width=\"0.25\"/>"
        }
        let clamps=p.cableConfigurations.compactMap { CableClamp($0) }
        let fittings=p.cableConfigurations.map { CableOutlet($0).pocketOutline }+clamps.flatMap(\.outlines)
        let hardware=rectangle(l.nailBoss,fill:"#ddd")+fittings.map { outline in
            let points=outline.map { "\(mm(tx+$0.0)),\(mm(ty-$0.1))" }.joined(separator:" ")
            return "\n<polygon points=\"\(points)\" fill=\"#ddd\" stroke=\"#333\" stroke-width=\"0.25\"/>"
        }.joined()
        let leds=sections.enumerated().map { i,s in
            rectangle(s.footprint(width:p.stripWidth),fill:"#d7ebdc") +
            "<text x=\"\(mm(tx+s.x))\" y=\"\(mm(ty-s.y+1))\" text-anchor=\"middle\" font-size=\"3.2\">\(i+1)</text>"
        }.joined(separator:"\n")
        return """
        <svg xmlns="http://www.w3.org/2000/svg" width="\(mm(w))mm" height="\(mm(h))mm" viewBox="0 0 \(mm(w)) \(mm(h))">
          <title>\(p.displayName) \(p.kind.rawValue) LED placement plan — cavity view</title>
          <desc>Straight LED sections on the flat floor. Grey areas are the nail pocket and cable seals\(clamps.isEmpty ? "":" with strain relief"). Cable exits: \(p.cableSides.map(\.title).joined(separator:", ")). Lengths are in ASSEMBLY.md. This is a placement plan, not an optical simulation.</desc>
          <rect width="100%" height="100%" fill="white"/>
          <g font-family="sans-serif" fill="#222">
            <path d="\(outline)" fill="#fafafa" stroke="#333" stroke-width="0.4"/>
            \(hardware)
            \(leds)
            <text x="10" y="\(mm(p.height+19))" font-size="3">LED side up · grey: nail pocket, cable seals\(clamps.isEmpty ? "":", strain relief")</text>
            <text x="10" y="\(mm(p.height+25))" font-size="3">Lengths: ASSEMBLY.md · print at 100%</text>
            <path d="M10 \(mm(p.height+35)) h50 m-50 -2 v4 m50 -4 v4" fill="none" stroke="#222" stroke-width="0.35"/>
            <text x="35" y="\(mm(p.height+42))" text-anchor="middle" font-size="3">50 mm</text>
          </g>
        </svg>
        """
    }
}
