import Foundation
import CryptoKit

enum STLImportError: LocalizedError {
    case invalid(String)
    var errorDescription: String? {
        switch self {case .invalid(let message): return message}
    }
}

struct ImportedBalloon: Sendable {
    let mesh: BalloonMesh
    let parameters: BalloonParameters
    let restoredSettings: Bool
    let notes: String
}

/// Standard STL geometry, with optional settings stored in its 80-byte binary header.
/// A digest binds the settings to the geometry so edits in other software invalidate them.
enum BalloonSTL {
    static let maximumBytes = 150_000_000
    static let maximumTriangles = 2_000_000
    private static let legacySignature = Data("BSTL0001".utf8)
    private static let signature = Data("BSTL0002".utf8)

    static func export(_ mesh: BalloonMesh, parameters: BalloonParameters) throws -> Data {
        var data = try mesh.binarySTL()
        let p = parameters.normalized()
        var header = signature
        header.append((p.hollow ? 1 : 0) | (p.stringHoles ? 2 : 0) | (p.hangingLoop ? 4 : 0))
        header.append(UInt8(p.panels))
        for value in [p.height,p.diameter,p.panelDepth,p.neckDiameter,p.neckHeight,p.shoulder,p.wallThickness,p.cordClearance,p.hangingClearance,
                      p.hangingThickness,p.hangingWall,p.hangingFillet,p.hangingCrownThickness] {
            var bits = Float(value).bitPattern.littleEndian
            withUnsafeBytes(of:&bits) {header.append(contentsOf:$0)}
        }
        var hash = SHA256()
        hash.update(data:header)
        hash.update(data:data[80...])
        // Version 2 retains a 128-bit integrity digest to fit the additional
        // hanger settings inside the standard 80-byte binary STL header.
        header.append(contentsOf:hash.finalize().prefix(16))
        header.append(contentsOf:[0,0])
        data.replaceSubrange(0..<80,with:header)
        return data
    }

    static func open(_ url: URL) throws -> ImportedBalloon {
        let size = try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0
        guard size <= maximumBytes else {throw STLImportError.invalid("This STL is too large. Open a file smaller than 150 MB with at most 2 million triangles.")}
        return try read(Data(contentsOf:url,options:.mappedIfSafe))
    }

    static func read(_ data: Data) throws -> ImportedBalloon {
        let mesh = try parse(data)
        if let parameters = settings(data) {
            return ImportedBalloon(mesh:centered(mesh),parameters:parameters,restoredSettings:true,
                notes:"Balloon Studio settings were recovered from this file. Walls, attachments, and shape settings are ready to edit. STL does not store filament colors or patterns.")
        }
        return try reconstruct(mesh)
    }

    private static func uint32(_ data:Data,_ offset:Int) -> UInt32 {
        UInt32(data[offset]) | UInt32(data[offset+1]) << 8 | UInt32(data[offset+2]) << 16 | UInt32(data[offset+3]) << 24
    }
    private static func settings(_ data:Data) -> BalloonParameters? {
        guard data.count >= 84 else {return nil}
        let legacy=data.prefix(8) == legacySignature
        guard legacy || data.prefix(8) == signature else {return nil}
        let settingsEnd=legacy ? 46:62,digestLength=legacy ? 32:16
        var hash = SHA256()
        hash.update(data:data[0..<settingsEnd]);hash.update(data:data[80...])
        guard Data(hash.finalize().prefix(digestLength)) == data[settingsEnd..<78], data[8] <= 7 else {return nil}
        let values = (0..<(legacy ? 9:13)).map {Double(Float(bitPattern:uint32(data,10+$0*4)))}
        guard values.allSatisfy(\.isFinite) else {return nil}
        var p = BalloonParameters(height:values[0],diameter:values[1],panels:Int(data[9]),panelDepth:values[2],
            neckDiameter:values[3],neckHeight:values[4],shoulder:values[5],hollow:data[8]&1 != 0,
            wallThickness:values[6],stringHoles:data[8]&2 != 0,cordClearance:values[7],
            hangingLoop:data[8]&4 != 0,hangingClearance:values[8])
        if !legacy {
            p.hangingThickness=values[9];p.hangingWall=values[10]
            p.hangingFillet=values[11];p.hangingCrownThickness=values[12]
        }
        return p.normalized()
    }

