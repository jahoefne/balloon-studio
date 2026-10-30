import AppKit
import SceneKit
import SwiftUI

// Renders meshes through the real BalloonPreview.Coordinator and dumps them for the web Stage.
struct RefCase {
    let name:String; let mesh:BalloonMesh; let colors:[Int]; let color:NSColor; let detail:NSColor; let accent:NSColor; let hardware:NSColor
    var showPlate=true; var neck=0.0; var neckHeight=12.0; var filled=false; var compact=false; var min=32.0
    var sharp=false; var smooth=0.0; var below:Double? = nil; var cutaway=false; var opening=false; var top=false; var topDown=false; var objectName:String? = nil
}
func comps(_ c:NSColor) -> [Double] {
    let s=c.usingColorSpace(.sRGB)!
    return [Double(s.redComponent),Double(s.greenComponent),Double(s.blueComponent)]
}
@main struct Main {
    @MainActor static func main() throws {
        let out=URL(fileURLWithPath:CommandLine.arguments[1])
        let W=1000,H=800
        let cal={(r:CGFloat,g:CGFloat,b:CGFloat) in NSColor(calibratedRed:r,green:g,blue:b,alpha:1)}
        var cases:[RefCase]=[]
        // BalloonStudioApp.swift:509-514, Classic, Saffron (colors[0]), solid
        let classic=BalloonParameters.classic
        cases.append(RefCase(name:"balloon-classic-saffron",mesh:BalloonGenerator.generate(classic),colors:[],color:cal(0.86,0.43,0.18),detail:.white,accent:.black,hardware:.gray,neck:classic.neckDiameter,neckHeight:classic.neckHeight,filled:!classic.hollow))
        var hollow=classic;hollow.hollow=true
        hollow=hollow.normalized()
        cases.append(RefCase(name:"balloon-hollow-cutaway",mesh:BalloonGenerator.generate(hollow),colors:[],color:cal(0.19,0.57,0.49),detail:.white,accent:.black,hardware:.gray,neck:hollow.neckDiameter,neckHeight:hollow.neckHeight,filled:false,cutaway:true))
        cases.append(RefCase(name:"balloon-opening",mesh:BalloonGenerator.generate(hollow),colors:[],color:cal(0.86,0.43,0.18),detail:.white,accent:.black,hardware:.gray,showPlate:false,neck:hollow.neckDiameter,neckHeight:hollow.neckHeight,filled:false,opening:true))
        var holes=classic;holes.stringHoles=true
        holes=holes.normalized()
        cases.append(RefCase(name:"balloon-filled-neck",mesh:BalloonGenerator.generate(holes),colors:[],color:cal(0.86,0.43,0.18),detail:.white,accent:.black,hardware:.gray,showPlate:false,neck:holes.neckDiameter,neckHeight:holes.neckHeight,filled:true,opening:true))
        var hanger=classic;hanger.hangingLoop=true
        hanger=hanger.normalized()
        cases.append(RefCase(name:"balloon-hanger",mesh:BalloonGenerator.generate(hanger),colors:[],color:cal(0.71,0.76,0.85),detail:.white,accent:.black,hardware:.gray,showPlate:false,neck:hanger.neckDiameter,neckHeight:hanger.neckHeight,filled:!hanger.hollow,top:hanger.hangingLoop))
        // RingEditor.swift:298-303, RingParameters.large = segmented, reflected
        let large=RingParameters.large
        let kit=SegmentedRingKit(large)
        let ringColor=NSColor(white:0.9,alpha:1), ringDetail=cal(0.35,0.53,0.46)
        cases.append(RefCase(name:"ring-reflected",mesh:kit.assembly(),colors:kit.assemblyFaceColors,color:ringColor,detail:ringDetail,accent:.black,hardware:.gray,showPlate:false,compact:true,sharp:true,objectName:"mobile ring"))
        let solid=RingParameters.solid
        let solidMesh=RingGenerator.generate(solid)
        cases.append(RefCase(name:"ring-reflected-solid",mesh:solidMesh,colors:solid.ledFaces(in:solidMesh),color:ringColor,detail:ringDetail,accent:.black,hardware:.gray,compact:true,sharp:true,topDown:true,objectName:"mobile ring"))
        // CloudEditor.swift:409-416, selection == .exploded, default cloud (surface decides smoothAngle)
        let cloud=CloudKit(CloudParameters())
        let cp=cloud.parameters
        let diffuser=NSColor(white:cp.surface == .sculpted ? 0.8 : 0.96,alpha:1)
        cases.append(RefCase(name:"cloud-exploded",mesh:cloud.assembly(exploded:true),colors:cloud.assemblyColors,color:NSColor(white:0.36,alpha:1),detail:diffuser,accent:cal(0.93,0.45,0.2),hardware:cal(0.25,0.58,0.8),showPlate:false,compact:true,sharp:true,smooth:cp.surface == .sculpted ? .pi/5 : 0,objectName:"cloud lamp"))
        // BasketEditor.swift:193-196
        let bp=BasketParameters()
        let basket=BasketGenerator.generate(bp)
        cases.append(RefCase(name:"basket-default",mesh:basket,colors:[],color:cal(0.67,0.40,0.19),detail:.white,accent:.black,hardware:.gray,compact:true,sharp:true,smooth:.pi/6,below:bp.holeCenter-bp.cordClearance/2-0.6))

        let device=MTLCreateSystemDefaultDevice()!
        for c in cases {
            let coord=BalloonPreview.Coordinator()
            coord.replaceMesh(c.mesh,cutaway:c.cutaway,faceColors:c.colors,sharpEdges:c.sharp,smoothAngle:c.smooth,smoothBelowHeight:c.below)
            coord.material.diffuse.contents=c.color
            coord.detailMaterial.diffuse.contents=c.detail
            coord.accentMaterial.diffuse.contents=c.accent
            coord.hardwareMaterial.diffuse.contents=c.hardware
            coord.plate.isHidden = !c.showPlate
            let dims=c.mesh.dimensions
            let view=SCNView(frame:NSRect(x:0,y:0,width:W,height:H))
            view.scene=coord.scene
            coord.frame(view,height:dims.z,neck:c.neck,opening:c.opening,compact:c.compact,width:max(dims.x,dims.y),top:c.top,neckHeight:c.neckHeight,filledNeck:c.filled,topDown:c.topDown,minimumScale:c.min)
            let suffix:String
            if CommandLine.arguments.count > 2 && !c.topDown {
                // The same camera without the roll that consecutive look(at:) calls build up.
                coord.camera.look(at:view.defaultCameraController.target,up:SCNVector3(0,1,0),localFront:SCNVector3(0,0,-1))
                suffix="noroll"
            } else {suffix="scenekit"}
            let r=SCNRenderer(device:device,options:nil)
            r.scene=coord.scene
            r.pointOfView=coord.camera
            r.autoenablesDefaultLighting=false
            let img=r.snapshot(atTime:0,with:CGSize(width:W,height:H),antialiasingMode:.multisampling4X)
            let rep=NSBitmapImageRep(data:img.tiffRepresentation!)!
            try rep.representation(using:.png,properties:[:])!.write(to:out.appendingPathComponent("\(c.name).\(suffix).png"))
            // Dump for the web Stage
            var bin=Data()
            var pos=[Float]();pos.reserveCapacity(c.mesh.vertices.count*3)
            for v in c.mesh.vertices {pos.append(Float(v.x));pos.append(Float(v.y));pos.append(Float(v.z))}
            var idx=[UInt32]();idx.reserveCapacity(c.mesh.triangles.count*3)
            for t in c.mesh.triangles {idx.append(UInt32(t.a));idx.append(UInt32(t.b));idx.append(UInt32(t.c))}
            pos.withUnsafeBytes {bin.append(contentsOf:$0)}
            idx.withUnsafeBytes {bin.append(contentsOf:$0)}
            bin.append(contentsOf:c.colors.map {UInt8($0)})
            try bin.write(to:out.appendingPathComponent("\(c.name).bin"))
            var stage:[String:Any]=["geometryKey":c.name,"color":comps(c.color),"detailColor":comps(c.detail),"accentColor":comps(c.accent),"hardwareColor":comps(c.hardware),
                "showPlate":c.showPlate,"wireframe":false,"resetCamera":0,"cutaway":c.cutaway,"inspectOpening":c.opening,"neckDiameter":c.neck,"neckHeight":c.neckHeight,"filledNeck":c.filled,
                "compactObject":c.compact,"inspectTop":c.top,"minimumScale":c.min,"topDown":c.topDown,"sharpEdges":c.sharp,"smoothAngle":c.smooth]
            if let b=c.below {stage["smoothBelowHeight"]=b}
            if let n=c.objectName {stage["objectName"]=n}
            let info:[String:Any]=["vertices":c.mesh.vertices.count,"triangles":c.mesh.triangles.count,"colors":c.colors.count,
                "dimensions":["x":dims.x,"y":dims.y,"z":dims.z],"stage":stage]
            try JSONSerialization.data(withJSONObject:info,options:[.prettyPrinted,.sortedKeys]).write(to:out.appendingPathComponent("\(c.name).json"))
            print(c.name,c.mesh.vertices.count,c.mesh.triangles.count,c.colors.count,dims.x,dims.y,dims.z,"scale",coord.camera.camera!.orthographicScale)
        }
    }
}
