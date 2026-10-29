import Foundation

enum BalloonPattern: String, Codable, CaseIterable, Identifiable, Sendable {
    case none = "Solid", stripes = "Horizontal stripes", hearts = "Hearts", dots = "Polka dots", diamonds = "Diamonds", text = "Text", nightFlight = "Night Flight", summitCableCar = "Summit Cable Car"
    var id: String {rawValue}
    // Panoramic sculpted scenes: raised artwork in the body color and a cap in the second color.
    var hasRelief:Bool {self == .nightFlight || self == .summitCableCar}
}

enum FilamentColor: String, Codable, CaseIterable, Identifiable, Sendable {
    case saffron = "Saffron", cream = "Cream", rose = "Rose", sage = "Sage", blue = "Blue", charcoal = "Charcoal", midnight = "Midnight blue"
    var id:String {rawValue}
    var hex:String {
        switch self {
        case .saffron: return "#DB6E2E"
        case .cream: return "#F5EAD2"
        case .rose: return "#BA4F5C"
        case .sage: return "#31917D"
        case .blue: return "#739BCB"
        case .charcoal: return "#333D49"
        case .midnight: return "#253D60"
        }
    }
}

struct PatternSettings: Codable, Equatable, Sendable {
    var style:BalloonPattern = .none
    var bands:Int = 6
    var repeats:Int = 8
    var rows:Int = 2
    var size:Double = 18
    var base:FilamentColor = .saffron
    var detail:FilamentColor = .cream
    var text:String = "Hello"
    var textFont:BalloonTextFont = .rounded
    var textRepeats:Int = 3
    var textHeight:Double = 24
    var flightCompositionVersion:Int = 3
    var reliefDepth:Double = 2.4
    var capHeight:Double = 18
    var flightBody:FilamentColor = .cream
    var flightCap:FilamentColor = .midnight
    var baseColor:FilamentColor {style.hasRelief ? flightBody:base}
    var detailColor:FilamentColor {style.hasRelief ? flightCap:detail}
    var multicolor:Bool {style != .none && baseColor != detailColor}
    func capBoundary(_ p:BalloonParameters) -> Double {p.height*(1-capHeight/100)}
    func maximumTextHeight(_ p:BalloonParameters) -> Double {min(60,(p.height-p.neckHeight)*0.28)}
    func maximumSize(_ p:BalloonParameters) -> Double {
        min(40, (p.height-p.neckHeight)*0.5/Double(max(1,rows)), Double.pi*p.diameter*0.55/Double(max(1,repeats))*0.75)
    }
    func normalized(_ p:BalloonParameters) -> Self {
        var s=self
        s.bands=min(24,max(2,bands));s.repeats=min(24,max(1,repeats));s.rows=min(6,max(1,rows))
        s.size=min(s.maximumSize(p),max(3,size.isFinite ? size:18))
        s.text=String(text.prefix(64).map {$0.isWhitespace ? Character(" "):$0})
        s.textRepeats=min(24,max(1,textRepeats))
        s.textHeight=min(s.maximumTextHeight(p),max(3,textHeight.isFinite ? textHeight:24))
        s.flightCompositionVersion=3
        s.reliefDepth=min(4,max(1.2,reliefDepth.isFinite ? reliefDepth:2.4))
        s.capHeight=min(28,max(10,capHeight.isFinite ? capHeight:18))
        return s
    }
    func color(at v:Point3, normal:Point3, parameters p:BalloonParameters) -> Int {
        guard multicolor else {return 0}
        // The whole upper cross section, including the cavity and hanger, uses the cap filament.
        if style.hasRelief {return v.z>=capBoundary(p) ? 1:0}
        if style == .stripes {
            return min(bands-1,max(0,Int(floor(v.z/p.height*Double(bands)))))%2
        }
        // Paint only the outside envelope; cavities and attachments remain the base color.
        guard v.z > p.neckHeight, v.z < p.height*0.9, normal.x*v.x+normal.y*v.y > 0 else {return 0}
        let step=2*Double.pi/Double(repeats)
        for row in 0..<rows {
            let center=p.neckHeight+(p.height-p.neckHeight)*(rows == 1 ? 0.55:0.30+0.5*Double(row)/Double(rows-1))
            let y=(v.z-center)/(size/2)
            guard abs(y)<1.3 else {continue}
            let angle=atan2(v.y,v.x)-(row%2 == 0 ? 0:step/2)
            let delta=angle-step*(angle/step).rounded()
            let x=delta*hypot(v.x,v.y)/(size/2)
            guard abs(x)<1.3 else {continue}
            switch style {
            case .dots: if x*x+y*y<=1 {return 1}
            case .diamonds: if abs(x)+abs(y)<=1 {return 1}
            case .hearts:
                let hx=x*1.2,hy=y*1.2+0.1,q=hx*hx+hy*hy-1
                if q*q*q-hx*hx*hy*hy*hy<=0 {return 1}
            default: break
            }
        }
        return 0
    }
}

