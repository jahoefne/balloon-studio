import Foundation
import CryptoKit

@main
struct STLImportTests {
    static func require(_ condition:@autoclosure () -> Bool,_ message:String) {
        if !condition() {fatalError(message)}
    }
    static func rejects(_ label:String,_ action:() throws -> Void) {
        do {try action();fatalError("Expected rejection: \(label)")} catch {}
    }
    static func close(_ a:Double,_ b:Double,_ tolerance:Double = 0.02) -> Bool {abs(a-b) < tolerance}
    static func main() throws {
        for p in [BalloonParameters.classic,.round,.tall,
                  BalloonParameters(height:210,diameter:175,panels:28,panelDepth:6.5,neckDiameter:36,neckHeight:14,shoulder:61,hollow:true,wallThickness:1.4,stringHoles:true,cordClearance:3.5,hangingLoop:true,hangingClearance:4.5,
                                    hangingThickness:15.5,hangingWall:7.5,hangingFillet:4.5,hangingCrownThickness:7.2)] {
            let mesh = BalloonGenerator.generate(p)
            let data = try BalloonSTL.export(mesh,parameters:p)
            require(data.count == 84+mesh.triangles.count*50,"Metadata changed STL length")
            let imported = try BalloonSTL.read(data),q = imported.parameters
            require(imported.restoredSettings,"Lost settings")
            require(close(q.height,p.height) && close(q.diameter,p.diameter) && close(q.panelDepth,p.panelDepth) && close(q.shoulder,p.shoulder),"Shape settings changed")
            require(close(q.neckHeight,p.neckHeight) && close(q.neckDiameter,p.neckDiameter),"Neck settings changed")
            require(q.panels == p.panels && q.hollow == p.hollow && q.stringHoles == p.stringHoles && q.hangingLoop == p.hangingLoop,"Flags changed")
            require(close(q.wallThickness,p.wallThickness) && close(q.cordClearance,p.cordClearance) && close(q.hangingClearance,p.hangingClearance),"Clearances changed")
            require(close(q.hangingThickness,p.hangingThickness) && close(q.hangingWall,p.hangingWall) && close(q.hangingFillet,p.hangingFillet) && close(q.hangingCrownThickness,p.hangingCrownThickness),"Hanger adjustments changed")
            try imported.mesh.validate()
            print("PASS saved settings: \(p.filename)")
        }
        for p in [BalloonParameters.classic,.round,.tall,
                  BalloonParameters(panelDepth:0),BalloonParameters(hollow:true,wallThickness:1.6),
                  BalloonParameters(stringHoles:true,hangingLoop:true).normalized()] {
            let imported = try BalloonSTL.read(BalloonGenerator.generate(p).binarySTL()),q = imported.parameters
            require(!imported.restoredSettings,"Old STL should be estimated")
            require(close(q.height,p.height,0.2) && close(q.diameter,p.diameter) && close(q.shoulder,p.shoulder,0.2),"Estimated profile differs")
            require(close(q.neckHeight,p.neckHeight) && close(q.neckDiameter,p.neckDiameter),"Estimated neck differs")
            require(close(q.panelDepth,p.panelDepth,0.1) && (p.panelDepth == 0 || q.panels == p.panels),"Estimated panels differ")
            require(q.hollow == p.hollow,"Hollow mode differs")
            if p.hollow {require(close(q.wallThickness,p.wallThickness,0.05),"Wall estimate differs")}
            print("PASS legacy reconstruction: \(p.filename)")
        }
        let original = try BalloonSTL.open(URL(fileURLWithPath:"output/hot_air_balloon_envelope_180x220mm.stl"))
        require(close(original.parameters.height,220,0.1) && close(original.parameters.diameter,180),"Original Blender model differs")
        require(original.parameters.panels == 20 && close(original.parameters.panelDepth,4,0.1),"Original Blender panels differ")
        print("PASS original Blender STL")
        let oldAttachments = try BalloonSTL.open(URL(fileURLWithPath:"output/Balloon-222x244mm-with-attachments.stl"))
        require(close(oldAttachments.parameters.height,244,0.2) && close(oldAttachments.parameters.diameter,222,0.2),"Existing attachment export differs")
        print("PASS existing 222 × 244 mm attachment export")
        let classic = BalloonGenerator.generate(.classic)
        // Recreate the original header independently: old exports remain readable
        // and acquire the stronger defaults when next generated.
        var legacyData=try classic.binarySTL()
        var legacyHeader=Data("BSTL0001".utf8)
        legacyHeader.append(contentsOf:[4,20])
        for value:Float in [244,180,4,32,6,65,1.2,3,4] {
            var bits=value.bitPattern.littleEndian
            withUnsafeBytes(of:&bits) {legacyHeader.append(contentsOf:$0)}
        }
        var legacyHash=SHA256();legacyHash.update(data:legacyHeader);legacyHash.update(data:legacyData[80...])
        legacyHeader.append(contentsOf:legacyHash.finalize());legacyHeader.append(contentsOf:[0,0])
        legacyData.replaceSubrange(0..<80,with:legacyHeader)
        let legacySettings=try BalloonSTL.read(legacyData)
        require(legacySettings.restoredSettings && legacySettings.parameters.hangingLoop && legacySettings.parameters.height==240 && legacySettings.parameters.hangingThickness==12,"Version 1 STL settings did not migrate")
        print("PASS version 1 STL metadata migration and adjusted build height")
        var binary = try classic.binarySTL()
        binary.replaceSubrange(0..<5,with:Data("solid".utf8))
        require(tryParse(binary).triangles.count == classic.triangles.count,"Binary solid header misclassified")
        var translated = classic
        translated.vertices = classic.vertices.map {$0+Point3(x:17,y:-22,z:35)}
        let shifted = try BalloonSTL.read(translated.binarySTL())
        require(close(shifted.parameters.height,220,0.1),"Translated model failed")
        var metadata = try BalloonSTL.export(classic,parameters:.classic)
        metadata[10] ^= 1
        let corruptHeader = try BalloonSTL.read(metadata)
        require(!corruptHeader.restoredSettings,"Corrupt metadata trusted")
        metadata = try BalloonSTL.export(classic,parameters:.classic)
        metadata[46] ^= 1
        require(tryRead(metadata).restoredSettings == false,"Corrupt hanger metadata trusted")
        metadata = try BalloonSTL.export(classic,parameters:.classic)
        metadata[84] ^= 1
        let modifiedPayload = try BalloonSTL.read(metadata)
        require(!modifiedPayload.restoredSettings,"Modified payload trusted")
        let ascii = """
        solid triangle
          facet normal 0 0 1
            outer loop
              vertex 0 0 0
              vertex 1e0 0 0
              vertex 0 1 0
            endloop
          endfacet
        endsolid triangle
        """
        let parsed = try BalloonSTL.parse(Data(ascii.utf8))
        require(parsed.vertices.count == 3 && parsed.triangles.count == 1,"ASCII triangle not read")
        // Exercise reconstruction through the ASCII path, including independent decimal formatting.
        var text = "solid balloon\n"
        for t in classic.triangles {
            text += "facet normal 0 0 0\nouter loop\n"
            for i in [t.a,t.b,t.c] {let p = classic.vertices[i];text += "vertex \(p.x) \(p.y) \(p.z)\n"}
            text += "endloop\nendfacet\n"
        }
        text += "endsolid balloon\n"
        let asciiBalloon = try BalloonSTL.read(Data(text.utf8))
        require(close(asciiBalloon.parameters.height,220,0.1),"ASCII balloon reconstruction failed")
        rejects("empty") {_ = try BalloonSTL.read(Data())}
        rejects("truncated") {_ = try BalloonSTL.parse(binary.dropLast())}
        rejects("triangle count") {var bad = binary;bad[83] = 127;_ = try BalloonSTL.parse(bad)}
        rejects("ASCII missing end") {_ = try BalloonSTL.parse(Data(ascii.replacingOccurrences(of:"endfacet",with:"").utf8))}
        rejects("ASCII NaN") {_ = try BalloonSTL.parse(Data(ascii.replacingOccurrences(of:"1e0",with:"nan").utf8))}
        rejects("degenerate") {_ = try BalloonSTL.parse(Data(ascii.replacingOccurrences(of:"1e0",with:"0").utf8))}
        rejects("non-balloon") {_ = try BalloonSTL.read(Data(ascii.utf8))}
        rejects("basket") {_ = try BalloonSTL.read(BasketGenerator.generate(BasketParameters()).binarySTL())}
        print("PASS ASCII, binary detection, centering, integrity, malformed and unsupported files")
        // Reopened settings must still produce editable, validated shells, attachments and patterns.
        var edited = original.parameters
        edited.hollow = true;edited.wallThickness = 1.4;edited.stringHoles = true;edited.hangingLoop = true
        edited = edited.normalized()
        let editedMesh = BalloonGenerator.generate(edited)
        try editedMesh.validate()
        var pattern = PatternSettings();pattern.style = .stripes
        let painted = PaintedBalloon.make(editedMesh,parameters:edited,settings:pattern)
        let threeMF = try painted.threeMF(settings:pattern,purge:PurgeSettings())
        require(threeMF.count > 100,"Pattern export failed")
        print("PASS reopened balloon → hollow walls, holes, hanger, patterned 3MF")
    }
    static func tryParse(_ data:Data) -> BalloonMesh {try! BalloonSTL.parse(data)}
    static func tryRead(_ data:Data) -> ImportedBalloon {try! BalloonSTL.read(data)}
}
