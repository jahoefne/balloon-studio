import Foundation

extension GeometryTests {
    /// The one-piece wall clip for the lead: a plate under the cable with a
    /// strap fixed on one side and free on the other, the nail in the plate's
    /// extension past the strap. Dimensions are stated here, independently of
    /// the generator: strap inner radius cable/2 + 0.1, plate 1.4 (or head
    /// height + 0.6), plate dropped by 1.0 past the cable on the open side,
    /// nail 0.6 past the strap with 1.0 of plate beyond its counterbore.
    static func checkCableClips() throws {
        try? FileManager.default.removeItem(atPath:".build/test-output/cable-clip")
        try FileManager.default.createDirectory(atPath:".build/test-output/cable-clip", withIntermediateDirectories:true)
        let defaults = CableClipParameters()
        require(defaults.cableDiameter == 3.75 && defaults.mount == .nail && defaults.nailDiameter == 1.8 && defaults.nailHeadDiameter == 3.3
                && defaults.nailHeadHeight == 0.7 && defaults.nailGap == 3 && defaults.plate == 2 && defaults.length == 6 && defaults.wall == 0.7 && defaults.overlap == 0.5 && !defaults.flat, "Cable clip defaults changed")

        // Settings: round trip, normalization, partial, unknown and old files.
        let restored = try JSONDecoder().decode(CableClipParameters.self, from:JSONEncoder().encode(defaults))
        require(restored == defaults, "Cable clip settings failed to round trip")
        var bad = defaults
        bad.cableDiameter = 50; bad.nailDiameter = -1; bad.nailHeadDiameter = 99; bad.nailHeadHeight = 0; bad.nailGap = 99; bad.plate = 0; bad.length = 1; bad.wall = 9; bad.overlap = .nan
        let fixed = bad.normalized()
        require(fixed.cableDiameter == 6 && fixed.nailDiameter == 1 && fixed.nailHeadDiameter == 8 && fixed.nailHeadHeight == 0.3
                && fixed.nailGap == 10 && fixed.plate == 1.2 && fixed.length == 4 && fixed.wall == 1.2 && fixed.overlap == 0.5, "Cable clip normalization failed")
        require(fixed.normalized() == fixed, "Cable clip normalization is not idempotent")
        let partial = try JSONDecoder().decode(CableClipParameters.self, from:Data("{\"cableDiameter\":4,\"mount\":\"adhesive\"}".utf8))
        require(partial.cableDiameter == 4 && partial.mount == .adhesive && partial.length == 6 && partial.overlap == 0.5 && partial.plate == 2, "Partial cable clip settings did not fill in")
        let unknown = try JSONDecoder().decode(CableClipParameters.self, from:Data("{\"mount\":\"velcro\"}".utf8))
        require(unknown.mount == .nail, "Unknown fixing did not fall back")
        // Settings saved by the two-part clip of 1.28: the cable and nail carry over, the rest is ignored or clamped.
        let old = try JSONDecoder().decode(CableClipParameters.self, from:Data("{\"cableDiameter\":3.75,\"grip\":0.4,\"nailDiameter\":1.4,\"length\":8,\"wall\":1.6,\"hookDepth\":0.5,\"play\":0.2,\"rail\":true,\"railLength\":20}".utf8)).normalized()
        require(old.nailDiameter == 1.4 && old.length == 8 && old.wall == 1.2 && old.overlap == 0.5, "Old two-part settings did not migrate")
        require(defaults.filename == "Cable-Clip-3.75mm.stl", "Cable clip filename changed")
        var glued = defaults; glued.mount = .adhesive
        var flat = defaults; flat.flat = true
        var four = defaults; four.cableDiameter = 4
        require(Set([defaults.filename, glued.filename, flat.filename, four.filename]).count == 4, "Cable clip variants share a filename")
        require(glued.filename.contains("-adhesive") && flat.filename.contains("-flat") && four.filename.hasPrefix("Cable-Clip-4mm"), "Cable clip filename parts")

        // Problems and notes.
        var smallHead = defaults; smallHead.nailHeadDiameter = 2.2
        require(CableClip(smallHead).problem != nil, "A 2.2 mm head on a 1.8 mm nail was accepted")
        require(CableClip(defaults).problem == nil && CableClip(defaults).note == nil, "The default clip reports a problem")
        var tall = defaults; tall.nailHeadHeight = 2
        let tallClip = CableClip(tall)
        require(abs(tallClip.plateThickness-2.6) < 1e-9 && abs(tallClip.counterboreDepth-2) < 1e-9 && tallClip.note == nil, "A tall head does not thicken the plate")
        var deep = defaults; deep.overlap = 1.5
        let deepClip = CableClip(deep)
        require(deepClip.opening >= 0.3-1e-9 && (deepClip.overlap >= 1.5-0.01 || deepClip.note != nil), "A deep overlap left the tip too close to the plate")
        var thinDeep = defaults; thinDeep.cableDiameter = 2; thinDeep.mount = .adhesive; thinDeep.overlap = 1.5
        let thinClip = CableClip(thinDeep)
        require(thinClip.overlap < 0.9-0.01 && thinClip.note != nil && abs(thinClip.opening-0.3) < 0.02, "A deep overlap on a 2 mm cable was not limited to keep the tip off the plate")
        let kit = CableClipKit.generate(smallHead, quality:.export)
        try kit.mesh.validate()

        var cases: [(String, CableClipParameters, Bool)] = [("default", defaults, true), ("adhesive", glued, false), ("flat", flat, false)]
        var small = CableClipParameters()
        small.cableDiameter = 2; small.length = 4; small.wall = 0.6; small.overlap = 0.3; small.nailDiameter = 1; small.nailHeadDiameter = 2; small.nailHeadHeight = 0.3
        cases.append(("small", small, false))
        var big = CableClipParameters()
        big.cableDiameter = 6; big.length = 12; big.wall = 1.2; big.overlap = 1.5; big.nailDiameter = 4; big.nailHeadDiameter = 8; big.nailHeadHeight = 2
        cases.append(("big", big, false))
        var thin = CableClipParameters(); thin.cableDiameter = 2; thin.mount = .adhesive
        cases.append(("thin-adhesive", thin, false))
        var long = CableClipParameters(); long.cableDiameter = 3.5; long.length = 12; long.nailHeadHeight = 1.2
        cases.append(("long-tall-head", long, false))
        var printed = CableClipParameters(); printed.nailDiameter = 1.4; printed.length = 8; printed.wall = 1.2
        cases.append(("thick-strap", printed, false))
        cases.append(("deep-overlap", deep, false))
        var flatBig = big; flatBig.flat = true
        cases.append(("big-flat", flatBig, false))
        var thick = CableClipParameters(); thick.plate = 4
        cases.append(("thick-plate", thick, false))
        var thinPlate = CableClipParameters(); thinPlate.plate = 1.2; thinPlate.nailHeadHeight = 1.0
        cases.append(("thin-plate-tall-head", thinPlate, false))
        var tight = CableClipParameters(); tight.nailGap = 0.4
        cases.append(("tight-nail", tight, false))
        var roomy = CableClipParameters(); roomy.nailGap = 10
        cases.append(("roomy-nail", roomy, false))
        for (name, p, write) in cases { try checkCableClip(p, name:name, write:write) }
        print("PASS cable clip: \(cases.count) one-piece clips at preview and export resolution, cable room, opening, strap, plate, nail hole, print orientation, settings")
    }

