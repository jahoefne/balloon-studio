import Foundation
import CoreGraphics

// Summit Cable Car: two summits half a turn apart, a timber station on each peak and the
// cable swinging between them in two swags; a vintage Swiss cabin climbs each rise.
// Motifs are laid out in physical millimetres around their own meridian and warped onto
// the panorama, so they keep their proportions where the envelope narrows towards the
// neck. The scene was drawn 1:1 for the classic envelope. Other shapes scale heights with
// the artwork height and motif sizes with the smaller of height and circumference.
// Gray values are sculpted height, never filament colors: far things low, near things high.
enum SummitCableCarArtwork {
    static let designWidth=531.56,designHeight=152.5   // the classic envelope's artwork

    static func draw(width:Double,height:Double,diameter:Double,columns:Int,rows:Int,radius:(Double)->Double)->[Float] {
        var bytes=Array(repeating:UInt8(0),count:columns*rows)
        let reach=width/(2*Double.pi)
        let sy=height/designHeight,sm=min(sy,width/designWidth)
        bytes.withUnsafeMutableBytes {buffer in
            let c=CGContext(data:buffer.baseAddress,width:columns,height:rows,bitsPerComponent:8,
                            bytesPerRow:columns,space:CGColorSpaceCreateDeviceGray(),bitmapInfo:CGImageAlphaInfo.none.rawValue)!
            c.translateBy(x:0,y:CGFloat(rows));c.scaleBy(x:1,y:-1)
            c.scaleBy(x:Double(columns)/width,y:Double(rows)/height)

            // ---- warp machinery ------------------------------------------------------------
            var meridian=0.0                       // panorama position of the current motif
            var local=CGAffineTransform.identity    // motif coordinates -> (mm from meridian, mm above bottom)
            func k(_ y:Double)->Double {reach/max(8,radius(y))}
            func map(_ p:CGPoint)->CGPoint {CGPoint(x:meridian*width+p.x*k(p.y),y:p.y)}
            func warp(_ path:CGPath)->CGPath {
                var t=local
                let source=path.copy(using:&t)!
                let out=CGMutablePath()
                var current=CGPoint.zero,start=CGPoint.zero
                func segment(_ n:Int,_ f:(Double)->CGPoint) {
                    for i in 1...n {out.addLine(to:map(f(Double(i)/Double(n))))}
                }
                func dist(_ a:CGPoint,_ b:CGPoint)->Double {hypot(a.x-b.x,a.y-b.y)}
                source.applyWithBlock {e in
                    let p=e.pointee.points
                    switch e.pointee.type {
                    case .moveToPoint:
                        current=p[0];start=current;out.move(to:map(current))
                    case .addLineToPoint:
                        let a=current,b=p[0]
                        segment(max(1,Int(ceil(dist(a,b)/0.8)))) {f in CGPoint(x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f)}
                        current=b
                    case .addQuadCurveToPoint:
                        let a=current,b=p[0],d=p[1]
                        segment(max(4,Int(ceil((dist(a,b)+dist(b,d))/0.6)))) {f in
                            let u=1-f;return CGPoint(x:u*u*a.x+2*u*f*b.x+f*f*d.x,y:u*u*a.y+2*u*f*b.y+f*f*d.y)}
                        current=d
                    case .addCurveToPoint:
                        let a=current,b=p[0],q=p[1],d=p[2]
                        segment(max(4,Int(ceil((dist(a,b)+dist(b,q)+dist(q,d))/0.6)))) {f in
                            let u=1-f
                            return CGPoint(x:u*u*u*a.x+3*u*u*f*b.x+3*u*f*f*q.x+f*f*f*d.x,
                                           y:u*u*u*a.y+3*u*u*f*b.y+3*u*f*f*q.y+f*f*f*d.y)}
                        current=d
                    case .closeSubpath:
                        let a=current,b=start
                        if dist(a,b)>1e-6 {segment(max(1,Int(ceil(dist(a,b)/0.8)))) {f in CGPoint(x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f)}}
                        out.closeSubpath();current=start
                    @unknown default: break
                    }
                }
                return out
            }
            // A motif sits at panorama position u, y mm (classic scale) above the bottom. Sizes follow
            // the motif scale; a stretched motif follows the artwork height instead, like the mountains.
            func motif(_ u:Double,_ y:Double,scale s:Double=1,rotation r:Double=0,mirror:Bool=false,stretch:Bool=false,_ body:()->Void) {
                let savedLocal=local,savedMeridian=meridian
                meridian=u
                local=CGAffineTransform(translationX:0,y:y*sy).rotated(by:r).scaledBy(x:(mirror ? -s:s)*sm,y:s*(stretch ? sy:sm))
                body()
                local=savedLocal;meridian=savedMeridian
            }
            // Nested placement inside a motif, in the motif's own coordinates.
            func place(_ x:Double,_ y:Double,scale s:Double=1,rotation r:Double=0,_ body:()->Void) {
                let saved=local
                local=CGAffineTransform(translationX:x,y:y).rotated(by:r).scaledBy(x:s,y:s).concatenating(saved)
                body()
                local=saved
            }
            func fill(_ path:CGPath,_ level:Double) {
                c.setFillColor(gray:level,alpha:1);c.addPath(warp(path));c.fillPath()
            }
            func line(_ pts:[(Double,Double)],_ level:Double,_ w:Double,cap:CGLineCap = .round) {
                let p=CGMutablePath();p.move(to:CGPoint(x:pts[0].0,y:pts[0].1))
                for q in pts.dropFirst() {p.addLine(to:CGPoint(x:q.0,y:q.1))}
                fill(p.copy(strokingWithWidth:w,lineCap:cap,lineJoin:.round,miterLimit:4),level)
            }
            func strokePath(_ p:CGPath,_ level:Double,_ w:Double) {
                fill(p.copy(strokingWithWidth:w,lineCap:.round,lineJoin:.round,miterLimit:4),level)
            }
            func ellipse(_ x:Double,_ y:Double,_ rx:Double,_ ry:Double,_ level:Double) {
                fill(CGPath(ellipseIn:CGRect(x:x-rx,y:y-ry,width:2*rx,height:2*ry),transform:nil),level)
            }
            func rect(_ x:Double,_ y:Double,_ w:Double,_ h:Double,_ r:Double,_ level:Double) {
                fill(CGPath(roundedRect:CGRect(x:x,y:y,width:w,height:h),cornerWidth:min(r,w/2-0.01),cornerHeight:min(r,h/2-0.01),transform:nil),level)
            }
            func clip(_ path:CGPath,_ body:()->Void) {
                c.saveGState();c.addPath(warp(path));c.clip();body();c.restoreGState()
            }
            func scaleOf(_ t:CGAffineTransform)->Double {sqrt(abs(t.a*t.d-t.b*t.c))}
            func rounded(_ path:CGPath,_ cx:Double,_ cy:Double,_ r:Double,_ high:Double,_ low:Double) {
                let p=map(CGPoint(x:cx,y:cy).applying(local))
                c.saveGState();c.addPath(warp(path));c.clip()
                c.translateBy(x:p.x,y:p.y);c.scaleBy(x:k(p.y),y:1)
                let g=CGGradient(colorSpace:CGColorSpaceCreateDeviceGray(),colorComponents:[high,1,low,1],locations:[0,1],count:2)!
                c.drawRadialGradient(g,startCenter:.zero,startRadius:0,endCenter:.zero,endRadius:r*scaleOf(local),options:.drawsAfterEndLocation)
                c.restoreGState()
            }
            func linear(_ path:CGPath,_ a:(Double,Double),_ b:(Double,Double),_ from:Double,_ to:Double) {
                let p=map(CGPoint(x:a.0,y:a.1).applying(local)),q=map(CGPoint(x:b.0,y:b.1).applying(local))
                c.saveGState();c.addPath(warp(path));c.clip()
                let g=CGGradient(colorSpace:CGColorSpaceCreateDeviceGray(),colorComponents:[from,1,to,1],locations:[0,1],count:2)!
                c.drawLinearGradient(g,start:p,end:q,options:[.drawsBeforeStartLocation,.drawsAfterEndLocation])
                c.restoreGState()
            }
            func P(_ x:Double,_ y:Double)->CGPoint {CGPoint(x:x,y:y)}

            // ---- layout (u relative to each half's hero meridian, y in mm above the bottom) ----
            // Two summits stand 180° apart; the cable hangs between their stations in two swags
            // and each cabin is climbing the rising half of its swag.
            let stationU=0.07,stationY=119.0,cabinU = -0.075,cabinScale=0.84,sag=36.0,chaletU = -0.175
            let sideU = -0.19,moonU = -0.125,cloudU=0.215,cloud2U = -0.25

            func bump(_ d:Double,_ w:Double)->Double {
                let x=d-0.5*(d/0.5).rounded();return exp(-(x/w)*(x/w))
            }
            func groundPath(_ h:Double,_ f:(Double)->Double)->CGMutablePath {
                let p=CGMutablePath()
                p.move(to:P(-0.02*width,0))
                let n=700
                for i in 0...n {let u = -0.02+1.04*Double(i)/Double(n);p.addLine(to:P(u*width,f(u-h)*sy))}
                p.addLine(to:P(1.02*width,0));p.closeSubpath();return p
            }
            func groundFill(_ path:CGPath,_ level:Double) {
                // Drawn straight onto the panorama; a short ramp keeps the lower edge free of a ledge.
                c.saveGState();c.addPath(path);c.clip()
                let g=CGGradient(colorSpace:CGColorSpaceCreateDeviceGray(),colorComponents:[0,1,level,1],locations:[0,1],count:2)!
                c.drawLinearGradient(g,start:P(0,0),end:P(0,7*sy),options:[.drawsAfterEndLocation])
                c.restoreGState()
            }

            func mountain(_ h:Double) {
                motif(h+stationU,0,stretch:true) {
                    let top=stationY
                    let o=CGMutablePath()
                    o.move(to:P(-96,14))
                    o.addCurve(to:P(-36,42),control1:P(-66,18),control2:P(-44,28))
                    o.addCurve(to:P(-28,94),control1:P(-30,56),control2:P(-32,80))
                    o.addCurve(to:P(-15,top-1),control1:P(-25,104),control2:P(-20,top-6))
                    o.addCurve(to:P(15,top-1),control1:P(-6,top+2.5),control2:P(6,top+2.5))
                    o.addCurve(to:P(28,98),control1:P(20,top-6),control2:P(24,106))
                    o.addCurve(to:P(50,58),control1:P(33,86),control2:P(42,68))
                    o.addCurve(to:P(98,18),control1:P(60,44),control2:P(78,26))
                    o.addLine(to:P(98,0));o.addLine(to:P(-96,0));o.closeSubpath()
                    // Paper-cut facets: the shaded body, a broad lit face up to a crisp ridge, a deeper
                    // shadow face behind a second ridge. Each step casts its own small shadow.
                    fill(o,0.36)
                    let lit=CGMutablePath()
                    lit.move(to:P(-120,0));lit.addLine(to:P(-120,top+10));lit.addLine(to:P(1,top+10))
                    lit.addCurve(to:P(9,88),control1:P(3,108),control2:P(10,98))
                    lit.addCurve(to:P(2,52),control1:P(8,76),control2:P(1,64))
                    lit.addCurve(to:P(-6,0),control1:P(3,36),control2:P(-2,16))
                    lit.closeSubpath()
                    clip(o) {linear(lit,(-40,50),(0,top),0.52,0.58)}
                    let deep=CGMutablePath()
                    deep.move(to:P(16,top-2))
                    deep.addCurve(to:P(30,80),control1:P(24,104),control2:P(30,92))
                    deep.addCurve(to:P(34,30),control1:P(30,62),control2:P(36,46))
                    deep.addLine(to:P(120,0));deep.addLine(to:P(120,top+10));deep.closeSubpath()
                    clip(o) {fill(deep,0.27)}
                    // A buttress leans against the foot of the lit face. Its ridge runs diagonally,
                    // so the face above it stays one broad plane instead of a narrow tongue.
                    let shoulder=CGMutablePath()
                    shoulder.move(to:P(-120,0));shoulder.addLine(to:P(-120,60))
                    shoulder.addCurve(to:P(-36,50),control1:P(-70,66),control2:P(-48,58))
                    shoulder.addCurve(to:P(-22,0),control1:P(-28,36),control2:P(-22,16))
                    shoulder.closeSubpath()
                    clip(o) {clip(lit) {fill(shoulder,0.47)}}
                    // A lower spur on the shadow side catches a little light as well.
                    let spur=CGMutablePath()
                    spur.move(to:P(120,0));spur.addLine(to:P(120,52))
                    spur.addCurve(to:P(44,48),control1:P(90,58),control2:P(60,54))
                    spur.addCurve(to:P(60,0),control1:P(34,40),control2:P(48,18))
                    spur.closeSubpath()
                    clip(o) {clip(deep) {fill(spur,0.33)}}
                    // Snow mantle over the summit with a scalloped hem and a tongue down the ridge.
                    let snow=CGMutablePath()
                    snow.move(to:P(-40,top+20))
                    snow.addLine(to:P(-40,top-22))
                    snow.addQuadCurve(to:P(-27,top-34),control:P(-29,top-22))
                    snow.addQuadCurve(to:P(-18,top-22),control:P(-21,top-32))
                    snow.addQuadCurve(to:P(-9,top-30),control:P(-14,top-21))
                    snow.addQuadCurve(to:P(0,top-21),control:P(-4,top-30))
                    snow.addQuadCurve(to:P(10,top-38),control:P(8,top-22))
                    snow.addQuadCurve(to:P(18,top-23),control:P(15,top-36))
                    snow.addQuadCurve(to:P(28,top-30),control:P(22,top-21))
                    snow.addLine(to:P(44,top-30));snow.addLine(to:P(44,top+20));snow.closeSubpath()
                    clip(o) {clip(snow) {
                        fill(o,0.72)
                        clip(deep) {fill(o,0.66)}
                        clip(lit) {linear(o,(-24,top-26),(0,top),0.82,0.88)}
                    }}
                    // A dashed zigzag climbs the lit face: the family's hiking trail.
                    let trail=CGMutablePath()
                    trail.move(to:P(-8,26))
                    trail.addCurve(to:P(-24,54),control1:P(8,36),control2:P(-40,42))
                    trail.addCurve(to:P(-8,72),control1:P(-12,60),control2:P(2,66))
                    trail.addCurve(to:P(-18,top-28),control1:P(-22,78),control2:P(-28,86))
                    clip(o) {clip(lit) {strokePath(trail.copy(dashingWithPhase:0,lengths:[3.4,2.8]),0.32,1.4)}}
                }
            }

            // A lower snow-tipped peak in the saddle, behind the swag's lowest point.
            func sidePeak(_ u:Double) {
                motif(u,0,stretch:true) {
                    let o=CGMutablePath()
                    o.move(to:P(-70,14))
                    o.addCurve(to:P(-24,46),control1:P(-50,20),control2:P(-34,34))
                    o.addCurve(to:P(0,74),control1:P(-16,56),control2:P(-6,70))
                    o.addCurve(to:P(26,48),control1:P(6,70),control2:P(16,58))
                    o.addCurve(to:P(70,14),control1:P(36,36),control2:P(52,20))
                    o.addLine(to:P(70,0));o.addLine(to:P(-70,0));o.closeSubpath()
                    fill(o,0.28)
                    let lit=CGMutablePath()
                    lit.move(to:P(-80,0));lit.addLine(to:P(-80,90));lit.addLine(to:P(0,90))
                    lit.addCurve(to:P(4,52),control1:P(2,70),control2:P(5,60))
                    lit.addCurve(to:P(-4,0),control1:P(3,40),control2:P(-2,16));lit.closeSubpath()
                    clip(o) {fill(lit,0.35)}
                    let snow=CGMutablePath()
                    snow.move(to:P(-20,80));snow.addLine(to:P(-20,60))
                    snow.addQuadCurve(to:P(-8,62),control:P(-14,57))
                    snow.addQuadCurve(to:P(1,57),control:P(-4,62))
                    snow.addQuadCurve(to:P(10,61),control:P(6,56))
                    snow.addQuadCurve(to:P(20,58),control:P(15,62))
                    snow.addLine(to:P(20,80));snow.closeSubpath()
                    clip(o) {fill(snow,0.44);clip(lit) {fill(snow,0.50)}}
                }
            }

            func conifer(_ u:Double,_ y:Double,_ size:Double,_ level:Double) {
                motif(u,y,scale:size) {
                    let p=CGMutablePath()
                    p.move(to:P(0,20))
                    p.addQuadCurve(to:P(4.2,13.5),control:P(2.6,17.5))
                    p.addLine(to:P(2.6,13.5))
                    p.addQuadCurve(to:P(6.2,7.2),control:P(4.8,11))
                    p.addLine(to:P(4.2,7.2))
                    p.addQuadCurve(to:P(7.8,1.6),control:P(6.6,4.6))
                    p.addLine(to:P(-7.8,1.6))
                    p.addQuadCurve(to:P(-4.2,7.2),control:P(-6.6,4.6))
                    p.addLine(to:P(-6.2,7.2))
                    p.addQuadCurve(to:P(-2.6,13.5),control:P(-4.8,11))
                    p.addLine(to:P(-4.2,13.5))
                    p.addQuadCurve(to:P(0,20),control:P(-2.6,17.5))
                    p.closeSubpath()
                    rect(-1.3,-1.5,2.6,4,0.6,level-0.06)
                    rounded(p,-1.5,12,16,level+0.06,level-0.06)
                }
            }

            func bullwheel(_ x:Double,_ y:Double,_ r:Double,_ level:Double) {
                ellipse(x,y,r,r,level);ellipse(x,y,r-1.4,r-1.4,level-0.30)
                for a in [0.0,Double.pi/3,2*Double.pi/3] {
                    line([(x+cos(a)*(r-1),y+sin(a)*(r-1)),(x-cos(a)*(r-1),y-sin(a)*(r-1))],level-0.06,1.0)
                }
                ellipse(x,y,1.6,1.6,level+0.04)
            }

            // Summit station: a timber hall astride the peak; the cable runs through both gables.
            let wheelX=10.5,wheelR=4.0,wheelY=6.0
            func summitStation(_ h:Double) {
                motif(h+stationU,stationY-0.5) {
                    rect(-16,0,32,14,1.2,0.92)
                    let roofFace=CGMutablePath()
                    roofFace.move(to:P(-19,13));roofFace.addLine(to:P(-8,21.5));roofFace.addLine(to:P(8,21.5));roofFace.addLine(to:P(19,13))
                    roofFace.addLine(to:P(17,11.4));roofFace.addLine(to:P(-17,11.4));roofFace.closeSubpath()
                    linear(roofFace,(0,21.5),(0,11),1.0,0.95)
                    line([(-17.8,12.6),(-7.6,20.6),(7.6,20.6),(17.8,12.6)],0.86,0.9)
                    for side in [-1.0,1.0] {
                        rect(side*wheelX-5.6,0.8,11.2,10.6,2,0.62)
                        bullwheel(side*wheelX,wheelY,wheelR,0.96)
                    }
                    rect(-2.6,0,5.2,8.5,1.8,0.66)
                    ellipse(0,15.6,2.2,2.2,0.72);ellipse(0,15.6,1.3,1.3,1.0)
                    line([(0,21.3),(0,30.5)],0.94,1.2)
                    let flag=CGMutablePath()
                    flag.move(to:P(0.4,30.4))
                    flag.addCurve(to:P(8,27.8),control1:P(3,31.4),control2:P(5.6,27.2))
                    flag.addLine(to:P(0.4,26.2));flag.closeSubpath()
                    fill(flag,0.96)
                }
            }

            // A chalet in the valley with lit windows.
            func chalet(_ u:Double,_ y:Double) {
                motif(u,y) {
                    rect(-9,0,18,11,1,0.80)
                    let roof=CGMutablePath()
                    roof.move(to:P(-12,10));roof.addLine(to:P(0,19));roof.addLine(to:P(12,10));roof.addLine(to:P(10,8.6))
                    roof.addLine(to:P(-10,8.6));roof.closeSubpath()
                    linear(roof,(0,19),(0,9),0.92,0.82)
                    rect(4.5,13.5,2.6,5,0.5,0.84)
                    rect(-6.5,4,5,4.4,1,0.54);line([(-4,4),(-4,8.4)],0.80,0.8)
                    rect(2,0,4.2,7,1.4,0.58)
                    ellipse(0,13.2,1.5,1.5,0.56)
                }
            }

            func cabin(_ u:Double,_ y:Double,_ slope:Double) {
                motif(u,y/sy,scale:cabinScale) {   // y arrives in artwork millimetres from the swag
                    // Carriage riding the cable, tilted with it.
                    place(0,0,rotation:slope) {
                        rect(-13,-3.2,26,6.4,3,0.88)
                        for x in [-7.0,7.0] {ellipse(x,1.6,3.6,3.6,0.97);ellipse(x,1.6,1.4,1.4,0.72)}
                        for x in [-11.0,0,11.0] {ellipse(x,-1.6,0.7,0.7,0.70)}
                    }
                    // Hanger, pivot and the yoke on the roof.
                    rect(-1.8,-16,3.6,15,1.2,0.90)
                    ellipse(0,-1.5,2.4,2.4,0.95);ellipse(0,-1.5,1,1,0.72)
                    rect(-8,-17.6,16,3,1.4,0.90)
                    // Roof: a rounded cap overhanging the body, with a lantern at the front.
                    let roof=CGMutablePath()
                    roof.move(to:P(-28,-23))
                    roof.addCurve(to:P(-21,-16),control1:P(-28,-19),control2:P(-25,-16))
                    roof.addLine(to:P(21,-16))
                    roof.addCurve(to:P(28,-23),control1:P(25,-16),control2:P(28,-19))
                    roof.closeSubpath()
                    rounded(roof,-4,-17,32,0.97,0.86)
                    ellipse(23,-15.2,2.5,2.5,0.98);ellipse(23,-15.2,1.2,1.2,0.80)
                    // Body: wider at the roof than at the floor, like the classic Swiss cabins.
                    let body=CGMutablePath()
                    body.move(to:P(-26,-23))
                    body.addLine(to:P(26,-23))
                    body.addCurve(to:P(20,-58),control1:P(25,-36),control2:P(22.5,-49))
                    body.addCurve(to:P(12,-64),control1:P(18.8,-62),control2:P(16,-64))
                    body.addLine(to:P(-12,-64))
                    body.addCurve(to:P(-20,-58),control1:P(-16,-64),control2:P(-18.8,-62))
                    body.addCurve(to:P(-26,-23),control1:P(-22.5,-49),control2:P(-25,-36))
                    body.closeSubpath()
                    rounded(body,-7,-33,50,0.97,0.80)
                    // Recessed window band following the slanted sides, three panes and passengers.
                    let glass=CGMutablePath()
                    glass.move(to:P(-19,-27));glass.addLine(to:P(19,-27))
                    glass.addQuadCurve(to:P(22.2,-30.5),control:P(22.6,-27))
                    glass.addLine(to:P(20.4,-41.5))
                    glass.addQuadCurve(to:P(17,-44),control:P(20,-44))
                    glass.addLine(to:P(-17,-44))
                    glass.addQuadCurve(to:P(-20.4,-41.5),control:P(-20,-44))
                    glass.addLine(to:P(-22.2,-30.5))
                    glass.addQuadCurve(to:P(-19,-27),control:P(-22.6,-27))
                    glass.closeSubpath()
                    fill(glass,0.50)
                    clip(glass) {
                        ellipse(-13.5,-33.6,3.3,3.5,0.76);ellipse(-13.5,-42.5,6.4,4.6,0.72)
                        ellipse(0,-35.6,3.0,3.1,0.80);ellipse(0,-43.4,5.2,4.0,0.76)
                        line([(3.2,-40),(5.0,-32.6)],0.80,2.0);ellipse(5.3,-31.5,1.6,1.6,0.82)
                        ellipse(13.2,-36.4,3.2,3.0,0.76);ellipse(16.5,-37.6,2.3,1.6,0.76)
                        place(10.8,-36.2,rotation:0.35) {ellipse(0,0,1.3,2.6,0.70)}
                        ellipse(13.6,-43.2,5.6,3.6,0.72)
                    }
                    line([(-6.8,-44),(-7.2,-27)],0.94,2.2,cap:.butt);line([(6.8,-44),(7.2,-27)],0.94,2.2,cap:.butt)
                    // Waist band, door, edelweiss badge, rivets and a keel rail.
                    let band=CGMutablePath()
                    band.move(to:P(-30,-47.5));band.addLine(to:P(30,-47.5));band.addLine(to:P(30,-50.5));band.addLine(to:P(-30,-50.5));band.closeSubpath()
                    clip(body) {fill(band,0.68)}
                    strokePath(CGPath(roundedRect:CGRect(x:7,y:-61,width:10,height:10.5),cornerWidth:2,cornerHeight:2,transform:nil),0.66,0.9)
                    ellipse(15,-56,0.9,0.9,0.70)
                    place(-8,-56.2) {
                        for i in 0..<6 {
                            let a=Double(i)*Double.pi/3+Double.pi/2
                            place(cos(a)*2.5,sin(a)*2.5,rotation:a-Double.pi/2) {ellipse(0,0,1.2,2.4,0.74)}
                        }
                        ellipse(0,0,1.3,1.3,0.97)
                    }
                    for x in stride(from:-15.0,through:3,by:4.5) {ellipse(x,-61.2,0.75,0.75,0.68)}
                    rect(-14,-67.2,28,4,2,0.86)
                }
            }

            func cloud(_ u:Double,_ y:Double,_ s:Double,_ mirror:Bool=false) {
                motif(u,y,scale:s,mirror:mirror) {
                    let o=CGMutablePath()
                    o.move(to:P(-20,-7))
                    o.addCurve(to:P(-21,8),control1:P(-32,-6),control2:P(-31,8))
                    o.addCurve(to:P(-9,16),control1:P(-24,19),control2:P(-14,24))
                    o.addCurve(to:P(12,15),control1:P(-9,32),control2:P(14,30))
                    o.addCurve(to:P(23,6),control1:P(23,21),control2:P(30,14))
                    o.addCurve(to:P(21,-7),control1:P(34,6),control2:P(33,-7))
                    o.addCurve(to:P(-20,-7),control1:P(10,-10),control2:P(-9,-10))
                    o.closeSubpath()
                    rounded(o,0,7,34,0.82,0.66)
                }
            }

            func star(_ u:Double,_ y:Double,_ r:Double) {
                motif(u,y) {
                    let p=CGMutablePath()
                    for i in 0..<10 {
                        let a=Double.pi/2+Double(i)*Double.pi/5,d=i%2==0 ? r:r*0.46
                        if i==0 {p.move(to:P(cos(a)*d,sin(a)*d))} else {p.addLine(to:P(cos(a)*d,sin(a)*d))}
                    }
                    p.closeSubpath();fill(p,0.80)
                }
            }

            func moon(_ u:Double,_ y:Double,_ r:Double) {
                motif(u,y) {
                    // Join the two circle arcs at their exact intersections, as Night Flight does.
                    let dx=0.48,dy=0.28,inner=0.89,d=hypot(dx,dy)
                    let direction=atan2(dy,dx),half=acos((1-inner*inner+d*d)/(2*d))
                    let upper=direction+half,lower=direction-half
                    let m=CGMutablePath()
                    m.addArc(center:.zero,radius:r,startAngle:upper,endAngle:lower+2*Double.pi,clockwise:false)
                    m.addArc(center:P(dx*r,dy*r),radius:inner*r,startAngle:atan2(sin(lower)-dy,cos(lower)-dx),
                             endAngle:atan2(sin(upper)-dy,cos(upper)-dx),clockwise:true)
                    m.closeSubpath();fill(m,0.88)
                }
            }

            let halves=[0.02,0.52].flatMap {h in (-1...1).map {h+Double($0)}}
            // Back hills: one range all round, rising behind each mountain.
            groundFill(groundPath(0.02) {d in 26+5*cos(4*Double.pi*d*3)+10*bump(d-stationU,0.12)+6*bump(d-cabinU,0.05)},0.22)
            for h in halves {sidePeak(h+sideU)}
            for h in halves {mountain(h)}
            // Front meadow in front of the mountain bases.
            groundFill(groundPath(0.02) {d in 11+2.5*cos(4*Double.pi*d*5)+5*bump(d-chaletU,0.05)+4*bump(d-stationU-0.05,0.05)},0.56)
            // The cable: a parabolic swag from one summit station to the next, drawn on the panorama.
            let wheelTop=(stationY-0.5)*sy+(wheelY+wheelR)*sm
            let half=0.25-wheelX*sm*k(wheelTop)/width   // the swag spans ±0.25 minus the stations' wheel offset
            func swagY(_ d:Double)->Double {   // d: u relative to this half's lowest point
                let f=d/half
                return wheelTop-sag*sy*(1-f*f)
            }
            for h in halves {
                let low=h+stationU-0.25
                let p=CGMutablePath()
                for i in 0...240 {
                    let d = -half+2*half*Double(i)/240
                    let q=P((low+d)*width,swagY(d))
                    if i==0 {p.move(to:q)} else {p.addLine(to:q)}
                }
                c.setStrokeColor(gray:0.88,alpha:1);c.setLineWidth(max(1.2,2.1*sm));c.setLineCap(.round);c.setLineJoin(.round)
                c.addPath(p);c.strokePath()
            }
            for h in halves {
                summitStation(h)
                for (du,y,s,l) in [(-0.235,10.0,1.1,0.76),(-0.115,10.0,1.0,0.74),(0.215,9.0,1.05,0.74)] {
                    conifer(h+du,y,s,l)
                }
                chalet(h+chaletU,12)
                let low=h+stationU-0.25,d=h+cabinU-low
                let gy=swagY(d)
                let slopeDrawing=2*sag*sy*d/(half*half)/width   // dy per drawing mm
                cabin(h+cabinU,gy,atan(slopeDrawing*k(gy)))
                moon(h+moonU,132,11)
                cloud(h+cloudU,60,0.5)
                cloud(h+cloud2U,126,0.5,true)
                for (du,y,r) in [(-0.03,145.0,3.6),(0.045,128.0,2.6),(-0.16,128.0,3.0),(-0.20,104.0,2.6),(0.19,138.0,3.4),
                                 (0.215,106.0,2.6),(0.07,146.0,2.8),(-0.075,112.0,2.2),(-0.12,104.0,2.0)] {
                    star(h+du,y,r)
                }
            }
        }
        return bytes.map {Float($0)/255}
    }
}
