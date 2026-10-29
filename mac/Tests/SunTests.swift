import Foundation

extension GeometryTests {
    /// Every sun at its default size.
    static var suns: [CloudParameters] {
        SunStyle.allCases.map { var p = WallLampKind.sun.defaults; p.sunStyle = $0; return p }
    }

    static func checkSuns() throws {
        let defaults = WallLampKind.sun.defaults
        require(defaults.kind == .sun && defaults.width == 200 && defaults.height == 200, "Sun defaults changed")
        let old = try JSONDecoder().decode(CloudParameters.self, from: Data("{\"width\":188,\"style\":\"twin\",\"mirrored\":true}".utf8))
        require(old.kind == .cloud && old.style == .twin && old.mirrored && old.width == 188, "Sun migration changed a saved cloud")
        let restored = try JSONDecoder().decode(CloudParameters.self, from: JSONEncoder().encode(defaults))
        require(restored == defaults, "Sun settings failed to round trip")
        require(WallLampKind.sun.settingsKey != WallLampKind.cloud.settingsKey, "Sun shares cloud preferences")
        var bad = defaults
        bad.width = 20; bad.depth = .nan; bad.style = .twin; bad.mirrored = true
        let fixed = bad.normalized()
        require(fixed.width == 160 && fixed.depth == 22 && fixed.style == .classic && !fixed.mirrored, "Sun normalization failed")
        require(fixed.normalized() == fixed, "Sun normalization is not idempotent")

        let legacySun = try JSONDecoder().decode(CloudParameters.self, from:Data("{\"kind\":\"sun\",\"width\":188,\"depth\":34,\"diffuserThickness\":2}".utf8))
        require(legacySun.width == 188 && legacySun.depth == 34 && legacySun.diffuserThickness == 2, "Existing sun changed during migration")
        // The former Rounded, Radiant and Halo designs open as the first sun.
        for former in ["rounded", "radiant", "halo"] {
            let saved = try JSONDecoder().decode(CloudParameters.self, from:Data("{\"kind\":\"sun\",\"sunStyle\":\"\(former)\",\"width\":188,\"depth\":34}".utf8))
            require(saved.kind == .sun && saved.sunStyle == .softStar && saved.width == 188 && saved.depth == 34 && saved.normalized() == saved, "A sun saved as \(former) did not open")
        }
        require(legacySun.sunStyle == .softStar && SunStyle.allCases.count == 4, "Suns changed")
        var filenames = Set<String>()
        for style in SunStyle.allCases {
            var p = defaults; p.sunStyle = style
            let restored = try JSONDecoder().decode(CloudParameters.self, from:JSONEncoder().encode(p))
            require(restored == p && restored.normalized() == p, "Sun style did not persist")
            require(filenames.insert(p.filename).inserted && p.filename.contains(style.rawValue), "Sun styles share an export filename")
            // No kit takes the name of a former design's kit.
            require(p.filename != "Sun-Lamp-200mm-kit.zip" && !p.filename.contains("radiant") && !p.filename.contains("halo"), "Kit name of a former sun")
            var cloud = CloudParameters(); cloud.sunStyle = style
            require(cloud.normalized().sunStyle == .softStar, "A cloud keeps a sun's design")
            try checkSunStyle(style)
        }
        // Soft star and Cones share their outline, and with it their back.
        for (i, a) in SunStyle.allCases.enumerated() { for b in SunStyle.allCases.dropFirst(i+1) {
            let differences = (0..<720).map { i -> Double in
                let angle = Double(i) * Double.pi/360
                return abs(CloudGenerator.radius(angle, inset:0, width:200, profile:a.profile)-CloudGenerator.radius(angle, inset:0, width:200, profile:b.profile))
            }
            if Set([a, b]) == [.softStar, .cones] {
                require(differences.max()! == 0, "Soft star and Cones no longer share their outline")
                var first = defaults, second = defaults
                first.sunStyle = a; second.sunStyle = b
                let backs = try [first, second].map { try CloudKit($0).back.binarySTL() }
                require(backs[0] == backs[1], "Soft star and Cones no longer share their back")
                first.surface = .sculpted; second.surface = .sculpted
                let fronts = try [first, second].map { try CloudKit($0).front.binarySTL() }
                require(fronts[0] != fronts[1], "Soft star and Cones have the same front")
            } else {
                require(differences.max()! > 5 && differences.reduce(0, +)/720 > 1.5, "\(a.title) and \(b.title) are not visibly distinct")
            }
        } }
        print("PASS four suns: silhouettes, migration of former designs, persistence and unique kit names")
    }