    static func checkCableClip(_ input: CableClipParameters, name: String, write: Bool) throws {
        let p = input.normalized()
        let up = Point3(x:0, y:0, z:1), down = Point3(x:0, y:0, z:-1), right = Point3(x:1, y:0, z:0), left = Point3(x:-1, y:0, z:0)
        func close(_ actual: Double, _ expected: Double, _ message: String, _ tolerance: Double = 1e-6) {
            require(abs(actual-expected) < tolerance, "\(message): \(actual) instead of \(expected)")
        }
        func distance(_ mesh: BalloonMesh, _ o: Point3, _ d: Point3) -> Double { ray(mesh, o, d)?.0 ?? .infinity }
        // The dimensions as the design states them.
        let nail = p.mount == .nail, c = p.cableDiameter, r = c/2, inner = r+0.1, outer = inner+p.wall
        let bore = p.nailDiameter+0.3, cbore = max(p.nailHeadDiameter+0.3, bore+0.4)
        let plate = nail ? max(p.plate, p.nailHeadHeight+0.6) : p.plate
        let w = max(outer, 1.5, nail ? cbore/2+0.7 : 0)
        let center = plate+r, edgeX = max(0.4*r, 0.6)
        let half = p.length/2
        let flareEnd = half+1.1*(w-edgeX)
        let nailY = max(half+p.nailGap+cbore/2, half+(cbore/2+0.7)*(1+1.1*1.1).squareRoot()-1.1*edgeX), end = nail ? nailY+cbore/2+1.0 : half, total = half+end
        let height = center+outer, depth = nail ? min(p.nailHeadHeight, plate-0.6) : 0
        for quality in [BalloonGenerator.Quality.preview, .export] {
            let kit = CableClipKit.generate(p, quality:quality), clip = kit.clip, mesh = kit.mesh
            let label = "\(name) at \(quality)"
            close(clip.width, 2*w, "Width, \(label)"); close(clip.length, total, "Length, \(label)"); close(clip.height, height, "Height, \(label)")
            close(clip.plateThickness, plate, "Plate, \(label)"); close(clip.edgeX, edgeX, "Edge, \(label)")
            if nail { close(clip.flareEnd, flareEnd, "Slant, \(label)") }
            if nail { close(clip.nailY ?? -1, nailY, "Nail position, \(label)") } else { require(clip.nailY == nil, "Nail on a glued clip, \(label)") }
            require(clip.opening >= 0.3-1e-9, "Tip too close to the plate: \(clip.opening), \(label)")
            require(clip.overlap > 0.29 && clip.overlap <= p.overlap+1e-9, "Overlap \(clip.overlap) out of range, \(label)")
            require(clip.snapStrain > 0.002 && clip.snapStrain < 0.08, "Strain estimate \(clip.snapStrain) out of range, \(label)")
            try mesh.validate()
            close(mesh.dimensions.x, 2*w, "Mesh width, \(label)"); close(mesh.dimensions.y, total, "Mesh length, \(label)"); close(mesh.dimensions.z, height, "Mesh height, \(label)")
            close(mesh.vertices.map(\.z).min()!, 0, "Clip off the wall, \(label)")
            // The cable's room, from its middle: the arch above and on both sides, the plate below.
            let o = Point3(x:0, y:0, z:center)
            close(distance(mesh, o, up), inner, "Arch over the cable, \(label)", 0.01)
            close(distance(mesh, o, left), inner, "Arch on the root side, \(label)", 0.01)
            close(distance(mesh, o, right), inner, "Arch on the open side, \(label)", 0.01)
            close(distance(mesh, o, down), r, "Plate under the cable, \(label)")
            for k in 0..<24 {
                let a = 2*Double.pi*Double(k)/24, q = Point3(x:(r-0.02)*cos(a), y:0, z:center+(r-0.02)*sin(a))
                require(!inside(mesh, q), "Cable cut by the clip at angle \(k), \(label)")
                let qe = Point3(x:(r-0.02)*cos(a), y:end-0.5, z:center+(r-0.02)*sin(a))
                require(!inside(mesh, qe), "Cable cut by the plate's end at angle \(k), \(label)")
            }
            // The strap: root with its fillet, round tip, the opening below the tip, nothing beyond the strap's length.
            require(inside(mesh, Point3(x:-(inner+outer)/2, y:0, z:plate+0.2)) && inside(mesh, Point3(x:-inner+0.08, y:0, z:plate+0.08)), "No strap root, \(label)")
            require(inside(mesh, Point3(x:0, y:0, z:center+(inner+outer)/2)), "No arch, \(label)")
            let tip = clip.tip
            require(inside(mesh, Point3(x:tip.x, y:0, z:tip.z)), "No tip, \(label)")
            require(!inside(mesh, Point3(x:tip.x, y:0, z:tip.z-p.wall/2-0.05)) && !inside(mesh, Point3(x:tip.x, y:0, z:clip.tipBottom-0.3)), "Opening blocked, \(label)")
            require(distance(mesh, Point3(x:tip.x, y:0, z:clip.tipBottom-0.01), down) >= clip.opening-0.05, "Opening under the tip narrower than stated, \(label)")
            require(clip.opening <= clip.tipBottom+1e-6, "Opening wider than the space under the tip, \(label)")
            require(!inside(mesh, Point3(x:-(inner+outer)/2, y:half+0.2, z:center)) && !inside(mesh, Point3(x:0, y:-half-0.2, z:center+inner+p.wall/2)), "Strap beyond its length, \(label)")
            // The plate: full under the cable, dropped past it on the open side.
            require(inside(mesh, Point3(x:edgeX-0.1, y:0, z:plate-0.05)) && inside(mesh, Point3(x:edgeX-0.1, y:0, z:0.3)) && inside(mesh, Point3(x:-w+0.1, y:0, z:0.3)), "Plate missing under the strap, \(label)")
            require(!inside(mesh, Point3(x:edgeX+0.15, y:0, z:plate-0.05)) && !inside(mesh, Point3(x:edgeX+0.15, y:0, z:0.3)) && !inside(mesh, Point3(x:w-0.1, y:0, z:0.3)), "Plate reaches under the strap's tip, \(label)")
            if nail {
                // The extension: plate only, with the bore and the counterbore under the cable's line.
                require(!inside(mesh, Point3(x:0, y:nailY, z:plate+0.2)) && !inside(mesh, Point3(x:0, y:nailY, z:0.3)), "Extension blocked, \(label)")
                require(!inside(mesh, Point3(x:bore/2-0.05, y:nailY, z:0.3)) && inside(mesh, Point3(x:bore/2+0.1, y:nailY, z:0.3)), "Bore size, \(label)")
                require(!inside(mesh, Point3(x:cbore/2-0.05, y:nailY, z:plate-depth/2)) && inside(mesh, Point3(x:cbore/2+0.1, y:nailY, z:plate-depth/2)), "Counterbore size, \(label)")
                require(inside(mesh, Point3(x:(bore+cbore)/4, y:nailY, z:plate-depth-0.05)), "No counterbore floor, \(label)")
                close(distance(mesh, Point3(x:(bore+cbore)/4, y:nailY, z:plate+1), down), 1+depth, "Counterbore depth, \(label)")
                require(inside(mesh, Point3(x:w-0.1, y:nailY, z:plate-0.05)) && !inside(mesh, Point3(x:w-0.1, y:nailY, z:plate+0.05)), "Extension not full height, \(label)")
                require(inside(mesh, Point3(x:w-0.1, y:flareEnd+0.1, z:0.5)) && !inside(mesh, Point3(x:w-0.1, y:half-0.1, z:0.5)), "Plate not full width past the slant, \(label)")
                let ym = (half+flareEnd)/2, xm = edgeX+(w-edgeX)/2
                require(inside(mesh, Point3(x:xm-0.15, y:ym, z:0.5)) && !inside(mesh, Point3(x:xm+0.15, y:ym, z:0.5)), "No slant between strap and extension, \(label)")
                require(inside(mesh, Point3(x:-w+0.1, y:end-0.2, z:plate-0.05)), "Plate ends early, \(label)")
                require(nailY-cbore/2-half >= p.nailGap-1e-9, "Nail too close to the strap, \(label)")
                require(inside(mesh, Point3(x:0, y:half+p.nailGap/2, z:plate-0.05)), "No plate between strap and nail, \(label)")
            } else {
                require(inside(mesh, Point3(x:0, y:0, z:0.3)) && inside(mesh, Point3(x:0, y:half-0.2, z:0.3)), "Hole in a glued clip, \(label)")
            }
            // Print view: on the bed, standing on the strap's end unless flat.
            let print = kit.printView
            try print.validate()
            close(print.vertices.map(\.z).min()!, 0, "Print view below the bed, \(label)")
            if p.flat {
                close(print.dimensions.z, height, "Flat print height, \(label)"); close(print.dimensions.y, total, "Flat print length, \(label)")
            } else {
                close(print.dimensions.z, total, "Standing print height, \(label)"); close(print.dimensions.x, 2*w, "Standing print width, \(label)"); close(print.dimensions.y, height, "Standing print depth, \(label)")
                require(print.vertices.contains { abs($0.z) < 1e-9 && abs($0.y+height) < 1e-6 && abs($0.x) < 1e-6 }, "Not standing on the strap's end, \(label)")
                // Nothing overhangs more than 45°, but for the horizontal nail hole, which bridges.
                for t in print.triangles {
                    let v = [t.a, t.b, t.c].map { print.vertices[$0] }, n = (v[1]-v[0]).cross(v[2]-v[0]).unit
                    let inHole = nail && v.allSatisfy { hypot($0.x, $0.z-(nailY+half)) <= cbore/2+1e-6 }
                    require(n.z > -0.7072 || v.allSatisfy { abs($0.z) < 1e-9 } || inHole, "Overhang on the standing clip at \(v[0]), \(label)")
                }
            }
            // The preview: clip, cable and nail, each its own colour.
            let assembly = kit.assembly()
            require(assembly.colors.count == assembly.mesh.triangles.count && Set(assembly.colors) == Set(nail ? [0, 2, 3] : [0, 2]), "Preview parts, \(label)")
            let cable = kit.cable()
            try cable.validate()
            close(cable.dimensions.z, c, "Cable size, \(label)", 1e-6); close(cable.vertices.map(\.z).min()!, plate, "Cable off its floor, \(label)", 1e-6)
            for nailMesh in kit.nail() { try nailMesh.validate() }
            require(kit.notes.contains(p.cableText) && kit.notes.contains("strap"), "Notes, \(label)")
            guard quality == .export else { continue }
            let data = try print.binarySTL(), parsed = parseSTL(data)
            try parsed.validate()
            let a = parsed.dimensions, b = print.dimensions
            require(abs(a.x-b.x) < 1e-4 && abs(a.y-b.y) < 1e-4 && abs(a.z-b.z) < 1e-4, "STL dimensions changed, \(label)")
            if write {
                let dir = ".build/test-output/cable-clip"
                try data.write(to:URL(fileURLWithPath:"\(dir)/\(p.filename)"))
                try mesh.binarySTL().write(to:URL(fileURLWithPath:"\(dir)/seated-clip.stl"))
                try CableClipGenerator.rod(y0:-12, y1:12, r:r-0.01, z:center).binarySTL().write(to:URL(fileURLWithPath:"\(dir)/seated-cable.stl"))
                try JSONEncoder().encode(p).write(to:URL(fileURLWithPath:"\(dir)/cable-clip-settings.json"))
            }
        }
    }
}
