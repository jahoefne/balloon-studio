import Foundation
import CoreGraphics
// Dash elements of Summit's hiking trail (SummitCableCar.swift:208-213), in motif coordinates as the Swift code dashes it.
// Output: ../cg-dash-summit-trail.txt (macOS 26.6.2).
func P(_ x:Double,_ y:Double)->CGPoint {CGPoint(x:x,y:y)}
let top=119.0
let trail=CGMutablePath()
trail.move(to:P(-8,26))
trail.addCurve(to:P(-24,54),control1:P(8,36),control2:P(-40,42))
trail.addCurve(to:P(-8,72),control1:P(-12,60),control2:P(2,66))
trail.addCurve(to:P(-18,top-28),control1:P(-22,78),control2:P(-28,86))
let dashed=trail.copy(dashingWithPhase:0,lengths:[3.4,2.8])
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
