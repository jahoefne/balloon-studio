import SwiftUI
import AppKit
import UniformTypeIdentifiers

@MainActor
final class CloudModel: ObservableObject {
    @Published private(set) var parameters: CloudParameters
    @Published private(set) var kit: CloudKit
    @Published private(set) var revision = 0
    @Published private(set) var updating = false
    @Published private(set) var exporting = false
    @Published var exportedURL: URL?
    @Published var error: String?
    let kind: WallLampKind
    private var settingsKey: String { kind.settingsKey }
    private var pending: Task<Void, Never>?

    init(kind: WallLampKind = .cloud) {
        self.kind = kind
        let saved=UserDefaults.standard.data(forKey:kind.settingsKey).flatMap {try? JSONDecoder().decode(CloudParameters.self,from:$0)}
        var restored=saved ?? kind.defaults
        restored.kind=kind
        let p=restored.normalized()
        parameters=p;kit=CloudKit(p)
    }
    func apply(_ input:CloudParameters) {
        var input=input
        input.kind=kind
        let p=input.normalized()
        guard p != parameters else {return}
        parameters=p;exportedURL=nil
        if let data=try? JSONEncoder().encode(p) {UserDefaults.standard.set(data,forKey:settingsKey)}
        pending?.cancel();updating=true
        pending=Task { [weak self] in
            do {try await Task.sleep(nanoseconds:100_000_000)} catch {return}
            guard !Task.isCancelled else {return}
            let result=await Task.detached(priority:.userInitiated) {CloudKit(p)}.value
            guard !Task.isCancelled,let self else {return}
            self.kit=result;self.revision += 1;self.updating=false
        }
    }
    func binding(_ key:WritableKeyPath<CloudParameters,Double>) -> Binding<Double> {
        Binding(get:{self.parameters[keyPath:key]},set:{value in
            var p=self.parameters;p[keyPath:key]=value;self.apply(p)
        })
    }
    func selectStyle(_ style:CloudStyle) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=parameters;p.style=style;apply(p)
    }
    func selectSunStyle(_ style:SunStyle) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=parameters;p.sunStyle=style;apply(p)
    }
    func mirror(_ mirrored:Bool) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=parameters;p.mirrored=mirrored;apply(p)
    }
    func selectCableSide(_ side:CableSide,outlet index:Int=0) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        guard !parameters.cableSides.prefix(index).contains(side) else {return}
        var p=parameters;p.selectCableSide(side,outlet:index);apply(p)
    }
    /// Turning an outlet on adds it; turning it off removes it and the ones after it.
    func setCableOutlet(_ index:Int,enabled:Bool) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=parameters;p.setCableOutletCount(enabled ? index+1 : index);apply(p)
    }
    func setStrainRelief(_ wanted:Bool) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=parameters;p.strainRelief=wanted;apply(p)
    }
    func setNailInsert(_ wanted:Bool) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=parameters;p.nailInsert=wanted;apply(p)
    }
    func selectSurface(_ surface:LampSurface) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=parameters;p.surface=surface;apply(p)
    }
    func export() {
        guard !exporting else {return}
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        let snapshot=parameters,panel=NSSavePanel()
        panel.title="Export \(kind.title) Lamp Kit";panel.prompt="Export Kit"
        panel.nameFieldStringValue=snapshot.filename
        panel.allowedContentTypes=[UTType(filenameExtension:"zip") ?? .data]
        panel.canCreateDirectories=true
        let clamps=snapshot.cableConfigurations.compactMap {CableClamp($0)}.count
        let parts=2+snapshot.cableSides.count+2*clamps+(snapshot.nailInsert && NailInsert(snapshot) != nil ? 1 : 0)
        panel.message="\(parts) print-ready STLs, a full-size LED placement plan, cut list and assembly notes.\(snapshot.fitsP2S ? "":" This width exceeds the P2S bed with a brim.")"
        guard let window=NSApp.keyWindow else {return}
        panel.beginSheetModal(for:window) { [weak self] response in
            guard response == .OK,let url=panel.url,let self else {return}
            self.exporting=true
            Task {
                do {
                    try await Task.detached(priority:.userInitiated) {
                        try CloudKit(snapshot,quality:.export).archive().write(to:url,options:.atomic)
                    }.value
                    self.exportedURL=url
                } catch {self.error=error.localizedDescription}
                self.exporting=false
            }
        }
    }
}