    /// A spring tab must be a flat piece of wall to bend. On a sun that is
    /// the flank of a ray: not its tip, not a notch. Stated here from the
    /// silhouette alone: tips at half the width, notches where rays meet.
    static func checkSunClips(_ style: SunStyle) {
        func point(_ radius: Double, _ angle: Double) -> (Double, Double) { (radius*cos(angle), radius*sin(angle)) }
        func distance(_ p: (Double, Double), _ a: (Double, Double), _ b: (Double, Double)) -> Double {
            abs((b.0-a.0)*(p.1-a.1)-(b.1-a.1)*(p.0-a.0))/hypot(b.0-a.0, b.1-a.1)
        }
        let sector = 2*Double.pi/Double(style.rayCount), lean = style == .pinwheel ? Double.pi/24 : 0
        for width in stride(from:160.0, through:500, by:10) { for fit in [0.2, 0.5] {
            var p = WallLampKind.sun.defaults
            p.sunStyle = style; p.width = width; p.clipFit = fit
            let clips = LampClips(p), label = "\(style.title) \(width) mm, fit \(fit)"
            require(clips.centers.count == 4, "Four clips: \(label)")
            for (index, center) in clips.centers.enumerated() {
                require(abs(center-clips.centers[0]-Double(index)*Double.pi/2) < 1e-12, "Clips are not a quarter turn apart: \(label)")
                // Slot, tab, slot: four points of the outline.
                let ends = [-clips.half-clips.slit, -clips.half, clips.half, clips.half+clips.slit].map { offset -> (Double, Double) in
                    point(CloudGenerator.radius(center+offset, inset:0, width:width, profile:style.profile), center+offset)
                }
                // The flank they lie on, between a tip and the notch beside it.
                var flank: (tip: (Double, Double), notch: (Double, Double), other: (Double, Double))?
                for ray in 0..<style.rayCount { for side in [1.0, -1] {
                    let tip = point(width/2, Double(ray)*sector)
                    let notch = point(style.notchRadius*width, (Double(ray)+side/2)*sector+lean)
                    if ends.allSatisfy({ distance($0, tip, notch) < 1e-6 }) {
                        flank = (tip, notch, point(style.notchRadius*width, (Double(ray)-side/2)*sector+lean))
                    }
                } }
                guard let flank else { fatalError("A clip is not on the straight flank of one ray: \(label)") }
                let tab = hypot(ends[2].0-ends[1].0, ends[2].1-ends[1].1)
                let slots = [hypot(ends[1].0-ends[0].0, ends[1].1-ends[0].1), hypot(ends[3].0-ends[2].0, ends[3].1-ends[2].1)]
                // One angle serves both slots; the flank is oblique, so the
                // one nearer the tip comes out wider.
                require(abs(tab-10) < 0.01 && slots.allSatisfy { $0 > 0.999 && $0 < 1.6 }, "Tab of \(tab) mm, slots of \(slots) mm: \(label)")
                // Clear of the notch, and where the ray is wide enough for
                // the tab to bend into the cavity: both skirts, the tab's
                // root and 1 mm of room between them and the other flank.
                for end in [ends[0], ends[3]] {
                    require(hypot(end.0-flank.notch.0, end.1-flank.notch.1) > 1.5, "A clip's slot is in the notch: \(label)")
                    require(distance(end, flank.tip, flank.other) > 2*(2.4+fit)+2.0+1.2+1, "No room for the tab to bend: \(label)")
                }
            }
        } }
    }

