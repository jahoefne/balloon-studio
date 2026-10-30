import Foundation
import CoreGraphics
// CGMutablePath.addArc element lists as JSON lines: {"name","s","e","cw","cx","cy","r","prefix","elements":[[type,x,y,...],...],"current":[x,y]}
func elements(_ p:CGPath)->[[Double]] {
  var o:[[Double]]=[]
  p.applyWithBlock {e in
    let q=e.pointee.points
    switch e.pointee.type {
    case .moveToPoint: o.append([0,q[0].x,q[0].y])
    case .addLineToPoint: o.append([1,q[0].x,q[0].y])
    case .addQuadCurveToPoint: o.append([2,q[0].x,q[0].y,q[1].x,q[1].y])
    case .addCurveToPoint: o.append([3,q[0].x,q[0].y,q[1].x,q[1].y,q[2].x,q[2].y])
    case .closeSubpath: o.append([4])
    @unknown default: break
    }
  }
  return o
}
func js(_ d:Double)->String {"\(d)"}
func arr(_ a:[Double])->String {"["+a.map(js).joined(separator:",")+"]"}
let pi=Double.pi
let cases:[(Double,Double,Bool)]=[
  (0,0,false),(0,2*pi,false),(0,4*pi,false),(0,-0.5,false),(0,0.5,true),(0,7,false),(0,-7,true),(1,1+1e-9,true),
  (0,-7,false),(0,7,true),(0,0,true),(0,-13,false),(0,pi/2,true),(0,-pi/2,false),(0,2*pi,true),(0,-2*pi,true),
]
let geom:[(Double,Double,Double)]=[(0,0,1),(0.48,0.28,0.89),(30,-12,7.5)]
for prefixed in [false,true] { for (cx,cy,r) in geom { for (s,e,cw) in cases {
  let p=CGMutablePath()
  if prefixed {p.move(to:CGPoint(x:9,y:9))}
  p.addArc(center:CGPoint(x:cx,y:cy),radius:r,startAngle:s,endAngle:e,clockwise:cw)
  print("{\"s\":\(js(s)),\"e\":\(js(e)),\"cw\":\(cw),\"cx\":\(js(cx)),\"cy\":\(js(cy)),\"r\":\(js(r)),\"prefix\":\(prefixed),\"elements\":[\(elements(p).map(arr).joined(separator:","))],\"current\":[\(js(p.currentPoint.x)),\(js(p.currentPoint.y))]}")
}}}
