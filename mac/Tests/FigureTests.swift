import Foundation

extension GeometryTests {
    /// Figures for the mobile: every style at several settings, their holes,
    /// their domes, their drawings and their settings.
    static func checkFigures() throws {
        try FileManager.default.createDirectory(atPath:".build/test-output/figures", withIntermediateDirectories:true)
        let defaults = FigureParameters()
        require(defaults.style == .star && defaults.height == 60 && defaults.surface == .pillow && defaults.edge == 1.6 && defaults.dome == 3.2
                && !defaults.doubleSided && defaults.holeDiameter == 2 && defaults.holeMargin == 2.5 && !defaults.chainHole, "Figure defaults changed")
        require(FigureStyle.allCases.count == 7 && FigureSurface.allCases.count == 3, "Figure catalogue changed")

        // Settings: round trip, normalization, old and partial files.
        let restored = try JSONDecoder().decode(FigureParameters.self, from:JSONEncoder().encode(defaults))
        require(restored == defaults, "Figure settings failed to round trip")
        var bad = defaults
        bad.height = 500; bad.edge = .nan; bad.dome = 0; bad.holeDiameter = -1; bad.holeMargin = 99; bad.surface = .flat; bad.doubleSided = true
        let fixed = bad.normalized()
        require(fixed.height == 120 && fixed.edge == 1.6 && fixed.dome == 0.8 && fixed.holeDiameter == 1.5 && fixed.holeMargin == 6 && !fixed.doubleSided, "Figure normalization failed")
        require(fixed.normalized() == fixed, "Figure normalization is not idempotent")
        let partial = try JSONDecoder().decode(FigureParameters.self, from:Data("{\"style\":\"moon\",\"height\":75}".utf8))
        require(partial.style == .moon && partial.height == 75 && partial.surface == .pillow && partial.edge == 1.6, "Partial figure settings did not fill in")
        let unknown = try JSONDecoder().decode(FigureParameters.self, from:Data("{\"style\":\"dragon\",\"surface\":\"velvet\"}".utf8))
        require(unknown.style == .star && unknown.surface == .pillow, "Unknown figure names did not fall back")
        var filenames = Set<String>()
        for style in FigureStyle.allCases {
            var p = defaults; p.style = style
            require(filenames.insert(p.filename).inserted && p.filename.contains(style.rawValue) && p.filename.hasSuffix(".stl"), "Figures share an export filename")
            var flat = p; flat.surface = .flat
            var two = p; two.doubleSided = true
            var chain = p; chain.chainHole = true
            require(Set([p.filename, flat.filename, two.filename, chain.filename]).count == 4, "Figure variants share a filename")
            require(p.setFilename.hasSuffix(".zip") && p.setFilename == defaults.setFilename, "The set's filename depends on the chosen figure")
        }
        try checkFigureDrawings()

        // Every figure at the default settings, at both resolutions.
        for style in FigureStyle.allCases {
            var p = defaults; p.style = style
            try checkFigure(p, name:"\(style.rawValue)-default", write:true)
        }
        // Extremes and options on a few figures.
        var cases: [(String, FigureParameters)] = []
        for style in [FigureStyle.star, .balloon, .moon] {
            var small = FigureParameters(style:style)
            small.height = 40; small.edge = 0.8; small.dome = 0.8; small.holeDiameter = 1.5; small.holeMargin = 1.5
            cases.append(("\(style.rawValue)-small", small))
            var large = FigureParameters(style:style)
            large.height = 120; large.edge = 6; large.dome = 10; large.holeDiameter = 4; large.holeMargin = 6; large.chainHole = true
            cases.append(("\(style.rawValue)-large-chain", large))
        }
        for style in FigureStyle.allCases {
            var p = FigureParameters(style:style); p.surface = .flat
            cases.append(("\(style.rawValue)-flat", p))
            var puffy = FigureParameters(style:style); puffy.surface = .puffy; puffy.chainHole = true
            cases.append(("\(style.rawValue)-puffy-chain", puffy))
            var two = FigureParameters(style:style); two.doubleSided = true
            cases.append(("\(style.rawValue)-two-sided", two))
        }
        for (name, p) in cases { try checkFigure(p, name:name, write:name.hasPrefix("cloud") || name.hasPrefix("star-large")) }

        // The set holds every figure, the notes and the settings.
        let entries = try FigureSet.entries(defaults)
        require(entries.count == FigureStyle.allCases.count+2, "Figure set has \(entries.count) entries")
        for style in FigureStyle.allCases {
            var p = defaults; p.style = style
            let entry = entries.first { $0.0 == p.filename }
            require(entry != nil, "Figure set lacks \(style.title)")
            let parsed = parseSTL(entry!.1)
            try parsed.validate()
            require(abs(parsed.dimensions.y-60) < 0.05, "Set figure \(style.title) is \(parsed.dimensions.y) tall")
        }
        let notes = String(decoding:entries.first { $0.0 == "FIGURES.md" }!.1, as:UTF8.self)
        require(notes.contains("flat back down") && notes.contains("out of a baby's reach") && notes.contains("60 mm tall"), "Figure notes changed")
        let saved = try JSONDecoder().decode(FigureParameters.self, from:entries.first { $0.0 == "figure-settings.json" }!.1)
        require(saved == defaults, "Figure set settings do not reopen")
        try FigureSet.archive(defaults).write(to:URL(fileURLWithPath:".build/test-output/figures/\(defaults.setFilename)"))
        print("PASS figures: seven figures at both resolutions, extremes, flat, puffy, two-sided and chained variants, holes, domes, drawings, settings and the set")
    }

