import Foundation
import CoreText
import CoreGraphics

enum BalloonTextFont:String,Codable,CaseIterable,Identifiable,Sendable {
    case rounded = "Rounded", sans = "Sans serif", serif = "Serif", handwritten = "Handwritten", mono = "Monospaced"
    var id:String {rawValue}
    var postScriptName:String {
        switch self {
        case .rounded:return "ArialRoundedMTBold"
        case .sans:return "Helvetica-Bold"
        case .serif:return "Georgia-Bold"
        case .handwritten:return "ChalkboardSE-Bold"
        case .mono:return "Menlo-Bold"
        }
    }
}

// Shape once with Core Text, including kerning, accents and fallback fonts. The immutable
// mask is shared by all triangle samples; no font work happens in the per-face loop.
struct BalloonTextMask:Sendable {
    let width:Int
    let height:Int
    let aspect:Double
    let pixels:[UInt8]
    private let sums:[Int32]

    init?(text:String,font:BalloonTextFont) {
        let message=text.trimmingCharacters(in:.whitespacesAndNewlines)
        guard !message.isEmpty else {return nil}
        let typeface=CTFontCreateWithName(font.postScriptName as CFString,100,nil)
        let attributes=[NSAttributedString.Key(kCTFontAttributeName as String):typeface]
        let line=CTLineCreateWithAttributedString(NSAttributedString(string:message,attributes:attributes))
        let path=CGMutablePath()
        for run in CTLineGetGlyphRuns(line) as! [CTRun] {
            let count=CTRunGetGlyphCount(run)
            var glyphs=Array(repeating:CGGlyph(),count:count)
            var positions=Array(repeating:CGPoint.zero,count:count)
            CTRunGetGlyphs(run,CFRange(location:0,length:0),&glyphs)
            CTRunGetPositions(run,CFRange(location:0,length:0),&positions)
            let runFont=(CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
            let matrix=CTRunGetTextMatrix(run)
            for i in 0..<count {
                guard let glyph=CTFontCreatePathForGlyph(runFont,glyphs[i],nil) else {continue}
                var transform=matrix
                transform.tx += positions[i].x;transform.ty += positions[i].y
                path.addPath(glyph,transform:transform)
            }
        }
        let bounds=path.boundingBoxOfPath
        guard !bounds.isNull,bounds.width>0,bounds.height>0 else {return nil}
        aspect=Double(bounds.width/bounds.height)
        let scale=min(256/bounds.height,8192/bounds.width)
        let width=max(1,Int(ceil(bounds.width*scale))),height=max(1,Int(ceil(bounds.height*scale)))
        self.width=width;self.height=height
        var bytes=Array(repeating:UInt8(0),count:width*height)
        let rendered=bytes.withUnsafeMutableBytes {buffer -> Bool in
            guard let context=CGContext(data:buffer.baseAddress,width:width,height:height,bitsPerComponent:8,
                                        bytesPerRow:width,space:CGColorSpaceCreateDeviceGray(),bitmapInfo:CGImageAlphaInfo.none.rawValue) else {return false}
            context.setShouldAntialias(false)
            context.setFillColor(gray:1,alpha:1)
            // Store row zero at the glyph's bottom, matching the balloon's upward Z axis.
            context.translateBy(x:0,y:CGFloat(height));context.scaleBy(x:1,y:-1)
            context.scaleBy(x:CGFloat(width)/bounds.width,y:CGFloat(height)/bounds.height)
            context.translateBy(x:-bounds.minX,y:-bounds.minY)
            context.addPath(path);context.fillPath()
            return true
        }
        guard rendered,bytes.contains(where:{$0>0}) else {return nil}
        pixels=bytes
        var integral=Array(repeating:Int32(0),count:(width+1)*(height+1))
        for y in 0..<height {
            var row:Int32=0
            for x in 0..<width {
                row += bytes[y*width+x]>0 ? 1:0
                integral[(y+1)*(width+1)+x+1]=integral[y*(width+1)+x+1]+row
            }
        }
        sums=integral
    }

    func contains(x:Double,y:Double) -> Bool {
        guard x>=0,x<1,y>=0,y<1 else {return false}
        return pixels[min(height-1,Int(y*Double(height)))*width+min(width-1,Int(x*Double(width)))]>0
    }

    // A summed-area table catches ink even when every triangle sample misses a glyph.
    func crossesBoundary(minX:Double,maxX:Double,minY:Double,maxY:Double) -> Bool {
        guard maxX>=0,minX<=1,maxY>=0,minY<=1 else {return false}
        let x0=max(0,Int(floor(max(0,minX)*Double(width))))
        let x1=min(width,Int(ceil(min(1,maxX)*Double(width)))+1)
        let y0=max(0,Int(floor(max(0,minY)*Double(height))))
        let y1=min(height,Int(ceil(min(1,maxY)*Double(height)))+1)
        guard x1>x0,y1>y0 else {return false}
        let stride=width+1
        let ink=sums[y1*stride+x1]-sums[y0*stride+x1]-sums[y1*stride+x0]+sums[y0*stride+x0]
        return ink>0 && (ink<Int32((x1-x0)*(y1-y0)) || minX<0 || maxX>1 || minY<0 || maxY>1)
    }
}

struct BalloonTextLayout:Sendable {
    let mask:BalloonTextMask
    let height:Double
    let bottom:Double
    let angularWidth:Double
    let step:Double
    let nominalRadius:Double
    // Face the starting preview camera with the first copy, even at a repeat count of one.
    static let origin = -Double.pi/3
    var fittedWidth:Double {height*mask.aspect}
    var resolution:Double {min(0.35,max(0.06,height/32))}

