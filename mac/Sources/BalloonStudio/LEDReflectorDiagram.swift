import SwiftUI

/// An actual radial cross section, with the LED envelope shown schematically.
struct LEDReflectorDiagram:View {
    let parameters:RingParameters
    var body:some View {
        VStack(spacing:5) {
            Text("UPWARD LIGHT · CROSS SECTION").font(.system(size:9,weight:.semibold)).foregroundStyle(.secondary)
            Canvas {context,size in
                let p=parameters
                let scale=min((size.width-16)/p.bandWidth,(size.height-28)/p.totalHeight)
                let left=(size.width-p.bandWidth*scale)/2,bottom=size.height-8
                func point(_ r:Double,_ z:Double) -> CGPoint {CGPoint(x:left+(r-p.innerRadius)*scale,y:bottom-z*scale)}
                var body=Path();body.move(to:point(p.innerRadius,0))
                for v in p.outerProfile {body.addLine(to:point(v.radius,v.z))}
                body.addLine(to:point(p.innerRadius,p.height));body.closeSubpath()
                context.fill(body,with:.color(.white))
                context.stroke(body,with:.color(ink.opacity(0.4)),lineWidth:1)
                let a=point(p.ledWallRadius-p.stripThickness,p.ledShelfZ+p.stripWidth)
                context.fill(Path(CGRect(x:a.x,y:a.y,width:p.stripThickness*scale,height:p.stripWidth*scale)),with:.color(accent))
                let middle=p.ledShelfZ+p.stripWidth/2
                let ramp=p.reflectorToeRadius-(middle-p.height)
                var light=Path();light.move(to:point(p.ledWallRadius-p.stripThickness-0.4,middle))
                light.addLine(to:point(ramp+0.2,middle))
                light.addLine(to:point(ramp+3,p.totalHeight+3))
                context.stroke(light,with:.color(accent),style:StrokeStyle(lineWidth:1.5,dash:[3,2]))
                let tip=point(ramp+3,p.totalHeight+3)
                var arrow=Path();arrow.move(to:CGPoint(x:tip.x-4,y:tip.y+5));arrow.addLine(to:tip);arrow.addLine(to:CGPoint(x:tip.x+4,y:tip.y+5))
                context.stroke(arrow,with:.color(accent),lineWidth:1.5)
            }
            HStack {Text("Ring centre");Spacer();Text("Outer wall · LED")}.font(.system(size:9)).foregroundStyle(.secondary)
        }.accessibilityElement(children:.ignore)
            .accessibilityLabel("Radial cross section: the strip stands vertically against the outer wall on a ledge. It faces a 45 degree white reflector with an inner shielding lip. Light escapes through the open top; the solid floor blocks direct sight from below. The arrow is schematic, not an optical simulation.")
    }
}