    /// Every drawing is a simple polygon: no loop crosses itself or another.
    private static func checkFigureDrawings() throws {
        func crosses(_ a: SIMD2<Double>, _ b: SIMD2<Double>, _ c: SIMD2<Double>, _ d: SIMD2<Double>) -> Bool {
            func side(_ p: SIMD2<Double>, _ q: SIMD2<Double>, _ r: SIMD2<Double>) -> Double { (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x) }
            let s1 = side(a, b, c), s2 = side(a, b, d), s3 = side(c, d, a), s4 = side(c, d, b)
            return s1*s2 < -1e-12 && s3*s4 < -1e-12
        }
        for style in FigureStyle.allCases {
            let outline = style.outline
            let loops = outline.loops
            for (l, loop) in loops.enumerated() {
                require(loop.count >= 3, "\(style.title) has a degenerate loop")
                for i in loop.indices {
                    require(hypot(loop[i].x-loop[(i+1) % loop.count].x, loop[i].y-loop[(i+1) % loop.count].y) > 1e-9, "\(style.title) repeats a point")
                }
                // Within a loop, segments that share an end never count as crossing.
                for i in loop.indices { for j in loop.indices where j > i+1 && !(i == 0 && j == loop.count-1) {
                    require(!crosses(loop[i], loop[(i+1) % loop.count], loop[j], loop[(j+1) % loop.count]), "\(style.title)'s drawing crosses itself")
                } }
                for other in loops[(l+1)...] {
                    for i in loop.indices { for j in other.indices {
                        require(!crosses(loop[i], loop[(i+1) % loop.count], other[j], other[(j+1) % other.count]), "\(style.title)'s window crosses its outline")
                    } }
                }
            }
            require(outline.rawHeight > 0 && outline.rawWidth > 0 && outline.rounding > 0, "\(style.title) has no size")
            let (field, hanging, _) = FigureGenerator.field(FigureParameters(style:style))
            require(hanging != nil, "\(style.title) has no room for its thread hole at 60 mm")
            // The centroid lies inside the figure, and the hole hangs over it.
            let centroid = (outline.centroid-SIMD2((outline.minX+outline.maxX)/2, (outline.minY+outline.maxY)/2))*FigureParameters(style:style).scale
            require(abs(hanging!.x-centroid.x) < 1e-9, "\(style.title)'s hole is not above its centre of gravity")
            require(field.distance(centroid) > -field.rounding, "\(style.title)'s centre of gravity lies outside it")
        }
        require(FigureStyle.balloon.outline.loops.count == 2 && FigureStyle.allCases.filter { $0.outline.loops.count == 1 }.count == 6, "Only the balloon has a window")
    }