    static func parse(_ data:Data) throws -> BalloonMesh {
        guard !data.isEmpty, data.count <= maximumBytes else {throw STLImportError.invalid("The STL is empty or exceeds the 150 MB limit.")}
        struct Key:Hashable {let x:Double;let y:Double;let z:Double}
        var vertices:[Point3] = [], triangles:[Triangle] = [], lookup:[Key:Int] = [:]
        func add(_ points:[Point3]) throws {
            guard triangles.count < maximumTriangles else {throw STLImportError.invalid("The STL exceeds the limit of 2 million triangles.")}
            guard points.allSatisfy({$0.x.isFinite && $0.y.isFinite && $0.z.isFinite && max(abs($0.x),abs($0.y),abs($0.z)) < 1e7}),
                  (points[1]-points[0]).cross(points[2]-points[0]).length > 1e-9 else {
                throw STLImportError.invalid("The STL contains invalid coordinates or collapsed triangles.")
            }
            let ids = points.map {p -> Int in
                let key = Key(x:p.x,y:p.y,z:p.z)
                if let id = lookup[key] {return id}
                let id = vertices.count;lookup[key] = id;vertices.append(p);return id
            }
            triangles.append(Triangle(a:ids[0],b:ids[1],c:ids[2]))
        }
        // A binary STL may also start with "solid". Its exact length is authoritative.
        let count = data.count >= 84 ? Int(uint32(data,80)) : 0
        if data.count >= 84, count <= maximumTriangles, data.count == 84+count*50 {
            for i in 0..<count {
                let start = 84+i*50+12
                let points = (0..<3).map {j -> Point3 in
                    let offset = start+j*12
                    return Point3(x:Double(Float(bitPattern:uint32(data,offset))),
                        y:Double(Float(bitPattern:uint32(data,offset+4))),z:Double(Float(bitPattern:uint32(data,offset+8))))
                }
                try add(points)
            }
        } else {
            guard let source = String(data:data,encoding:.utf8) else {throw STLImportError.invalid("The binary STL is truncated or has an invalid triangle count.")}
            var state = 0, points:[Point3] = [], solids = 0
            for line in source.split(whereSeparator:{$0.isNewline}) {
                let words = line.split(whereSeparator:{$0.isWhitespace})
                guard let first = words.first else {continue}
                switch (state,first.lowercased()) {
                case (0,"solid"): solids += 1;state = 1
                case (1,"facet"):
                    guard words.count == 5, words[1].lowercased() == "normal",
                          words.dropFirst(2).allSatisfy({Double($0)?.isFinite == true}) else {throw malformedASCII()}
                    points = [];state = 2
                case (2,"outer"):
                    guard words.count == 2, words[1].lowercased() == "loop" else {throw malformedASCII()};state = 3
                case (3,"vertex"):
                    guard words.count == 4, let x = Double(words[1]),let y = Double(words[2]),let z = Double(words[3]) else {throw malformedASCII()}
                    points.append(Point3(x:x,y:y,z:z));if points.count == 3 {state = 4}
                case (4,"endloop"): state = 5
                case (5,"endfacet"): try add(points);state = 1
                case (1,"endsolid"): state = 0
                default: throw malformedASCII()
                }
            }
            guard state == 0, solids > 0 else {throw malformedASCII()}
        }
        guard !triangles.isEmpty else {throw STLImportError.invalid("The STL has no triangles.")}
        return BalloonMesh(vertices:vertices,triangles:triangles,maxOverhang:0)
    }
    private static func malformedASCII() -> STLImportError {
        .invalid("The file is not a complete ASCII or binary STL. Try exporting it as STL again.")
    }
    static func centered(_ mesh:BalloonMesh) -> BalloonMesh {
        var lo = mesh.vertices[0], hi = lo
        for p in mesh.vertices {
            lo.x = min(lo.x,p.x);lo.y = min(lo.y,p.y);lo.z = min(lo.z,p.z)
            hi.x = max(hi.x,p.x);hi.y = max(hi.y,p.y)
        }
        let offset = Point3(x:(lo.x+hi.x)/2,y:(lo.y+hi.y)/2,z:lo.z)
        var result = mesh;result.vertices = mesh.vertices.map {$0-offset};return result
    }

