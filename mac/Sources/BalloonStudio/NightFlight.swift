import Foundation
import CoreGraphics

// One panoramic composition in physical millimetres. Gray values are sculpted height,
// never filament colors. Detail is built from separate layers, with a narrow edge bevel.
// NightFlightRelief turns this or the Summit Cable Car artwork into raised geometry.
private enum NightFlightArtwork {
    static func draw(width:Double,height:Double,diameter:Double,columns:Int,rows:Int)->[Float] {
        var bytes=Array(repeating:UInt8(0),count:columns*rows)
        bytes.withUnsafeMutableBytes {buffer in
            let c=CGContext(data:buffer.baseAddress,width:columns,height:rows,bitsPerComponent:8,
                            bytesPerRow:columns,space:CGColorSpaceCreateDeviceGray(),bitmapInfo:CGImageAlphaInfo.none.rawValue)!
            c.translateBy(x:0,y:CGFloat(rows));c.scaleBy(x:1,y:-1)
            c.scaleBy(x:Double(columns)/width,y:Double(rows)/height)
            func ellipse(_ x:Double,_ y:Double,_ rx:Double,_ ry:Double,_ level:Double) {
                c.setFillColor(gray:level,alpha:1)
                c.fillEllipse(in:CGRect(x:x-rx,y:y-ry,width:rx*2,height:ry*2))
            }
            func fill(_ path:CGPath,_ level:Double) {
                c.setFillColor(gray:level,alpha:1);c.addPath(path);c.fillPath()
            }
            func roundedFill(_ path:CGPath,center:CGPoint,radius:Double,high:Double,low:Double) {
                c.saveGState();c.addPath(path);c.clip()
                let gradient=CGGradient(colorSpace:CGColorSpaceCreateDeviceGray(),
                                        colorComponents:[high,1,low,1],locations:[0,1],count:2)!
                c.drawRadialGradient(gradient,startCenter:center,startRadius:0,
                                     endCenter:center,endRadius:radius,options:.drawsAfterEndLocation)
                c.restoreGState()
            }
            func stroke(_ points:[CGPoint],level:Double,line:Double) {
                c.setStrokeColor(gray:level,alpha:1);c.setLineWidth(line);c.setLineCap(.round)
                c.move(to:points[0]);for p in points.dropFirst() {c.addLine(to:p)};c.strokePath()
            }
            func position(_ x:Double,_ y:Double)->CGPoint {CGPoint(x:x*width,y:y*height)}
            let scale=min(diameter*0.006,height*0.0105)

            // Each plane has its own looping trail. Repeat only wrapped copies, so a
            // plane crossing the panorama boundary remains a single continuous object.
            let planeCenters=[0.02,0.52]
            for center in planeCenters {for wrap in -1...1 {
                let u=center+Double(wrap)
                let tail=position(u+(-55*cos(0.25)+2*sin(0.25))*scale/width,
                                  0.52+(-55*sin(0.25)-2*cos(0.25))*scale/height)
                c.setStrokeColor(gray:0.62,alpha:1);c.setLineWidth(max(1.1,2.0*scale));c.setLineCap(.round)
                c.setLineDash(phase:0,lengths:[max(1.8,3.8*scale),max(2,4.5*scale)])
                c.move(to:position(u-0.24,0.36))
                c.addCurve(to:position(u-0.18,0.23),control1:position(u-0.23,0.20),control2:position(u-0.20,0.18))
                c.addCurve(to:position(u-0.16,0.39),control1:position(u-0.12,0.33),control2:position(u-0.11,0.53))
                c.addCurve(to:position(u-0.20,0.36),control1:position(u-0.21,0.56),control2:position(u-0.25,0.41))
                c.addCurve(to:tail,control1:position(u-0.18,0.23),control2:CGPoint(x:tail.x-width*0.05,y:tail.y-height*0.07))
                c.strokePath()
            }}
            c.setLineDash(phase:0,lengths:[])

            // Each cloud is one continuous silhouette with a gently rounded face.
            // No overlapping puff outlines or engraved marks cross its surface.
            func cloud(_ u:Double,_ v:Double,_ size:Double,_ mirror:Bool=false) {
                c.saveGState();c.translateBy(x:u*width,y:v*height)
                let s=min(size*scale,height*(0.97-v)/28,height*(v-0.03)/10)
                c.scaleBy(x:mirror ? -s:s,y:s)
                let outline=CGMutablePath()
                outline.move(to:CGPoint(x:-20,y:-7))
                outline.addCurve(to:CGPoint(x:-21,y:8),control1:CGPoint(x:-32,y:-6),control2:CGPoint(x:-31,y:8))
                outline.addCurve(to:CGPoint(x:-9,y:16),control1:CGPoint(x:-24,y:19),control2:CGPoint(x:-14,y:24))
                outline.addCurve(to:CGPoint(x:12,y:15),control1:CGPoint(x:-9,y:32),control2:CGPoint(x:14,y:30))
                outline.addCurve(to:CGPoint(x:23,y:6),control1:CGPoint(x:23,y:21),control2:CGPoint(x:30,y:14))
                outline.addCurve(to:CGPoint(x:21,y:-7),control1:CGPoint(x:34,y:6),control2:CGPoint(x:33,y:-7))
                outline.addCurve(to:CGPoint(x:-20,y:-7),control1:CGPoint(x:10,y:-10),control2:CGPoint(x:-9,y:-10))
                outline.closeSubpath()
                roundedFill(outline,center:CGPoint(x:0,y:7),radius:34,high:0.86,low:0.70)
                c.restoreGState()
            }
            cloud(0.31,0.62,0.90)
            cloud(0.55,0.81,0.85,true)
            cloud(0.64,0.21,0.88)
            cloud(0.20,0.68,0.75,true)
            cloud(0.82,0.73,1.0)
            cloud(0.94,0.15,0.62,true)

            let moonRadius=min(height*0.115,diameter*0.085)
            let mx=width*0.40,my=height*0.87
            // Join the two circle arcs at their exact intersections. Erasing a second
            // antialiased circle inside a clipped disk leaves a thin, broken outer rim.
            let dx=0.48,dy=0.28,innerRadius=0.89,d=hypot(dx,dy)
            let direction=atan2(dy,dx),halfAngle=acos((1-innerRadius*innerRadius+d*d)/(2*d))
            let upper=direction+halfAngle,lower=direction-halfAngle
            let moon=CGMutablePath()
            moon.addArc(center:CGPoint(x:mx,y:my),radius:moonRadius,
                        startAngle:upper,endAngle:lower+2*Double.pi,clockwise:false)
            moon.addArc(center:CGPoint(x:mx+dx*moonRadius,y:my+dy*moonRadius),radius:innerRadius*moonRadius,
                        startAngle:atan2(sin(lower)-dy,cos(lower)-dx),
                        endAngle:atan2(sin(upper)-dy,cos(upper)-dx),clockwise:true)
            moon.closeSubpath();fill(moon,0.90)
            for (u,v,size) in [(0.50,0.93,5.0),(0.69,0.75,4.1),(0.26,0.87,4.5),(0.22,0.50,3.5),
                               (0.56,0.16,4.2),(0.73,0.17,3.5),(0.90,0.83,4.8),(0.06,0.88,4.0),
                               (0.18,0.35,3.0),(0.16,0.43,3.5),(0.86,0.18,3.3),(0.95,0.91,3.8)] {
                let star=CGMutablePath(),r=max(1.8,size*scale)
                for i in 0..<10 {
                    let a=Double.pi/2+Double(i)*Double.pi/5,d=i%2==0 ? r:r*0.46
                    let p=CGPoint(x:u*width+cos(a)*d,y:v*height+sin(a)*d)
                    if i==0 {star.move(to:p)} else {star.addLine(to:p)}
                }
                star.closeSubpath();fill(star,0.82)
            }

            // A rounded vintage toy aeroplane: broad elliptical wings, a glazed canopy,
            // sculpted cowling, landing wheels, ribbed wings, fasteners and a pilot silhouette.
            func plane(at u:Double) {
                c.saveGState();c.translateBy(x:width*u,y:height*0.52);c.rotate(by:0.25);c.scaleBy(x:scale,y:scale)
                let farWing=CGMutablePath()
                farWing.move(to:CGPoint(x:-10,y:4))
                farWing.addCurve(to:CGPoint(x:-23,y:33),control1:CGPoint(x:-17,y:16),control2:CGPoint(x:-30,y:29))
                farWing.addCurve(to:CGPoint(x:-9,y:36),control1:CGPoint(x:-21,y:40),control2:CGPoint(x:-14,y:40))
                farWing.addCurve(to:CGPoint(x:19,y:9),control1:CGPoint(x:2,y:29),control2:CGPoint(x:14,y:16))
                farWing.closeSubpath();fill(farWing,0.65)
                stroke([CGPoint(x:-19,y:31),CGPoint(x:4,y:15)],level:0.49,line:1.1)
                c.saveGState();c.addPath(farWing);c.clip()
                for (a,b) in [(CGPoint(x:-22,y:28),CGPoint(x:-17,y:29.6)),
                              (CGPoint(x:-18,y:19),CGPoint(x:-9,y:24)),
                              (CGPoint(x:-11,y:11),CGPoint(x:-1,y:18.5))] {
                    stroke([a,b],level:0.53,line:0.9)
                }
                c.restoreGState()
                let fin=CGMutablePath()
                fin.move(to:CGPoint(x:-47,y:0))
                fin.addCurve(to:CGPoint(x:-43,y:24),control1:CGPoint(x:-51,y:8),control2:CGPoint(x:-52,y:25))
                fin.addCurve(to:CGPoint(x:-25,y:3),control1:CGPoint(x:-35,y:24),control2:CGPoint(x:-35,y:10))
                fin.closeSubpath();fill(fin,0.73)
                stroke([CGPoint(x:-43,y:7),CGPoint(x:-45,y:18)],level:0.54,line:1.2)
                ellipse(-41,15,2.6,3.1,0.94);ellipse(-41,15,1.3,1.7,0.57)
                // Two small wheels and their angled legs sit behind the fuselage and near wing.
                stroke([CGPoint(x:29,y:-5),CGPoint(x:33,y:-15)],level:0.65,line:2.5)
                ellipse(33,-16,3.8,4.8,0.63);ellipse(33,-16,1.8,2.5,0.85)
                stroke([CGPoint(x:8,y:-6),CGPoint(x:22,y:-20),CGPoint(x:28,y:-6)],level:0.76,line:2.5)
                ellipse(22,-21,5.2,6.0,0.78);ellipse(22,-21,3.8,4.6,0.55);ellipse(22,-21,2.7,3.4,0.98)
                stroke([CGPoint(x:20,y:-21),CGPoint(x:24,y:-21)],level:0.72,line:0.8)
                stroke([CGPoint(x:22,y:-23.6),CGPoint(x:22,y:-18.4)],level:0.72,line:0.8)
                ellipse(22,-21,1.0,1.3,1)
                let body=CGMutablePath()
                body.move(to:CGPoint(x:-52,y:-1))
                body.addCurve(to:CGPoint(x:28,y:-10),control1:CGPoint(x:-31,y:-8),control2:CGPoint(x:9,y:-14))
                body.addCurve(to:CGPoint(x:45,y:1),control1:CGPoint(x:40,y:-10),control2:CGPoint(x:46,y:-5))
                body.addCurve(to:CGPoint(x:29,y:14),control1:CGPoint(x:46,y:10),control2:CGPoint(x:38,y:15))
                body.addCurve(to:CGPoint(x:-7,y:8),control1:CGPoint(x:13,y:14),control2:CGPoint(x:3,y:11))
                body.addCurve(to:CGPoint(x:-52,y:-1),control1:CGPoint(x:-28,y:5),control2:CGPoint(x:-57,y:6))
                body.closeSubpath()
                roundedFill(body,center:CGPoint(x:14,y:3),radius:62,high:0.96,low:0.77)
                let stripe=CGMutablePath()
                stripe.move(to:CGPoint(x:-45,y:0));stripe.addQuadCurve(to:CGPoint(x:2,y:3),control:CGPoint(x:-22,y:-1))
                stripe.addLine(to:CGPoint(x:5,y:6));stripe.addQuadCurve(to:CGPoint(x:-45,y:0),control:CGPoint(x:-22,y:2))
                stripe.closeSubpath();fill(stripe,0.59)
                // An access hatch and two rows of recessed fasteners give the fuselage scale.
                let hatch=CGPath(roundedRect:CGRect(x:-30,y:-4.5,width:10,height:4.5),cornerWidth:1,cornerHeight:1,transform:nil)
                c.addPath(hatch);c.setStrokeColor(gray:0.61,alpha:1);c.setLineWidth(0.9);c.strokePath()
                ellipse(-22,-2,0.85,0.85,0.98)
                for (x,y) in [(-39.0,-2.5),(-34,-3.5),(-17,-5.5),(-12,-6),(-26,4.5),(-19,5.8),(-12,6.8)] {
                    ellipse(x,y,0.7,0.7,0.57)
                }
                // A curved canopy, with an unbroken rim and a substantial windshield divider.
                let canopy=CGMutablePath()
                canopy.move(to:CGPoint(x:-5,y:8))
                canopy.addCurve(to:CGPoint(x:9,y:21),control1:CGPoint(x:-2,y:19),control2:CGPoint(x:1,y:23))
                canopy.addCurve(to:CGPoint(x:26,y:10),control1:CGPoint(x:19,y:21),control2:CGPoint(x:25,y:17))
                canopy.closeSubpath();fill(canopy,0.92)
                let glass=CGMutablePath()
                glass.move(to:CGPoint(x:-1,y:10))
                glass.addCurve(to:CGPoint(x:9,y:18),control1:CGPoint(x:1,y:17),control2:CGPoint(x:3,y:20))
                glass.addCurve(to:CGPoint(x:22,y:12),control1:CGPoint(x:16,y:18),control2:CGPoint(x:20,y:16))
                glass.closeSubpath();fill(glass,0.43)
                // A simple head and shoulders stay inside the rear pane of the canopy.
                c.saveGState();c.addPath(glass);c.clip()
                ellipse(5.5,15.3,1.8,1.9,0.85)
                ellipse(5.5,10.3,4.1,3.5,0.78)
                c.restoreGState()
                stroke([CGPoint(x:12,y:11),CGPoint(x:14,y:18)],level:0.94,line:1.5)
                stroke([CGPoint(x:-3,y:8),CGPoint(x:25,y:10)],level:0.98,line:1.6)
                let nose=CGMutablePath()
                nose.move(to:CGPoint(x:30,y:-9))
                nose.addCurve(to:CGPoint(x:44,y:-5),control1:CGPoint(x:34,y:-12),control2:CGPoint(x:43,y:-9))
                nose.addQuadCurve(to:CGPoint(x:44,y:9),control:CGPoint(x:49,y:2))
                nose.addCurve(to:CGPoint(x:30,y:14),control1:CGPoint(x:42,y:14),control2:CGPoint(x:35,y:16))
                nose.addQuadCurve(to:CGPoint(x:30,y:-9),control:CGPoint(x:26,y:3));nose.closeSubpath()
                roundedFill(nose,center:CGPoint(x:37,y:4),radius:17,high:1,low:0.84)
                c.setStrokeColor(gray:0.62,alpha:1);c.setLineWidth(1.1);c.setLineCap(.round)
                c.move(to:CGPoint(x:30,y:-8));c.addQuadCurve(to:CGPoint(x:30,y:13),control:CGPoint(x:27,y:3));c.strokePath()
                // Three broad cooling slots are legible in cream relief at normal print sizes.
                for x in [31.5,35.5,39.5] {
                    stroke([CGPoint(x:x,y:-3),CGPoint(x:x-0.6,y:6)],level:0.65,line:1.25)
                }
                for (x,y) in [(31.5,-6.5),(36,-7.5),(41,-5.5),(31.5,10.5),(36,11.5),(41,10)] {
                    ellipse(x,y,0.8,0.8,0.58)
                }
                let wing=CGMutablePath()
                wing.move(to:CGPoint(x:-1,y:0))
                wing.addCurve(to:CGPoint(x:-22,y:-32),control1:CGPoint(x:-8,y:-8),control2:CGPoint(x:-25,y:-23))
                wing.addCurve(to:CGPoint(x:-7,y:-38),control1:CGPoint(x:-22,y:-41),control2:CGPoint(x:-14,y:-43))
                wing.addCurve(to:CGPoint(x:21,y:-5),control1:CGPoint(x:4,y:-30),control2:CGPoint(x:18,y:-17))
                wing.addQuadCurve(to:CGPoint(x:-1,y:0),control:CGPoint(x:26,y:5));wing.closeSubpath()
                roundedFill(wing,center:CGPoint(x:2,y:-9),radius:40,high:1,low:0.87)
                c.setStrokeColor(gray:0.68,alpha:1);c.setLineWidth(1.15);c.setLineCap(.round)
                c.move(to:CGPoint(x:-9,y:-34));c.addQuadCurve(to:CGPoint(x:16,y:-7),control:CGPoint(x:8,y:-20));c.strokePath()
                c.saveGState();c.addPath(wing);c.clip()
                for (a,b) in [(CGPoint(x:-17,y:-29),CGPoint(x:-8,y:-30)),
                              (CGPoint(x:-12,y:-20),CGPoint(x:0,y:-24)),
                              (CGPoint(x:-6,y:-11),CGPoint(x:7,y:-17)),
                              (CGPoint(x:1,y:-4),CGPoint(x:14,y:-10))] {
                    stroke([a,b],level:0.77,line:0.9)
                }
                for (x,y) in [(-18.0,-33.0),(-17,-25),(-12,-17),(-6,-9),(0,-3),(8,0)] {
                    ellipse(x,y,0.75,0.75,0.63)
                }
                c.restoreGState()
                ellipse(-12,-27,4.2,4.7,0.66);ellipse(-12,-27,2.5,2.9,0.96)
                let tail=CGMutablePath()
                tail.move(to:CGPoint(x:-44,y:0))
                tail.addCurve(to:CGPoint(x:-50,y:-14),control1:CGPoint(x:-48,y:-4),control2:CGPoint(x:-54,y:-12))
                tail.addCurve(to:CGPoint(x:-40,y:-15),control1:CGPoint(x:-48,y:-19),control2:CGPoint(x:-43,y:-19))
                tail.addLine(to:CGPoint(x:-28,y:-3));tail.closeSubpath();fill(tail,0.94)
                stroke([CGPoint(x:-44,y:-13),CGPoint(x:-34,y:-4)],level:0.72,line:1.1)
                stroke([CGPoint(x:44,y:1),CGPoint(x:53,y:1)],level:0.85,line:3)
                c.saveGState();c.translateBy(x:52,y:1);c.rotate(by:-0.14)
                for angle in [0.0,Double.pi] {
                    c.saveGState();c.rotate(by:angle)
                    let blade=CGMutablePath()
                    blade.move(to:CGPoint(x:-1.8,y:1))
                    blade.addCurve(to:CGPoint(x:0,y:21),control1:CGPoint(x:-6,y:12),control2:CGPoint(x:-5,y:22))
                    blade.addCurve(to:CGPoint(x:3,y:9),control1:CGPoint(x:5,y:21),control2:CGPoint(x:5,y:16))
                    blade.addLine(to:CGPoint(x:1.8,y:1));blade.closeSubpath();fill(blade,0.87)
                    c.saveGState();c.addPath(blade);c.clip()
                    stroke([CGPoint(x:-0.5,y:8),CGPoint(x:0,y:17)],level:0.65,line:0.9)
                    c.restoreGState()
                    c.restoreGState()
                }
                ellipse(0,0,4.4,3.6,1);ellipse(0,0,1.7,1.5,0.69);c.restoreGState()
                c.restoreGState()
            }
            for center in planeCenters {for wrap in -1...1 {plane(at:center+Double(wrap))}}
        }
        return bytes.map {Float($0)/255}
    }
}

