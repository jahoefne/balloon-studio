import Foundation

struct RingParameters:Codable,Equatable,Sendable {
    var diameter:Double = 240
    var bandWidth:Double = 18
    var height:Double = 6
    var cordClearance:Double = 3
    var ledClearance:Double = 0.4
    var channelDepth:Double = 1.5
    var segmented:Bool = false
    var jointFit:Double = 0.3
    var reflectedLED:Bool = false
    var stripWidth:Double = 3.5
    var stripThickness:Double = 3

    static let large=RingParameters(diameter:450,bandWidth:40,height:12,cordClearance:6,ledClearance:0.5,segmented:true,reflectedLED:true,stripWidth:8)
    static let solid:RingParameters = {var p=large;p.segmented=false;return p}()
    var diameterRange:ClosedRange<Double> {segmented ? 300...600:140...600}
    var heightRange:ClosedRange<Double> {segmented || reflectedLED ? 8...16:4...10}
    var cordRange:ClosedRange<Double> {segmented || reflectedLED ? 4...8:2...5}
    var maximumBandWidth:Double {reflectedLED ? 60:segmented ? 36:28}
    var continuousCords:Bool {segmented}
    var fitsP2S:Bool {diameter+16<=256 && totalHeight<=256}

    static let outerLip = 2.0
    var channelWidth:Double {stripWidth+ledClearance}
    var minimumBandWidth:Double {
        if reflectedLED {return ceil(diameter/2-flangeOuterRadius+4+sqrt(2)*(cordClearance+1.6))}
        return segmented ? max(24,ceil(channelWidth+6+sqrt(2)*(cordClearance+1.6))) : ceil(channelWidth+6+sqrt(2)*cordClearance)
    }
    var maximumChannelDepth:Double {min(3,height-3)}
    var innerRadius:Double {diameter/2-bandWidth}
    var channelOuterRadius:Double {diameter/2-Self.outerLip}
    var channelInnerRadius:Double {channelOuterRadius-channelWidth}
    var flangeOuterRadius:Double {reflectedLED ? reflectorInnerRadius-2:channelInnerRadius}
    var holeRadius:Double {(innerRadius+flangeOuterRadius)/2}
    var channelRadius:Double {(channelInnerRadius+channelOuterRadius)/2}
    var stripPathLength:Double {2*Double.pi*(reflectedLED ? ledWallRadius:channelRadius)}
    var balloonSpacing:Double {sqrt(3)*holeRadius}
    var floorThickness:Double {height-channelDepth}
    // The LED backing follows a vertical cylinder. The 45° ramp faces it across
    // a clear floor; neither the ramp nor the mounting ledge intersects a bore.
    var ledWallRadius:Double {diameter/2-2.4}
    var ledShelfZ:Double {height+1}
    var ledShelfRadius:Double {ledWallRadius-stripThickness-0.5}
    var reflectorRise:Double {channelWidth+2}
    var reflectorToeRadius:Double {ledWallRadius-stripThickness-2}
    var reflectorInnerRadius:Double {reflectorToeRadius-reflectorRise}
    var totalHeight:Double {height+(reflectedLED ? reflectorRise:0)}
    var outerProfile:[(radius:Double,z:Double)] {
        if reflectedLED {
            return [(flangeOuterRadius,0),(diameter/2,0),(diameter/2,totalHeight),
                    (ledWallRadius,totalHeight),(ledWallRadius,ledShelfZ+channelWidth),
                    (ledWallRadius,ledShelfZ),(ledShelfRadius,ledShelfZ),(ledShelfRadius,height),
                    (reflectorToeRadius,height),(reflectorInnerRadius,totalHeight),
                    (flangeOuterRadius,totalHeight),(flangeOuterRadius,height)]
        }
        return [(flangeOuterRadius,0),(diameter/2,0),(diameter/2,height),(channelOuterRadius,height),
                (channelOuterRadius,floorThickness),(channelInnerRadius,floorThickness),(flangeOuterRadius,height)]
    }
    var filename:String {
        if reflectedLED {return "Mobile-Ring-\(Int(diameter))mm-\(String(format:"%g",locale:Locale(identifier:"en_US_POSIX"),stripWidth))mm-uplight-\(segmented ? "kit.zip":"solid.stl")"}
        return segmented ? "Mobile-Ring-\(Int(diameter))mm-6-section-kit.zip":"Mobile-Ring-\(Int(diameter))mm-3-balloons.stl"
    }