extension PatternSettings {
    private enum CodingKeys:String,CodingKey {
        case style,bands,repeats,rows,size,base,detail,text,textFont,textRepeats,textHeight
        case flightCompositionVersion,reliefDepth,capHeight,flightBody,flightCap
    }
    // Keep existing designs when opening settings saved before text was available.
    init(from decoder:Decoder) throws {
        self.init()
        let c=try decoder.container(keyedBy:CodingKeys.self)
        style=try c.decodeIfPresent(BalloonPattern.self,forKey:.style) ?? style
        bands=try c.decodeIfPresent(Int.self,forKey:.bands) ?? bands
        repeats=try c.decodeIfPresent(Int.self,forKey:.repeats) ?? repeats
        rows=try c.decodeIfPresent(Int.self,forKey:.rows) ?? rows
        size=try c.decodeIfPresent(Double.self,forKey:.size) ?? size
        base=try c.decodeIfPresent(FilamentColor.self,forKey:.base) ?? base
        detail=try c.decodeIfPresent(FilamentColor.self,forKey:.detail) ?? detail
        text=try c.decodeIfPresent(String.self,forKey:.text) ?? text
        textFont=try c.decodeIfPresent(BalloonTextFont.self,forKey:.textFont) ?? textFont
        textRepeats=try c.decodeIfPresent(Int.self,forKey:.textRepeats) ?? textRepeats
        textHeight=try c.decodeIfPresent(Double.self,forKey:.textHeight) ?? textHeight
        reliefDepth=try c.decodeIfPresent(Double.self,forKey:.reliefDepth) ?? reliefDepth
        if try c.decodeIfPresent(Int.self,forKey:.flightCompositionVersion) == nil {
            reliefDepth=max(2.4,reliefDepth)
        }
        capHeight=try c.decodeIfPresent(Double.self,forKey:.capHeight) ?? capHeight
        flightBody=try c.decodeIfPresent(FilamentColor.self,forKey:.flightBody) ?? flightBody
        flightCap=try c.decodeIfPresent(FilamentColor.self,forKey:.flightCap) ?? flightCap
    }
}

