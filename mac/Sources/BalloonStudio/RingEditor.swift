import SwiftUI
import AppKit
import UniformTypeIdentifiers

private enum RingView:Int,CaseIterable,Identifiable {
    case assembly,guided,plain,plate,pin
    var id:Int {rawValue}
    var title:String {
        switch self {
        case .assembly:return "Assembled ring"
        case .guided:return "A · Cord guide · print 3"
        case .plain:return "B · Plain section · print 3"
        case .plate:return "C · Joint plate · print 6"
        case .pin:return "D · Alignment pin · print 12"
        }
    }
}

struct RingPreviewState:Sendable {
    let parameters:RingParameters
    let kit:SegmentedRingKit?
    let assembled:BalloonMesh
    let exploded:BalloonMesh
    let parts:[BalloonMesh]
    let assemblyColors:[Int]
    let partColors:[[Int]]
    init(_ p:RingParameters) {
        parameters=p
        if p.segmented {
            let kit=SegmentedRingKit(p)
            self.kit=kit;assembled=kit.assembly();exploded=kit.assembly(exploded:true)
            parts=kit.printParts.map(\.mesh)
            assemblyColors=kit.assemblyFaceColors;partColors=kit.partFaceColors
        } else {
            let mesh=RingGenerator.generate(p)
            kit=nil;assembled=mesh;exploded=mesh;parts=[]
            assemblyColors=p.ledFaces(in:mesh)
            partColors=[]
        }
    }
}

@MainActor
final class RingModel:ObservableObject {
    @Published private(set) var parameters:RingParameters
    @Published private(set) var rendered:RingPreviewState
    @Published private(set) var revision=0
    @Published private(set) var updating=false
    @Published private(set) var exporting=false
    @Published var exportedURL:URL?
    @Published var error:String?
    private var pending:Task<Void,Never>?
    private let key="BalloonStudio.ring.v1"

    init() {
        let restored=UserDefaults.standard.data(forKey:key).flatMap {try? JSONDecoder().decode(RingParameters.self,from:$0)}
        let p=(restored ?? .solid).normalized()
        parameters=p;rendered=RingPreviewState(p)
    }
    func apply(_ value:RingParameters) {
        let p=value.normalized()
        guard p != parameters else {return}
        parameters=p;exportedURL=nil
        if let data=try? JSONEncoder().encode(p) {UserDefaults.standard.set(data,forKey:key)}
        pending?.cancel();updating=true
        pending=Task { [weak self] in
            do {try await Task.sleep(nanoseconds:60_000_000)} catch {return}
            guard !Task.isCancelled else {return}
            let rendered=await Task.detached(priority:.userInitiated) {RingPreviewState(p)}.value
            guard !Task.isCancelled,let self else {return}
            self.rendered=rendered;self.revision += 1;self.updating=false
        }
    }
    func construction(_ segmented:Bool) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        guard parameters.segmented != segmented else {return}
        var p=parameters;p.segmented=segmented
        apply(p)
    }
    func binding(_ key:WritableKeyPath<RingParameters,Double>) -> Binding<Double> {
        Binding(get:{self.parameters[keyPath:key]},set:{value in
            var p=self.parameters;p[keyPath:key]=value;self.apply(p)
        })
    }
    func lighting(_ reflected:Bool) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=parameters;p.reflectedLED=reflected
        if reflected {p.stripWidth=8;p.ledClearance=0.5;p.bandWidth=max(40,p.bandWidth)}
        apply(p)
    }
    func export() {
        guard !exporting else {return}
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        let p=parameters,panel=NSSavePanel()
        panel.title=p.segmented ? "Export Ring Kit":"Export Mobile Ring STL"
        panel.prompt=p.segmented ? "Export Kit":"Export Ring"
        panel.nameFieldStringValue=p.filename
        panel.allowedContentTypes=[UTType(filenameExtension:p.segmented ? "zip":"stl") ?? .data]
        panel.canCreateDirectories=true
        panel.message=p.segmented
            ? "ZIP containing four STL designs, print quantities and assembly instructions. Every part fits the P2S; the assembled ring does not."
            : p.reflectedLED
                ? "One continuous ring with three ceiling holes, three balloon holes and an upright LED mount. Print flat, trough facing up.\(p.fitsP2S ? "":" This size exceeds the P2S bed; reduce diameter in the app for a test print.")"
                : "One ring for three balloons, with six cord holes and a top LED channel. Print flat, channel facing up.\(p.fitsP2S ? "":" This size exceeds the P2S bed.")"
        guard let window=NSApp.keyWindow else {return}
        panel.beginSheetModal(for:window) { [weak self] response in
            guard response == .OK,let url=panel.url,let self else {return}
            self.exporting=true
            Task {
                do {
                    try await Task.detached(priority:.userInitiated) {
                        let data=try p.segmented ? SegmentedRingKit(p,quality:.export).archive():RingGenerator.generate(p,quality:.export).binarySTL()
                        try data.write(to:url,options:.atomic)
                    }.value
                    self.exportedURL=url
                } catch {self.error=error.localizedDescription}
                self.exporting=false
            }
        }
    }
}