    func normalized() -> Self {
        var p=self
        func clamp(_ value:Double,_ low:Double,_ high:Double,_ fallback:Double) -> Double {
            max(low,min(high,value.isFinite ? value:fallback))
        }
        p.stripWidth=clamp(stripWidth,3.5,12,p.reflectedLED ? 8:3.5)
        p.stripThickness=clamp(stripThickness,1,6,3)
        p.diameter=clamp(diameter,p.diameterRange.lowerBound,p.diameterRange.upperBound,segmented ? 450:240)
        p.height=clamp(height,p.heightRange.lowerBound,p.heightRange.upperBound,p.segmented || p.reflectedLED ? 12:6)
        p.cordClearance=clamp(cordClearance,p.cordRange.lowerBound,p.cordRange.upperBound,p.segmented || p.reflectedLED ? 6:3)
        p.ledClearance=clamp(ledClearance,0.2,1,0.4)
        p.bandWidth=clamp(bandWidth,p.minimumBandWidth,p.maximumBandWidth,p.reflectedLED ? 40:segmented ? 24:18)
        p.channelDepth=clamp(channelDepth,0.6,p.maximumChannelDepth,1.5)
        p.jointFit=clamp(jointFit,0.2,0.6,0.3)
        return p
    }

    func ledFaces(in mesh:BalloonMesh) -> [Int] {
        mesh.triangles.map {t in
            [t.a,t.b,t.c].allSatisfy {
                let v=mesh.vertices[$0]
                return reflectedLED
                    ? abs(hypot(v.x,v.y)-ledWallRadius)<1e-7 && v.z>=ledShelfZ-1e-7 && v.z<=ledShelfZ+channelWidth+1e-7
                    : abs(v.z-floorThickness)<1e-7
            } ? 1:0
        }
    }
}

extension RingParameters {
    private enum CodingKeys:String,CodingKey {case diameter,bandWidth,height,cordClearance,ledClearance,channelDepth,segmented,jointFit,reflectedLED,stripWidth,stripThickness}
    init(from decoder:Decoder) throws {
        self.init()
        let c=try decoder.container(keyedBy:CodingKeys.self)
        diameter=try c.decodeIfPresent(Double.self,forKey:.diameter) ?? diameter
        bandWidth=try c.decodeIfPresent(Double.self,forKey:.bandWidth) ?? bandWidth
        height=try c.decodeIfPresent(Double.self,forKey:.height) ?? height
        cordClearance=try c.decodeIfPresent(Double.self,forKey:.cordClearance) ?? cordClearance
        ledClearance=try c.decodeIfPresent(Double.self,forKey:.ledClearance) ?? ledClearance
        channelDepth=try c.decodeIfPresent(Double.self,forKey:.channelDepth) ?? channelDepth
        segmented=try c.decodeIfPresent(Bool.self,forKey:.segmented) ?? false
        jointFit=try c.decodeIfPresent(Double.self,forKey:.jointFit) ?? 0.3
        reflectedLED=try c.decodeIfPresent(Bool.self,forKey:.reflectedLED) ?? false
        stripWidth=try c.decodeIfPresent(Double.self,forKey:.stripWidth) ?? 3.5
        stripThickness=try c.decodeIfPresent(Double.self,forKey:.stripThickness) ?? 3
    }
}

