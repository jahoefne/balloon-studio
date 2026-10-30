import Foundation
import CoreGraphics
func rect(_ r:CGRect)->String {r.isNull ? "null":"(\(r.minX),\(r.minY),\(r.width),\(r.height))"}
func P(_ x:Double,_ y:Double)->CGPoint {CGPoint(x:x,y:y)}
func stroked(_ name:String,_ p:CGPath,_ w:Double=2,cap:CGLineCap = .butt,join:CGLineJoin = .miter,limit:Double=10) {
  let s=p.copy(strokingWithWidth:w,lineCap:cap,lineJoin:join,miterLimit:limit)
  print("stroke \(name) cap=\(cap.rawValue) join=\(join.rawValue) limit=\(limit): empty=\(s.isEmpty) bbox=\(rect(s.boundingBoxOfPath))")
}
func dashed(_ name:String,_ p:CGPath,_ lengths:[CGFloat],phase:Double=0) {
  let s=p.copy(dashingWithPhase:phase,lengths:lengths)
  var t=""
  s.applyWithBlock {e in
    let q=e.pointee.points
    switch e.pointee.type {
    case .moveToPoint: t+=" M(\(q[0].x),\(q[0].y))"
    case .addLineToPoint: t+=" L(\(q[0].x),\(q[0].y))"
    case .addQuadCurveToPoint: t+=" Q(\(q[1].x),\(q[1].y))"
    case .addCurveToPoint: t+=" C(\(q[2].x),\(q[2].y))"
    case .closeSubpath: t+=" Z"
    @unknown default: break
    }
  }
  print("dash \(name) \(lengths) phase=\(phase):\(t)")
}
// lone points
let m=CGMutablePath();m.move(to:P(5,5))
let ml=CGMutablePath();ml.move(to:P(5,5));ml.addLine(to:P(5,5))
let mz=CGMutablePath();mz.move(to:P(5,5));mz.closeSubpath()
let mlz=CGMutablePath();mlz.move(to:P(5,5));mlz.addLine(to:P(5,5));mlz.closeSubpath()
for cap in [CGLineCap.butt,.round,.square] {
  stroked("M",m,2,cap:cap);stroked("ML0",ml,2,cap:cap);stroked("MZ",mz,2,cap:cap);stroked("ML0Z",mlz,2,cap:cap)
}
// miter threshold: a 90 degree corner has ratio sqrt2; limit below and above
let corner=CGMutablePath();corner.move(to:P(0,0));corner.addLine(to:P(10,0));corner.addLine(to:P(10,10))
stroked("corner",corner,2,join:.miter,limit:10)
stroked("corner",corner,2,join:.miter,limit:1.5)
stroked("corner",corner,2,join:.miter,limit:1.4)
stroked("corner",corner,2,join:.bevel)
stroked("corner",corner,2,join:.round)
stroked("corner",corner,2,cap:.square)
stroked("corner",corner,2,cap:.round)
// closed rounded rect has no caps
stroked("rrect",CGPath(roundedRect:CGRect(x:0,y:0,width:20,height:10),cornerWidth:3,cornerHeight:3,transform:nil),2,cap:.round,join:.miter)
// u-turn
let u=CGMutablePath();u.move(to:P(0,0));u.addLine(to:P(10,0));u.addLine(to:P(0,0))
stroked("uturn",u,2,join:.miter);stroked("uturn",u,2,join:.round);stroked("uturn",u,2,join:.bevel)
// dash
let line=CGMutablePath();line.move(to:P(0,0));line.addLine(to:P(100,0))
dashed("line",line,[8,5]);dashed("line",line,[8,5],phase:3);dashed("line",line,[8,5],phase:10);dashed("line",line,[8,5],phase:-3);dashed("line",line,[8,5],phase:13)
dashed("line",line,[30]);dashed("line",line,[30,10,5]);dashed("line",line,[0,25]);dashed("line",line,[25,0]);dashed("line",line,[])
let sq=CGMutablePath();sq.addRect(CGRect(x:0,y:0,width:10,height:10))
dashed("square",sq,[7,3]);dashed("square",sq,[10,0]);dashed("square",sq,[40,5]);dashed("square",sq,[6,6],phase:2)
let two=CGMutablePath();two.move(to:P(0,0));two.addLine(to:P(4,0));two.move(to:P(0,5));two.addLine(to:P(4,5))
dashed("two",two,[3,2])
let poly=CGMutablePath();poly.move(to:P(0,0));poly.addLine(to:P(4,0));poly.addLine(to:P(4,4))
dashed("poly",poly,[6,1])
let q=CGMutablePath();q.move(to:P(0,0));q.addCurve(to:P(10,0),control1:P(0,10),control2:P(10,10))
dashed("curve",q,[3.4,2.8])
dashed("lone",m,[3,2]);dashed("ML0",ml,[3,2])
