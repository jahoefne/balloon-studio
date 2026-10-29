import Foundation

struct BalloonParameters: Codable, Equatable, Sendable {
    var height: Double = 220
    var diameter: Double = 180
    var panels: Int = 20
    var panelDepth: Double = 4
    var neckDiameter: Double = 32
    var neckHeight: Double = 6
    var shoulder: Double = 65
    var hollow: Bool = false
    var wallThickness: Double = 1.2
    var stringHoles: Bool = false
    var cordClearance: Double = 3
    var hangingLoop: Bool = false
    var hangingClearance: Double = 4
    var hangingThickness: Double = 12
    var hangingWall: Double = 6
    var hangingFillet: Double = 4
    var hangingCrownThickness: Double = 5

    static let classic = BalloonParameters()
    static let round = BalloonParameters(height: 190, diameter: 190, panels: 16, panelDepth: 4, neckDiameter: 34, neckHeight: 6, shoulder: 57)
    static let tall = BalloonParameters(height: 245, diameter: 160, panels: 24, panelDepth: 5, neckDiameter: 28, neckHeight: 8, shoulder: 68)

    var maximumNeckDiameter: Double { min(80, diameter * 0.6) }
    var maximumNeckHeight: Double { min(20, height * 0.15) }
    var hasStringHoles:Bool {stringHoles}
    var loopHeight:Double {hangingLoop ? CeilingLoop.height(parameters:self):0}
    var totalHeight:Double {height+loopHeight}
    var maximumHeight:Double {min(250,floor(256-loopHeight))}
    // An extra 0.2 mm protects the perforated neck where a faceted arc spans
    // a diamond opening. Keep the main light-diffusing envelope unchanged.
    var neckWallThickness:Double {hasStringHoles ? max(2,wallThickness)+0.2:wallThickness}
    var minimumNeckDiameter:Double {hasStringHoles ? max(20,4*cordClearance+2*neckWallThickness+1):12}
    var minimumNeckHeight:Double {hasStringHoles ? 12:3}
    var fitsPrinter: Bool { diameter <= 256 && totalHeight <= 256 }
    var fitsWithBrim: Bool { max(diameter, neckDiameter + 16) <= 256 && totalHeight <= 256 }
    var openingDiameter: Double { neckDiameter-2*neckWallThickness }
    var filename: String {
        let suffix=hollow ? "-hollow-\(String(format:"%.1f",locale:Locale(identifier:"en_US_POSIX"),wallThickness))mm" : ""
        return "Balloon-\(Int(diameter))x\(Int(height))mm-\(panels)panels\(suffix)\(hasStringHoles ? "-tethers":"")\(hangingLoop ? "-hanger":"").stl"
    }

    func normalized() -> Self {
        var p = self
        func clamp(_ v: Double, _ range: ClosedRange<Double>, _ fallback: Double) -> Double {
            v.isFinite ? min(range.upperBound, max(range.lowerBound, v)) : fallback
        }
        p.hangingClearance = clamp(hangingClearance, 2...5, 4)
        p.hangingThickness = clamp(hangingThickness, 8...16, 12)
        p.hangingWall = clamp(hangingWall, 4...8, 6)
        p.hangingFillet = clamp(hangingFillet, 2.5...5, 4)
        p.hangingCrownThickness = clamp(hangingCrownThickness, 3.4...8, 5)
        p.height = clamp(height, 80...p.maximumHeight, 220)
        p.diameter = clamp(diameter, 60...240, 180)
        // Groups of four place a panel ridge on each cardinal axis, preserving
        // the exact requested X and Y dimensions without stretching the neck.
        p.panels = Int((Double(min(32, max(8, panels)))/4).rounded())*4
        p.panelDepth = clamp(panelDepth, 0...8, 4)
        p.shoulder = clamp(shoulder, 50...75, 65)
        p.wallThickness = clamp(wallThickness, 0.8...2.4, 1.2)
        p.cordClearance = clamp(cordClearance, 2...5, 3)
        p.neckDiameter = clamp(neckDiameter, p.minimumNeckDiameter...p.maximumNeckDiameter, 32)
        p.neckHeight = clamp(neckHeight, p.minimumNeckHeight...p.maximumNeckHeight, p.minimumNeckHeight)
        return p
    }
}