enum RingGenerator {
    /// A continuous annular solid with six alternating attachment holes:
    /// suspension at 0°/120°/240°, balloons at 60°/180°/300°.
    /// Uplight holes have bevelled entries on both sides.
    static func generate(_ input:RingParameters,quality:BalloonGenerator.Quality = .preview) -> BalloonMesh {
        let p=input.normalized(),tau=2*Double.pi
        let bevel=p.reflectedLED ? 0.8:0
        let half=(p.cordClearance+2*bevel)/sqrt(2),span=atan(half/p.holeRadius)
        let holeCount=6
        let centers=(0..<holeCount).map {Double($0)*tau/Double(holeCount)}
        func wrapped(_ angle:Double) -> Double {(angle+tau).truncatingRemainder(dividingBy:tau)}
        func distance(_ a:Double,_ b:Double) -> Double {abs(atan2(sin(a-b),cos(a-b)))}
        let samples=quality == .export ? 720:360
        var angles=(0..<samples).map {tau*Double($0)/Double(samples)}.filter {angle in
            !centers.contains {distance(angle,$0)<span+1e-8}
        }
        for center in centers {angles.append(contentsOf:[wrapped(center-span),center,wrapped(center+span)])}
        angles.sort()
        // Keep circular boundaries finely sampled even beside the broad bore
        // patches. Small rings otherwise develop flat spots in the LED wall.
        let denseAngles=(angles+(0..<samples).map {tau*Double($0)/Double(samples)}).sorted().reduce(into:[Double]()) {result,angle in
            if result.last.map({angle-$0>1e-9}) ?? true {result.append(angle)}
        }
        let columns=angles.count
        let holeColumns=centers.map {center in angles.firstIndex {abs($0-center)<1e-8}!}
        let sideColumns=Set(holeColumns.flatMap {[($0+columns-1)%columns,($0+1)%columns]})
        let radii=[p.innerRadius,p.holeRadius-half,p.holeRadius,p.holeRadius+half,p.flangeOuterRadius]
        var vertices:[Point3]=[],triangles:[Triangle]=[]
        var loopAngles:[Int:[Double]]=[:]
        func ring(_ radius:Double,_ z:Double,straightenHole:Bool=false,dense:Bool=false) -> [Int] {
            let samples=dense ? denseAngles:angles
            let indices=samples.enumerated().map {column,theta in
                // Put the left/right diamond corners on a straight tangent,
                // so the requested inscribed clearance is exact, not a chord.
                let r=straightenHole && sideColumns.contains(column) ? radius/cos(span):radius
                let index=vertices.count
                vertices.append(Point3(x:r*cos(theta),y:r*sin(theta),z:z))
                return index
            }
            loopAngles[indices[0]]=samples
            return indices
        }
        let bottom=radii.enumerated().map {ring($0.element,0,straightenHole:$0.offset==2,dense:p.reflectedLED && ($0.offset==0 || $0.offset==4))}
        let top=radii.enumerated().map {ring($0.element,p.height,straightenHole:$0.offset==2,dense:p.reflectedLED && ($0.offset==0 || $0.offset==4))}
        func join(_ a:[Int],_ b:[Int],reversed:Bool=false) {
            let aa=loopAngles[a[0]]!,ba=loopAngles[b[0]]!
            var i=0,j=0
            func face(_ x:Int,_ y:Int,_ z:Int) {triangles.append(Triangle(a:x,b:reversed ? z:y,c:reversed ? y:z))}
            while i<a.count || j<b.count {
                let nextA=i<a.count ? (i+1<a.count ? aa[i+1]:tau):Double.infinity
                let nextB=j<b.count ? (j+1<b.count ? ba[j+1]:tau):Double.infinity
                let ai=a[i%a.count],bj=b[j%b.count]
                if abs(nextA-nextB)<1e-9 {
                    let ak=a[(i+1)%a.count],bk=b[(j+1)%b.count]
                    face(ai,ak,bk);face(ai,bk,bj);i += 1;j += 1
                } else if nextA<nextB {
                    face(ai,a[(i+1)%a.count],bj);i += 1
                } else {
                    face(ai,b[(j+1)%b.count],bj);j += 1
                }
            }
        }
        for row in 0..<(radii.count-1) {
            join(bottom[row],bottom[row+1])
            join(top[row],top[row+1],reversed:true)
        }
        join(top[0],bottom[0])
        // Trace the rest of the cross section around the outer rim and back
        // through the recessed channel; share its seams with the inner flange.
        let profile=[bottom.last!]+p.outerProfile.dropFirst().dropLast().map {ring($0.radius,$0.z,dense:p.reflectedLED)}+[top.last!]
        for row in 0..<(profile.count-1) {join(profile[row],profile[row+1])}
        var mesh=BalloonMesh(vertices:vertices,triangles:triangles,maxOverhang:0)
        let pairs=holeColumns.map {column in
            (StringHoles.patch(row:2,column:column,columns:columns,index:{bottom[$0][$1]}),
             StringHoles.patch(row:2,column:column,columns:columns,index:{top[$0][$1]}))
        }
        if bevel==0 {StringHoles.punch(&mesh,pairs:pairs)}
        else {
            for (lower,upper) in pairs {
                mesh.triangles.removeAll {[$0.a,$0.b,$0.c].contains(lower.center) || [$0.a,$0.b,$0.c].contains(upper.center)}
                mesh.triangles.append(contentsOf:[Triangle(a:lower.bottomLeft,b:lower.bottom,c:lower.left),Triangle(a:lower.right,b:lower.topRight,c:lower.top),
                                                  Triangle(a:upper.bottomLeft,b:upper.left,c:upper.bottom),Triangle(a:upper.right,b:upper.top,c:upper.topRight)])
                let center=mesh.vertices[lower.center],ratio=p.cordClearance/(p.cordClearance+2*bevel)
                func throat(_ z:Double) -> [Int] {
                    lower.loop.map {i in
                        let v=mesh.vertices[i],index=mesh.vertices.count
                        mesh.vertices.append(Point3(x:center.x+(v.x-center.x)*ratio,y:center.y+(v.y-center.y)*ratio,z:z))
                        return index
                    }
                }
                let loops=[lower.loop,throat(bevel),throat(p.height-bevel),upper.loop]
                for level in 0..<3 {for j in 0..<4 {
                    let k=(j+1)%4,a=loops[level][j],b=loops[level][k],c=loops[level+1][k],d=loops[level+1][j]
                    mesh.triangles.append(contentsOf:[Triangle(a:a,b:b,c:c),Triangle(a:a,b:c,c:d)])
                }}
            }
            StringHoles.compact(&mesh)
        }
        return mesh
    }
}
