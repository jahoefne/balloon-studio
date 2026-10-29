import SwiftUI
import AppKit
import UniformTypeIdentifiers

extension Notification.Name {
    static let commitBalloonEditing=Notification.Name("BalloonStudio.commitEditing")
}

@MainActor
final class BalloonModel: ObservableObject {
    @Published private(set) var parameters: BalloonParameters
    @Published private(set) var mesh: BalloonMesh
    @Published private(set) var pattern:PatternSettings
    @Published private(set) var purge:PurgeSettings
    @Published private(set) var faceColors:[Int]
    @Published private(set) var estimate:PurgeEstimate
    @Published private(set) var revision=0
    @Published private(set) var updating=false
    @Published private(set) var exporting=false
    @Published private(set) var openedSTLName: String?
    @Published private(set) var importRevision=0
    @Published var exportedURL: URL?
    @Published var error: String?
    private var unpainted:BalloonMesh
    private var meshParameters:BalloonParameters
    private var pending: Task<Void,Never>?
    private let settingsKey="BalloonStudio.parameters.v1"

    init() {
        let restored=UserDefaults.standard.data(forKey:settingsKey).flatMap { try? JSONDecoder().decode(BalloonParameters.self,from:$0) }
        let p=(restored ?? .classic).normalized()
        parameters=p
        let pattern=(UserDefaults.standard.data(forKey:"BalloonStudio.pattern.v1").flatMap {try? JSONDecoder().decode(PatternSettings.self,from:$0)} ?? PatternSettings()).normalized(p)
        let purge=(UserDefaults.standard.data(forKey:"BalloonStudio.purge.v1").flatMap {try? JSONDecoder().decode(PurgeSettings.self,from:$0)} ?? PurgeSettings()).normalized()
        self.pattern=pattern;self.purge=purge
        let original=BalloonGenerator.generate(p)
        unpainted=original;meshParameters=p
        let painted=PaintedBalloon.make(original,parameters:p,settings:pattern)
        mesh=painted.mesh;faceColors=painted.colors
        estimate=PurgeEstimate.calculate(painted,settings:purge)
    }