struct PaintedBalloon: Sendable {
    var mesh:BalloonMesh
    var colors:[Int]
    static func make(_ original:BalloonMesh, parameters:BalloonParameters, settings:PatternSettings) -> Self {
        let s=settings.normalized(parameters)
        let lettering=s.multicolor && s.style == .text ? BalloonTextLayout(settings:s,parameters:parameters):nil
        var mesh=original
        if s.style.hasRelief {
            let relief=NightFlightRelief(settings:s,parameters:parameters,mesh:original)
            for _ in 0..<7 {
                if !refine(&mesh,parameters:parameters,settings:s,relief:relief) {break}
            }
            relief.apply(to:&mesh)
            if s.multicolor {split(&mesh,at:s.capBoundary(parameters))}
        }
        // Shared intersections preserve watertight topology and put stripe edges on exact Z planes.
        if s.multicolor && s.style == .stripes {
            for band in 1..<s.bands {split(&mesh,at:parameters.height*Double(band)/Double(s.bands))}
        }
        if s.multicolor && s.style == .text,let lettering {
            // Inspect glyph bounds too: sampling only corners can miss a thin stroke entirely.
            for _ in 0..<7 {
                if !refine(&mesh,parameters:parameters,settings:s,lettering:lettering) {break}
            }
        } else if s.multicolor && s.style != .stripes && s.style != .text && !s.style.hasRelief {
            // Refine only color boundaries, sharing every new edge vertex with adjacent faces.
            for _ in 0..<2 {refine(&mesh,parameters:parameters,settings:s)}
        }
        let colors=mesh.triangles.map {t -> Int in
            let a=mesh.vertices[t.a],b=mesh.vertices[t.b],c=mesh.vertices[t.c]
            let point=(a+b+c)*(1.0/3),normal=(b-a).cross(c-a)
            if s.style == .text {return lettering?.color(at:point,normal:normal) ?? 0}
            return s.color(at:point,normal:normal,parameters:parameters)
        }
        return Self(mesh:mesh,colors:colors)
    }
    @discardableResult
    private static func refine(_ mesh:inout BalloonMesh,parameters:BalloonParameters,settings:PatternSettings,lettering:BalloonTextLayout? = nil,relief:NightFlightRelief? = nil) -> Bool {
        struct Edge:Hashable {
            let a:Int;let b:Int
            init(_ x:Int,_ y:Int) {a=min(x,y);b=max(x,y)}
        }
        var marked=Set<Edge>()
        for t in mesh.triangles {
            let a=mesh.vertices[t.a],b=mesh.vertices[t.b],c=mesh.vertices[t.c],normal=(b-a).cross(c-a)
            if let relief {
                if relief.needsRefinement(a,b,c,normal:normal) {
                    // Wide/short envelopes have long, thin faces. Bisect only oversized
                    // edges instead of repeatedly quartering their already short direction.
                    if relief.edgeNeedsRefinement(a,b) {marked.insert(Edge(t.a,t.b))}
                    if relief.edgeNeedsRefinement(b,c) {marked.insert(Edge(t.b,t.c))}
                    if relief.edgeNeedsRefinement(c,a) {marked.insert(Edge(t.c,t.a))}
                }
                continue
            }
            if let lettering {
                if lettering.needsRefinement(a,b,c,normal:normal) {
                    marked.formUnion([Edge(t.a,t.b),Edge(t.b,t.c),Edge(t.c,t.a)])
                }
                continue
            }
            let samples=[a,b,c,(a+b)*0.5,(b+c)*0.5,(c+a)*0.5,(a+b+c)*(1.0/3)]
            let colors=samples.map {settings.color(at:$0,normal:normal,parameters:parameters)}
            if colors.contains(0) && colors.contains(1) {
                marked.formUnion([Edge(t.a,t.b),Edge(t.b,t.c),Edge(t.c,t.a)])
            }
        }
        guard !marked.isEmpty else {return false}
        var mids:[Edge:Int]=[:]
        // Deterministic insertion is important for identical exports and regression tests.
        for edge in marked.sorted(by:{$0.a == $1.a ? $0.b<$1.b:$0.a<$1.a}) {
            mids[edge]=mesh.vertices.count
            mesh.vertices.append((mesh.vertices[edge.a]+mesh.vertices[edge.b])*0.5)
        }
        var faces:[Triangle]=[]
        func add(_ a:Int,_ b:Int,_ c:Int) {faces.append(Triangle(a:a,b:b,c:c))}
        for t in mesh.triangles {
            let v=[t.a,t.b,t.c],m=(0..<3).map {mids[Edge(v[$0],v[($0+1)%3])]}
            let count=m.compactMap {$0}.count
            if count==0 {faces.append(t)}
            else if count==3 {
                add(v[0],m[0]!,m[2]!);add(m[0]!,v[1],m[1]!);add(m[2]!,m[1]!,v[2]);add(m[0]!,m[1]!,m[2]!)
            } else if count==1 {
                let i=m.firstIndex(where:{$0 != nil})!,a=v[i],b=v[(i+1)%3],c=v[(i+2)%3],ab=m[i]!
                add(a,ab,c);add(ab,b,c)
            } else {
                let i=(0..<3).first {m[$0] != nil && m[($0+2)%3] != nil}!
                let a=v[i],b=v[(i+1)%3],c=v[(i+2)%3],ab=m[i]!,ca=m[(i+2)%3]!
                add(a,ab,ca);add(ab,b,c);add(ab,c,ca)
            }
        }
        mesh.triangles=faces;mesh.innerVertexRange=nil
        return true
    }
    private static func split(_ mesh:inout BalloonMesh,at z:Double) {
        struct Edge:Hashable {let a:Int;let b:Int}
        var intersections:[Edge:Int]=[:],result:[Triangle]=[]
        func intersection(_ a:Int,_ b:Int) -> Int {
            if abs(mesh.vertices[a].z-z)<1e-9 {return a}
            if abs(mesh.vertices[b].z-z)<1e-9 {return b}
            let edge=Edge(a:min(a,b),b:max(a,b))
            if let i=intersections[edge] {return i}
            let v=mesh.vertices[edge.a],w=mesh.vertices[edge.b]
            var p=v+(w-v)*((z-v.z)/(w.z-v.z));p.z=z
            let i=mesh.vertices.count;mesh.vertices.append(p);intersections[edge]=i
            return i
        }
        for t in mesh.triangles {
            let ids=[t.a,t.b,t.c],zs=ids.map {mesh.vertices[$0].z}
            guard zs.min()! < z-1e-9 && zs.max()! > z+1e-9 else {result.append(t);continue}
            for side in [-1.0,1.0] {
                var polygon:[Int]=[]
                for i in 0..<3 {
                    let a=ids[i],b=ids[(i+1)%3]
                    let insideA=(mesh.vertices[a].z-z)*side >= -1e-9
                    let insideB=(mesh.vertices[b].z-z)*side >= -1e-9
                    if insideA {polygon.append(a)}
                    if insideA != insideB {polygon.append(intersection(a,b))}
                }
                var unique:[Int]=[]
                for i in polygon where !unique.contains(i) {unique.append(i)}
                if unique.count>=3 {
                    for i in 1..<(unique.count-1) {result.append(Triangle(a:unique[0],b:unique[i],c:unique[i+1]))}
                }
            }
        }
        mesh.triangles=result;mesh.innerVertexRange=nil
    }
}