    static func checkSunStyle(_ style: SunStyle) throws {
        var defaults = WallLampKind.sun.defaults; defaults.sunStyle = style
        let rays = style.rayCount
        checkSunClips(style)
        // At every supported compact diameter, the largest fittings must stay
        // in the Cartesian core and the core must stay inside the diffuser skirt.
        for width in Int(defaults.minimumWidth)...240 {
            var p = defaults
            p.width = Double(width); p.cableDiameter = 6; p.nailHead = 10; p.stripWidth = 12; p.clipFit = 0.5
            let l = CloudGenerator.Layout(p: p)
            for r in l.rectangles {
                require(r.x0 > -l.coreX && r.x1 < l.coreX && r.y0 > l.lowY && r.y1 < l.highY, "Sun fitting outside core at \(width): \(r)")
            }
            require(l.nailBoss.y0 >= l.led.y1 + 0.99 && abs(l.nailBoss.y1 - p.width * CloudParameters.sunNailTop) < 1e-9, "Sun fittings overlap or LED rows moved")
            // The lamp hangs from the top of the slot, above its middle.
            require(l.slot.y1 > 0.09 * p.width, "Sun hangs from below its middle")
            for x in [-l.coreX, l.coreX] { for y in [l.lowY, l.highY] {
                let r = CloudGenerator.radius(atan2(y,x), inset:4.1, width:p.width, profile:p.profile)
                require(r > hypot(x,y) + 0.1, "Sun core crosses skirt")
            } }
        }

        var cases: [CloudParameters] = [defaults]
        for width in [defaults.minimumWidth, 180, 200, 240, 241, 500] { for largeFittings in [false, true] {
            var p = defaults
            p.width = width; p.depth = largeFittings ? 40 : 16
            p.cableDiameter = largeFittings ? 6 : 2; p.nailHead = largeFittings ? 10 : 5
            p.nailShaft = largeFittings ? 5 : 2; p.stripWidth = largeFittings ? 12 : 3.5
            p.stripThickness = largeFittings ? 6 : 1; p.clipFit = largeFittings ? 0.5 : 0.2
            p.diffuserThickness = largeFittings ? 2 : 0.8
            p.cableSide = CableSide.allCases[(cases.count + SunStyle.allCases.firstIndex(of:style)!) % 4]
            cases.append(p.normalized())
        } }
        for (index,p) in cases.enumerated() {
            checkLEDLayout(p)
            for quality in [BalloonGenerator.Quality.preview, .export] {
                let kit = CloudKit(p, quality:quality)
                var parts: [BalloonMesh] = []
                let seal = parseSTL(try kit.seal.binarySTL())
                for (name, mesh) in [("back",kit.back), ("front",kit.front)] {
                    try mesh.validate()
                    let parsed = parseSTL(try mesh.binarySTL())
                    try parsed.validate(); parts.append(parsed)
                    require(abs(parsed.dimensions.x-p.width) < 0.002 && abs(parsed.dimensions.y-p.width) < 0.002, "Sun must remain round and match its diameter")
                    require(abs(parsed.dimensions.z-(name == "back" ? p.depth : p.diffuserThickness+12)) < 0.002, "Sun print depth incorrect")
                    require(parsed.vertices.allSatisfy {$0.z >= -1e-6}, "Sun extends below bed")
                    require(parsed.vertices.count-parsed.triangles.count/2 == (name == "back" ? 0 : 2), "Sun has extra shells or holes")
                    require(p.fitsP2S == (p.width <= 240), "Sun bed fit incorrect")
                }
                try checkCloudFeatures(p, back:parts[0], front:parts[1], seal:seal, full:index < 2)
                if index < 3 && quality == .export {
                    let folder = ".build/test-output/sun-\(style.rawValue)\(index == 0 ? "" : "-\(index)")"
                    try FileManager.default.createDirectory(atPath:folder, withIntermediateDirectories:true)
                    for (name,data) in try kit.entries() { try data.write(to:URL(fileURLWithPath:"\(folder)/\(name)")) }
                    try kit.archive().write(to:URL(fileURLWithPath:"\(folder)/\(p.filename)"))
                }
            }
            print("PASS \(style.title) sun \(index+1)/\(cases.count): \(Int(p.width)) mm, cable \(p.cableSide.rawValue), both resolutions, closed solids and lamp fittings"); fflush(stdout)
        }
        // Verify the sun has distinct rays, with matching X/Y
        // extents and rotational symmetry. Test nested inset contours as well.
        for inset in [0.0, 1.6, 2.4, 4.1, 6.1] {
            for i in 0..<720 {
                let a = Double(i) * .pi / 360
                let r = CloudGenerator.radius(a, inset:inset, width:200, profile:defaults.profile)
                let rotated = CloudGenerator.radius(a + 2 * .pi / Double(rays), inset:inset, width:200, profile:defaults.profile)
                require(abs(r-rotated) < 1e-8, "Sun rays are not symmetric")
                if inset > 0 {
                    let outside = CloudGenerator.radius(a, inset:0, width:200, profile:defaults.profile)
                    require(outside-r >= inset-1e-8, "Sun inset loses wall thickness")
                }
            }
        }
        let tip = CloudGenerator.radius(0, inset:0, width:200, profile:defaults.profile)
        let root = style.notchAngles.map { CloudGenerator.radius($0, inset:0, width:200, profile:defaults.profile) }
        require(root.allSatisfy { abs($0-style.notchRadius*200) < 1e-6 } && tip == 100 && tip-root[0] > 35, "Sun rays are not distinct")
        for width in [defaults.minimumWidth, 200, 500] { for cut in [16.0, 50, 100] { for spacing in [14.0, 40] {
            var p=defaults; p.width=width; p.stripCutLength=cut; p.ledRowSpacing=spacing
            checkLEDLayout(p)
        } } }
        let kit = CloudKit(defaults)
        let entries = try kit.entries().map(\.0)
        require(Set(entries) == Set(["A-sun-back-opaque.stl", "B-sun-front-diffuser.stl", "C-cable-seal-TPU.stl", "D-cable-clamp-bar.stl", "E-cable-clamp-anvil.stl", "LED-LAYOUT.svg", "ASSEMBLY.md", "sun-settings.json"]), "Sun kit names or contents incorrect")
        require(kit.instructions.contains("Sun wall lamp") && kit.ledPlan.svg.contains(defaults.displayName), "Sun export mislabeled")
        require(!kit.ledPlan.sections.isEmpty && kit.ledPlan.rowCount > 3, "Sun has no useful LED layout")
        print("PASS \(style.title) sun: clips on flat flanks, independent settings keys, fitting layouts, 18 LED layouts, ray symmetry and kit packaging")
    }
}
