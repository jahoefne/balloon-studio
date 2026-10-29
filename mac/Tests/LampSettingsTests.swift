import Foundation

extension GeometryTests {
    static func checkLampSettings() throws {
        var cloud = CloudParameters()
        cloud.style = .billow; cloud.mirrored = true
        cloud.width = 239; cloud.depth = 28; cloud.diffuserThickness = 0.8
        cloud.surface = .sculpted; cloud.surfaceDepth = 20
        cloud.stripWidth = 10; cloud.stripThickness = 4; cloud.stripCutLength = 25; cloud.ledRowSpacing = 18
        cloud.clipFit = 0.4; cloud.cableDiameter = 5; cloud.cableSide = .left
        cloud.strainRelief = false; cloud.nailHead = 9; cloud.nailShaft = 4
        cloud.nailInsert = true; cloud.nailDiameter = 2.1; cloud.nailHeadDiameter = 4.2
        var sun = cloud
        sun.kind = .sun; sun.sunStyle = .pinwheel
        for input in [cloud, sun] {
            let expected = input.normalized()
            let restored = try LampSettingsFile.decode(JSONEncoder().encode(expected))
            require(restored == expected, "Opening lamp settings lost a saved option")
        }

        // Use the JSON actually packaged alongside the printable parts.
        for kind in [WallLampKind.cloud, .sun] {
            let kit = CloudKit(kind.defaults)
            let entry = try kit.entries().first { $0.0 == "\(kind.rawValue)-settings.json" }!
            let reopened = try LampSettingsFile.decode(entry.1)
            require(reopened == kit.parameters, "An exported lamp kit cannot restore its settings")
        }

        for (folder, width, depth, thickness, rowSpacing, kind) in [
            ("cloud-lamp-100", 100.0, 16.0, 0.8, 14.0, WallLampKind.cloud),
            ("cloud-lamp-230", 230.0, 28.0, 1.2, 14.0, .cloud),
            ("cloud-lamp-100-led-rows", 100.0, 22.0, 0.8, 14.0, .cloud),
            ("cloud-lamp-239-led-rows", 239.0, 22.0, 0.8, 18.0, .cloud),
            ("sun-lamp-200", 200.0, 22.0, 1.2, 14.0, .sun)
        ] {
            let url = URL(fileURLWithPath: "output/\(folder)/\(kind.rawValue)-settings.json")
            let restored = try LampSettingsFile.decode(Data(contentsOf: url))
            require(restored.kind == kind && restored.width == width && restored.depth == depth,
                    "An older exported design opened with the wrong shape or dimensions")
            require(restored.diffuserThickness == thickness && restored.ledRowSpacing == rowSpacing,
                    "An older exported design lost its diffuser or LED settings")
            require(restored.style == .classic && !restored.mirrored && restored.sunStyle == .softStar && restored.surface == .flat,
                    "Missing newer options did not preserve the older design")
        }

        // Suns saved as one of the former designs open as the first sun.
        let former = try LampSettingsFile.decode(Data(#"{"kind":"sun","sunStyle":"halo","width":180,"depth":22,"diffuserThickness":1.2}"#.utf8))
        require(former.kind == .sun && former.sunStyle == .softStar && former.width == 180, "A sun of a former design did not open")

        let sparse = try LampSettingsFile.decode(Data(#"{"width":100,"depth":16,"diffuserThickness":0.8}"#.utf8))
        require(sparse.kind == .cloud && sparse.stripCutLength == 16 && sparse.ledRowSpacing == 14,
                "Legacy settings did not receive the migration defaults")
        let normalized = try LampSettingsFile.decode(Data(#"{"width":999,"depth":-1,"diffuserThickness":0,"stripWidth":12,"ledRowSpacing":1}"#.utf8))
        require(normalized.width == 500 && normalized.depth == 16 && normalized.diffuserThickness == 0.8 && normalized.ledRowSpacing == 16,
                "Opened settings bypassed the editor's supported dimensions")

        for invalid in [
            "", "{", "[]", "null", "{}", #"{"unrelated":true}"#,
            #"{"width":100,"depth":16}"#,
            #"{"width":null,"depth":16,"diffuserThickness":0.8}"#,
            #"{"width":"100","depth":16,"diffuserThickness":0.8}"#,
            #"{"width":100,"depth":16,"diffuserThickness":0.8,"kind":"basket"}"#,
            #"{"width":100,"depth":16,"diffuserThickness":0.8,"style":"unknown"}"#,
            #"{"width":100,"depth":16,"diffuserThickness":0.8,"mirrored":"yes"}"#,
            #"{"width":1e999,"depth":16,"diffuserThickness":0.8}"#
        ] {
            do {
                _ = try LampSettingsFile.decode(Data(invalid.utf8))
                fatalError("Invalid or unrelated JSON was accepted as lamp settings: \(invalid)")
            } catch LampSettingsFile.ReadError.invalidSettings {
                // Expected: callers receive an actionable error before applying a design.
            }
        }
        print("PASS lamp settings: exported cloud/sun kits, every saved option, five legacy files, migration, normalization and invalid-file rejection")
    }
}