// The reference exporter (mac/ReferenceExporter) dumps this raster for the web port.
// The drawing stays private; this only forwards to it.
enum NightFlightArtworkReference {
    static func draw(width:Double,height:Double,diameter:Double,columns:Int,rows:Int)->[Float] {
        NightFlightArtwork.draw(width:width,height:height,diameter:diameter,columns:columns,rows:rows)
    }
}

struct NightFlightRelief:Sendable {
    let width:Double
    let height:Double
    let bottom:Double
    let depth:Double
    let columns:Int
    let rows:Int
    private let pixels:[Float]
    private let coverage:[Int32]
    private let boundaries:[Int32]
    private let crest:[Double]
    static let origin = -Double.pi/3
    var resolution:Double {0.28}

    init(settings input:PatternSettings,parameters p:BalloonParameters,mesh:BalloonMesh) {
        let settings=input.normalized(p)
        depth=settings.reliefDepth
        let width=Double.pi*p.diameter*0.94
        let free=p.height-p.neckHeight
        let bottom=p.neckHeight+free*0.09
        let height=settings.capBoundary(p)-max(2,p.height*0.012)-bottom
        let columns=min(3072,max(1024,Int(ceil(width/0.20))))
        let rows=min(1200,max(256,Int(ceil(height/0.18))))
        self.width=width;self.height=height;self.bottom=bottom;self.columns=columns;self.rows=rows
        // Lift each motif above the panel crests, filling grooves under the object only.
        // Original ring maxima define the same meridian as the source mesh, independently
        // of relief refinement. Inner walls and mechanical attachments stay untouched.
        var rings:[Double:Double]=[:]
        for (i,v) in mesh.vertices.enumerated() where mesh.innerVertexRange?.contains(i) != true && v.z<=p.height {
            rings[v.z]=max(rings[v.z] ?? 0,hypot(v.x,v.y))
        }
        let profile=rings.sorted {$0.key<$1.key}
        var radii=Array(repeating:0.0,count:rows),j=0
        for y in 0..<rows {
            let z=bottom+Double(y)/Double(rows-1)*height
            while j+1<profile.count-1 && profile[j+1].key<z {j+=1}
            let a=profile[j],b=profile[j+1],f=(z-a.key)/(b.key-a.key)
            radii[y]=a.value+(b.value-a.value)*f
        }
        crest=radii
        // The cable car lays its motifs out in millimetres per meridian and needs the crest
        // radius at each height to keep their proportions where the envelope narrows.
        let crestRadius:(Double)->Double = {y in
            let f=max(0,min(Double(rows-1),y/height*Double(rows-1))),i=min(rows-2,Int(f)),t=f-Double(i)
            return radii[i]*(1-t)+radii[i+1]*t
        }
        var field=settings.style == .summitCableCar
            ? SummitCableCarArtwork.draw(width:width,height:height,diameter:p.diameter,columns:columns,rows:rows,radius:crestRadius)
            : NightFlightArtwork.draw(width:width,height:height,diameter:p.diameter,columns:columns,rows:rows)
        // A fixed 0.25 mm bevel preserves small details even at deeper relief settings.
        // Horizontal filtering wraps with the artwork instead of fading at the seam.
        // Unlike the old broad blur, it leaves flat tops and sharp silhouette transitions.
        func smooth(_ input:[Float],horizontal:Bool)->[Float] {
            var output=Array(repeating:Float(0),count:input.count)
            let count=horizontal ? columns:rows,lines=horizontal ? rows:columns
            let radius=max(1,Int((0.25*Double(count)/(horizontal ? width:height)).rounded()))
            for line in 0..<lines {
                func index(_ offset:Int)->Int {horizontal ? line*columns+(offset+count)%count:offset*columns+line}
                var sum:Float=0
                for offset in (horizontal ? -radius:0)...radius {sum+=input[index(offset)]}
                for offset in 0..<count {
                    output[index(offset)]=max(0,sum/Float(2*radius+1))
                    if horizontal || offset-radius>=0 {sum-=input[index(offset-radius)]}
                    if horizontal || offset+radius+1<count {sum+=input[index(offset+radius+1)]}
                }
            }
            return output
        }
        field=smooth(smooth(field,horizontal:true),horizontal:false)
        pixels=field
        var sums=Array(repeating:Int32(0),count:(columns+1)*(rows+1)),edges=sums
        for y in 0..<rows {
            var sum:Int32=0,edge:Int32=0
            for x in 0..<columns {
                let i=y*columns+x,v=field[i]
                sum += v>0.005 ? 1:0
                let dx=abs(v-field[y*columns+(x+1)%columns])
                let dy=abs(v-field[min(rows-1,y+1)*columns+x])
                edge += max(dx,dy)>0.025 ? 1:0
                sums[(y+1)*(columns+1)+x+1]=sums[y*(columns+1)+x+1]+sum
                edges[(y+1)*(columns+1)+x+1]=edges[y*(columns+1)+x+1]+edge
            }
        }
        coverage=sums;boundaries=edges
    }

