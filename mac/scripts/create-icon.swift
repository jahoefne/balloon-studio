import AppKit

let output=URL(fileURLWithPath:CommandLine.arguments[1])
try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
var iconPayload=Data()
func bigEndian(_ value:Int) -> Data {
    var word=UInt32(value).bigEndian
    return withUnsafeBytes(of:&word) {Data($0)}
}
for size in [16,32,64,128,256,512,1024] {
    let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:size,pixelsHigh:size,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
    let context=NSGraphicsContext(bitmapImageRep:rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current=context
    context.cgContext.scaleBy(x:CGFloat(size)/1024,y:CGFloat(size)/1024)
    let background=NSBezierPath(roundedRect:NSRect(x:40,y:40,width:944,height:944),xRadius:212,yRadius:212)
    NSGradient(starting:NSColor(calibratedRed:0.16,green:0.46,blue:0.40,alpha:1),ending:NSColor(calibratedRed:0.05,green:0.23,blue:0.23,alpha:1))!.draw(in:background,angle:-90)
    let balloon=NSBezierPath()
    balloon.move(to:NSPoint(x:472,y:163))
    balloon.line(to:NSPoint(x:552,y:163))
    balloon.curve(to:NSPoint(x:819,y:624),controlPoint1:NSPoint(x:552,y:310),controlPoint2:NSPoint(x:819,y:390))
    balloon.curve(to:NSPoint(x:512,y:898),controlPoint1:NSPoint(x:819,y:785),controlPoint2:NSPoint(x:693,y:898))
    balloon.curve(to:NSPoint(x:205,y:624),controlPoint1:NSPoint(x:331,y:898),controlPoint2:NSPoint(x:205,y:785))
    balloon.curve(to:NSPoint(x:472,y:163),controlPoint1:NSPoint(x:205,y:390),controlPoint2:NSPoint(x:472,y:310))
    balloon.close()
    NSGradient(starting:NSColor(calibratedRed:1,green:0.80,blue:0.48,alpha:1),ending:NSColor(calibratedRed:0.87,green:0.43,blue:0.18,alpha:1))!.draw(in:balloon,angle:-50)
    NSGraphicsContext.saveGraphicsState()
    balloon.addClip()
    for offset in [-0.72,-0.37,0.0,0.37,0.72] {
        let line=NSBezierPath()
        line.move(to:NSPoint(x:512,y:898))
        line.curve(to:NSPoint(x:512+offset*30,y:163),controlPoint1:NSPoint(x:512+offset*460,y:808),controlPoint2:NSPoint(x:512+offset*340,y:467))
        line.lineWidth=9
        NSColor(calibratedRed:0.52,green:0.23,blue:0.10,alpha:0.30).setStroke()
        line.stroke()
    }
    NSGraphicsContext.restoreGraphicsState()
    NSGraphicsContext.restoreGraphicsState()
    let png=rep.representation(using:.png,properties:[:])!
    let type=[16:"icp4",32:"icp5",64:"icp6",128:"ic07",256:"ic08",512:"ic09",1024:"ic10"][size]!
    iconPayload.append(Data(type.utf8))
    iconPayload.append(bigEndian(png.count+8))
    iconPayload.append(png)
    let names:[String]
    switch size {
    case 16:names=["icon_16x16.png"]
    case 32:names=["icon_16x16@2x.png","icon_32x32.png"]
    case 64:names=["icon_32x32@2x.png"]
    case 128:names=["icon_128x128.png"]
    case 256:names=["icon_128x128@2x.png","icon_256x256.png"]
    case 512:names=["icon_256x256@2x.png","icon_512x512.png"]
    default:names=["icon_512x512@2x.png"]
    }
    for name in names {try png.write(to:output.appendingPathComponent(name))}
}
var icon=Data("icns".utf8)
icon.append(bigEndian(iconPayload.count+8))
icon.append(iconPayload)
try icon.write(to:output.deletingLastPathComponent().appendingPathComponent("AppIcon.icns"))
