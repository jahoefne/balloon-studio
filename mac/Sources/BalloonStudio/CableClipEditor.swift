import SwiftUI
import AppKit
import UniformTypeIdentifiers

@MainActor
final class CableClipModel: ObservableObject {
    @Published private(set) var parameters: CableClipParameters
    @Published private(set) var kit: CableClipKit
    @Published private(set) var revision = 0
    @Published private(set) var updating = false
    @Published private(set) var exporting = false
    @Published var exportedURL: URL?
    @Published var error: String?
    private var pending: Task<Void, Never>?
    private let key = "BalloonStudio.cableClip.v1"

    init() {
        let restored = UserDefaults.standard.data(forKey:key).flatMap { try? JSONDecoder().decode(CableClipParameters.self, from:$0) }
        let p = (restored ?? CableClipParameters()).normalized()
        parameters = p; kit = CableClipKit.generate(p)
    }
    func apply(_ value: CableClipParameters) {
        let p = value.normalized()
        guard p != parameters else { return }
        parameters = p; exportedURL = nil
        if let data = try? JSONEncoder().encode(p) { UserDefaults.standard.set(data, forKey:key) }
        pending?.cancel(); updating = true
        pending = Task { [weak self] in
            do { try await Task.sleep(nanoseconds:60_000_000) } catch { return }
            guard !Task.isCancelled else { return }
            let kit = await Task.detached(priority:.userInitiated) { CableClipKit.generate(p) }.value
            guard !Task.isCancelled, let self else { return }
            self.kit = kit; self.revision += 1; self.updating = false
        }
    }
    private func commit() {
        NotificationCenter.default.post(name:.commitBalloonEditing, object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
    }
    func select(_ mount: CableClipMount) { commit(); var p = parameters; p.mount = mount; apply(p) }
    func setFlat(_ wanted: Bool) { commit(); var p = parameters; p.flat = wanted; apply(p) }
    func binding(_ key: WritableKeyPath<CableClipParameters, Double>) -> Binding<Double> {
        Binding(get:{ self.parameters[keyPath:key] }, set:{ value in
            var p = self.parameters; p[keyPath:key] = value; self.apply(p)
        })
    }
    func export() {
        guard !exporting, kit.clip.problem == nil else { return }
        commit()
        let p = parameters, panel = NSSavePanel()
        panel.title = "Export Cable Clip"
        panel.prompt = "Export Clip"
        panel.nameFieldStringValue = p.filename
        panel.allowedContentTypes = [UTType(filenameExtension:"stl") ?? .data]
        panel.canCreateDirectories = true
        panel.message = "One-piece clip in print orientation. Millimetres."
        guard let window = NSApp.keyWindow else { return }
        panel.beginSheetModal(for:window) { [weak self] response in
            guard response == .OK, let url = panel.url, let self else { return }
            self.exporting = true
            Task {
                do {
                    try await Task.detached(priority:.userInitiated) {
                        try CableClipKit.generate(p, quality:.export).printView.binarySTL().write(to:url, options:.atomic)
                    }.value
                    self.exportedURL = url
                } catch { self.error = error.localizedDescription }
                self.exporting = false
            }
        }
    }
}

private enum CableClipView: String, CaseIterable, Identifiable {
    case assembled = "On the wall", print = "Print view"
    var id: String { rawValue }
    var index: Int { Self.allCases.firstIndex(of:self)! }
}

struct CableClipEditor: View {
    @ObservedObject var model: CableClipModel
    @State private var selection: CableClipView = .assembled
    @State private var showPlate = true
    @State private var wireframe = false
    @State private var topDown = false
    @State private var resetCamera = 0
    @State private var colorIndex = 0
    private let colors: [NSColor] = [
        NSColor(calibratedRed:0.86, green:0.80, blue:0.68, alpha:1),
        NSColor(calibratedRed:0.93, green:0.92, blue:0.89, alpha:1),
        NSColor(calibratedRed:0.17, green:0.17, blue:0.18, alpha:1),
        NSColor(calibratedRed:0.56, green:0.56, blue:0.57, alpha:1),
        NSColor(calibratedRed:0.19, green:0.57, blue:0.49, alpha:1)
    ]
    private let colorNames = ["Linen", "Wall white", "Black", "Grey", "Sage"]
    private let cableColor = NSColor(calibratedRed:0.80, green:0.75, blue:0.66, alpha:1)
    private let nailColor = NSColor(calibratedRed:0.55, green:0.56, blue:0.58, alpha:1)