    func artworkHeight(at point:Point3)->Double {
        let angle=atan2(point.y,point.x)-Self.origin
        let x=(angle/(2*Double.pi)+0.5).truncatingRemainder(dividingBy:1)
        return sample(x:x<0 ? x+1:x,y:(point.z-bottom)/height)*depth
    }
    private func sample(x:Double,y:Double)->Double {
        guard y>=0,y<1 else {return 0}
        // Raster samples sit at pixel centers. Interpolate periodically across the
        // cylindrical seam; clamping here would split the plane on the opposite side.
        let px=x*Double(columns)-0.5,py=y*Double(rows-1),ix=Int(floor(px))
        let x0=(ix+columns)%columns,y0=Int(py),x1=(x0+1)%columns,y1=min(rows-1,y0+1)
        let u=Float(px-Double(ix)),v=Float(py-Double(y0))
        return Double((pixels[y0*columns+x0]*(1-u)+pixels[y0*columns+x1]*u)*(1-v) +
                      (pixels[y1*columns+x0]*(1-u)+pixels[y1*columns+x1]*u)*v)
    }
    func displacement(at point:Point3)->Double {
        let amount=artworkHeight(at:point)
        guard amount>0.005 else {return 0}
        let y=max(0,min(Double(rows-1),(point.z-bottom)/height*Double(rows-1)))
        let i=min(rows-2,Int(y)),f=y-Double(i)
        let radius=crest[i]*(1-f)+crest[i+1]*f
        let edge=min(1,amount/(depth*0.35))
        return amount+max(0,radius-hypot(point.x,point.y))*edge
    }

