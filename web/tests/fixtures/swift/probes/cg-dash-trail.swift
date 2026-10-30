import Foundation
import CoreGraphics
// Dash elements of one Night Flight trail (NightFlight.swift:42-51, u = 0.52), and whether the context dashes like
// copy(dashingWithPhase:). Arguments: width height diameter columns rows of a relief-night-flight-* raster JSON.
// Output for the three shapes, with a `shape <name>` line in front of each: ../cg-dash-trail.txt (macOS 26.6.2).
let width=Double(CommandLine.arguments[1])!,height=Double(CommandLine.arguments[2])!,diameter=Double(CommandLine.arguments[3])!
let columns=Int(CommandLine.arguments[4])!,rows=Int(CommandLine.arguments[5])!
let scale=min(diameter*0.006,height*0.0105)
func position(_ x:Double,_ y:Double)->CGPoint {CGPoint(x:x*width,y:y*height)}
let u=0.52
let tail=position(u+(-55*cos(0.25)+2*sin(0.25))*scale/width,0.52+(-55*sin(0.25)-2*cos(0.25))*scale/height)
let p=CGMutablePath()
p.move(to:position(u-0.24,0.36))
p.addCurve(to:position(u-0.18,0.23),control1:position(u-0.23,0.20),control2:position(u-0.20,0.18))
p.addCurve(to:position(u-0.16,0.39),control1:position(u-0.12,0.33),control2:position(u-0.11,0.53))
p.addCurve(to:position(u-0.20,0.36),control1:position(u-0.21,0.56),control2:position(u-0.25,0.41))
p.addCurve(to:tail,control1:position(u-0.18,0.23),control2:CGPoint(x:tail.x-width*0.05,y:tail.y-height*0.07))
let lengths:[CGFloat]=[max(1.8,3.8*scale),max(2,4.5*scale)]
print("lengths",lengths[0],lengths[1],"line",max(1.1,2.0*scale))
p.applyWithBlock {e in
  let q=e.pointee.points
  switch e.pointee.type {
  case .moveToPoint: print("SRC M",q[0].x,q[0].y)
  case .addLineToPoint: print("SRC L",q[0].x,q[0].y)
  case .addCurveToPoint: print("SRC C",q[0].x,q[0].y,q[1].x,q[1].y,q[2].x,q[2].y)
  default: print("SRC ?")
  }
}
let dashed=p.copy(dashingWithPhase:0,lengths:lengths)
dashed.applyWithBlock {e in
  let q=e.pointee.points
  switch e.pointee.type {
  case .moveToPoint: print("M",q[0].x,q[0].y)
  case .addLineToPoint: print("L",q[0].x,q[0].y)
  case .addQuadCurveToPoint: print("Q",q[0].x,q[0].y,q[1].x,q[1].y)
  case .addCurveToPoint: print("C",q[0].x,q[0].y,q[1].x,q[1].y,q[2].x,q[2].y)
  case .closeSubpath: print("Z")
  @unknown default: break
  }
}
func draw(_ body:(CGContext)->Void)->[UInt8] {
  var bytes=Array(repeating:UInt8(0),count:columns*rows)
  bytes.withUnsafeMutableBytes {b in
    let c=CGContext(data:b.baseAddress,width:columns,height:rows,bitsPerComponent:8,bytesPerRow:columns,space:CGColorSpaceCreateDeviceGray(),bitmapInfo:CGImageAlphaInfo.none.rawValue)!
    c.translateBy(x:0,y:CGFloat(rows));c.scaleBy(x:1,y:-1)
    c.scaleBy(x:Double(columns)/width,y:Double(rows)/height)
    c.setStrokeColor(gray:0.62,alpha:1);c.setLineWidth(max(1.1,2.0*scale));c.setLineCap(.round)
    body(c)
  }
  return bytes
}
let direct=draw {c in c.setLineDash(phase:0,lengths:lengths);c.addPath(p);c.strokePath()}
let viaCopy=draw {c in c.addPath(dashed);c.strokePath()}
var diff=0,worst=0
for i in direct.indices {let d=abs(Int(direct[i])-Int(viaCopy[i]));if d>0 {diff+=1};worst=max(worst,d)}
print("context-vs-copy differing",diff,"worst",worst)
