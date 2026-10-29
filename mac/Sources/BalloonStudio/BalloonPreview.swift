import SwiftUI
import SceneKit

struct BalloonPreview: NSViewRepresentable {
    let mesh: BalloonMesh
    let revision: Int
    let color: NSColor
    let showPlate: Bool
    let wireframe: Bool
    let resetCamera: Int
    let cutaway: Bool
    let inspectOpening: Bool
    let neckDiameter: Double
    var neckHeight=12.0
    var filledNeck=false
    var compactObject=false
    var inspectTop=false
    var faceColors:[Int]=[]
    var detailColor:NSColor = .white
    var accentColor:NSColor = .black
    var hardwareColor:NSColor = .gray
    var minimumScale=32.0
    var topDown=false
    var objectName:String? = nil
    var sharpEdges=false
    var smoothAngle=0.0
    // Keep sculpted relief smooth below a mechanical attachment band.
    var smoothBelowHeight:Double? = nil

    final class Coordinator {
        let scene=SCNScene()
        let balloon=SCNNode()
        let plate=SCNNode()
        let camera=SCNNode()
        let material=SCNMaterial()
        let detailMaterial=SCNMaterial()
        let accentMaterial=SCNMaterial()
        let hardwareMaterial=SCNMaterial()
        var revision = -1
        var reset = -1
        var cutaway=false
        var inspectOpening=false
        var inspectTop=false
        var filledNeck=false
        var topDown=false