extension BalloonParameters {
    // Preserve version 1 settings when the new shell fields are absent.
    private enum CodingKeys:String,CodingKey {
        case height,diameter,panels,panelDepth,neckDiameter,neckHeight,shoulder,hollow,wallThickness,stringHoles,cordClearance,hangingLoop,hangingClearance
        case hangingThickness,hangingWall,hangingFillet,hangingCrownThickness
    }
    init(from decoder:Decoder) throws {
        self.init()
        let c=try decoder.container(keyedBy:CodingKeys.self)
        height=try c.decodeIfPresent(Double.self,forKey:.height) ?? height
        diameter=try c.decodeIfPresent(Double.self,forKey:.diameter) ?? diameter
        panels=try c.decodeIfPresent(Int.self,forKey:.panels) ?? panels
        panelDepth=try c.decodeIfPresent(Double.self,forKey:.panelDepth) ?? panelDepth
        neckDiameter=try c.decodeIfPresent(Double.self,forKey:.neckDiameter) ?? neckDiameter
        neckHeight=try c.decodeIfPresent(Double.self,forKey:.neckHeight) ?? neckHeight
        shoulder=try c.decodeIfPresent(Double.self,forKey:.shoulder) ?? shoulder
        hollow=try c.decodeIfPresent(Bool.self,forKey:.hollow) ?? false
        wallThickness=try c.decodeIfPresent(Double.self,forKey:.wallThickness) ?? 1.2
        stringHoles=try c.decodeIfPresent(Bool.self,forKey:.stringHoles) ?? false
        cordClearance=try c.decodeIfPresent(Double.self,forKey:.cordClearance) ?? 3
        hangingLoop=try c.decodeIfPresent(Bool.self,forKey:.hangingLoop) ?? false
        hangingClearance=try c.decodeIfPresent(Double.self,forKey:.hangingClearance) ?? 4
        hangingThickness=try c.decodeIfPresent(Double.self,forKey:.hangingThickness) ?? hangingThickness
        hangingWall=try c.decodeIfPresent(Double.self,forKey:.hangingWall) ?? hangingWall
        hangingFillet=try c.decodeIfPresent(Double.self,forKey:.hangingFillet) ?? hangingFillet
        hangingCrownThickness=try c.decodeIfPresent(Double.self,forKey:.hangingCrownThickness) ?? hangingCrownThickness
    }
}

struct Point3: Sendable {
    var x: Double
    var y: Double
    var z: Double
    static let zero = Point3(x: 0, y: 0, z: 0)
    static func - (a: Self, b: Self) -> Self { Self(x: a.x-b.x, y: a.y-b.y, z: a.z-b.z) }
    static func + (a: Self, b: Self) -> Self { Self(x: a.x+b.x, y: a.y+b.y, z: a.z+b.z) }
    static func * (a:Self,b:Double) -> Self {Self(x:a.x*b,y:a.y*b,z:a.z*b)}
    func cross(_ b: Self) -> Self { Self(x: y*b.z-z*b.y, y: z*b.x-x*b.z, z: x*b.y-y*b.x) }
    func dot(_ b: Self) -> Double { x*b.x+y*b.y+z*b.z }
    var length: Double { sqrt(dot(self)) }
    var unit: Self { let d = max(length, 1e-30); return Self(x: x/d, y: y/d, z: z/d) }
}

struct Triangle: Sendable {
    var a: Int
    var b: Int
    var c: Int
}

enum MeshError: LocalizedError {
    case invalid(String)
    var errorDescription: String? {
        switch self { case .invalid(let reason): return "The model could not be exported: \(reason)" }
    }
}

struct BalloonMesh: Sendable {
    var vertices: [Point3]
    var triangles: [Triangle]
    var maxOverhang: Double
    // Contiguous inner-envelope vertices, retained for wall-clearance verification.
    var innerVertexRange: Range<Int>? = nil

    var dimensions: Point3 {
        let first = vertices.first ?? .zero
        var lo = first, hi = first
        for p in vertices {
            lo.x = min(lo.x,p.x); lo.y = min(lo.y,p.y); lo.z = min(lo.z,p.z)
            hi.x = max(hi.x,p.x); hi.y = max(hi.y,p.y); hi.z = max(hi.z,p.z)
        }
        return hi-lo
    }