    func needsRefinement(_ a:Point3,_ b:Point3,_ c:Point3,normal:Point3)->Bool {
        let center=(a+b+c)*(1.0/3)
        guard normal.x*center.x+normal.y*center.y>0,
              max(a.z,b.z,c.z)>=bottom,min(a.z,b.z,c.z)<=bottom+height else {return false}
        let first=atan2(a.y,a.x)
        func unwrap(_ p:Point3)->Double {
            let delta=atan2(p.y,p.x)-first
            return first+atan2(sin(delta),cos(delta))
        }
        let angles=[first,unwrap(b),unwrap(c)],middle=angles.reduce(0,+)/3
        let shift=floor((middle-Self.origin)/(2*Double.pi)+0.5)
        let xs=angles.map {($0-Self.origin)/(2*Double.pi)+0.5-shift}
        let ys=[a,b,c].map {($0.z-bottom)/height}
        let loX=xs.min()!,hiX=xs.max()!,loY=ys.min()!,hiY=ys.max()!
        let span=max((hiX-loX)*width,(hiY-loY)*height)
        guard span>resolution,hiY>=0,loY<=1 else {return false}
        func occupied(_ table:[Int32],_ low:Double,_ high:Double)->Bool {
            let x0=max(0,min(columns,Int(floor(max(0,low)*Double(columns)))-2))
            let x1=max(0,min(columns,Int(ceil(min(1,high)*Double(columns)))+3))
            let y0=max(0,min(rows,Int(floor(max(0,loY)*Double(rows)))-2))
            let y1=max(0,min(rows,Int(ceil(min(1,hiY)*Double(rows)))+3))
            guard x1>x0,y1>y0 else {return false}
            let stride=columns+1
            return table[y1*stride+x1]-table[y0*stride+x1]-table[y1*stride+x0]+table[y0*stride+x0]>0
        }
        let table=span>1.0 ? coverage:boundaries
        if occupied(table,loX,hiX) {return true}
        if loX<0 && occupied(table,loX+1,1) {return true}
        return hiX>1 && occupied(table,0,hiX-1)
    }
    func edgeNeedsRefinement(_ a:Point3,_ b:Point3)->Bool {
        let angle=atan2(a.y,a.x)-atan2(b.y,b.x)
        return max(abs(atan2(sin(angle),cos(angle)))*width/(2*Double.pi),abs(a.z-b.z))>resolution
    }