        init() {
            scene.background.contents=NSColor(calibratedRed:0.075,green:0.09,blue:0.12,alpha:1)
            material.lightingModel = .blinn
            material.specular.contents=NSColor(white:0.28,alpha:1)
            material.shininess=0.38
            detailMaterial.lightingModel = .blinn
            detailMaterial.specular.contents=NSColor(white:0.28,alpha:1)
            detailMaterial.shininess=0.38
            accentMaterial.lightingModel = .blinn
            accentMaterial.specular.contents=NSColor(white:0.28,alpha:1)
            accentMaterial.shininess=0.38
            hardwareMaterial.lightingModel = .blinn
            hardwareMaterial.specular.contents=NSColor(white:0.28,alpha:1)
            hardwareMaterial.shininess=0.38
            scene.rootNode.addChildNode(balloon)
            scene.rootNode.addChildNode(plate)
            let bed=SCNBox(width:256,height:1.4,length:256,chamferRadius:3)
            let bedMat=SCNMaterial()
            bedMat.lightingModel = .lambert
            bedMat.diffuse.contents=NSColor(calibratedRed:0.12,green:0.15,blue:0.19,alpha:1)
            bedMat.roughness.contents=0.85
            bed.materials=[bedMat]
            let bedNode=SCNNode(geometry:bed)
            bedNode.position.y = -0.9
            plate.addChildNode(bedNode)
            let gridMat=SCNMaterial()
            gridMat.lightingModel = .constant
            gridMat.diffuse.contents=NSColor(white:0.42,alpha:0.35)
            for i in -6...6 {
                let a=SCNBox(width:0.28,height:0.06,length:248,chamferRadius:0)
                a.materials=[gridMat]
                let node=SCNNode(geometry:a)
                node.position=SCNVector3(Float(i*20),-0.14,0)
                plate.addChildNode(node)
                let b=SCNBox(width:248,height:0.06,length:0.28,chamferRadius:0)
                b.materials=[gridMat]
                let other=SCNNode(geometry:b)
                other.position=SCNVector3(0,-0.14,Float(i*20))
                plate.addChildNode(other)
            }
            camera.camera=SCNCamera()
            camera.camera?.usesOrthographicProjection=true
            camera.camera?.zNear=0.1
            camera.camera?.zFar=4000
            camera.camera?.wantsHDR=false
            scene.rootNode.addChildNode(camera)
            light(.ambient, position:SCNVector3(0,0,0), intensity:130, color:NSColor(calibratedRed:0.73,green:0.81,blue:1,alpha:1))
            light(.omni,position:SCNVector3(-220,380,260),intensity:850,color:NSColor(calibratedRed:1,green:0.91,blue:0.78,alpha:1))
            light(.omni,position:SCNVector3(240,200,80),intensity:180,color:.white)
            light(.omni,position:SCNVector3(0,280,-260),intensity:550,color:NSColor(calibratedRed:0.74,green:0.84,blue:1,alpha:1))
            light(.omni,position:SCNVector3(0,-100,60),intensity:160,color:.white)
        }
        func light(_ type: SCNLight.LightType,position:SCNVector3,intensity:CGFloat,color:NSColor) {
            let node=SCNNode()
            node.light=SCNLight()
            node.light?.type=type
            node.light?.intensity=intensity
            node.light?.color=color
            node.position=position
            scene.rootNode.addChildNode(node)
        }
        func replaceMesh(_ mesh: BalloonMesh,cutaway:Bool,faceColors:[Int],sharpEdges:Bool,smoothAngle:Double,smoothBelowHeight:Double? = nil) {
            var normals=Array(repeating:Point3.zero,count:mesh.vertices.count)
            var incident = smoothAngle > 0 ? Array(repeating:[Point3](),count:mesh.vertices.count) : []
            var indices=[[Int32](),[Int32](),[Int32](),[Int32]()]
            for (i,t) in mesh.triangles.enumerated() {
                if cutaway && (mesh.vertices[t.a].y+mesh.vertices[t.b].y+mesh.vertices[t.c].y)/3 < -0.0001 {continue}
                let n=(mesh.vertices[t.b]-mesh.vertices[t.a]).cross(mesh.vertices[t.c]-mesh.vertices[t.a])
                normals[t.a]=normals[t.a]+n
                normals[t.b]=normals[t.b]+n
                normals[t.c]=normals[t.c]+n
                if smoothAngle > 0 {
                    incident[t.a].append(n);incident[t.b].append(n);incident[t.c].append(n)
                }
                indices[faceColors.count == mesh.triangles.count ? faceColors[i]:0].append(contentsOf:[Int32(t.a),Int32(t.b),Int32(t.c)])
            }
            func scn(_ p:Point3) -> SCNVector3 { SCNVector3(p.x,p.z,-p.y) }
            var displayVertices=mesh.vertices
            if sharpEdges {
                // Keep mechanical rims crisp: smoothing across perpendicular
                // faces makes the recessed LED channel hard to see.
                displayVertices=[];normals=[]
                for group in indices.indices {
                    let original=indices[group]
                    indices[group]=[]
                    for offset in stride(from:0,to:original.count,by:3) {
                        let points=(0..<3).map {mesh.vertices[Int(original[offset+$0])]}
                        let normal=(points[1]-points[0]).cross(points[2]-points[0]).unit
                        for (corner,point) in points.enumerated() {
                            indices[group].append(Int32(displayVertices.count))
                            displayVertices.append(point)
                            if smoothAngle > 0 {
                                let adjacent=incident[Int(original[offset+corner])]
                                let continuous=smoothBelowHeight.map {point.z<$0} ?? false
                                let smooth=adjacent.filter {continuous || $0.unit.dot(normal) >= cos(smoothAngle)}.reduce(Point3.zero,+)
                                normals.append(smooth.unit)
                            } else {normals.append(normal)}
                        }
                    }
                }
            }
            let source=SCNGeometrySource(vertices:displayVertices.map(scn))
            let normalSource=SCNGeometrySource(normals:normals.map { scn($0.unit) })
            let elements=indices.map {SCNGeometryElement(indices:$0,primitiveType:.triangles)}
            let geometry=SCNGeometry(sources:[source,normalSource],elements:elements)
            geometry.materials=[material,detailMaterial,accentMaterial,hardwareMaterial]
            balloon.geometry=geometry
        }
        func frame(_ view: SCNView,height:Double,neck:Double,opening:Bool,compact:Bool,width:Double,top:Bool,neckHeight:Double,filledNeck:Bool,topDown:Bool,minimumScale:Double=32) {
            camera.position=opening ? SCNVector3(35,-160,80) : SCNVector3(340,height*0.5+210,490)
            var target=opening ? SCNVector3(0,0,0) : SCNVector3(0,height*0.48,0)
            camera.look(at:target)
            camera.camera?.orthographicScale=opening ? max(24,neck*0.7) : max(145,height*0.72)
            if compact {
                let flat=height<width*0.1
                camera.position=SCNVector3(width*2,height+width*(flat ? 2.5:1.2),width*2.4)
                camera.look(at:target)
                camera.camera?.orthographicScale=flat ? width*0.5:max(minimumScale,max(width*0.62,height*0.9))
            }
            if opening && filledNeck {
                target=SCNVector3(0,neckHeight/2,0)
                camera.position=SCNVector3(0,neckHeight/2,80)
                camera.look(at:target)
            }
            if top {
                target=SCNVector3(0,height-6,0)
                camera.position=SCNVector3(18,height+5,65)
                camera.look(at:target)
                camera.camera?.orthographicScale=19
            }
            if topDown {
                target=SCNVector3(0,height/2,0)
                camera.position=SCNVector3(0,height+width*2,0)
                camera.look(at:target,up:SCNVector3(0,0,-1),localFront:SCNVector3(0,0,-1))
                camera.camera?.orthographicScale=max(minimumScale,width*0.62)
            }
            view.pointOfView=camera
            view.defaultCameraController.target=target
            view.defaultCameraController.worldUp=SCNVector3(0,1,0)
            view.defaultCameraController.inertiaEnabled=true
            view.defaultCameraController.interactionMode = .orbitTurntable
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeNSView(context:Context) -> SCNView {
        let view=SCNView()
        view.scene=context.coordinator.scene
        view.allowsCameraControl=true
        view.antialiasingMode = .multisampling4X
        view.preferredFramesPerSecond=60
        view.rendersContinuously=false
        view.backgroundColor = .clear
        view.setAccessibilityLabel("Interactive \(objectName ?? (compactObject ? "basket":"balloon")) preview. Drag to rotate, scroll to zoom.")
        return view
    }
    func updateNSView(_ view:SCNView,context:Context) {
        let c=context.coordinator
        if c.revision != revision || c.cutaway != cutaway {
            c.replaceMesh(mesh,cutaway:cutaway,faceColors:faceColors,sharpEdges:sharpEdges,smoothAngle:smoothAngle,smoothBelowHeight:smoothBelowHeight)
            c.revision=revision
            c.cutaway=cutaway
        }
        c.material.diffuse.contents=color
        c.detailMaterial.diffuse.contents=detailColor
        c.accentMaterial.diffuse.contents=accentColor
        c.hardwareMaterial.diffuse.contents=hardwareColor
        c.hardwareMaterial.fillMode=wireframe ? .lines:.fill
        c.accentMaterial.fillMode=wireframe ? .lines:.fill
        c.detailMaterial.fillMode=wireframe ? .lines:.fill
        c.material.fillMode=wireframe ? .lines : .fill
        c.plate.isHidden = !showPlate
        if c.reset != resetCamera || c.inspectOpening != inspectOpening || c.inspectTop != inspectTop || c.topDown != topDown || (inspectOpening && c.filledNeck != filledNeck) {
            let dims=mesh.dimensions
            c.frame(view,height:dims.z,neck:neckDiameter,opening:inspectOpening,compact:compactObject,width:max(dims.x,dims.y),top:inspectTop,neckHeight:neckHeight,filledNeck:filledNeck,topDown:topDown,minimumScale:minimumScale)
            c.reset=resetCamera
            c.inspectOpening=inspectOpening
            c.inspectTop=inspectTop
            c.filledNeck=filledNeck
            c.topDown=topDown
        }
    }
}