    // Independent topological checks protect every exported mesh.
    func validate() throws {
        struct Edge: Hashable { let lo: Int; let hi: Int }
        struct Uses { var count = 0; var direction = 0 }
        guard vertices.count > 3, !triangles.isEmpty else { throw MeshError.invalid("empty geometry") }
        guard vertices.allSatisfy({ $0.x.isFinite && $0.y.isFinite && $0.z.isFinite }) else {
            throw MeshError.invalid("non-finite coordinates")
        }
        var edges: [Edge: Uses] = [:]
        edges.reserveCapacity(triangles.count * 3 / 2)
        var volume = 0.0
        var parents=Array(vertices.indices)
        func root(_ value:Int) -> Int {
            var i=value
            while parents[i] != i {parents[i]=parents[parents[i]];i=parents[i]}
            return i
        }
        for t in triangles {
            guard [t.a,t.b,t.c].allSatisfy({ vertices.indices.contains($0) }) else {
                throw MeshError.invalid("invalid face indices")
            }
            let a=vertices[t.a], b=vertices[t.b], c=vertices[t.c]
            let ra=root(t.a),rb=root(t.b),rc=root(t.c)
            parents[rb]=ra;parents[rc]=ra
            guard (b-a).cross(c-a).length > 1e-9 else { throw MeshError.invalid("collapsed face") }
            volume += a.dot(b.cross(c))/6
            for (i,j) in [(t.a,t.b),(t.b,t.c),(t.c,t.a)] {
                let edge = Edge(lo: min(i,j), hi: max(i,j))
                var uses = edges[edge] ?? Uses()
                uses.count += 1
                uses.direction += i < j ? 1 : -1
                edges[edge] = uses
            }
        }
        guard edges.values.allSatisfy({ $0.count == 2 && $0.direction == 0 }) else {
            throw MeshError.invalid("the surface is not consistently closed")
        }
        let euler=vertices.count-edges.count+triangles.count
        let component=root(0)
        guard vertices.indices.allSatisfy({root($0)==component}), euler<=2, (2-euler)%2==0, volume > 0 else {
            throw MeshError.invalid("unexpected topology or orientation")
        }
    }

    func binarySTL() throws -> Data {
        try validate()
        var data=Data(count: 80)
        let header=Data("Balloon Studio | millimetres | watertight material | Z up".utf8)
        data.replaceSubrange(0..<header.count, with: header)
        func append32(_ value: UInt32) {
            var le=value.littleEndian
            withUnsafeBytes(of: &le) { data.append(contentsOf: $0) }
        }
        append32(UInt32(triangles.count))
        data.reserveCapacity(84+triangles.count*50)
        for t in triangles {
            let a=vertices[t.a], b=vertices[t.b], c=vertices[t.c]
            let n=(b-a).cross(c-a).unit
            for p in [n,a,b,c] {
                append32(Float(p.x).bitPattern)
                append32(Float(p.y).bitPattern)
                append32(Float(p.z).bitPattern)
            }
            data.append(contentsOf: [0,0])
        }
        return data
    }
}

enum BalloonGenerator {
    enum Quality: Sendable { case preview, export }