    func loadSTL(_ imported:ImportedBalloon, preview:BalloonMesh, name:String) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        parameters=imported.parameters.normalized()
        pattern=PatternSettings().normalized(parameters)
        pending?.cancel()
        unpainted=preview;meshParameters=parameters;mesh=preview
        faceColors=Array(repeating:0,count:preview.triangles.count)
        estimate=PurgeEstimate(mixedLayers:0,minimumChanges:0,maximumChanges:0,minimumGrams:0,maximumGrams:0)
        updating=false
        revision += 1
        openedSTLName=name
        importRevision += 1
        exportedURL=nil
        if let data=try? JSONEncoder().encode(parameters) {UserDefaults.standard.set(data,forKey:settingsKey)}
        if let data=try? JSONEncoder().encode(pattern) {UserDefaults.standard.set(data,forKey:"BalloonStudio.pattern.v1")}
    }

    func set(_ key: WritableKeyPath<BalloonParameters,Double>,_ value:Double) {
        var p=parameters
        p[keyPath:key]=value
        apply(p)
    }
    func setPanels(_ value:Double) {
        var p=parameters
        p.panels=Int(value.rounded())
        apply(p)
    }
    func apply(_ value:BalloonParameters) {
        let p=value.normalized()
        guard p != parameters else { return }
        parameters=p
        exportedURL=nil
        if let data=try? JSONEncoder().encode(p) { UserDefaults.standard.set(data,forKey:settingsKey) }
        pattern=pattern.normalized(p)
        rebuild()
    }
    func setPattern(_ value:PatternSettings) {
        pattern=value.normalized(parameters)
        exportedURL=nil
        if let data=try? JSONEncoder().encode(pattern) {UserDefaults.standard.set(data,forKey:"BalloonStudio.pattern.v1")}
        rebuild()
    }
    func setPurge(_ value:PurgeSettings) {
        purge=value.normalized()
        exportedURL=nil
        if let data=try? JSONEncoder().encode(purge) {UserDefaults.standard.set(data,forKey:"BalloonStudio.purge.v1")}
        rebuild()
    }
    func rebuild() {
        let p=parameters,pattern=pattern,purge=purge
        let cached=meshParameters == p ? unpainted:nil
        pending?.cancel()
        updating=true
        pending=Task { [weak self] in
            do {try await Task.sleep(nanoseconds:100_000_000)} catch {return}
            guard !Task.isCancelled else {return}
            let worker=Task.detached(priority:.userInitiated) {
                let original=cached ?? BalloonGenerator.generate(p)
                let painted=PaintedBalloon.make(original,parameters:p,settings:pattern)
                return (painted,PurgeEstimate.calculate(painted,settings:purge),original)
            }
            let result=await withTaskCancellationHandler(operation:{await worker.value},onCancel:{worker.cancel()})
            guard !Task.isCancelled,let self else {return}
            self.unpainted=result.2;self.meshParameters=p
            self.mesh=result.0.mesh;self.faceColors=result.0.colors;self.estimate=result.1
            self.revision += 1
            self.updating=false
        }
    }
    var uses3MF:Bool {pattern.style != .none}
    var exportFormat:String {uses3MF ? "3MF":"STL"}
    func binding(_ key:WritableKeyPath<BalloonParameters,Double>) -> Binding<Double> {
        Binding(get:{ self.parameters[keyPath:key] },set:{ self.set(key,$0) })
    }
    var panelBinding: Binding<Double> {
        Binding(get:{Double(self.parameters.panels)},set:{self.setPanels($0)})
    }
    var hollowBinding: Binding<Bool> {
        Binding(get:{self.parameters.hollow},set:{value in
            var p=self.parameters;p.hollow=value;self.apply(p)
        })
    }
    var stringHolesBinding:Binding<Bool> {
        Binding(get:{self.parameters.stringHoles},set:{value in
            var p=self.parameters;p.stringHoles=value;self.apply(p)
        })
    }
    var hangingLoopBinding:Binding<Bool> {
        Binding(get:{self.parameters.hangingLoop},set:{value in
            var p=self.parameters;p.hangingLoop=value;self.apply(p)
        })
    }
    func addStringHoles(clearance:Double) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        var p=parameters;p.stringHoles=true;p.cordClearance=clearance
        apply(p)
    }
    func applyShape(_ shape:BalloonParameters) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=shape
        p.hollow=parameters.hollow
        p.wallThickness=parameters.wallThickness
        p.stringHoles=parameters.stringHoles
        p.cordClearance=parameters.cordClearance
        p.hangingLoop=parameters.hangingLoop
        p.hangingClearance=parameters.hangingClearance
        p.hangingThickness=parameters.hangingThickness
        p.hangingWall=parameters.hangingWall
        p.hangingFillet=parameters.hangingFillet
        p.hangingCrownThickness=parameters.hangingCrownThickness
        apply(p)
    }
    func export() {
        guard !exporting else { return }
        // Commit an active numeric field before taking the export snapshot.
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        let snapshot=parameters,patternSnapshot=pattern,purgeSnapshot=purge
        let multicolor=uses3MF,format=exportFormat
        let panel=NSSavePanel()
        panel.title="Export Balloon \(format)"
        panel.prompt="Export \(format)"
        panel.allowedContentTypes=[UTType(filenameExtension:multicolor ? "3mf":"stl") ?? .data]
        // Let NSSavePanel supply the selected type's extension exactly once.
        let suffix=patternSnapshot.style == .nightFlight ? "-night-flight":patternSnapshot.style == .summitCableCar ? "-summit-cable-car":"-pattern"
        panel.nameFieldStringValue=multicolor ? snapshot.filename.replacingOccurrences(of:".stl",with:suffix):snapshot.filename
        panel.canCreateDirectories=true
        panel.message=multicolor ? "Two filament colors with Bambu Studio paint assignments. Select your P2S profile and map colors after opening." : snapshot.hollow
            ? "Hollow shell with an open neck for LEDs. Millimetres; use 0% infill and standard printing mode."
            : "A closed, printable envelope in millimetres. Set walls and infill in your slicer."
        guard let window=NSApp.keyWindow else { return }
        panel.beginSheetModal(for:window) { [weak self] response in
            guard response == .OK,let url=panel.url,let self else { return }
            self.exporting=true
            Task {
                do {
                    try await Task.detached(priority:.userInitiated) {
                        let mesh=BalloonGenerator.generate(snapshot,quality:.export)
                        let data=try multicolor ? PaintedBalloon.make(mesh,parameters:snapshot,settings:patternSnapshot).threeMF(settings:patternSnapshot,purge:purgeSnapshot):BalloonSTL.export(mesh,parameters:snapshot)
                        try data.write(to:url,options:.atomic)
                    }.value
                    self.exportedURL=url
                } catch {
                    self.error=error.localizedDescription
                }
                self.exporting=false
            }
        }
    }
}