private enum CloudView: String, CaseIterable, Identifiable {
    case assembled="Assembled", exploded="Exploded", back="Back · inside", rear="Back · wall side", front="Front · print view", seal="Cable seal · print view", clamp="Cable clamp · print view", insert="Slot insert · print view"
    var id:String {rawValue}
    var index:Int {Self.allCases.firstIndex(of:self)!}
}

struct CloudEditor: View {
    @ObservedObject var model:CloudModel
    @State private var selection:CloudView = .exploded
    @State private var showPlate=false
    @State private var wireframe=false
    @State private var topDown=false
    @State private var resetCamera=0
    @State private var showGuide=false

    private var isSun: Bool { model.kind == .sun }
    private var title: String { model.kind.title }
    private var noun: String { model.kind.rawValue }
    // A softer white keeps the shading that shows the puffs of a sculpted cloud.
    private var diffuserColor: NSColor {
        isSun ? NSColor(calibratedRed:1,green:0.77,blue:0.25,alpha:1)
            : NSColor(white:model.parameters.surface == .sculpted ? 0.8 : 0.96,alpha:1)
    }
    // Print the seal in black. The preview shows it in color, to find it.
    private let sealColor=NSColor(calibratedRed:0.93,green:0.45,blue:0.2,alpha:1)
    // Bar and anvil of the strain relief. Any color prints.
    private let clampColor=NSColor(calibratedRed:0.25,green:0.58,blue:0.8,alpha:1)