    func apply(to mesh:inout BalloonMesh) {
        var exterior=Array(repeating:false,count:mesh.vertices.count)
        for t in mesh.triangles {
            let a=mesh.vertices[t.a],b=mesh.vertices[t.b],c=mesh.vertices[t.c]
            let center=(a+b+c)*(1.0/3),normal=(b-a).cross(c-a)
            if center.z>=bottom && center.z<=bottom+height && normal.x*center.x+normal.y*center.y>0 {
                exterior[t.a]=true;exterior[t.b]=true;exterior[t.c]=true
            }
        }
        for i in mesh.vertices.indices where exterior[i] {
            let p=mesh.vertices[i],r=hypot(p.x,p.y),amount=displacement(at:p)
            guard r>0,amount>0 else {continue}
            mesh.vertices[i]=Point3(x:p.x*(1+amount/r),y:p.y*(1+amount/r),z:p.z)
        }
        for t in mesh.triangles where exterior[t.a] || exterior[t.b] || exterior[t.c] {
            let a=mesh.vertices[t.a],b=mesh.vertices[t.b],c=mesh.vertices[t.c]
            let n=(b-a).cross(c-a),center=(a+b+c)*(1.0/3)
            if n.x*center.x+n.y*center.y>0 {
                mesh.maxOverhang=max(mesh.maxOverhang,atan2(-n.z,hypot(n.x,n.y))*180/Double.pi)
            }
        }
    }
}