struct PurgeSettings: Codable, Equatable, Sendable {
    var layerHeight:Double = 0.2
    var baseToDetail:Double = 400
    var detailToBase:Double = 400
    var multiplier:Double = 1
    var density:Double = 1.24
    func normalized() -> Self {
        var s=self
        func clamp(_ v:Double,_ lo:Double,_ hi:Double,_ fallback:Double)->Double {v.isFinite ? min(hi,max(lo,v)):fallback}
        s.layerHeight=clamp(layerHeight,0.08,0.32,0.2)
        s.baseToDetail=clamp(baseToDetail,0,1500,400);s.detailToBase=clamp(detailToBase,0,1500,400)
        s.multiplier=clamp(multiplier,0,2,1);s.density=clamp(density,0.5,2,1.24)
        return s
    }
}

struct PurgeEstimate: Sendable {
    var mixedLayers:Int
    var minimumChanges:Int
    var maximumChanges:Int
    var minimumGrams:Double
    var maximumGrams:Double
    // Fixed-height cross sections of the actual painted mesh. Count each color only once per layer,
    // regardless of the number of islands. Compare retained-tool and fixed-order scheduling.
    static func calculate(_ painted:PaintedBalloon, settings:PurgeSettings) -> Self {
        let s=settings.normalized(),count=max(1,Int(ceil(painted.mesh.dimensions.z/s.layerHeight)))
        var differences=Array(repeating:Array(repeating:0,count:count+1),count:2)
        for (i,t) in painted.mesh.triangles.enumerated() {
            let zs=[t.a,t.b,t.c].map {painted.mesh.vertices[$0].z}
            let low=zs.min()!,high=zs.max()!
            guard high-low>1e-9 else {continue}
            // Sample at the layer midpoint, including one partial layer at the crown.
            let first=max(0,Int(ceil(low/s.layerHeight-0.5)))
            let last=min(count-1,Int(ceil(high/s.layerHeight-0.5))-1)
            if first<=last {
                differences[painted.colors[i]][first]+=1
                differences[painted.colors[i]][last+1]-=1
            }
        }
        var active=[0,0],masks:[Int]=[]
        for layer in 0..<count {
            active[0]+=differences[0][layer];active[1]+=differences[1][layer]
            masks.append((active[0]>0 ? 1:0)|(active[1]>0 ? 2:0))
        }
        func schedule(retain:Bool,reverse:Bool)->(Int,Double) {
            var previous:Int?,changes=0,volume=0.0
            for mask in masks where mask != 0 {
                var order=mask == 3 ? (reverse ? [1,0]:[0,1]):[mask == 1 ? 0:1]
                if retain,let last=previous,order.contains(last) {order.sort {$0 == last && $1 != last}}
                for color in order {
                    if let last=previous,last != color {
                        changes+=1;volume += last == 0 ? s.baseToDetail:s.detailToBase
                    }
                    previous=color
                }
            }
            return (changes,volume*s.multiplier*s.density/1000)
        }
        let scenarios=[schedule(retain:true,reverse:false),schedule(retain:true,reverse:true),schedule(retain:false,reverse:false),schedule(retain:false,reverse:true)]
        return Self(mixedLayers:masks.filter {$0==3}.count,minimumChanges:scenarios.map {$0.0}.min()!,maximumChanges:scenarios.map {$0.0}.max()!,minimumGrams:scenarios.map {$0.1}.min()!,maximumGrams:scenarios.map {$0.1}.max()!)
    }
}