    var body:some View {
        HStack(alignment:.top,spacing:0) {
            sidebar.frame(width:312)
            Divider().opacity(0.45)
            preview.padding(22)
        }
        .onChange(of:selection) {_,value in
            resetCamera += 1;topDown = value == .assembled || value == .rear || value == .back
        }
        .onChange(of:model.kit.parameters.width) {_,_ in resetCamera += 1}
        .onChange(of:model.kit.parameters.style) {_,_ in resetCamera += 1}
        .onChange(of:model.kit.parameters.sunStyle) {_,_ in resetCamera += 1}
        .onChange(of:model.kit.parameters.mirrored) {_,_ in resetCamera += 1}
        .onChange(of:model.kit.parameters.cableSides) {_,_ in resetCamera += 1}
        .onChange(of:model.kit.parameters.surface) {_,_ in topDown=false;resetCamera += 1}
        .alert("\(title) export failed",isPresented:Binding(get:{model.error != nil},set:{if !$0 {model.error=nil}})) {
            Button("OK",role:.cancel) {model.error=nil}
        } message: {Text(model.error ?? "")}
        .sheet(isPresented:$showGuide) {
            VStack(alignment:.leading,spacing:16) {
                HStack {
                    Text("\(title) lamp · printing & assembly").font(.title2.weight(.semibold))
                    Spacer()
                    Button("Done") {showGuide=false}.keyboardShortcut(.cancelAction)
                }
                ScrollView {Text(model.kit.instructions).font(.system(size:13)).textSelection(.enabled).frame(maxWidth:.infinity,alignment:.leading)}
            }.padding(24).frame(width:700,height:650)
        }
    }
    private var sidebar:some View {
        VStack(spacing:0) {
            ScrollView {
                VStack(alignment:.leading,spacing:20) {
                    VStack(alignment:.leading,spacing:8) {
                        label(isSun ? "A LITTLE SUN FOR YOUR SKY" : "A CLOUD BEHIND YOUR BALLOONS")
                        Text(isSun ? "A sunny spot on the wall." : "A little light on the wall.").font(.system(size:17,weight:.semibold,design:.rounded))
                        Text(isSun ? "Choose your sun: an opaque LED tray and a glowing diffuser, joined by four hidden clips." : "An opaque LED tray and a white PLA diffuser, joined by four hidden clips. The balloons hang independently.")
                            .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                    }
                    if isSun { sunShapeChooser } else { shapeChooser }
                    VStack(alignment:.leading,spacing:13) {
                        label("\(title.uppercased()) & DIFFUSER")
                        parameter(isSun ? "Diameter including rays" : "Cloud width",\.width,model.parameters.minimumWidth...500)
                        parameter("Back depth",\.depth,16...40)
                        Text(isSun ? "160–500 mm across the rays. The circular shape stays round; the fittings keep their actual size." : "Down to 100 mm wide and 16 mm deep. Small clouds become taller to keep room for the nail pocket and the LED rows.")
                            .font(.system(size:10)).foregroundStyle(.secondary)
                        parameter(isSun ? "Diffuser thickness" : "White front thickness",\.diffuserThickness,0.8...2,step:0.2)
                        Text(isSun ? "Start with a 1.2 mm face in white or translucent yellow PLA. Preview color is illustrative; test the glow with your strip." : "Start at 1.2 mm for white PLA. A shallow back may show LED hotspots; test your filament and strip.")
                            .font(.system(size:10)).foregroundStyle(.secondary)
                        Text("Front surface").font(.system(size:12,weight:.semibold))
                        Picker("Front surface",selection:Binding(get:{model.parameters.surface},set:{model.selectSurface($0)})) {
                            ForEach(LampSurface.allCases) { Text($0.title).tag($0) }
                        }.pickerStyle(.segmented).labelsHidden().accessibilityIdentifier("\(noun)Surface")
                        if model.parameters.surface == .sculpted {
                            parameter("Surface depth",\.surfaceDepth,2...model.parameters.maximumSurfaceDepth,step:0.5)
                            Text(isSun ? "\(model.parameters.sunStyle.subtitle), rising from the outline. Hollow inside for light." : "Separate puffs, rounded from the outline up. Hollow inside for light. About 15 mm and more gives distinct puffs.")
                                .font(.system(size:10)).foregroundStyle(.secondary)
                            Text("Print curved face up, clips down. Add supports beneath the diffuser and a brim; keep clip slots clear. See the printing guide.")
                                .font(.system(size:10)).foregroundStyle(.secondary)
                        }
                        if !model.parameters.fitsP2S {
                            Text("This width exceeds the P2S bed with an 8 mm brim.").font(.system(size:11)).foregroundStyle(.orange)
                            Button("Use 240 mm for the P2S") {
                                NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
                                NSApp.keyWindow?.makeFirstResponder(nil)
                                var p=model.parameters;p.width=240;model.apply(p)
                            }.font(.system(size:11))
                        }
                    }
                    Divider()
                    VStack(alignment:.leading,spacing:13) {
                        Label("Straight LED sections",systemImage:"lightbulb").font(.system(size:12,weight:.semibold))
                        parameter("Strip width",\.stripWidth,3.5...12,step:0.5)
                        parameter("Strip thickness incl. LEDs",\.stripThickness,1...6,step:0.5)
                        parameter("Distance between cut marks",\.stripCutLength,5...100,step:0.1)
                        parameter("LED row spacing",\.ledRowSpacing,(model.parameters.stripWidth+4)...40,step:0.5)
                        Text("Aclorol USB COB: 8 mm wide, listed 16 mm cuts. Check the marks on your strip before cutting.")
                            .font(.system(size:10)).foregroundStyle(.secondary)
                        Text("\(model.kit.ledPlan.sections.count) straight sections · \(number(model.kit.ledPlan.totalLength)) mm of strip. Flat adhesive mounting with room for wire links.")
                            .font(.system(size:11)).foregroundStyle(.secondary)
                        if model.kit.ledPlan.sections.isEmpty {
                            Text("No complete section fits. Enlarge the \(noun) or use a strip with closer cut marks.")
                                .font(.system(size:11)).foregroundStyle(.orange)
                        }
                        Button("View LED placement") {selection = .back;topDown=true}
                            .font(.system(size:11)).accessibilityIdentifier("\(noun)LEDLayout")
                        Text("Minimum LED-to-front gap: \(number(model.parameters.depth-3-model.parameters.stripThickness)) mm. Start with a 22 mm back; test row spacing behind your printed front.")
                            .font(.system(size:10)).foregroundStyle(.secondary)
                        Text("Aclorol estimate: \(number(model.kit.ledPlan.nominalWatts)) W at full power. Dim to suit the lamp and check heat; larger layouts need suitable wiring and cooling.")
                            .font(.system(size:10)).foregroundStyle(.secondary)
                    }.padding(12).background(accent.opacity(0.07),in:RoundedRectangle(cornerRadius:10))
                    VStack(alignment:.leading,spacing:13) {
                        label("FOUR CONCEALED CLIPS")
                        parameter("Clip fit allowance",\.clipFit,0.2...0.5,step:0.05)
                        Text("1.6 mm spring tabs with tapered 2 mm roots click into an internal groove. A 12 mm overlap conceals the slots. Dry-fit before adding the LEDs.")
                            .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                    }
                    Divider()
                    VStack(alignment:.leading,spacing:13) {
                        label("WALL MOUNT & CABLE")
                        parameter("Nail head clearance",\.nailHead,5...10,step:0.5)
                        parameter("Nail shaft clearance",\.nailShaft,2...min(5,model.parameters.nailHead-2),step:0.5)
                        Toggle("Slot insert for a small nail head",isOn:Binding(get:{model.parameters.nailInsert},set:{model.setNailInsert($0)}))
                            .font(.system(size:12,weight:.semibold)).toggleStyle(.checkbox).accessibilityIdentifier("\(noun)NailInsert")
                        if model.parameters.nailInsert {
                            parameter("Measured nail shaft",\.nailDiameter,1...4,step:0.1)
                            parameter("Measured nail head",\.nailHeadDiameter,2...8,step:0.1)
                            if let insert=model.kit.nailInsert {
                                Text("For a head that slips through the slot, also in a back you have already printed. The insert goes in through the square entry and slides up behind the lip. It narrows the slot to \(number(2*insert.slotHalfWidth)) mm, and the head bears on its plate. Set the head's underside \(number(insert.nearestHead+0.1))–\(number(insert.nearestHead+0.4)) mm off the wall.")
                                    .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                                Button("View slot insert") {selection = .insert}
                                    .font(.system(size:11)).accessibilityIdentifier("\(noun)ViewNailInsert")
                            } else if let problem=NailInsert.problem(model.parameters) {
                                Text("\(problem) The kit comes without it.").font(.system(size:11)).foregroundStyle(.orange).lineSpacing(2)
                            }
                        }
                        parameter("Cable diameter",\.cableDiameter,2...6,step:0.5)
                        Text("Cable exit").font(.system(size:12,weight:.semibold))
                        Picker("Cable exit",selection:Binding(get:{model.parameters.cableSide},set:{model.selectCableSide($0)})) {
                            ForEach(CableSide.allCases) { Text($0.title).tag($0) }
                        }.pickerStyle(.segmented).labelsHidden().accessibilityIdentifier("\(noun)CableSide")
                        // Each further outlet appears once the one before it is on.
                        // The fourth takes the last free side and needs no picker.
                        ForEach(1..<min(model.parameters.cableSides.count+1,CableSide.allCases.count),id:\.self) { index in
                            let sides=model.parameters.cableSides,ordinal=["Second","Third","Fourth"][index-1]
                            let free=CableSide.allCases.filter {!sides.prefix(index).contains($0)}
                            Toggle(free.count == 1 ? "\(ordinal) cable outlet · \(free[0].title)" : "\(ordinal) cable outlet",
                                   isOn:Binding(get:{model.parameters.cableSides.count>index},set:{model.setCableOutlet(index,enabled:$0)}))
                                .font(.system(size:12,weight:.semibold)).toggleStyle(.checkbox).accessibilityIdentifier("\(noun)\(ordinal)CableOutlet")
                            if sides.count>index && free.count>1 {
                                Picker("\(ordinal) cable exit",selection:Binding(get:{model.parameters.cableSides.count>index ? model.parameters.cableSides[index] : free[0]},
                                                                                 set:{model.selectCableSide($0,outlet:index)})) {
                                    ForEach(free) { Text($0.title).tag($0) }
                                }.pickerStyle(.segmented).labelsHidden().accessibilityIdentifier("\(noun)\(ordinal)CableSide")
                            }
                        }
                        Text(cableExitNote)
                            .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                        Label("Flexible cable seal",systemImage:"circle.lefthalf.filled")
                            .font(.system(size:11,weight:.semibold)).foregroundStyle(accent)
                        Text("Each outlet has a seal printed in black TPU. It grips the cable and fills the window in the wall. Measure the cable: every outlet uses the diameter set here.")
                            .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                        Button("View cable seal") {selection = .seal}
                            .font(.system(size:11)).accessibilityIdentifier("\(noun)CableSeal")
                        Toggle("Screwed strain relief",isOn:Binding(get:{model.parameters.strainRelief},set:{model.setStrainRelief($0)}))
                            .font(.system(size:12,weight:.semibold)).toggleStyle(.checkbox).accessibilityIdentifier("\(noun)StrainRelief")
                        if model.parameters.strainRelief {
                            if model.kit.clampCount > 0 {
                                Text("Each clamp has two posts behind its seal, an anvil under the cable and a bar across it, held by two M3 × 10 screws. Ribs grip the jacket. The posts stop the bar, so the cable is squeezed by a set amount.")
                                    .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                                Button("View cable clamp") {selection = .clamp}
                                    .font(.system(size:11)).accessibilityIdentifier("\(noun)CableClamp")
                            }
                            if model.kit.clampCount < model.kit.cables.count {
                                Text(noClampNote).font(.system(size:11)).foregroundStyle(.orange).lineSpacing(2)
                            }
                        }
                    }
                    Button("Printing & assembly guide") {showGuide=true}
                        .font(.system(size:12,weight:.medium)).accessibilityIdentifier("\(noun)AssemblyGuide")
                }.padding(22)
            }
            VStack(alignment:.leading,spacing:8) {
                Button(action:model.export) {
                    HStack {Image(systemName:"square.and.arrow.up");Text(model.exporting ? "Exporting…":"Export \(title) Kit…");Spacer();Text("⌘E").opacity(0.65)}
                        .font(.system(size:13,weight:.semibold)).padding(.vertical,7).frame(maxWidth:.infinity)
                }.buttonStyle(.borderedProminent).disabled(model.exporting).accessibilityIdentifier("export\(title)")
                if let url=model.exportedURL {
                    Button {NSWorkspace.shared.activateFileViewerSelecting([url])} label: {
                        Label("\(title) saved · Show in Finder",systemImage:"checkmark.circle.fill").font(.system(size:11))
                    }.buttonStyle(.plain).foregroundStyle(accent)
                } else {Text("ZIP · \(model.kit.printedParts) STLs + LED plan + assembly notes").font(.system(size:10)).foregroundStyle(.secondary)}
            }.padding(20).background(.white.opacity(0.45))
        }
    }
    private var sunShapeChooser:some View {
        VStack(alignment:.leading,spacing:10) {
            label("FOUR WAYS TO SHINE")
            LazyVGrid(columns:[GridItem(.flexible()),GridItem(.flexible())],spacing:8) {
                ForEach(SunStyle.allCases) { style in
                    let selected=model.parameters.sunStyle == style
                    Button {model.selectSunStyle(style)} label: {
                        VStack(alignment:.leading,spacing:4) {
                            SunSilhouette(style:style)
                                .fill(selected ? Color(red:0.87,green:0.58,blue:0.12) : Color(red:0.82,green:0.68,blue:0.38))
                                .frame(height:70).frame(maxWidth:.infinity)
                            HStack(spacing:4) {
                                Text(style.title).font(.system(size:12,weight:.semibold))
                                Spacer(minLength:0)
                                if selected {Image(systemName:"checkmark.circle.fill").foregroundStyle(accent).font(.system(size:11))}
                            }
                            Text(style.note).font(.system(size:10)).foregroundStyle(.secondary)
                        }.padding(10).frame(maxWidth:.infinity,alignment:.leading)
                            .background(selected ? accent.opacity(0.09) : .white.opacity(0.5),in:RoundedRectangle(cornerRadius:10))
                            .overlay(RoundedRectangle(cornerRadius:10).stroke(selected ? accent.opacity(0.55) : .black.opacity(0.06),lineWidth:1))
                    }.buttonStyle(.plain)
                        .accessibilityLabel("\(style.title) sun, \(style.subtitle)")
                        .accessibilityAddTraits(selected ? [.isSelected] : [])
                        .accessibilityIdentifier("sunStyle-\(style.rawValue)")
                }
            }
            Text(model.parameters.sunStyle.subtitle).font(.system(size:11,weight:.medium)).foregroundStyle(accent)
            Text("Switch designs freely; your dimensions and fittings stay the same. Soft star and Cones share their outline and their back: they differ in the 3D surface. Every other kit has its own matching front and back.")
                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
        }
    }
    private var shapeChooser:some View {
        VStack(alignment:.leading,spacing:10) {
            label("SHAPES FOR YOUR SKY")
            LazyVGrid(columns:[GridItem(.flexible()),GridItem(.flexible())],spacing:8) {
                ForEach(CloudStyle.allCases) { style in
                    let selected=model.parameters.style == style
                    Button {model.selectStyle(style)} label: {
                        VStack(alignment:.leading,spacing:4) {
                            CloudSilhouette(style:style,mirrored:model.parameters.mirrored)
                                .fill(selected ? accent : accent.opacity(0.45))
                                .frame(height:65).padding(.horizontal,3)
                            HStack(spacing:4) {
                                Text(style.title).font(.system(size:12,weight:.semibold))
                                Spacer(minLength:0)
                                if selected {Image(systemName:"checkmark.circle.fill").foregroundStyle(accent).font(.system(size:11))}
                            }
                            Text(style.subtitle).font(.system(size:10)).foregroundStyle(.secondary)
                        }.padding(10).frame(maxWidth:.infinity,alignment:.leading)
                            .background(selected ? accent.opacity(0.09) : .white.opacity(0.5),in:RoundedRectangle(cornerRadius:10))
                            .overlay(RoundedRectangle(cornerRadius:10).stroke(selected ? accent.opacity(0.55) : .black.opacity(0.06),lineWidth:1))
                    }.buttonStyle(.plain)
                        .accessibilityLabel("\(style.title) cloud, \(style.subtitle)")
                        .accessibilityAddTraits(selected ? [.isSelected] : [])
                        .accessibilityIdentifier("cloudStyle-\(style.rawValue)")
                }
            }
            Toggle("Mirror silhouette",isOn:Binding(get:{model.parameters.mirrored},set:{model.mirror($0)}))
                .font(.system(size:11)).toggleStyle(.checkbox).accessibilityIdentifier("cloudMirror")
            Text("Mix shapes and widths, then mirror a few for a natural sky. Each kit includes its matching front and back.")
                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
        }
    }
    private var preview:some View {
        let kit=model.kit,p=kit.parameters,assembly=selection == .assembled || selection == .exploded
        let mesh:BalloonMesh
        switch selection {
        case .assembled:mesh=kit.assembly()
        case .exploded:mesh=kit.assembly(exploded:true)
        case .front:mesh=kit.front
        case .seal:mesh=kit.sealPrintView
        case .clamp:mesh=kit.clampPrintView ?? kit.sealPrintView
        case .insert:mesh=kit.insertMesh ?? kit.rear
        case .back:mesh=kit.backWithLEDGuides
        case .rear:mesh=kit.rear
        }
        let showsRear=selection == .rear || (selection == .insert && kit.insertMesh == nil)
        let colors=assembly ? kit.assemblyColors : selection == .back ? kit.backColors : showsRear ? kit.rearColors : []
        return VStack(alignment:.leading,spacing:14) {
            HStack {
                Picker("\(title) view",selection:$selection) {
                    ForEach(CloudView.allCases) {Text($0.rawValue).tag($0)}
                }.labelsHidden().frame(maxWidth:235).accessibilityIdentifier("\(noun)PreviewPart")
                Text(p.displayName).font(.system(size:12,weight:.semibold))
                Spacer()
                Text(model.updating ? "Updating…":"Live preview").font(.system(size:10,weight:.medium)).foregroundStyle(accent)
            }
            ZStack(alignment:.topLeading) {
                BalloonPreview(mesh:mesh,revision:model.revision*10+selection.index,
                               color:selection == .front ? diffuserColor : selection == .seal ? NSColor(white:0.2,alpha:1) : (selection == .clamp && kit.clampCount > 0) || (selection == .insert && kit.insertMesh != nil) ? clampColor : NSColor(white:0.36,alpha:1),
                               showPlate:showPlate && !assembly,wireframe:wireframe,resetCamera:resetCamera,
                               cutaway:false,inspectOpening:false,neckDiameter:0,compactObject:true,faceColors:colors,
                               detailColor:assembly ? diffuserColor : NSColor(calibratedRed:0.35,green:0.65,blue:0.49,alpha:1),
                               accentColor:sealColor,hardwareColor:clampColor,minimumScale:selection == .seal ? 9 : selection == .insert && kit.insertMesh != nil ? 12 : selection == .clamp ? 16 : 32,
                               topDown:topDown,objectName:"\(noun) lamp",sharpEdges:true,
                               smoothAngle:p.surface == .sculpted ? .pi/5 : 0)
                    .clipShape(RoundedRectangle(cornerRadius:16))
                Text(selection == .exploded ? "\(kit.printedParts) printed parts · four hidden clips\(kit.clampCount == 0 ? "":" · \(2*kit.clampCount) screws")" : selection == .rear ? "Blind keyhole · closed floor · cable: \(p.cableSides.map(\.title).joined(separator:" + "))\(kit.insertMesh == nil ? "" : " · blue: slot insert")" : selection == .insert ? (kit.insertMesh == nil ? "No slot insert in this kit · showing the wall side" : "Flat face on the bed, fingers up · print solid") : selection == .back ? "Green: LED guides · orange: seals\(kit.clampCount == 0 ? "":" · blue: clamps")" : selection == .seal ? "Black TPU · flat end down, nozzle up · no supports" : selection == .clamp ? (kit.clampCount == 0 ? "No strain relief in this lamp · showing the seals" : "Bar on its side, anvil flat · \(2*kit.clampCount) screws M3 × 10") : selection == .front ? (p.surface == .sculpted ? "Curved face up · clips down · supports required" : "Diffuser · flat face on the bed") : "\(p.surface == .sculpted ? "Sculpted" : isSun ? "Warm" : "White") diffuser · opaque backing")
                    .font(.system(size:11,weight:.medium)).foregroundStyle(.white)
                    .padding(.horizontal,11).padding(.vertical,8).background(.black.opacity(0.27),in:Capsule()).padding(15)
                VStack {
                    Spacer()
                    HStack {
                        Text("Drag to orbit  ·  Scroll to zoom").font(.system(size:10)).foregroundStyle(.white.opacity(0.65))
                        Spacer()
                        Button {topDown.toggle()} label: {
                            Label(topDown ? "Angled view":"Face view",systemImage:"viewfinder").font(.system(size:10,weight:.medium)).padding(.horizontal,9).frame(height:29)
                        }.buttonStyle(.plain).foregroundStyle(.white).background(.white.opacity(0.12),in:RoundedRectangle(cornerRadius:7))
                        Button {topDown=false;resetCamera += 1} label: {Image(systemName:"arrow.counterclockwise").frame(width:29,height:29)}
                            .buttonStyle(.plain).foregroundStyle(.white).background(.white.opacity(0.12),in:RoundedRectangle(cornerRadius:7)).help("Reset \(noun) camera")
                    }.padding(15)
                }
            }.frame(maxWidth:.infinity,maxHeight:.infinity).frame(minHeight:310)
            HStack {
                Text(p.fitsP2S ? "All pieces fit P2S + 8 mm brim":"Exceeds P2S bed · reduce \(noun) width").foregroundStyle(p.fitsP2S ? accent : .orange)
                Spacer()
                if !assembly {Toggle("Build plate",isOn:$showPlate)}
                Toggle("Wireframe",isOn:$wireframe)
            }.font(.system(size:11)).toggleStyle(.checkbox)
            HStack(spacing:0) {
                metric("\(title.uppercased()) SIZE","\(number(p.width)) × \(number(p.height))","mm")
                Divider().frame(height:30)
                metric("ASSEMBLED DEPTH",number(p.totalDepth),"mm")
                Divider().frame(height:30)
                metric(isSun ? "DIFFUSER" : "WHITE FACE",number(p.diffuserThickness),"mm")
            }.padding(.vertical,14).background(.white.opacity(0.8),in:RoundedRectangle(cornerRadius:12))
            VStack(alignment:.leading,spacing:6) {
                Text(isSun ? "A warm sun to sit beside your clouds." : "Light through the cloud. Openings hidden behind it.").font(.system(size:12,weight:.semibold))
                Text("The nail sits in a blind pocket with a 3 mm solid cap. Each cable leaves through the outer wall, through a flexible seal that fills the opening. Check the printed assembly in a dark room before mounting.")
                    .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                Text("Prototype · clip fit, mounting strength, opacity and LED heat need a physical check.")
                    .font(.system(size:10)).foregroundStyle(.secondary)
            }.fixedSize(horizontal:false,vertical:true)
        }
    }
    /// Why this lamp gets no clamp, and what would give it one.
    private var noClampNote:String {
        if model.parameters.cableSides.count > 1 {
            let sides=model.kit.cables.filter {$0.clamp == nil}.map {$0.parameters.cableSide.title}
            return "No room for a clamp at \(list(sides)). \(sides.count == 1 ? "This outlet keeps its seal; secure its lead" : "These outlets keep their seals; secure their leads") outside the lamp."
        }
        let p=model.parameters
        let wider=CableClamp.minimumWidth(p).map {"a width of \(number($0)) mm or more"}
        let exits=CableSide.allCases.filter { side in
            var q=p;q.cableSide=side
            return CableClamp(q.normalized()) != nil
        }.map(\.rawValue)
        let other=exits.isEmpty ? nil : "the cable exit at the \(exits.count>1 ? exits.dropLast().joined(separator:", ")+" or ":"")\(exits.last!)"
        let choices=[wider,other].compactMap {$0}.joined(separator:", or ")
        return "No room for the clamp behind this outlet: the nail pocket or the wall is too close. The kit comes without it.\(choices.isEmpty ? "":" It fits with \(choices).")"
    }
    /// Where the chosen exit is on this silhouette.
    private var cableExitNote:String {
        let p=model.parameters
        if p.cableSides.count > 1 {
            return "Cable exits: \(list(p.cableSides.map(\.title))). Left and right are as you face the lamp. The back sits flat on the wall."
        }
        let place:String
        switch p.cableSide {
        case .right: place="Left and right are as you face the lamp\(isSun ? ": the cable leaves between two rays, just below the horizontal one" : ": the cable leaves at the widest point")."
        case .left: place="Left and right are as you face the lamp\(isSun ? ": the cable leaves between two rays, just above the horizontal one" : ": the cable leaves at the widest point")."
        case .top: place=isSun ? "The cable leaves upwards, between two rays, just right of the vertical one." : "The cable leaves at the highest point of the cloud."
        case .bottom: place=isSun ? "The cable leaves downwards, between two rays, just left of the vertical one." : "The cable leaves straight down, in the middle of the flat base."
        }
        return "\(place) The recessed keyhole has a solid cap, and the back sits flat on the wall."
    }
    private func number(_ x:Double) -> String {x.formatted(.number.precision(.fractionLength(0...1)))}
    private func list(_ items:[String]) -> String {
        items.count < 2 ? items.joined() : items.dropLast().joined(separator:", ")+" and "+items.last!
    }
    private func label(_ s:String) -> some View {Text(s).font(.system(size:10,weight:.semibold)).tracking(1.1).foregroundStyle(.secondary)}
    private func parameter(_ title:String,_ key:WritableKeyPath<CloudParameters,Double>,_ range:ClosedRange<Double>,step:Double=1) -> some View {
        ParameterControl(title:title,value:model.binding(key),range:range,step:step,unit:"mm")
    }
    private func metric(_ title:String,_ value:String,_ unit:String) -> some View {
        VStack(alignment:.leading,spacing:5) {
            Text(title).font(.system(size:9,weight:.semibold)).foregroundStyle(.secondary)
            HStack(alignment:.firstTextBaseline,spacing:4) {Text(value).font(.system(size:18,weight:.semibold,design:.rounded));Text(unit).font(.system(size:10)).foregroundStyle(.secondary)}
        }.frame(maxWidth:.infinity,alignment:.leading).padding(.horizontal,15)
    }
}