let ink=Color(red:0.15,green:0.19,blue:0.20)
let accent=Color(red:0.12,green:0.40,blue:0.35)
let paper=Color(red:0.965,green:0.958,blue:0.935)

@main
struct BalloonStudioApp: App {
    @StateObject private var model=BalloonModel()
    @StateObject private var basket=BasketModel()
    @StateObject private var ring=RingModel()
    @StateObject private var cloud=CloudModel()
    @StateObject private var sun=CloudModel(kind:.sun)
    @StateObject private var figure=FigureModel()
    @StateObject private var clip=CableClipModel()
    @StateObject private var importer=StudioImportModel()
    @State private var part:StudioPart = .balloon
    var body: some Scene {
        WindowGroup("Balloon Studio") {
            ContentView(model:model,basket:basket,ring:ring,cloud:cloud,sun:sun,figure:figure,clip:clip,importer:importer,part:$part,openFile:chooseFile)
                .frame(minWidth:980,minHeight:730)
                .preferredColorScheme(.light)
                .onOpenURL {importer.open($0,useSettings:loadLampSettings)}
                .sheet(item:$importer.review) {review in
                    STLImportReviewView(review:review,useBalloon:{
                        model.loadSTL(review.imported,preview:review.editable,name:review.url.lastPathComponent)
                        part = .balloon
                        importer.review=nil
                    },cancel:{importer.review=nil})
                }
                .alert("Couldn’t open file",isPresented:Binding(get:{importer.error != nil},set:{if !$0 {importer.error=nil}})) {
                    Button("OK",role:.cancel) {importer.error=nil}
                } message: {Text(importer.error ?? "")}
                .onAppear {
                    NSApp.setActivationPolicy(.regular)
                    NSApp.activate(ignoringOtherApps:true)
                }
        }
        .defaultSize(width:1120,height:830)
        .commands {
            CommandGroup(replacing:.newItem) {
                Button("Open…",action:chooseFile).keyboardShortcut("o")
                    .disabled(importer.loading || importer.review != nil)
                Divider()
                Button("Reset Current Part") {
                    NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
                    NSApp.keyWindow?.makeFirstResponder(nil)
                    switch part {
                    case .balloon:model.apply(.classic)
                    case .basket:basket.apply(BasketParameters())
                    case .ring:ring.apply(ring.parameters.segmented ? .large:.solid)
                    case .cloud:cloud.apply(CloudParameters())
                    case .sun:sun.apply(WallLampKind.sun.defaults)
                    case .figure:figure.apply(FigureParameters())
                    case .clip:clip.apply(CableClipParameters())
                    }
                }.keyboardShortcut("n")
                Button(part == .sun ? "Export Sun Kit…":part == .cloud ? "Export Cloud Kit…":part == .figure ? "Export Figure STL…":part == .clip ? "Export Clip STL…":part == .balloon ? "Export \(model.exportFormat)…":part == .ring && ring.parameters.segmented ? "Export Ring Kit…":"Export STL…") {
                    switch part {
                    case .balloon:model.export()
                    case .basket:basket.export()
                    case .ring:ring.export()
                    case .cloud:cloud.export()
                    case .sun:sun.export()
                    case .figure:figure.export()
                    case .clip:clip.export()
                    }
                }.keyboardShortcut("e")
                    .disabled(part == .balloon ? model.exporting:part == .basket ? basket.exporting:part == .cloud ? cloud.exporting:part == .sun ? sun.exporting:part == .figure ? figure.exporting:part == .clip ? clip.exporting:ring.exporting)
            }
            CommandGroup(replacing:.appInfo) {
                Button("About Balloon Studio") {
                    NSApp.orderFrontStandardAboutPanel(options:[
                        .applicationName:"Balloon Studio",
                        .applicationVersion:"1.29.3",
                        .credits:NSAttributedString(string:"Parametric balloons, baskets, mobile rings, hanging figures, cloud and sun lamps and cable clips for 3D printing.\nBuilt for the Bambu Lab P2S.\nAll dimensions are in millimetres.")
                    ])
                }
            }
        }
    }

    private func chooseFile() {
        importer.chooseFile(useSettings:loadLampSettings)
    }

    private func loadLampSettings(_ parameters:CloudParameters) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        if parameters.kind == .sun {
            sun.apply(parameters)
            part = .sun
        } else {
            cloud.apply(parameters)
            part = .cloud
        }
    }
}