struct RingEditor:View {
    @ObservedObject var model:RingModel
    @ObservedObject var balloon:BalloonModel
    @State private var showPlate=true
    @State private var wireframe=false
    @State private var topDown=false
    @State private var exploded=false
    @State private var resetCamera=0
    @State private var selection:RingView = .assembly
    @State private var showInstructions=false

    var body:some View {
        HStack(alignment:.top,spacing:0) {
            sidebar.frame(width:312)
            Divider().opacity(0.45)
            preview.padding(22)
        }
        .onChange(of:selection) {_,_ in resetCamera += 1;topDown=false}
        .onChange(of:exploded) {_,_ in resetCamera += 1}
        .onChange(of:model.rendered.parameters.diameter) {_,_ in resetCamera += 1}
        .onChange(of:model.parameters.segmented) {_,_ in selection = .assembly;exploded=false;resetCamera += 1}
        .alert("Ring export failed",isPresented:Binding(get:{model.error != nil},set:{if !$0 {model.error=nil}})) {
            Button("OK",role:.cancel) {model.error=nil}
        } message:{Text(model.error ?? "")}
        .sheet(isPresented:$showInstructions) {assemblyGuide}
    }
    private var sidebar:some View {
        VStack(spacing:0) {
            ScrollView {
                VStack(alignment:.leading,spacing:20) {
                    VStack(alignment:.leading,spacing:8) {
                        label("A MOBILE FOR THREE")
                        Picker("Construction",selection:Binding(get:{model.parameters.segmented},set:{model.construction($0)})) {
                            Text("One piece").tag(false)
                            Text("Six sections").tag(true)
                        }.pickerStyle(.segmented).labelsHidden().accessibilityIdentifier("ringConstruction")
                        Text(model.parameters.segmented ? "A bigger ring, printed in parts.":"One ring. Three balloons.")
                            .font(.system(size:16,weight:.semibold,design:.rounded))
                        Text(model.parameters.segmented
                             ? "Three cord-guide sections alternate with three plain sections. Glue the curved plates underneath and align with printed pins."
                             : model.parameters.reflectedLED
                                ? "One continuous ring with three ceiling holes, three balloon holes and a raised reflector for an upright LED strip."
                                : "Three balloon ties, evenly spaced around a flat ring. Three more holes suspend it from a single ceiling string.")
                            .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                    }
                    VStack(alignment:.leading,spacing:13) {
                        label("RING DIMENSIONS")
                        parameter("Ring diameter",\.diameter,model.parameters.diameterRange)
                        parameter("Band width",\.bandWidth,model.parameters.minimumBandWidth...model.parameters.maximumBandWidth)
                        parameter(model.parameters.reflectedLED ? "Base thickness":"Ring thickness",\.height,model.parameters.heightRange,step:0.5)
                        if model.parameters.reflectedLED {
                            Text("With the raised light trough: \(number(model.parameters.totalHeight)) mm tall\(model.parameters.segmented ? ", plus 4 mm at the joint plates.":".")")
                                .font(.system(size:10)).foregroundStyle(.secondary)
                        }
                        if model.parameters.segmented {
                            Text("The assembled ring is larger than the bed. Each section is rotated and centred for printing.")
                                .font(.system(size:10)).foregroundStyle(.secondary)
                        } else if !model.parameters.fitsP2S {
                            Text("Full-size model · exceeds the P2S bed. Set the diameter to 240 mm for a test print while keeping the LED mount full size.")
                                .font(.system(size:10)).foregroundStyle(.secondary)
                            Button("Use 240 mm for a test print") {
                                var p=model.parameters;p.diameter=240;model.apply(p)
                            }.font(.system(size:11,weight:.medium)).foregroundStyle(accent)
                        }
                        if !model.parameters.segmented {
                            Button("Printing & lighting guide") {showInstructions=true}
                                .font(.system(size:11,weight:.medium)).foregroundStyle(accent)
                                .accessibilityIdentifier("ringAssemblyGuide")
                        }
                    }
                    if model.parameters.segmented {
                        VStack(alignment:.leading,spacing:12) {
                            label("PERMANENT JOINTS")
                            parameter("Joint fit allowance",\.jointFit,0.2...0.6,step:0.1)
                            Text("Six 4 mm-thick plates bridge the seams, with about 30 mm overlap on each side. Twelve bevelled pins align the glue-up.")
                                .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                            Button("Printing & assembly guide") {showInstructions=true}
                                .font(.system(size:11,weight:.medium)).foregroundStyle(accent)
                                .accessibilityIdentifier("ringAssemblyGuide")
                        }
                    }
                    VStack(alignment:.leading,spacing:13) {
                        Label("LED mounting",systemImage:"lightbulb").font(.system(size:12,weight:.semibold))
                        Picker("Light mount",selection:Binding(get:{model.parameters.reflectedLED},set:{model.lighting($0)})) {
                            Text("Reflected uplight").tag(true)
                            Text("Flat top channel").tag(false)
                        }.accessibilityIdentifier("ringLightMount")
                        parameter("LED strip width",\.stripWidth,3.5...12,step:0.5)
                        parameter("LED fit allowance",\.ledClearance,0.2...1,step:0.1)
                        if model.parameters.reflectedLED {
                            parameter("Strip thickness incl. LEDs",\.stripThickness,1...6,step:0.5)
                            LEDReflectorDiagram(parameters:model.parameters).frame(height:155)
                            Text("One continuous strip, upright on the outer wall. Green marks the mounting face. The ledge supports its lower edge; the white 45° slope scatters light upward.")
                                .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                            Text("The floor and inner lip screen the LEDs from below. White PLA may still glow through: check \(model.parameters.segmented ? "one printed section":"a printed prototype") for opacity and LED heat. Thickness includes LEDs, coating and mounting tape.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        } else {
                            parameter("Channel depth",\.channelDepth,0.6...model.parameters.maximumChannelDepth,step:0.1)
                            Text("Top channel: \(number(model.parameters.channelWidth)) mm wide · \(number(model.parameters.floorThickness)) mm underneath.")
                                .font(.system(size:10,weight:.medium)).foregroundStyle(accent)
                            Text("Use a strip designed to curve sideways. A standard strip needs straight sections joined by wires. Green marks the channel floor.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        }
                    }.padding(12).background(accent.opacity(0.07),in:RoundedRectangle(cornerRadius:10))
                    VStack(alignment:.leading,spacing:12) {
                        label(model.parameters.continuousCords ? "CONTINUOUS CORD GUIDES":"STRING ATTACHMENTS")
                        parameter("Ring cord clearance",\.cordClearance,model.parameters.cordRange,step:0.5)
                        if model.parameters.continuousCords {
                            Text("Three large guides with bevelled edges. Run each main cord continuously from the ceiling hardware, through a guide, to its balloon.\(model.parameters.segmented ? " The small holes are for alignment pins.":"")")
                                .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                            Text("For the planned 3 × 1 kg balloons: this is an untested prototype, not a load-rated assembly. Use suitable rated cord/hardware and test the printed ring and balloon attachments. The ring still experiences sideways guide forces.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        } else if model.parameters.reflectedLED {
                            Text("Six bevelled through-holes, alternating around the ring: three for ceiling suspension and three for the balloons. Each group is spaced 120° apart, with a 60° offset between groups.")
                                .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                            Text("Separate balloon cords put their full weight through the ring. The planned 3 × 1 kg load has not been validated; test the printed ring and attachments before overhead use.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        } else {
                            Text("Six through-holes beside the LED channel. Band width grows automatically to keep material around the holes.")
                                .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                            Button {
                                NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
                                NSApp.keyWindow?.makeFirstResponder(nil)
                                var p=balloon.parameters;p.hangingLoop=true;p.hangingClearance=model.parameters.cordClearance
                                balloon.apply(p)
                            } label: {
                                Label("Add matching balloon hanger",systemImage:"link").font(.system(size:11,weight:.medium))
                            }.buttonStyle(.plain).foregroundStyle(accent)
                            Text("Export the balloon separately. The printed eyelet has not been load-tested.")
                                .font(.system(size:10)).foregroundStyle(.secondary)
                        }
                    }
                }.padding(22)
            }
            VStack(spacing:9) {
                Button(action:model.export) {
                    HStack(spacing:7) {
                        if model.exporting {ProgressView().controlSize(.small)} else {Image(systemName:"square.and.arrow.up")}
                        Text(model.exporting ? "Preparing ring…":model.parameters.segmented ? "Export Ring Kit…":"Export Ring STL…").fontWeight(.semibold)
                        Spacer();Text("⌘E").opacity(0.65)
                    }.padding(.horizontal,13).frame(height:42)
                }.buttonStyle(.plain).foregroundStyle(.white)
                    .background(accent,in:RoundedRectangle(cornerRadius:10)).disabled(model.exporting)
                    .accessibilityIdentifier("exportRing")
                if let url=model.exportedURL {
                    Button {NSWorkspace.shared.activateFileViewerSelecting([url])} label: {
                        Label("Ring saved · Show in Finder",systemImage:"checkmark.circle.fill").font(.system(size:11))
                    }.buttonStyle(.plain).foregroundStyle(accent)
                } else {
                    Text(model.parameters.segmented ? "ZIP · 4 STL designs + assembly notes":"STL · millimetres · checked before export")
                        .font(.system(size:10)).foregroundStyle(.secondary)
                }
            }.padding(20).background(.white.opacity(0.45))
        }
    }
    private var preview:some View {
        let state=model.rendered,p=state.parameters
        let assembling = !p.segmented || selection == .assembly
        let mesh=assembling ? (exploded && p.segmented ? state.exploded:state.assembled):state.parts[selection.rawValue-1]
        let colors=assembling ? state.assemblyColors:state.partColors[selection.rawValue-1]
        let printDimensions=mesh.dimensions
        return VStack(alignment:.leading,spacing:14) {
            HStack {
                if p.segmented {
                    Picker("Preview part",selection:$selection) {
                        ForEach(RingView.allCases) {Text($0.title).tag($0)}
                    }.labelsHidden().frame(maxWidth:265).accessibilityIdentifier("ringPreviewPart")
                } else {Text("Your solid ring").font(.system(size:18,weight:.semibold,design:.rounded))}
                Spacer()
                Text(model.updating ? "Updating…":"Live preview").font(.system(size:10,weight:.medium)).foregroundStyle(accent)
            }
            ZStack(alignment:.topLeading) {
                BalloonPreview(mesh:mesh,revision:model.revision*20+selection.rawValue+(exploded ? 10:0),
                               color:p.reflectedLED ? NSColor(white:0.9,alpha:1):NSColor(calibratedRed:0.73,green:0.77,blue:0.70,alpha:1),
                               showPlate:showPlate && !(p.segmented && assembling),wireframe:wireframe,resetCamera:resetCamera,
                               cutaway:false,inspectOpening:false,neckDiameter:0,compactObject:true,faceColors:colors,
                               detailColor:NSColor(calibratedRed:0.35,green:0.53,blue:0.46,alpha:1),
                               topDown:topDown,objectName:"mobile ring",sharpEdges:true)
                    .clipShape(RoundedRectangle(cornerRadius:16))
                Text(p.segmented && assembling ? "\(Int(p.diameter)) mm assembly · printed as separate parts"
                     : !p.segmented && !p.fitsP2S ? "\(Int(p.diameter)) mm solid ring · exceeds P2S bed"
                     : p.segmented && selection == .pin ? "Fits P2S · upright on the small flat end":"Fits P2S · flat underside on the bed")
                    .font(.system(size:11,weight:.medium)).foregroundStyle(.white)
                    .padding(.horizontal,11).padding(.vertical,8).background(.black.opacity(0.27),in:Capsule()).padding(15)
                VStack {
                    Spacer()
                    HStack {
                        Text("Drag to orbit  ·  Scroll to zoom").font(.system(size:10)).foregroundStyle(.white.opacity(0.65))
                        Spacer()
                        Button {topDown.toggle()} label: {
                            Label(topDown ? "Angled view":"Top view",systemImage:"viewfinder")
                                .font(.system(size:10,weight:.medium)).padding(.horizontal,9).frame(height:29)
                        }.buttonStyle(.plain).foregroundStyle(.white)
                            .background(.white.opacity(0.12),in:RoundedRectangle(cornerRadius:7))
                        Button {topDown=false;resetCamera += 1} label: {
                            Image(systemName:"arrow.counterclockwise").frame(width:29,height:29)
                        }.buttonStyle(.plain).foregroundStyle(.white)
                            .background(.white.opacity(0.12),in:RoundedRectangle(cornerRadius:7)).help("Reset ring camera")
                    }.padding(15)
                }
            }.frame(maxWidth:.infinity,maxHeight:.infinity).frame(minHeight:280)
            HStack {
                if p.segmented && assembling {Toggle("Exploded assembly",isOn:$exploded)}
                else {
                    Text(p.segmented && selection == .pin ? "Print upright · bevelled ends"
                         : p.segmented && selection == .plate ? "Print flat · underside joint plate":"Print flat · channel up")
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if !(p.segmented && assembling) {Toggle("Build plate",isOn:$showPlate)}
                Toggle("Wireframe",isOn:$wireframe)
            }.font(.system(size:11)).toggleStyle(.checkbox)
            HStack(spacing:0) {
                metric(assembling ? "RING DIAMETER":"PART FOOTPRINT",assembling ? number(p.diameter):"\(Int(ceil(printDimensions.x))) × \(Int(ceil(printDimensions.y)))","mm")
                Divider().frame(height:30)
                metric(assembling ? (p.reflectedLED ? "LED STRIP":"LED CHANNEL"):"PART HEIGHT",number(assembling ? (p.reflectedLED ? p.stripWidth:p.channelWidth):printDimensions.z),assembling ? "mm wide":"mm")
                Divider().frame(height:30)
                metric(assembling ? "STRIP PATH ≈":"PRINT QUANTITY",assembling ? String(Int(p.stripPathLength.rounded())):String(selection == .pin ? 12:selection == .plate ? 6:3),assembling ? "mm":"copies")
            }.padding(.vertical,14).background(.white.opacity(0.8),in:RoundedRectangle(cornerRadius:12))
            HStack(alignment:.center,spacing:16) {
                if p.continuousCords {ContinuousCordDiagram().frame(width:106,height:100)}
                else {SeparateCordDiagram().frame(width:106,height:100)}
                VStack(alignment:.leading,spacing:5) {
                    Text(p.continuousCords ? "Main cords continue through the ring":"3 ceiling holes + 3 balloon holes").font(.system(size:12,weight:.semibold))
                    Text(p.continuousCords
                         ? "Ceiling hardware → guide → balloon. Use a retainer below each guide to support the ring on the cord. The ring still carries sideways guide forces and has not been load-tested."
                         : "Alternate ceiling and balloon cords around the ring. Join the three ceiling cords above it; attach a balloon to each of the three holes in between.")
                        .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                    Text(p.segmented
                         ? "Print 3 A + 3 B + 6 plates + 12 pins. Glue A–B–A–B–A–B; fit the LEDs after curing."
                         : p.reflectedLED ? "6 bevelled attachment holes · \(number(p.stripWidth)) mm LED strip · ring carries balloon weight"
                         : "Balloon ties are \(Int(p.balloonSpacing)) mm apart; stagger larger balloons in height.")
                        .font(.system(size:10)).foregroundStyle(accent)
                }.fixedSize(horizontal:false,vertical:true)
            }
        }
    }
    private var assemblyGuide:some View {
        VStack(alignment:.leading,spacing:16) {
            HStack {
                Text(model.parameters.segmented ? "Six-section ring · assembly":"Solid ring · printing & lighting").font(.title2.weight(.semibold))
                Spacer()
                Button("Done") {showInstructions=false}.keyboardShortcut(.cancelAction)
            }
            ScrollView {
                VStack(alignment:.leading,spacing:20) {
                    if model.parameters.segmented {
                    guide("1 · Print and dry-fit","Print 3 cord-guide sections A, 3 plain sections B, 6 underside plates C and 12 pins D. Print a plate and pin first to check the joint fit. All exports are already oriented flat on the bed; print pins upright. Start with 0.2 mm layers, 6 walls and 40% infill for A/B, solid plates and pins. These are prototype settings, not a load rating.")
                    guide("2 · Glue a complete circle","Alternate A–B–A–B–A–B with the channels up. Put a curved plate underneath each seam and align with two pins. Use a PLA-compatible adhesive on the broad plate surfaces, seam faces and pins, following its preparation and full-cure instructions. Keep the three large guides and channel free of glue. Pins align the parts; they do not lock the joint.")
                    guide("3 · Route continuous main cords","Run three separate, continuous cords from rated ceiling hardware, through the large guides in A, to the balloons. Use retainers below the guides to carry the ring on the cords. Do not end a main cord at the ring and start a separate balloon cord underneath. Keep upper legs reasonably steep and balanced; the ring still sees sideways forces.")
                    guide("4 · Test before hanging","The planned balloons weigh about 1 kg each, plus ring and LEDs. The kit and existing balloon eyelets have not been load-tested. Check the fully cured, printed and rigged assembly at low height over a clear area, including sustained loading, cord wear and deformation. Use proven attachments and suitably rated cord/hardware. PLA can creep over time.")
                    guide("5 · Add the light",model.parameters.reflectedLED
                          ? "Install the \(number(model.parameters.stripWidth)) mm strip upright against the green mounting face on the outer wall, after all joints cure. Its lower edge sits on the ledge and its LEDs face the white slope. Use mounting adhesive compatible with the strip and PLA, and smooth every seam first. Keep one continuous run across the six sections; trim only at a marked cut point, leave a small end gap and route the lead over the outer rim. Print and light one section first: PLA scatters light and may transmit a glow. Check the strip's bend radius, cooling requirements and temperature; PLA is not a heat sink. The thickness setting must include LEDs, coating and mounting tape."
                          : "Install the \(number(model.parameters.stripWidth)) mm strip after the joints cure. The flat circular channel requires a strip that bends sideways or short connected sections. Follow the cut points and bend limits. Check heat-sink requirements and operating temperature against PLA and adhesive. Route the lead over the rim.")
                    Text("The ZIP includes detailed assembly notes, exact dimensions and print quantities.").foregroundStyle(.secondary)
                    } else {
                        guide("1 · Choose a print size","Export saves one continuous STL, with a flat underside. The 450 mm design exceeds the 256 mm P2S bed. Set the diameter to 240 mm in the app for a smaller test ring; the LED mount and cord clearances retain their size. Do not scale the STL in the slicer, as that changes those clearances. Print trough-up at 100% scale. Start with 0.2 mm layers, 6 walls, 6 top/bottom layers and 40% infill as prototype settings, not a load rating.")
                        guide("2 · Attach ceiling and balloon cords","Use every other hole for ceiling suspension and the three holes in between for the balloons. Each group forms a triangle with holes 120° apart; the groups are offset by 60°. Join the three ceiling cords above the ring at suitable ceiling hardware. Tie a separate balloon cord to each remaining hole. The ring now carries the full balloon load, as well as its own weight and the LEDs. The printed ring and balloon attachments have not been load-tested for the planned 3 × 1 kg.")
                        guide("3 · Add the light",model.parameters.reflectedLED
                              ? "Mount the \(number(model.parameters.stripWidth)) mm strip upright on the green outer-wall face, LEDs facing the white 45° slope. The lower edge rests on the ledge; use mounting adhesive compatible with the strip and PLA. The strip curves in its natural bending direction. Follow its minimum bend radius and marked cut points, leave a small end gap and route the supply lead over the rim. The thickness setting includes LEDs, coating and mounting tape."
                              : "The flat circular channel needs a strip designed to bend sideways, or short connected sections. Follow the strip's cut points and bend limits, and route the lead over the rim.")
                        guide("4 · Check the printed prototype","Illuminate the ring to check reflection, underside glow and temperature. White PLA scatters light but may transmit a glow, and is not a heat sink; follow the strip's cooling requirements. For the planned 3 × 1 kg balloons, test the actual printed ring, rigging and attachments at low height over a clear area, including sustained loading, deformation and cord wear. PLA can creep over time. Geometry checks do not establish a load rating.")
                    }
                }.font(.system(size:13)).textSelection(.enabled).padding(.trailing,10)
            }
        }.padding(24).frame(width:640,height:620)
    }
    private func guide(_ title:String,_ body:String) -> some View {
        VStack(alignment:.leading,spacing:6) {Text(title).fontWeight(.semibold);Text(body).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)}
    }
    private func number(_ value:Double) -> String {value.formatted(.number.precision(.fractionLength(0...1)))}
    private func label(_ title:String) -> some View {Text(title).font(.system(size:9,weight:.bold)).tracking(1.3).foregroundStyle(.secondary)}
    private func parameter(_ title:String,_ key:WritableKeyPath<RingParameters,Double>,_ range:ClosedRange<Double>,step:Double=1) -> some View {
        ParameterControl(title:title,value:model.binding(key),range:range,step:step,unit:"mm")
    }
    private func metric(_ title:String,_ value:String,_ unit:String) -> some View {
        VStack(alignment:.leading,spacing:5) {
            Text(title).font(.system(size:8,weight:.bold)).tracking(0.7).foregroundStyle(.secondary)
            HStack(alignment:.firstTextBaseline,spacing:4) {
                Text(value).font(.system(size:20,weight:.medium,design:.rounded)).monospacedDigit()
                Text(unit).font(.system(size:10)).foregroundStyle(.secondary)
            }
        }.frame(maxWidth:.infinity,alignment:.leading).padding(.leading,16)
    }
}

private struct SeparateCordDiagram:View {
    var body:some View {
        Canvas {context,size in
            let w=size.width,h=size.height,cx=w/2,cy=h*0.46,rx=w*0.38,ry=h*0.12
            func point(_ hole:Int) -> CGPoint {
                let angle=Double(hole)*Double.pi/3-Double.pi/2
                return CGPoint(x:cx+rx*cos(angle),y:cy+ry*sin(angle))
            }
            for hole in stride(from:0,to:6,by:2) {
                var cord=Path();cord.move(to:CGPoint(x:cx,y:8));cord.addLine(to:point(hole))
                context.stroke(cord,with:.color(accent),lineWidth:1.5)
            }
            context.stroke(Path(ellipseIn:CGRect(x:cx-rx,y:cy-ry,width:2*rx,height:2*ry)),with:.color(ink.opacity(0.2)),lineWidth:7)
            for hole in 0..<6 {
                let p=point(hole)
                context.fill(Path(ellipseIn:CGRect(x:p.x-2,y:p.y-2,width:4,height:4)),with:.color(accent))
                if hole%2==1 {
                    var cord=Path();cord.move(to:p);cord.addLine(to:CGPoint(x:p.x,y:h-17))
                    context.stroke(cord,with:.color(accent),lineWidth:1.5)
                    context.fill(Path(ellipseIn:CGRect(x:p.x-7,y:h-18,width:14,height:16)),with:.color(accent.opacity(0.25)))
                }
            }
            context.stroke(Path(ellipseIn:CGRect(x:cx-4,y:2,width:8,height:8)),with:.color(ink),lineWidth:1.5)
        }.accessibilityLabel("Six attachment holes alternate around the ring: three ceiling suspension cords meet above it, and three separate balloon cords hang from the holes in between.")
    }
}

private struct ContinuousCordDiagram:View {
    var body:some View {
        Canvas {context,size in
            let w=size.width,h=size.height
            var ring=Path();ring.move(to:CGPoint(x:8,y:h*0.49));ring.addLine(to:CGPoint(x:w-8,y:h*0.49))
            context.stroke(ring,with:.color(ink.opacity(0.2)),lineWidth:9)
            for fraction in [0.18,0.5,0.82] {
                let x=w*fraction
                var cord=Path();cord.move(to:CGPoint(x:w/2,y:8));cord.addLine(to:CGPoint(x:x,y:h*0.49));cord.addLine(to:CGPoint(x:x,y:h-16))
                context.stroke(cord,with:.color(accent),lineWidth:1.5)
                context.fill(Path(ellipseIn:CGRect(x:x-3,y:h*0.49+5,width:6,height:4)),with:.color(accent))
                context.fill(Path(ellipseIn:CGRect(x:x-7,y:h-18,width:14,height:16)),with:.color(accent.opacity(0.25)))
            }
            context.stroke(Path(ellipseIn:CGRect(x:w/2-4,y:2,width:8,height:8)),with:.color(ink),lineWidth:1.5)
        }.accessibilityLabel("Suspension schematic: three continuous cords from the ceiling through ring guides to the balloons. Retainers below the guides support the ring.")
    }
}