private struct SunSilhouette: Shape {
    let style:SunStyle
    func path(in rect:CGRect) -> Path {
        let profile=style.profile, scale=min(rect.width,rect.height)
        var path=Path()
        for i in 0..<480 {
            let a=Double(i)*2*Double.pi/480
            let r=CloudGenerator.radius(a,inset:0,width:1,profile:profile)
            let point=CGPoint(x:rect.midX+r*cos(a)*scale,y:rect.midY-r*sin(a)*scale)
            if i==0 {path.move(to:point)} else {path.addLine(to:point)}
        }
        path.closeSubpath()
        return path
    }
}

/// Uses the same profile as the printable shell and the LED template.
private struct CloudSilhouette: Shape {
    let style:CloudStyle
    var mirrored=false
    func path(in rect:CGRect) -> Path {
        let profile=mirrored ? style.profile.mirrored : style.profile
        let scale=min(rect.width,rect.height/0.71)
        let centerY=(profile.highY+profile.lowY)/2
        var path=Path()
        for i in 0..<240 {
            let a=Double(i)*2*Double.pi/240
            let r=CloudGenerator.radius(a,inset:0,width:1,profile:profile)
            let point=CGPoint(x:rect.midX+r*cos(a)*scale,y:rect.midY-(r*sin(a)-centerY)*scale)
            if i==0 {path.move(to:point)} else {path.addLine(to:point)}
        }
        path.closeSubpath()
        return path
    }
}