struct ContentView: View {
    @ObservedObject var model: BalloonModel
    @ObservedObject var basket:BasketModel
    @ObservedObject var ring:RingModel
    @ObservedObject var cloud:CloudModel
    @ObservedObject var sun:CloudModel
    @ObservedObject var figure:FigureModel
    @ObservedObject var clip:CableClipModel
    @ObservedObject var importer:StudioImportModel
    @Binding var part:StudioPart
    let openFile:() -> Void
    @State private var showPlate=true
    @State private var wireframe=false
    @State private var resetCamera=0
    @State private var colorIndex=0
    @State private var cutaway=false
    @State private var inspectOpening=false
    @State private var inspectTop=false
    private let colors:[NSColor]=[
        NSColor(calibratedRed:0.86,green:0.43,blue:0.18,alpha:1),
        NSColor(calibratedRed:0.19,green:0.57,blue:0.49,alpha:1),
        NSColor(calibratedRed:0.71,green:0.76,blue:0.85,alpha:1),
        NSColor(calibratedRed:0.73,green:0.31,blue:0.36,alpha:1)
    ]
    private let colorNames=["Saffron","Sage","Porcelain","Rose"]
    var body: some View {
        VStack(spacing:0) {
            header
            Divider().opacity(0.45)
            if part == .balloon {
                HStack(alignment:.top,spacing:0) {
                    sidebar.frame(width:312)
                    Divider().opacity(0.45)
                    preview.padding(22)
                }
            } else if part == .basket {
                BasketEditor(model:basket,balloon:model)
            } else if part == .ring {
                RingEditor(model:ring,balloon:model)
            } else if part == .cloud {
                CloudEditor(model:cloud)
            } else if part == .figure {
                FigureEditor(model:figure)
            } else if part == .clip {
                CableClipEditor(model:clip)
            } else {
                CloudEditor(model:sun)
            }
        }
        .onChange(of:model.importRevision) {_,_ in
            cutaway=false;inspectOpening=false;inspectTop=false;resetCamera += 1
        }
        .background(paper)
        .foregroundStyle(ink)
        .tint(accent)
        .alert("Export failed",isPresented:Binding(get:{model.error != nil},set:{if !$0 {model.error=nil}})) {
            Button("OK",role:.cancel) {model.error=nil}
        } message: {Text(model.error ?? "")}
    }
    private var header: some View {
        HStack(spacing:12) {
            Image(systemName:"balloon.fill")
                .font(.system(size:24)).foregroundStyle(accent)
                .frame(width:43,height:43).background(accent.opacity(0.09),in:RoundedRectangle(cornerRadius:12))
            VStack(alignment:.leading,spacing:3) {
                Text("Balloon Studio").font(.system(size:21,weight:.semibold,design:.rounded))
                Text("A little shape. A lot of possibility.").font(.system(size:12)).foregroundStyle(.secondary)
            }
            Spacer()
            Picker("Part",selection:Binding(get:{part},set:{value in
                NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
                NSApp.keyWindow?.makeFirstResponder(nil)
                part=value
            })) {
                ForEach(StudioPart.allCases) {part in Text(part.rawValue).tag(part)}
            }.pickerStyle(.segmented).labelsHidden().frame(width:490)
            Spacer()
            Button(action:openFile) {
                Label(importer.loading ? "Opening…":"Open…",systemImage:"folder")
            }.disabled(importer.loading || importer.review != nil)
                .accessibilityIdentifier("openFile")
            Label("Made for your P2S",systemImage:"printer")
                .font(.system(size:12,weight:.medium)).foregroundStyle(accent)
                .padding(.horizontal,13).padding(.vertical,8)
                .background(.white.opacity(0.7),in:Capsule())
        }.padding(.horizontal,25).padding(.vertical,17)
    }
    private var sidebar: some View {
        VStack(spacing:0) {
            ScrollView {
                VStack(alignment:.leading,spacing:22) {
                    VStack(alignment:.leading,spacing:10) {
                        sectionLabel("START WITH A SHAPE")
                        HStack(spacing:6) {
                            preset("Classic",.classic)
                            preset("Round",.round)
                            preset("Tall",.tall)
                        }
                    }
                    VStack(alignment:.leading,spacing:12) {
                        Toggle(isOn:model.hollowBinding) {
                            Label("Hollow for LEDs",systemImage:"lightbulb")
                                .font(.system(size:12,weight:.semibold))
                        }.toggleStyle(.switch).controlSize(.small)
                            .accessibilityIdentifier("hollowMode")
                        if model.parameters.hollow {
                            parameter("Wall thickness",key:\.wallThickness,range:0.8...2.4,unit:"mm",step:0.1)
                                .help("Nominal shell thickness. A small allowance protects the wall around curves and grooves.")
                            Label("Opening Ø\(model.parameters.openingDiameter.formatted(.number.precision(.fractionLength(1)))) mm",systemImage:"circle.dashed")
                                .font(.system(size:11,weight:.medium)).foregroundStyle(accent)
                            Text("Open underneath for LEDs. Increase the neck diameter for a larger opening.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        }
                    }.padding(12).background(accent.opacity(0.07),in:RoundedRectangle(cornerRadius:10))
                    VStack(alignment:.leading,spacing:14) {
                        sectionLabel("DIMENSIONS")
                        parameter("Envelope height",key:\.height,range:80...model.parameters.maximumHeight,unit:"mm")
                        parameter("Widest diameter",key:\.diameter,range:60...240,unit:"mm")
                    }
                    Divider()
                    PatternEditor(model:model)
                    Divider()
                    VStack(alignment:.leading,spacing:14) {
                        sectionLabel("ENVELOPE")
                        ParameterControl(title:"Vertical panels",value:model.panelBinding,range:8...32,step:4,unit:"")
                            .help("8 to 32 panels, in groups of four, for a symmetric envelope.")
                        parameter("Panel depth",key:\.panelDepth,range:0...8,unit:"%",step:0.5)
                            .help("Depth of the grooves as a percentage of the radius. Zero makes a smooth envelope.")
                        parameter("Shoulder height",key:\.shoulder,range:50...75,unit:"%")
                            .help("Where the balloon reaches its widest point, measured from the bottom.")
                    }
                    Divider()
                    VStack(alignment:.leading,spacing:14) {
                        sectionLabel(model.parameters.hollow || model.parameters.hasStringHoles ? "NECK" : "FLAT BASE")
                        parameter("Neck diameter",key:\.neckDiameter,range:model.parameters.minimumNeckDiameter...model.parameters.maximumNeckDiameter,unit:"mm")
                        parameter("Neck height",key:\.neckHeight,range:model.parameters.minimumNeckHeight...model.parameters.maximumNeckHeight,unit:"mm")
                    }
                    Divider()
                    VStack(alignment:.leading,spacing:14) {
                        sectionLabel("ATTACHMENTS")
                        Toggle("Basket string holes",isOn:model.stringHolesBinding)
                            .font(.system(size:12,weight:.medium))
                            .accessibilityIdentifier("basketAttachments")
                        if model.parameters.hasStringHoles {
                            parameter("Basket cord clearance",key:\.cordClearance,range:2...5,unit:"mm",step:0.5)
                            Text(model.parameters.hollow
                                 ? "Four holes in a reinforced neck, at least 12 mm tall. The LED opening stays clear."
                                 : "Two straight, crossing through-holes connect opposite sides of the neck. The bottom stays closed and flat.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        }
                        Toggle("Ceiling hanging loop",isOn:model.hangingLoopBinding)
                            .font(.system(size:12,weight:.medium))
                            .accessibilityIdentifier("ceilingAttachment")
                        if model.parameters.hangingLoop {
                            parameter("Hanging cord clearance",key:\.hangingClearance,range:2...5,unit:"mm",step:0.5)
                            parameter("Eyelet thickness",key:\.hangingThickness,range:8...16,unit:"mm",step:0.5)
                                .help("Thickness from front to back along the cord hole. More material strengthens the eyelet.")
                            parameter("Material around hole",key:\.hangingWall,range:4...8,unit:"mm",step:0.5)
                                .help("Material beside and above the cord hole. Increasing this makes the eyelet wider and taller.")
                            parameter("Base flare radius",key:\.hangingFillet,range:2.5...5,unit:"mm",step:0.5)
                                .help("Rounds and widens the join into the balloon. A larger flare also raises the hole to keep it clear.")
                            if model.parameters.hollow {
                                parameter("Crown thickness",key:\.hangingCrownThickness,range:3.4...8,unit:"mm",step:0.2)
                                    .help("Nominal thickness under the hanger, blended into the hollow shell. A thicker crown lets less light through.")
                            }
                            Text("Rounded eyelet on a reinforced crown. Hanger height: \(model.parameters.loopHeight.formatted(.number.precision(.fractionLength(1)))) mm. Total print height: \(model.parameters.totalHeight.formatted(.number.precision(.fractionLength(1)))) mm. Envelope height is limited automatically to fit the P2S.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                            Text("Print the eyelet and its crown base solid with a local 100% infill modifier. Strength depends on the printed layers; test the finished attachment before hanging.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        }
                    }
                    Text(model.parameters.hollow
                         ? "A real shell with a closed crown and open neck. Thin, translucent filament lets the LEDs glow through."
                         : "Closed envelope, no basket. Choose wall thickness and infill in your slicer.")
                        .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(3)
                }.padding(22)
            }
            VStack(spacing:9) {
                Button(action:model.export) {
                    HStack(spacing:8) {
                        if model.exporting {ProgressView().controlSize(.small)}
                        else {Image(systemName:"square.and.arrow.up")}
                        Text(model.exporting ? "Preparing \(model.exportFormat)…" : "Export \(model.exportFormat)…").fontWeight(.semibold)
                        Spacer()
                        Text("⌘E").opacity(0.65)
                    }.padding(.horizontal,15).frame(height:42)
                }
                .buttonStyle(.plain).foregroundStyle(.white)
                .background(accent,in:RoundedRectangle(cornerRadius:10))
                .disabled(model.exporting)
                .accessibilityIdentifier("exportBalloon")
                if let url=model.exportedURL {
                    Button {NSWorkspace.shared.activateFileViewerSelecting([url])} label: {
                        Label("File saved · Show in Finder",systemImage:"checkmark.circle.fill")
                            .font(.system(size:11)).foregroundStyle(accent)
                    }.buttonStyle(.plain)
                } else {
                    Text("\(model.exportFormat) · millimetres · checked before export")
                        .font(.system(size:10)).foregroundStyle(.secondary)
                }
            }.padding(20).background(.white.opacity(0.45))
        }
    }
    private var preview: some View {
        VStack(alignment:.leading,spacing:14) {
            HStack {
                Text(model.openedSTLName == nil ? "Your envelope":"Editable balloon").font(.system(size:18,weight:.semibold,design:.rounded))
                Spacer()
                if model.updating {
                    Text("Updating…").font(.system(size:11)).foregroundStyle(.secondary)
                } else {
                    Label("Live preview",systemImage:"circle.fill")
                        .font(.system(size:10,weight:.medium)).foregroundStyle(accent)
                }
            }
            ZStack(alignment:.topLeading) {
                BalloonPreview(mesh:model.mesh,revision:model.revision,color:model.uses3MF ? model.pattern.baseColor.nsColor:colors[colorIndex],
                               showPlate:showPlate && !inspectTop && !(inspectOpening && (model.parameters.hollow || model.parameters.hasStringHoles)),
                               wireframe:wireframe,resetCamera:resetCamera,
                               cutaway:cutaway && model.parameters.hollow,
                               inspectOpening:inspectOpening && (model.parameters.hollow || model.parameters.hasStringHoles),
                               neckDiameter:model.parameters.neckDiameter,neckHeight:model.parameters.neckHeight,filledNeck:!model.parameters.hollow,inspectTop:inspectTop && model.parameters.hangingLoop,faceColors:model.uses3MF ? model.faceColors:[],detailColor:model.pattern.detailColor.nsColor)
                    .clipShape(RoundedRectangle(cornerRadius:16))
                HStack(spacing:6) {
                    Image(systemName:"checkmark.circle.fill").foregroundStyle(Color(red:0.53,green:0.83,blue:0.68))
                    Text("Fits P2S").foregroundStyle(.white)
                    Text("256³ mm").foregroundStyle(.white.opacity(0.55))
                }.font(.system(size:11,weight:.medium))
                    .padding(.horizontal,11).padding(.vertical,8)
                    .background(.black.opacity(0.27),in:Capsule()).padding(15)
                VStack {
                    Spacer()
                    HStack {
                        Text("Drag to orbit  ·  Scroll to zoom")
                            .font(.system(size:10)).foregroundStyle(.white.opacity(0.65))
                        Spacer()
                        if model.parameters.hollow || model.parameters.hasStringHoles {
                            Button {inspectOpening.toggle();inspectTop=false;cutaway=false} label: {
                                Label(inspectOpening ? "Whole balloon" : (model.parameters.hollow ? "View opening":"View neck"),systemImage:"viewfinder")
                                    .font(.system(size:10,weight:.medium)).padding(.horizontal,9).frame(height:29)
                            }.buttonStyle(.plain).foregroundStyle(.white)
                                .background(.white.opacity(0.12),in:RoundedRectangle(cornerRadius:7))
                        }
                        if model.parameters.hangingLoop {
                            Button {inspectTop.toggle();inspectOpening=false;cutaway=false} label: {
                                Label(inspectTop ? "Whole balloon":"View hanger",systemImage:"viewfinder")
                                    .font(.system(size:10,weight:.medium)).padding(.horizontal,9).frame(height:29)
                            }.buttonStyle(.plain).foregroundStyle(.white)
                                .background(.white.opacity(0.12),in:RoundedRectangle(cornerRadius:7))
                        }
                        Button {inspectOpening=false;inspectTop=false;resetCamera += 1} label: {
                            Image(systemName:"arrow.counterclockwise").font(.system(size:12,weight:.medium))
                                .frame(width:29,height:29)
                        }.buttonStyle(.plain).foregroundStyle(.white)
                            .background(.white.opacity(0.12),in:RoundedRectangle(cornerRadius:7))
                            .help("Reset camera").accessibilityLabel("Reset camera")
                    }.padding(15)
                }
            }.frame(maxWidth:.infinity,maxHeight:.infinity).frame(minHeight:310)
            HStack(spacing:9) {
                ForEach(model.uses3MF ? []:Array(0..<colors.count),id:\.self) { i in
                    Button {colorIndex=i} label: {
                        Circle().fill(Color(nsColor:colors[i])).frame(width:18,height:18)
                            .padding(3).overlay(Circle().stroke(colorIndex == i ? accent : .clear,lineWidth:1.5))
                    }.buttonStyle(.plain).help("\(colorNames[i]) · preview color only")
                        .accessibilityLabel("\(colorNames[i]) preview color")
                }
                Spacer()
                if model.parameters.hollow {
                    Toggle("Cutaway",isOn:$cutaway)
                        .help("Preview the cavity. The exported file always contains the complete shell.")
                        .onChange(of:cutaway) {_,enabled in if enabled {inspectOpening=false;inspectTop=false}}
                }
                Toggle("Build plate",isOn:$showPlate)
                Toggle("Wireframe",isOn:$wireframe)
            }.font(.system(size:11)).toggleStyle(.checkbox)
            if model.uses3MF {PurgeSummary(model:model)}
            HStack(spacing:0) {
                metric("DIAMETER",value:model.pattern.style.hasRelief
                       ? String(format:"%.1f",max(model.mesh.dimensions.x,model.mesh.dimensions.y))
                       : "\(Int(model.parameters.diameter))",unit:"mm")
                Divider().frame(height:30)
                metric("TOTAL HEIGHT",value:model.parameters.totalHeight.formatted(.number.precision(.fractionLength(1))),unit:"mm")
                Divider().frame(height:30)
                if model.parameters.hollow {
                    metric("LED OPENING",value:model.parameters.openingDiameter.formatted(.number.precision(.fractionLength(1))),unit:"mm")
                } else {
                    metric("PANELS",value:"\(model.parameters.panels)",unit:"")
                }
            }.padding(.vertical,14).background(.white.opacity(0.8),in:RoundedRectangle(cornerRadius:12))
            HStack(alignment:.top,spacing:9) {
                Image(systemName:model.parameters.hollow || model.mesh.maxOverhang > 45 ? "exclamationmark.triangle" : "info.circle")
                    .foregroundStyle(model.mesh.maxOverhang > 45 ? Color.orange : accent)
                VStack(alignment:.leading,spacing:3) {
                    Text(model.parameters.hollow ? "Shell printing · 0% infill" : (model.mesh.maxOverhang > 45 ? "Check supports in your slicer" : "Ready to make it real"))
                        .font(.system(size:11,weight:.semibold))
                    Text(model.parameters.hollow
                         ? "Use standard mode, not vase mode. Print neck down with a brim. The hollow crown may need supports; inspect your sliced layers."
                         : model.mesh.maxOverhang > 45
                         ? "Outward overhang reaches \(Int(ceil(model.mesh.maxOverhang)))° from vertical. Inspect the sliced layers before printing."
                         : "Try 0.2 mm layers, 3 walls, 10% infill and an 8 mm brim. Print with the flat neck down.")
                        .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2).fixedSize(horizontal:false,vertical:true)
                }
            }.padding(.top,2)
        }
    }
    private func sectionLabel(_ title:String) -> some View {
        Text(title).font(.system(size:9,weight:.bold)).tracking(1.3).foregroundStyle(.secondary)
    }
    private func parameter(_ title:String,key:WritableKeyPath<BalloonParameters,Double>,range:ClosedRange<Double>,unit:String,step:Double=1) -> some View {
        ParameterControl(title:title,value:model.binding(key),range:range,step:step,unit:unit)
    }
    private func preset(_ title:String,_ parameters:BalloonParameters) -> some View {
        var matchingShape=parameters
        matchingShape.hollow=model.parameters.hollow
        matchingShape.wallThickness=model.parameters.wallThickness
        matchingShape.stringHoles=model.parameters.stringHoles
        matchingShape.cordClearance=model.parameters.cordClearance
        matchingShape.hangingLoop=model.parameters.hangingLoop
        matchingShape.hangingClearance=model.parameters.hangingClearance
        matchingShape.hangingThickness=model.parameters.hangingThickness
        matchingShape.hangingWall=model.parameters.hangingWall
        matchingShape.hangingFillet=model.parameters.hangingFillet
        matchingShape.hangingCrownThickness=model.parameters.hangingCrownThickness
        matchingShape=matchingShape.normalized()
        return Button {model.applyShape(parameters)} label: {
            Text(title).font(.system(size:12,weight:.medium)).frame(maxWidth:.infinity).padding(.vertical,9)
                .foregroundStyle(model.parameters == matchingShape ? .white : ink)
                .background(model.parameters == matchingShape ? accent : Color.white,in:RoundedRectangle(cornerRadius:8))
        }.buttonStyle(.plain)
    }
    private func metric(_ title:String,value:String,unit:String) -> some View {
        VStack(alignment:.leading,spacing:5) {
            Text(title).font(.system(size:8,weight:.bold)).tracking(1).foregroundStyle(.secondary)
            HStack(alignment:.firstTextBaseline,spacing:4) {
                Text(value).font(.system(size:22,weight:.medium,design:.rounded)).monospacedDigit()
                Text(unit).font(.system(size:11)).foregroundStyle(.secondary)
            }
        }.frame(maxWidth:.infinity,alignment:.leading).padding(.leading,20)
    }
}

struct ParameterControl: View {
    let title:String
    @Binding var value:Double
    let range:ClosedRange<Double>
    let step:Double
    let unit:String
    @State private var text=""
    @FocusState private var focused:Bool

    var body: some View {
        VStack(spacing:6) {
            HStack {
                Text(title).font(.system(size:12,weight:.medium))
                Spacer(minLength:5)
                TextField(title,text:$text)
                    .multilineTextAlignment(.trailing)
                    .font(.system(size:12,weight:.medium,design:.monospaced))
                    .textFieldStyle(.plain).frame(width:44)
                    .padding(.horizontal,6).padding(.vertical,4)
                    .background(.white,in:RoundedRectangle(cornerRadius:5))
                    .overlay(RoundedRectangle(cornerRadius:5).stroke(focused ? accent.opacity(0.6) : .black.opacity(0.08)))
                    .focused($focused).onSubmit {commit();focused=false}
                    .accessibilityLabel(title)
                if !unit.isEmpty {Text(unit).font(.system(size:10)).foregroundStyle(.secondary).frame(width:19,alignment:.leading)}
            }
            Slider(value:$value,in:range.lowerBound...max(range.upperBound,range.lowerBound+step),step:step).controlSize(.small)
                .disabled(range.lowerBound==range.upperBound)
                .accessibilityLabel("\(title) slider")
        }
        .onAppear {refresh()}
        .onChange(of:value) {_,_ in if !focused {refresh()}}
        .onChange(of:focused) {_,isFocused in if !isFocused {commit()}}
        .onReceive(NotificationCenter.default.publisher(for:.commitBalloonEditing)) { _ in
            if focused {commit()}
        }
    }
    private func refresh() {
        let digits=max(0,Int(ceil(-log10(step))))
        text=value.formatted(.number.precision(.fractionLength(0...digits)))
    }
    private func commit() {
        let input=text.trimmingCharacters(in:.whitespaces)
            .replacingOccurrences(of:Locale.current.decimalSeparator ?? ".",with:".")
        if let number=Double(input),number.isFinite {
            let rounded=(number/step).rounded()*step
            value=min(range.upperBound,max(range.lowerBound,rounded))
        }
        refresh()
    }
}