    init?(settings:PatternSettings,parameters p:BalloonParameters) {
        guard let mask=BalloonTextMask(text:settings.text,font:settings.textFont) else {return nil}
        self.mask=mask
        step=2*Double.pi/Double(settings.textRepeats)
        nominalRadius=p.diameter*0.45
        // Leave a gap between copies and fit both dimensions with one scale factor.
        height=min(settings.textHeight,step*nominalRadius*0.78/mask.aspect)
        angularWidth=height*mask.aspect/nominalRadius
        bottom=p.neckHeight+(p.height-p.neckHeight)*0.55-height/2
    }

    func color(at v:Point3,normal:Point3) -> Int {
        guard v.z>=bottom,v.z<=bottom+height,normal.x*v.x+normal.y*v.y>0 else {return 0}
        let angle=atan2(v.y,v.x)-Self.origin
        let delta=angle-step*(angle/step).rounded()
        return mask.contains(x:delta/angularWidth+0.5,y:(v.z-bottom)/height) ? 1:0
    }

    func needsRefinement(_ a:Point3,_ b:Point3,_ c:Point3,normal:Point3) -> Bool {
        let center=(a+b+c)*(1.0/3)
        guard normal.x*center.x+normal.y*center.y>0,
              max(a.z,b.z,c.z)>=bottom,min(a.z,b.z,c.z)<=bottom+height else {return false}
        // Unwrap all three angles together so a triangle crossing ±π is local too.
        let first=atan2(a.y,a.x)
        func unwrap(_ p:Point3) -> Double {
            let delta=atan2(p.y,p.x)-first
            return first+atan2(sin(delta),cos(delta))
        }
        let angles=[first,unwrap(b),unwrap(c)]
        let middle=angles.reduce(0,+)/3
        let copy=Self.origin+step*((middle-Self.origin)/step).rounded()
        let xs=angles.map {($0-copy)/angularWidth+0.5}
        let ys=[a,b,c].map {($0.z-bottom)/height}
        let minX=xs.min()!,maxX=xs.max()!,minY=ys.min()!,maxY=ys.max()!
        guard max((maxX-minX)*fittedWidth,(maxY-minY)*height)>resolution else {return false}
        return mask.crossesBoundary(minX:minX,maxX:maxX,minY:minY,maxY:maxY)
    }
}