    static func generate(_ input: BalloonParameters, quality: Quality = .preview) -> BalloonMesh {
        let p=input.normalized()
        let radius=p.diameter/2, neck=p.neckDiameter/2
        let shoulderZ=p.height*p.shoulder/100
        let samples=quality == .export ? 20:12
        let baseAngular=p.panels*samples
        let allowance=0.04+radius*p.panelDepth/100*(1-cos(Double.pi/Double(samples)))
        let layout=p.hasStringHoles ? StringHoles.layout(samples:baseAngular,clearance:p.cordClearance) {_ in p.hollow ? neck-p.neckWallThickness-allowance:neck} : nil
        let angles=layout?.angles ?? (0..<baseAngular).map {2*Double.pi*Double($0)/Double(baseAngular)}
        let angular=angles.count
        let lowerSteps=quality == .export ? 160 : 80
        let upperSteps=quality == .export ? 140 : 70
        var profile: [(r: Double,z: Double)] = [(neck,0),(neck,p.neckHeight/2),(neck,p.neckHeight)]
        if p.hasStringHoles {
            let mid=p.neckHeight/2,half=p.cordClearance/sqrt(2)
            profile=[(neck,0),(neck,mid-half),(neck,mid),(neck,mid+half),(neck,p.neckHeight)]
        }
        func bezier(_ a: (Double,Double),_ b: (Double,Double),_ c: (Double,Double),_ d: (Double,Double),_ t: Double) -> (Double,Double) {
            let s=1-t
            return (s*s*s*a.0+3*s*s*t*b.0+3*s*t*t*c.0+t*t*t*d.0,
                    s*s*s*a.1+3*s*s*t*b.1+3*s*t*t*c.1+t*t*t*d.1)
        }
        // The same two lower Bezier curves used by the original Blender model.
        for i in 1...lowerSteps {
            let t=Double(i)/Double(lowerSteps)
            let (r,z): (Double,Double)
            if t <= 0.25 {
                (r,z)=bezier((16,6),(16,17),(26,28),(33,38),t*4)
            } else {
                (r,z)=bezier((33,38),(56,71),(90,94),(90,142),(t-0.25)/0.75)
            }
            profile.append((neck+(r-16)/74*(radius-neck), p.neckHeight+(z-6)/136*(shoulderZ-p.neckHeight)))
        }
        for i in 1..<upperSteps {
            let (r,z)=bezier((radius,shoulderZ),(radius,shoulderZ+(p.height-shoulderZ)*42/78),
                             (radius*48/90,p.height),(0,p.height),Double(i)/Double(upperSteps))
            profile.append((r,z))
        }
        func smooth(_ t: Double) -> Double { let s=min(1,max(0,t)); return s*s*(3-2*s) }
        var vertices: [Point3]=[]
        vertices.reserveCapacity(profile.count*angular+2)
        var maxSlope=0.0
        for (i,ring) in profile.enumerated() {
            // Measure the meridian profile, independent of the angular resampling
            // used to join the perforated neck to the fluted envelope.
            if i>0 {maxSlope=max(maxSlope,(ring.r-profile[i-1].r)/(ring.z-profile[i-1].z))}
            let fade=smooth((ring.z-p.neckHeight)/((shoulderZ-p.neckHeight)*32/136))
            let crown=smooth(ring.r/(radius*22/90))
            for j in 0..<angular {
                let blend=p.hasStringHoles ? smooth((ring.z-p.neckHeight)/max(12,p.height*0.1)):0
                let angle=angles[j]*(1-blend)+(2*Double.pi*Double(j)/Double(angular))*blend
                let r=ring.r*(1-p.panelDepth/200*fade*crown*(1-cos(Double(p.panels)*angle)))
                let v=Point3(x:r*cos(angle),y:r*sin(angle),z:ring.z)
                vertices.append(v)
            }
        }
        var triangles: [Triangle]=[]
        triangles.reserveCapacity(profile.count*angular*2)
        for i in 0..<(profile.count-1) {
            for j in 0..<angular {
                let k=(j+1)%angular
                let a=i*angular+j,b=i*angular+k,c=(i+1)*angular+k,d=(i+1)*angular+j
                triangles.append(Triangle(a:a,b:b,c:c))
                triangles.append(Triangle(a:a,b:c,c:d))
            }
        }
        let top=vertices.count
        vertices.append(Point3(x:0,y:0,z:p.height))
        let last=(profile.count-1)*angular
        for j in 0..<angular {
            let k=(j+1)%angular
            triangles.append(Triangle(a:last+j,b:last+k,c:top))
        }
        var holePairs:[(StringHoles.Patch,StringHoles.Patch)]=[]
        var innerRange:Range<Int>?
        if !p.hollow {
            let bottom=vertices.count
            vertices.append(.zero)
            for j in 0..<angular {
                triangles.append(Triangle(a:bottom,b:(j+1)%angular,c:j))
            }
        } else {
            let surface=SurfaceQuery(vertices:vertices,triangles:triangles)
            let insideStart=vertices.count
            // Extra clearance covers chord error when triangulating the offset.
            // A distance-based inset also rounds tight internal grooves safely.
            let inset=p.wallThickness+allowance
            let crownInset=p.hangingLoop ? max(p.hangingCrownThickness,inset):inset
            let insideHeight=p.height-crownInset
            // Blend the reinforced crown across the whole attachment pad.
            let reinforcementDepth=p.hangingLoop ? max(24,2*CeilingLoop.padRadius(parameters:p)):24
            var outerRow=0
            for ring in profile {
                if Task.isCancelled {
                    // Cancelled previews are discarded by the caller.
                    return BalloonMesh(vertices:[],triangles:[],maxOverhang:0)
                }
                let z=p.hasStringHoles
                    ? (ring.z<=p.neckHeight ? ring.z : p.neckHeight+(ring.z-p.neckHeight)*(insideHeight-p.neckHeight)/(p.height-p.neckHeight))
                    : ring.z*insideHeight/p.height
                let crownReinforcement=(crownInset-inset)*smooth((z-(p.height-reinforcementDepth))/(reinforcementDepth-crownInset))
                let localInset=inset+(p.neckWallThickness-p.wallThickness)*(1-smooth((z-p.neckHeight)/10))+crownReinforcement
                while outerRow+1<profile.count-1 && profile[outerRow+1].z<z {outerRow += 1}
                let fraction=(z-profile[outerRow].z)/(profile[outerRow+1].z-profile[outerRow].z)
                for j in 0..<angular {
                    let a=vertices[outerRow*angular+j],b=vertices[(outerRow+1)*angular+j]
                    let boundary=a+(b-a)*fraction
                    let outerRadius=hypot(boundary.x,boundary.y)
                    let direction=Point3(x:boundary.x/outerRadius,y:boundary.y/outerRadius,z:0)
                    var lo=0.0,hi=outerRadius
                    if z<=p.neckHeight*0.45 {
                        lo=neck-p.neckWallThickness
                    } else {
                        for _ in 0..<15 {
                            let middle=(lo+hi)/2
                            let point=Point3(x:direction.x*middle,y:direction.y*middle,z:z)
                            if surface.isCloser(than:localInset,to:point) {hi=middle} else {lo=middle}
                        }
                    }
                    vertices.append(Point3(x:direction.x*lo,y:direction.y*lo,z:z))
                }
            }
            let insideTop=vertices.count
            vertices.append(Point3(x:0,y:0,z:insideHeight))
            for i in 0..<(profile.count-1) {
                for j in 0..<angular {
                    let k=(j+1)%angular
                    let a=insideStart+i*angular+j,b=insideStart+i*angular+k
                    let c=insideStart+(i+1)*angular+k,d=insideStart+(i+1)*angular+j
                    triangles.append(Triangle(a:a,b:c,c:b))
                    triangles.append(Triangle(a:a,b:d,c:c))
                }
            }
            for j in 0..<angular {
                let k=(j+1)%angular
                // Inside crown points toward the empty cavity.
                triangles.append(Triangle(a:insideStart+last+j,b:insideTop,c:insideStart+last+k))
                // Annular base joins the two surfaces, leaving the LED opening clear.
                triangles.append(Triangle(a:j,b:insideStart+j,c:insideStart+k))
                triangles.append(Triangle(a:j,b:insideStart+k,c:k))
            }
            innerRange=insideStart..<vertices.count
            if let layout {
                holePairs=layout.centers.map {column in
                    (StringHoles.patch(row:2,column:column,columns:angular,index:{$0*angular+$1}),
                     StringHoles.patch(row:2,column:column,columns:angular,index:{insideStart+$0*angular+$1}))
                }
            }
        }
        var mesh=BalloonMesh(vertices:vertices,triangles:triangles,maxOverhang:atan(maxSlope)*180/Double.pi,innerVertexRange:innerRange)
        if p.hangingLoop {
            // Replace the outer crown only; the reinforced inner crown stays closed.
            let radiusNeeded=CeilingLoop.padRadius(parameters:p)
            let row=profile.lastIndex { $0.r>=radiusNeeded }!
            CeilingLoop.attach(to:&mesh,ringStart:row*angular,columns:angular,outerTop:top,parameters:p)
        }
        if !p.hollow,let layout {
            let patches=layout.centers.map {column in
                StringHoles.patch(row:2,column:column,columns:angular,index:{$0*angular+$1})
            }
            StringHoles.crossBores(&mesh,patches:patches,clearance:p.cordClearance,centerZ:p.neckHeight/2)
        } else if !holePairs.isEmpty {StringHoles.punch(&mesh,pairs:holePairs)}
        else if p.hangingLoop {StringHoles.compact(&mesh)}
        return mesh
    }
}
