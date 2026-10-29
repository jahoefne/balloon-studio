import SwiftUI
import AppKit
import UniformTypeIdentifiers

@MainActor
final class FigureModel: ObservableObject {
    @Published private(set) var parameters: FigureParameters
    @Published private(set) var body: FigureBody
    @Published private(set) var revision = 0
    @Published private(set) var updating = false
    @Published private(set) var exporting = false
    @Published var exportedURL: URL?
    @Published var error: String?
    private var pending: Task<Void, Never>?
    private let key = "BalloonStudio.figure.v1"

    init() {
        let restored = UserDefaults.standard.data(forKey:key).flatMap { try? JSONDecoder().decode(FigureParameters.self, from:$0) }
        let p = (restored ?? FigureParameters()).normalized()
        parameters = p; body = FigureGenerator.generate(p)
    }
    func apply(_ value: FigureParameters) {
        let p = value.normalized()
        guard p != parameters else { return }
        parameters = p; exportedURL = nil
        if let data = try? JSONEncoder().encode(p) { UserDefaults.standard.set(data, forKey:key) }
        pending?.cancel(); updating = true
        pending = Task { [weak self] in
            do { try await Task.sleep(nanoseconds:60_000_000) } catch { return }
            guard !Task.isCancelled else { return }
            let body = await Task.detached(priority:.userInitiated) { FigureGenerator.generate(p) }.value
            guard !Task.isCancelled, let self else { return }
            self.body = body; self.revision += 1; self.updating = false
        }
    }
    private func commit() {
        NotificationCenter.default.post(name:.commitBalloonEditing, object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
    }
    func select(_ style: FigureStyle) { commit(); var p = parameters; p.style = style; apply(p) }
    func select(_ surface: FigureSurface) { commit(); var p = parameters; p.surface = surface; apply(p) }
    func setDoubleSided(_ wanted: Bool) { commit(); var p = parameters; p.doubleSided = wanted; apply(p) }
    func setChainHole(_ wanted: Bool) { commit(); var p = parameters; p.chainHole = wanted; apply(p) }
    func binding(_ key: WritableKeyPath<FigureParameters, Double>) -> Binding<Double> {
        Binding(get:{ self.parameters[keyPath:key] }, set:{ value in
            var p = self.parameters; p[keyPath:key] = value; self.apply(p)
        })
    }
    func export() { export(set:false) }
    func export(set: Bool) {
        guard !exporting else { return }
        commit()
        let p = parameters, panel = NSSavePanel()
        panel.title = set ? "Export Figure Set" : "Export Figure STL"
        panel.prompt = set ? "Export Set" : "Export Figure"
        panel.nameFieldStringValue = set ? p.setFilename : p.filename
        panel.allowedContentTypes = [UTType(filenameExtension:set ? "zip" : "stl") ?? .data]
        panel.canCreateDirectories = true
        panel.message = set ? "All seven figures at these settings, with printing and hanging notes. Millimetres; print flat back down."
            : "One figure for the mobile, with its thread hole. Millimetres; print flat back down."
        guard let window = NSApp.keyWindow else { return }
        panel.beginSheetModal(for:window) { [weak self] response in
            guard response == .OK, let url = panel.url, let self else { return }
            self.exporting = true
            Task {
                do {
                    try await Task.detached(priority:.userInitiated) {
                        let data = set ? try FigureSet.archive(p) : try FigureGenerator.generate(p, quality:.export).mesh.binarySTL()
                        try data.write(to:url, options:.atomic)
                    }.value
                    self.exportedURL = url
                } catch { self.error = error.localizedDescription }
                self.exporting = false
            }
        }
    }
}

struct FigureEditor: View {
    @ObservedObject var model: FigureModel
    @State private var showPlate = true
    @State private var wireframe = false
    @State private var hanging = true
    @State private var resetCamera = 0
    @State private var colorIndex = 0
    private let colors: [NSColor] = [
        NSColor(calibratedRed:0.98, green:0.85, blue:0.42, alpha:1),
        NSColor(calibratedRed:0.62, green:0.78, blue:0.92, alpha:1),
        NSColor(calibratedRed:0.95, green:0.72, blue:0.74, alpha:1),
        NSColor(calibratedRed:0.70, green:0.85, blue:0.72, alpha:1),
        NSColor(calibratedRed:0.78, green:0.72, blue:0.90, alpha:1)
    ]
    var body: some View {
        HStack(alignment:.top, spacing:0) {
            sidebar.frame(width:312)
            Divider().opacity(0.45)
            preview.padding(22)
        }
        .alert("Figure export failed", isPresented:Binding(get:{ model.error != nil }, set:{ if !$0 { model.error = nil } })) {
            Button("OK", role:.cancel) { model.error = nil }
        } message: { Text(model.error ?? "") }
    }
    private var sidebar: some View {
        let p = model.parameters
        return VStack(spacing:0) {
            ScrollView {
                VStack(alignment:.leading, spacing:20) {
                    VStack(alignment:.leading, spacing:8) {
                        label("CHOOSE A FIGURE")
                        ForEach(FigureStyle.allCases) { style in
                            let selected = p.style == style
                            Button { model.select(style) } label: {
                                HStack(spacing:10) {
                                    FigureSilhouette(style:style)
                                        .fill(selected ? Color.white : accent, style:FillStyle(eoFill:true))
                                        .frame(width:28, height:28)
                                    VStack(alignment:.leading, spacing:3) {
                                        Text(style.title).font(.system(size:12, weight:.semibold))
                                        Text(style.subtitle).font(.system(size:9))
                                            .foregroundStyle(selected ? Color.white.opacity(0.8) : .secondary)
                                    }
                                    Spacer(minLength:0)
                                    if selected { Image(systemName:"checkmark").font(.system(size:10, weight:.bold)) }
                                }.padding(11).frame(maxWidth:.infinity, alignment:.leading)
                                    .foregroundStyle(selected ? .white : ink)
                                    .background(selected ? accent : .white, in:RoundedRectangle(cornerRadius:9))
                            }.buttonStyle(.plain).accessibilityLabel("\(style.title) figure")
                        }
                    }
                    VStack(alignment:.leading, spacing:13) {
                        label("SIZE & BODY")
                        parameter("Height", \.height, FigureParameters.heightRange, "mm")
                        Picker("Surface", selection:Binding(get:{ p.surface }, set:{ model.select($0) })) {
                            ForEach(FigureSurface.allCases) { Text($0.title).tag($0) }
                        }.pickerStyle(.segmented).labelsHidden().accessibilityLabel("Figure surface")
                        Text(p.surface.subtitle).font(.system(size:10)).foregroundStyle(.secondary)
                        parameter(p.domed ? "Edge band" : "Thickness", \.edge, FigureParameters.edgeRange, "mm", step:0.2)
                        if p.domed {
                            parameter("Dome height", \.dome, FigureParameters.domeRange, "mm", step:0.2)
                            Toggle("Domed on both sides", isOn:Binding(get:{ p.doubleSided }, set:{ model.setDoubleSided($0) }))
                                .font(.system(size:12, weight:.medium)).toggleStyle(.checkbox)
                            Text(p.doubleSided ? "Needs supports under the lower dome. Or print the flat-backed figure twice and glue the pair back to back."
                                 : "The flat back prints without supports and sits well on the bed.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        }
                    }
                    Divider()
                    VStack(alignment:.leading, spacing:12) {
                        label("HANGING")
                        parameter("Thread hole", \.holeDiameter, FigureParameters.holeRange, "mm", step:0.5)
                        parameter("Material around hole", \.holeMargin, FigureParameters.marginRange, "mm", step:0.5)
                        Toggle("Second hole at the bottom", isOn:Binding(get:{ p.chainHole }, set:{ model.setChainHole($0) }))
                            .font(.system(size:12, weight:.medium)).toggleStyle(.checkbox)
                        Text(p.chainHole ? "For a figure hanging below this one: raindrops under a cloud, a star under the moon."
                             : "The hole sits as high as the figure allows, right above its centre of gravity, so it hangs straight.")
                            .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        if model.body.holes < model.body.holesWanted {
                            Label(model.body.hangingHole == nil ? "No room for the thread hole: make the figure taller or the hole smaller."
                                  : "No room for the second hole: make the figure taller or the hole smaller.", systemImage:"exclamationmark.triangle")
                                .font(.system(size:10)).foregroundStyle(.orange)
                        }
                    }
                }.padding(22)
            }
            VStack(spacing:9) {
                Button(action:model.export) {
                    HStack(spacing:7) {
                        if model.exporting { ProgressView().controlSize(.small) } else { Image(systemName:"square.and.arrow.up") }
                        Text(model.exporting ? "Preparing figure…" : "Export Figure STL…").fontWeight(.semibold)
                        Spacer(); Text("⌘E").opacity(0.65)
                    }.padding(.horizontal, 13).frame(height:42)
                }.buttonStyle(.plain).foregroundStyle(.white)
                    .background(accent, in:RoundedRectangle(cornerRadius:10)).disabled(model.exporting)
                    .accessibilityIdentifier("exportFigure")
                Button { model.export(set:true) } label: {
                    Label("Export all seven as a set (ZIP)…", systemImage:"square.stack.3d.up")
                        .font(.system(size:11, weight:.medium)).frame(maxWidth:.infinity).padding(.vertical, 9)
                }.buttonStyle(.plain).foregroundStyle(accent).disabled(model.exporting)
                    .background(accent.opacity(0.08), in:RoundedRectangle(cornerRadius:8))
                if let url = model.exportedURL {
                    Button { NSWorkspace.shared.activateFileViewerSelecting([url]) } label: {
                        Label("Saved · Show in Finder", systemImage:"checkmark.circle.fill").font(.system(size:11))
                    }.buttonStyle(.plain).foregroundStyle(accent)
                } else { Text("One STL per figure · thread hole included · millimetres").font(.system(size:10)).foregroundStyle(.secondary) }
            }.padding(20).background(.white.opacity(0.45))
        }
    }
    private var preview: some View {
        let p = model.parameters, body = model.body
        let shown = hanging ? body.hangingView() : (mesh:body.mesh, colors:[])
        return VStack(alignment:.leading, spacing:14) {
            HStack {
                Text("\(p.style.title) figure").font(.system(size:18, weight:.semibold, design:.rounded))
                Spacer()
                Text(model.updating ? "Updating…" : "Live preview").font(.system(size:10, weight:.medium)).foregroundStyle(accent)
            }
            ZStack(alignment:.topLeading) {
                BalloonPreview(mesh:shown.mesh, revision:model.revision*2+(hanging ? 1 : 0), color:colors[colorIndex],
                               showPlate:showPlate && !hanging, wireframe:wireframe, resetCamera:resetCamera, cutaway:false,
                               inspectOpening:false, neckDiameter:0, compactObject:true, faceColors:shown.colors,
                               detailColor:NSColor(white:0.82, alpha:1), minimumScale:40, objectName:"figure", sharpEdges:true,
                               smoothAngle:p.domed ? .pi/5 : 0)
                    .clipShape(RoundedRectangle(cornerRadius:16))
                Label(hanging ? "As it hangs · thread through the hole" : (p.sides == 2 ? "Print view · supports under the lower dome" : "Print view · flat back on the bed"),
                      systemImage:hanging ? "link" : "printer")
                    .font(.system(size:11, weight:.medium)).foregroundStyle(.white)
                    .padding(.horizontal, 11).padding(.vertical, 8).background(.black.opacity(0.27), in:Capsule()).padding(15)
                VStack {
                    Spacer()
                    HStack {
                        Text("Drag to orbit  ·  Scroll to zoom").font(.system(size:10)).foregroundStyle(.white.opacity(0.65))
                        Spacer()
                        Button { hanging.toggle(); resetCamera += 1 } label: {
                            Label(hanging ? "Print view" : "Hanging view", systemImage:"viewfinder").font(.system(size:10, weight:.medium)).padding(.horizontal, 9).frame(height:29)
                        }.buttonStyle(.plain).foregroundStyle(.white).background(.white.opacity(0.12), in:RoundedRectangle(cornerRadius:7))
                        Button { resetCamera += 1 } label: { Image(systemName:"arrow.counterclockwise").frame(width:29, height:29) }
                            .buttonStyle(.plain).foregroundStyle(.white)
                            .background(.white.opacity(0.12), in:RoundedRectangle(cornerRadius:7)).help("Reset figure camera")
                    }.padding(15)
                }
            }.frame(maxWidth:.infinity, maxHeight:.infinity).frame(minHeight:310)
            HStack(spacing:9) {
                ForEach(0..<colors.count, id:\.self) { i in
                    Button { colorIndex = i } label: {
                        Circle().fill(Color(nsColor:colors[i])).frame(width:18, height:18).padding(3)
                            .overlay(Circle().stroke(colorIndex == i ? accent : .clear, lineWidth:1.5))
                    }.buttonStyle(.plain).help("Preview colour only")
                }
                Spacer()
                if !hanging { Toggle("Build plate", isOn:$showPlate) }
                Toggle("Wireframe", isOn:$wireframe)
            }.font(.system(size:11)).toggleStyle(.checkbox)
            HStack(spacing:0) {
                metric("SIZE", "\(number(body.width)) × \(number(p.height))", "mm")
                Divider().frame(height:30)
                metric("THICKNESS", number(p.thickness), "mm")
                Divider().frame(height:30)
                metric("THREAD HOLE", "Ø \(number(p.holeDiameter))\(body.holes == 2 ? " · 2" : "")", "mm")
            }.padding(.vertical, 14).background(.white.opacity(0.8), in:RoundedRectangle(cornerRadius:12))
            HStack(alignment:.top, spacing:9) {
                Image(systemName:"link").foregroundStyle(accent)
                VStack(alignment:.leading, spacing:3) {
                    Text("Print flat back down, then thread and hang").font(.system(size:11, weight:.semibold))
                    Text("No supports needed. Tie a loop through the hole and hang the figures from the mobile ring at different heights, out of the baby's reach.")
                        .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2).fixedSize(horizontal:false, vertical:true)
                }
            }.padding(.top, 2)
        }
    }
    private func number(_ v: Double) -> String { v.formatted(.number.precision(.fractionLength(0...1))) }
    private func label(_ title: String) -> some View { Text(title).font(.system(size:9, weight:.bold)).tracking(1.3).foregroundStyle(.secondary) }
    private func parameter(_ title: String, _ key: WritableKeyPath<FigureParameters, Double>, _ range: ClosedRange<Double>, _ unit: String, step: Double = 1) -> some View {
        ParameterControl(title:title, value:model.binding(key), range:range, step:step, unit:unit)
    }
    private func metric(_ title: String, _ value: String, _ unit: String) -> some View {
        VStack(alignment:.leading, spacing:5) {
            Text(title).font(.system(size:8, weight:.bold)).tracking(0.7).foregroundStyle(.secondary)
            HStack(alignment:.firstTextBaseline, spacing:4) {
                Text(value).font(.system(size:21, weight:.medium, design:.rounded)).monospacedDigit()
                Text(unit).font(.system(size:10)).foregroundStyle(.secondary)
            }
        }.frame(maxWidth:.infinity, alignment:.leading).padding(.leading, 16)
    }
}

/// The figure's drawing, windows included, fitted into the given rectangle.
struct FigureSilhouette: Shape {
    let style: FigureStyle
    func path(in rect: CGRect) -> Path {
        let outline = style.outline
        let scale = min(rect.width/(outline.maxX-outline.minX), rect.height/(outline.maxY-outline.minY))
        let cx = (outline.minX+outline.maxX)/2, cy = (outline.minY+outline.maxY)/2
        var path = Path()
        for loop in outline.loops {
            for (i, p) in loop.enumerated() {
                let point = CGPoint(x:rect.midX+(p.x-cx)*scale, y:rect.midY-(p.y-cy)*scale)
                if i == 0 { path.move(to:point) } else { path.addLine(to:point) }
            }
            path.closeSubpath()
        }
        return path
    }
}