    var body: some View {
        HStack(alignment:.top, spacing:0) {
            sidebar.frame(width:312)
            Divider().opacity(0.45)
            preview.padding(22)
        }
        .alert("Clip export failed", isPresented:Binding(get:{ model.error != nil }, set:{ if !$0 { model.error = nil } })) {
            Button("OK", role:.cancel) { model.error = nil }
        } message: { Text(model.error ?? "") }
    }

    private var sidebar: some View {
        let p = model.parameters, c = model.kit.clip
        return VStack(spacing:0) {
            ScrollView {
                VStack(alignment:.leading, spacing:20) {
                    VStack(alignment:.leading, spacing:13) {
                        label("CABLE")
                        parameter("Cable diameter", \.cableDiameter, CableClipParameters.cableRange, "mm", step:0.05)
                        Text("Measure the lead over its fabric sheath. The strap's arch is 0.1 mm wider than the cable, which lies on the plate.")
                            .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                    }
                    Divider()
                    VStack(alignment:.leading, spacing:12) {
                        label("WALL FIXING")
                        Picker("Fixing", selection:Binding(get:{ p.mount }, set:{ model.select($0) })) {
                            ForEach(CableClipMount.allCases) { Text($0.title).tag($0) }
                        }.pickerStyle(.segmented).labelsHidden().accessibilityLabel("Wall fixing")
                        Text(p.mount.subtitle).font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        parameter("Plate thickness", \.plate, CableClipParameters.plateRange, "mm", step:0.1)
                        if c.plateThickness > p.plate+1e-9 {
                            Text("The plate is \(number(c.plateThickness)) mm here: at least 0.6 mm thicker than the nail head, so the head sinks in flush.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        }
                        if p.mount == .nail {
                            parameter("Nail shaft", \.nailDiameter, CableClipParameters.nailRange, "mm", step:0.1)
                            parameter("Nail head", \.nailHeadDiameter, CableClipParameters.headRange, "mm", step:0.1)
                            parameter("Head height", \.nailHeadHeight, CableClipParameters.headHeightRange, "mm", step:0.1)
                            parameter("Nail gap from the strap", \.nailGap, CableClipParameters.nailGapRange, "mm", step:0.5)
                            Text("The plate runs \(number(c.plateEnd-p.length/2)) mm past the strap on one side. The head's counterbore, \(number(c.counterbore)) mm wide and \(number(c.counterboreDepth)) mm deep, starts \(number((c.nailY ?? 0)-c.counterbore/2-p.length/2)) mm past the strap: that is the room the hammer or a nail punch has. The whole clip is \(number(c.length)) mm long.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        } else {
                            Text("The plate is \(number(c.halfWidth+c.edgeX)) mm wide under the strap and \(number(c.length)) mm long, about \(Int(c.padArea.rounded())) mm² of glue pad.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        }
                        if let problem = c.problem {
                            Label(problem, systemImage:"exclamationmark.triangle").font(.system(size:10)).foregroundStyle(.orange)
                        } else if let note = c.note {
                            Label(note, systemImage:"info.circle").font(.system(size:10)).foregroundStyle(.secondary)
                        }
                    }
                    Divider()
                    VStack(alignment:.leading, spacing:12) {
                        label("STRAP")
                        parameter("Length along the cable", \.length, CableClipParameters.lengthRange, "mm", step:0.5)
                        parameter("Thickness", \.wall, CableClipParameters.wallRange, "mm", step:0.1)
                        parameter("Overlap below the cable", \.overlap, CableClipParameters.overlapRange, "mm", step:0.1)
                        Text("The strap is the spring. A thinner strap bends further; more overlap holds the cable better but needs a wider opening. On the open side the plate ends \(number(c.edgeX)) mm past the cable's middle under the strap, so the passage between the tip and the plate's edge is \(number(c.opening)) mm, and the cable lifts the strap about \(number(c.insertion)) mm on its way in.")
                            .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        Label("Strain about \(number(c.snapStrain*100)) % as the cable goes in · PLA takes about 2 %, PETG more", systemImage:c.snapStrain > 0.022 ? "exclamationmark.triangle" : "arrow.up.and.down")
                            .font(.system(size:10, weight:.medium)).foregroundStyle(c.snapStrain > 0.022 ? .orange : accent)
                    }
                    Divider()
                    VStack(alignment:.leading, spacing:12) {
                        label("PRINT")
                        Toggle("Print lying on the plate", isOn:Binding(get:{ p.flat }, set:{ model.setFlat($0) }))
                            .font(.system(size:12, weight:.medium)).toggleStyle(.checkbox)
                        Text(p.flat ? "Lying flat the plate is on the bed and the arch is bridged, but the strap bends across its layers: PETG rather than PLA."
                             : "Standing on the strap's end, the profile lies on the bed and the strap bends within its layers. Use a brim.")
                            .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                    }
                }.padding(22)
            }
            VStack(spacing:9) {
                Button(action:model.export) {
                    HStack(spacing:7) {
                        if model.exporting { ProgressView().controlSize(.small) } else { Image(systemName:"square.and.arrow.up") }
                        Text(model.exporting ? "Preparing clip…" : "Export Clip STL…").fontWeight(.semibold)
                        Spacer(); Text("⌘E").opacity(0.65)
                    }.padding(.horizontal, 13).frame(height:42)
                }.buttonStyle(.plain).foregroundStyle(.white)
                    .background(c.problem == nil ? accent : Color.gray, in:RoundedRectangle(cornerRadius:10))
                    .disabled(model.exporting || c.problem != nil)
                    .accessibilityIdentifier("exportCableClip")
                if let url = model.exportedURL {
                    Button { NSWorkspace.shared.activateFileViewerSelecting([url]) } label: {
                        Label("Saved · Show in Finder", systemImage:"checkmark.circle.fill").font(.system(size:11))
                    }.buttonStyle(.plain).foregroundStyle(accent)
                } else {
                    Text("One STL · print orientation · millimetres").font(.system(size:10)).foregroundStyle(.secondary)
                }
            }.padding(20).background(.white.opacity(0.45))
        }
    }

    private var preview: some View {
        let kit = model.kit, p = kit.parameters, c = kit.clip, assembly = selection == .assembled
        let shown: (mesh: BalloonMesh, colors: [Int]) = assembly ? kit.assembly() : (kit.printView, [])
        let caption = assembly ? "On the wall · press the cable in from the open side"
            : (p.flat ? "Lying on the plate · arch bridged · no supports" : "Standing on the strap's end · profile on the bed · brim")
        return VStack(alignment:.leading, spacing:14) {
            HStack {
                Picker("Clip view", selection:$selection) {
                    ForEach(CableClipView.allCases) { Text($0.rawValue).tag($0) }
                }.pickerStyle(.segmented).labelsHidden().frame(maxWidth:220).accessibilityIdentifier("cableClipPreviewPart")
                Text(p.displayName).font(.system(size:12, weight:.semibold))
                Spacer()
                Text(model.updating ? "Updating…" : "Live preview").font(.system(size:10, weight:.medium)).foregroundStyle(accent)
            }
            ZStack(alignment:.topLeading) {
                BalloonPreview(mesh:shown.mesh, revision:model.revision*10+selection.index,
                               color:colors[colorIndex],
                               showPlate:showPlate, wireframe:wireframe, resetCamera:resetCamera, cutaway:false,
                               inspectOpening:false, neckDiameter:0, compactObject:true, faceColors:shown.colors,
                               detailColor:colors[colorIndex], accentColor:cableColor, hardwareColor:nailColor,
                               minimumScale:assembly ? 14 : 10, topDown:topDown, objectName:"cable clip", sharpEdges:true, smoothAngle:.pi/5)
                    .clipShape(RoundedRectangle(cornerRadius:16))
                Label(caption, systemImage:assembly ? "cable.connector.horizontal" : "printer")
                    .font(.system(size:11, weight:.medium)).foregroundStyle(.white)
                    .padding(.horizontal, 11).padding(.vertical, 8).background(.black.opacity(0.27), in:Capsule()).padding(15)
                VStack {
                    Spacer()
                    HStack {
                        Text("Drag to orbit  ·  Scroll to zoom").font(.system(size:10)).foregroundStyle(.white.opacity(0.65))
                        Spacer()
                        Button { topDown.toggle() } label: {
                            Label(topDown ? "Angled view" : "Face view", systemImage:"viewfinder").font(.system(size:10, weight:.medium)).padding(.horizontal, 9).frame(height:29)
                        }.buttonStyle(.plain).foregroundStyle(.white).background(.white.opacity(0.12), in:RoundedRectangle(cornerRadius:7))
                        Button { topDown = false; resetCamera += 1 } label: { Image(systemName:"arrow.counterclockwise").frame(width:29, height:29) }
                            .buttonStyle(.plain).foregroundStyle(.white)
                            .background(.white.opacity(0.12), in:RoundedRectangle(cornerRadius:7)).help("Reset clip camera")
                    }.padding(15)
                }
            }.frame(maxWidth:.infinity, maxHeight:.infinity).frame(minHeight:310)
            HStack(spacing:9) {
                ForEach(0..<colors.count, id:\.self) { i in
                    Button { colorIndex = i } label: {
                        Circle().fill(Color(nsColor:colors[i])).frame(width:18, height:18).padding(3)
                            .overlay(Circle().stroke(colorIndex == i ? accent : .black.opacity(0.1), lineWidth:1.5))
                    }.buttonStyle(.plain).help("\(colorNames[i]) · preview only")
                }
                Text("Colour · preview only").font(.system(size:10)).foregroundStyle(.secondary)
                Spacer()
                Toggle(assembly ? "Wall" : "Build plate", isOn:$showPlate)
                Toggle("Wireframe", isOn:$wireframe)
            }.font(.system(size:11)).toggleStyle(.checkbox)
            HStack(spacing:0) {
                metric("SIZE", "\(number(c.width)) × \(number(c.length)) × \(number(c.height))", "mm")
                Divider().frame(height:30)
                metric("OPENING", "\(number(c.opening)) · lifts \(number(c.insertion))", "mm")
                Divider().frame(height:30)
                metric("BEYOND THE CABLE", "+\(number(c.width-p.cableDiameter)) wide · +\(number(c.height-p.cableDiameter)) tall", "mm")
            }.padding(.vertical, 14).background(.white.opacity(0.8), in:RoundedRectangle(cornerRadius:12))
            HStack(alignment:.top, spacing:9) {
                Image(systemName:"hand.tap").foregroundStyle(accent)
                VStack(alignment:.leading, spacing:3) {
                    Text("Nail the plate, then press the cable in from the open side").font(.system(size:11, weight:.semibold))
                    Text("The nail sits past the strap, so the hammer never touches it; finish with a nail punch. The strap springs open for the cable and closes over it. A clip every 30 to 40 cm, two near a turn. The spring is not yet confirmed in print.")
                        .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2).fixedSize(horizontal:false, vertical:true)
                }
            }.padding(.top, 2)
        }
    }
    private func number(_ v: Double) -> String { v.formatted(.number.precision(.fractionLength(0...2))) }
    private func label(_ title: String) -> some View { Text(title).font(.system(size:9, weight:.bold)).tracking(1.3).foregroundStyle(.secondary) }
    private func parameter(_ title: String, _ key: WritableKeyPath<CableClipParameters, Double>, _ range: ClosedRange<Double>, _ unit: String, step: Double = 1) -> some View {
        ParameterControl(title:title, value:model.binding(key), range:range, step:step, unit:unit)
    }
    private func metric(_ title: String, _ value: String, _ unit: String) -> some View {
        VStack(alignment:.leading, spacing:5) {
            Text(title).font(.system(size:8, weight:.bold)).tracking(0.7).foregroundStyle(.secondary)
            HStack(alignment:.firstTextBaseline, spacing:4) {
                Text(value).font(.system(size:15, weight:.medium, design:.rounded)).monospacedDigit()
                Text(unit).font(.system(size:10)).foregroundStyle(.secondary)
            }
        }.frame(maxWidth:.infinity, alignment:.leading).padding(.leading, 16)
    }
}