    private static func reconstruct(_ source:BalloonMesh) throws -> ImportedBalloon {
        let mesh = centered(source), dims = mesh.dimensions
        func unsupported() -> STLImportError {
            .invalid("This STL could not be reconstructed as an editable balloon. Use an upright balloon envelope in millimetres (60–240 mm wide, 80–256 mm tall). Arbitrary meshes, baskets, and rotated models cannot be converted to balloon settings.")
        }
        guard dims.z >= 79.9, dims.z <= 256.1, dims.x >= 59.9, dims.x <= 240.1,
              abs(dims.x-dims.y) < max(0.2,dims.x*0.01) else {throw unsupported()}
        // The existing generator and the original Blender model use horizontal rings.
        // Keep the outermost radius at each height, ignoring cavity vertices.
        var outerIDs = Set<Int>()
        for t in mesh.triangles {
            let a = mesh.vertices[t.a],b = mesh.vertices[t.b],c = mesh.vertices[t.c]
            let normal = (b-a).cross(c-a),center = (a+b+c)*(1.0/3)
            if normal.x*center.x+normal.y*center.y > 1e-8 {outerIDs.formUnion([t.a,t.b,t.c])}
        }
        var rings:[Int:[Point3]] = [:]
        for id in outerIDs {
            let p = mesh.vertices[id]
            rings[Int((p.z*1000).rounded()),default:[]].append(p)
        }
        let profile = rings.sorted {$0.key < $1.key}.map {entry in
            (z:Double(entry.key)/1000,r:entry.value.map {hypot($0.x,$0.y)}.max() ?? 0,points:entry.value)
        }
        guard profile.count >= 20, let widest = profile.max(by:{$0.r < $1.r}),
              widest.z/dims.z > 0.45, widest.z/dims.z < 0.78,
              let base = profile.first, base.r >= 5.9, base.r < widest.r*0.61 else {throw unsupported()}
        let neckRows = profile.prefix(while:{$0.r <= base.r+0.025 && $0.z < dims.z*0.16})
        let neckHeight = neckRows.last?.z ?? 0
        guard neckHeight >= 2.9, neckHeight <= 20.1 else {throw unsupported()}
        // Fit the upper Bezier crown, excluding the small crown patch used by a hanger.
        let upper = profile.filter {$0.z > widest.z && $0.r > widest.r*0.22 && $0.r < widest.r*0.95}
        guard upper.count >= 8 else {throw unsupported()}
        func upperT(_ ratio:Double) -> Double {
            var lo = 0.0,hi = 1.0
            for _ in 0..<25 {
                let t = (lo+hi)/2,s = 1-t
                let radius = s*s*s+3*s*s*t+3*s*t*t*48/90
                if radius > ratio {lo = t} else {hi = t}
            }
            return (lo+hi)/2
        }
        let heights = upper.map {row -> Double in
            let t = upperT(row.r/widest.r),s = 1-t
            let fraction = 3*s*s*t*42/78+3*s*t*t+t*t*t
            return widest.z+(row.z-widest.z)/fraction
        }.sorted()
        let height = heights[heights.count/2]
        guard height >= 79.9, height <= 250.1,
              heights.allSatisfy({abs($0-height) < 1.5}) else {throw unsupported()}
        let shoulder = widest.z/height*100
        guard shoulder >= 49.9, shoulder <= 75.1 else {throw unsupported()}
        let outer = widest.points.filter {hypot($0.x,$0.y) >= widest.r*0.915}
            .sorted {atan2($0.y,$0.x) < atan2($1.y,$1.x)}
        let minRadius = outer.map {hypot($0.x,$0.y)}.min() ?? widest.r
        // Count periodic radial peaks using a Fourier fit; cavity rings don't share this Z.
        let candidates = stride(from:8,through:32,by:4).map {panels -> (Int,Double) in
            let mean = outer.reduce(0.0) {$0+hypot($1.x,$1.y)}/Double(outer.count)
            var c = 0.0,s = 0.0
            for point in outer {
                let angle = atan2(point.y,point.x)*Double(panels),r = hypot(point.x,point.y)-mean
                c += r*cos(angle);s += r*sin(angle)
            }
            return (panels,hypot(c,s))
        }
        let depth = (1-minRadius/widest.r)*100
        let panels = depth < 0.1 ? 20 : (candidates.max {$0.1 < $1.1}?.0 ?? 20)
        let baseRadii = mesh.vertices.filter {$0.z < 0.001}.map {hypot($0.x,$0.y)}
        let inside = baseRadii.min() ?? 0
        // A filled cap may be triangulated without a center vertex; test its actual faces.
        let filled = mesh.triangles.contains {t in
            let a = mesh.vertices[t.a],b = mesh.vertices[t.b],c = mesh.vertices[t.c]
            guard max(a.z,b.z,c.z) < 0.001 else {return false}
            func edge(_ p:Point3,_ q:Point3) -> Double {p.x*q.y-p.y*q.x}
            let signs = [edge(a,b),edge(b,c),edge(c,a)]
            return signs.allSatisfy {$0 >= -1e-8} || signs.allSatisfy {$0 <= 1e-8}
        }
        let p = BalloonParameters(height:height,diameter:widest.r*2,panels:panels,panelDepth:depth,
            neckDiameter:base.r*2,neckHeight:neckHeight,shoulder:shoulder,hollow:!filled,
            wallThickness:!filled ? min(2.4,max(0.8,base.r-inside)):1.2).normalized()
        return ImportedBalloon(mesh:mesh,parameters:p,restoredSettings:false,
            notes:"These shape settings are estimates. Editing rebuilds the balloon and may change its surface. Existing holes, hangers, and other custom details are not preserved; add them again under Attachments. Check hollow mode and wall thickness before export. STL has no pattern or color settings.")
    }
}