    private static func checkFigure(_ input: FigureParameters, name: String, write: Bool) throws {
        let p = input.normalized()
        let preview = FigureGenerator.generate(p)
        try preview.mesh.validate()
        let body = FigureGenerator.generate(p, quality:.export)
        let data = try body.mesh.binarySTL(), parsed = parseSTL(data)
        try parsed.validate()
        if write { try data.write(to:URL(fileURLWithPath:".build/test-output/figures/\(name).stl")) }
        let dims = parsed.dimensions
        require(abs(dims.y-p.height) < 0.03, "\(name): height \(dims.y) instead of \(p.height)")
        require(abs(dims.x-p.width) < 0.03, "\(name): width \(dims.x) instead of \(p.width)")
        require(abs(dims.z-p.thickness) < 0.02, "\(name): thickness \(dims.z) instead of \(p.thickness)")
        require(parsed.vertices.allSatisfy { $0.z >= -1e-6 }, "\(name) lies below the bed")
        require(abs(body.mesh.dimensions.z-preview.mesh.dimensions.z) < 0.02, "\(name): preview and export differ in thickness")

        let holes = body.holes
        require(holes == (p.chainHole ? 2 : 1), "\(name) has \(holes) holes")
        require(body.hangingHole != nil, "\(name) lacks its thread hole")
        // Genus: one handle per thread hole and per window in the drawing.
        let handles = holes+p.style.outline.loops.count-1
        for mesh in [parsed, preview.mesh] {
            require(mesh.vertices.count-mesh.triangles.count/2 == 2-2*handles, "\(name): \(mesh.vertices.count-mesh.triangles.count/2) instead of \(2-2*handles) for \(handles) handles")
        }
        let r = p.holeDiameter/2
        for hole in [body.hangingHole, body.chainHole].compactMap({ $0 }) {
            // A thread passes straight through, and the material around the hole is at least the margin.
            for angle in stride(from:0.0, to:2 * .pi, by: .pi/6) {
                let inside = SIMD2(hole.x+(r-0.15)*cos(angle), hole.y+(r-0.15)*sin(angle))
                require(!hits(parsed, x:inside.x, y:inside.y), "\(name): hole blocked at \(inside)")
                let rim = SIMD2(hole.x+(r+0.3)*cos(angle), hole.y+(r+0.3)*sin(angle))
                require(hits(parsed, x:rim.x, y:rim.y), "\(name): nothing around the hole at \(rim)")
                let margin = SIMD2(hole.x+(r+p.holeMargin-0.3)*cos(angle), hole.y+(r+p.holeMargin-0.3)*sin(angle))
                require(hits(parsed, x:margin.x, y:margin.y), "\(name): material around the hole thinner than the margin at \(margin)")
            }
            require(hole.y+r+p.holeMargin <= p.height/2+1e-6 && hole.y-r-p.holeMargin >= -p.height/2-1e-6, "\(name): hole too close to the top or bottom")
        }
        if let hanging = body.hangingHole, let chain = body.chainHole {
            require(hanging.y > chain.y && hypot(hanging.x-chain.x, hanging.y-chain.y) >= 2*r+p.holeMargin, "\(name): holes too close")
        }

        // The dome: flat back, full height on the thickest part, the edge band
        // at the outline, a rise in between, and nothing beyond the drawing.
        let (field, _, _) = FigureGenerator.field(p)
        let top = parsed.vertices.filter { $0.z > p.thickness-1e-6 }
        require(!top.isEmpty, "\(name) never reaches its thickness")
        let base = p.sides == 2 ? p.dome : 0
        for v in parsed.vertices {
            let d = field.distance(SIMD2(v.x, v.y))
            // Across a notch or the hole a chord lies outside the drawing by its
            // sagitta, well under a tenth of a millimetre at the largest size.
            require(d > -0.12, "\(name): a vertex lies \(-d) mm outside the drawing at \(v)")
            if p.surface == .flat {
                require(abs(v.z) < 1e-6 || abs(v.z-p.edge) < 1e-6, "\(name): a flat figure has a vertex at z \(v.z)")
            } else {
                require(v.z >= -1e-6 && v.z <= p.thickness+1e-6, "\(name): vertex height \(v.z) out of range")
                // Only the edge band and the flat back touch the outline; the domes stay inside it.
                let onBand = abs(v.z-base-p.edge) < 1e-6 || abs(v.z-base) < 1e-6 || abs(v.z) < 1e-6
                if !onBand { require(d > 0, "\(name): a dome vertex lies on the outline at \(v)") }
                if v.z > base+p.edge+1e-6 { require(v.z-base-p.edge <= p.dome+1e-6, "\(name): front too high at \(v)") }
                if v.z < base-1e-6 { require(p.sides == 2 && base-v.z <= p.dome+1e-6, "\(name): back too low at \(v)") }
                if p.sides == 1 { require(v.z >= -1e-9 && (v.z < 1e-6 || v.z >= p.edge-1e-6), "\(name): a flat-backed figure has material below its edge band") }
            }
        }
        if p.surface != .flat {
            // Near the outline the front already stands well above the edge band.
            let near = parsed.vertices.filter { v in let d = field.distance(SIMD2(v.x, v.y)); return d > 0.4 && d < 0.6 && v.z > base+p.edge-1e-6 }
            require(!near.isEmpty && near.allSatisfy { $0.z > base+p.edge+0.25*p.dome*min(1, 0.5/(0.4*p.dome)) }, "\(name): the dome does not roll up from the edge")
            // The thickest vertices sit where the figure is widest.
            let deepest = parsed.vertices.map { field.distance(SIMD2($0.x, $0.y)) }.max()!
            require(top.allSatisfy { field.distance(SIMD2($0.x, $0.y)) >= min(deepest, p.surface == .puffy ? deepest : 1.75*p.dome)-0.05 }, "\(name): full height on a thin part")
        }
        // The hanging view keeps every triangle and adds a thread.
        let view = body.hangingView()
        require(view.colors.count == view.mesh.triangles.count && view.colors.filter { $0 == 1 }.count == 12, "\(name): hanging view colours")
        let upright = view.mesh.vertices.prefix(body.mesh.vertices.count).map(\.z)
        require(abs(upright.min()!) < 0.03 && abs(upright.max()!-p.height) < 0.03, "\(name): hanging view is not upright")
    }

    /// Whether a line through the figure's plane at (x, y) meets the body.
    private static func hits(_ mesh: BalloonMesh, x: Double, y: Double) -> Bool {
        for t in mesh.triangles {
            let a = mesh.vertices[t.a], b = mesh.vertices[t.b], c = mesh.vertices[t.c]
            let d1 = (b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x)
            let d2 = (c.x-b.x)*(y-b.y)-(c.y-b.y)*(x-b.x)
            let d3 = (a.x-c.x)*(y-c.y)-(a.y-c.y)*(x-c.x)
            if (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0) { return true }
        }
        return false
    }
}
