import SwiftUI
import AppKit
import UniformTypeIdentifiers

enum StudioPart:String,CaseIterable,Identifiable {
    case balloon="Balloon",basket="Basket",ring="Ring",cloud="Cloud",sun="Sun",figure="Figures",clip="Cable clip"
    var id:String {rawValue}
}

@MainActor
final class BasketModel:ObservableObject {
    @Published private(set) var parameters:BasketParameters
    @Published private(set) var mesh:BalloonMesh
    @Published private(set) var revision=0
    @Published private(set) var updating=false
    @Published private(set) var exporting=false
    @Published var exportedURL:URL?
    @Published var error:String?
    private var pending:Task<Void,Never>?
    private let key="BalloonStudio.basket.v1"
    init() {
        let restored=UserDefaults.standard.data(forKey:key).flatMap {try? JSONDecoder().decode(BasketParameters.self,from:$0)}
        let p=(restored ?? BasketParameters()).normalized()
        parameters=p;mesh=BasketGenerator.generate(p)
    }
    func apply(_ value:BasketParameters) {
        let p=value.normalized()
        guard p != parameters else {return}
        parameters=p;exportedURL=nil
        if let data=try? JSONEncoder().encode(p) {UserDefaults.standard.set(data,forKey:key)}
        pending?.cancel();updating=true
        pending=Task { [weak self] in
            do {try await Task.sleep(nanoseconds:60_000_000)} catch {return}
            guard !Task.isCancelled else {return}
            let mesh=await Task.detached(priority:.userInitiated) {BasketGenerator.generate(p)}.value
            guard !Task.isCancelled,let self else {return}
            self.mesh=mesh;self.revision += 1;self.updating=false
        }
    }
    func style(_ style:BasketStyle) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=parameters;p.style=style;apply(p)
    }
    func binding(_ key:WritableKeyPath<BasketParameters,Double>) -> Binding<Double> {
        Binding(get:{self.parameters[keyPath:key]},set:{value in
            var p=self.parameters;p[keyPath:key]=value;self.apply(p)
        })
    }
    func match(_ balloon:BalloonParameters) {
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        var p=parameters
        p.width=round(balloon.diameter*0.35);p.depth=round(balloon.diameter*0.27);p.height=round(balloon.height*0.19)
        apply(p)
    }
    func export() {
        guard !exporting else {return}
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        let p=parameters,panel=NSSavePanel()
        panel.title="Export Basket STL";panel.prompt="Export Basket"
        panel.nameFieldStringValue=p.filename
        panel.allowedContentTypes=[UTType(filenameExtension:"stl") ?? .data]
        panel.canCreateDirectories=true
        panel.message="A separate open-top basket with four cord holes. Millimetres; print flat base down."
        guard let window=NSApp.keyWindow else {return}
        panel.beginSheetModal(for:window) { [weak self] response in
            guard response == .OK,let url=panel.url,let self else {return}
            self.exporting=true
            Task {
                do {
                    try await Task.detached(priority:.userInitiated) {
                        let data=try BasketGenerator.generate(p,quality:.export).binarySTL()
                        try data.write(to:url,options:.atomic)
                    }.value
                    self.exportedURL=url
                } catch {self.error=error.localizedDescription}
                self.exporting=false
            }
        }
    }
}

struct BasketEditor:View {
    @ObservedObject var model:BasketModel
    @ObservedObject var balloon:BalloonModel
    @State private var showPlate=true
    @State private var wireframe=false
    @State private var cutaway=false
    @State private var resetCamera=0
    @State private var colorIndex=0
    private let colors:[NSColor]=[
        NSColor(calibratedRed:0.67,green:0.40,blue:0.19,alpha:1),
        NSColor(calibratedRed:0.73,green:0.74,blue:0.68,alpha:1),
        NSColor(calibratedRed:0.22,green:0.46,blue:0.39,alpha:1)
    ]
    var body:some View {
        HStack(alignment:.top,spacing:0) {
            sidebar.frame(width:312)
            Divider().opacity(0.45)
            preview.padding(22)
        }
        .alert("Basket export failed",isPresented:Binding(get:{model.error != nil},set:{if !$0 {model.error=nil}})) {
            Button("OK",role:.cancel) {model.error=nil}
        } message:{Text(model.error ?? "")}
    }
    private var sidebar:some View {
        VStack(spacing:0) {
            ScrollView {
                VStack(alignment:.leading,spacing:20) {
                    VStack(alignment:.leading,spacing:8) {
                        label("CHOOSE A BASKET")
                        ForEach(BasketStyle.allCases) {style in
                            Button {model.style(style)} label: {
                                HStack(spacing:10) {
                                    Image(systemName:style.symbol).font(.system(size:20)).frame(width:28)
                                    VStack(alignment:.leading,spacing:3) {
                                        Text(style.title).font(.system(size:12,weight:.semibold))
                                        Text(style.subtitle).font(.system(size:9))
                                            .foregroundStyle(model.parameters.style == style ? Color.white.opacity(0.8):.secondary)
                                    }
                                    Spacer(minLength:0)
                                    if model.parameters.style == style {Image(systemName:"checkmark").font(.system(size:10,weight:.bold))}
                                }.padding(11).frame(maxWidth:.infinity,alignment:.leading)
                                    .foregroundStyle(model.parameters.style == style ? .white:ink)
                                    .background(model.parameters.style == style ? accent:.white,in:RoundedRectangle(cornerRadius:9))
                            }.buttonStyle(.plain).accessibilityLabel("\(style.title) basket")
                        }
                    }
                    VStack(alignment:.leading,spacing:13) {
                        HStack {
                            label("DIMENSIONS")
                            Spacer()
                            Button("Match balloon") {model.match(balloon.parameters)}
                                .font(.system(size:10)).buttonStyle(.plain).foregroundStyle(accent)
                                .help("Size this basket in proportion to the current balloon.")
                        }
                        parameter(model.parameters.style == .ribbed ? "Diameter":"Width",\.width,40...100,"mm")
                        if model.parameters.style != .ribbed {parameter("Depth",\.depth,30...90,"mm")}
                        parameter("Basket height",\.height,24...70,"mm")
                        parameter("Basket wall",\.wallThickness,1.6...3.2,"mm",step:0.2)
                        parameter("Surface detail",\.texture,0...1,"",step:0.1)
                    }
                    Divider()
                    VStack(alignment:.leading,spacing:12) {
                        label("STRING ATTACHMENTS")
                        parameter("Cord clearance",\.cordClearance,2...5,"mm",step:0.5)
                        Text("Four round holes with beveled edges, one on each side. Choose clearance larger than your string.")
                            .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2)
                        Group {
                            Button {
                                NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
                                balloon.addStringHoles(clearance:model.parameters.cordClearance)
                            } label: {
                                Label(balloon.parameters.hasStringHoles && abs(balloon.parameters.cordClearance-model.parameters.cordClearance)<0.01
                                      ? "Balloon holes match" : "Add matching balloon holes",systemImage:"link")
                                    .font(.system(size:11,weight:.medium)).frame(maxWidth:.infinity).padding(.vertical,9)
                            }.buttonStyle(.plain).foregroundStyle(accent)
                                .background(accent.opacity(0.08),in:RoundedRectangle(cornerRadius:8))
                            Text("Works with filled and hollow balloons. The neck may become taller or wider. Export the updated balloon separately.")
                                .font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
                        }
                    }
                }.padding(22)
            }
            VStack(spacing:9) {
                Button(action:model.export) {
                    HStack(spacing:7) {
                        if model.exporting {ProgressView().controlSize(.small)} else {Image(systemName:"square.and.arrow.up")}
                        Text(model.exporting ? "Preparing basket…":"Export Basket STL…").fontWeight(.semibold)
                        Spacer();Text("⌘E").opacity(0.65)
                    }.padding(.horizontal,13).frame(height:42)
                }.buttonStyle(.plain).foregroundStyle(.white)
                    .background(accent,in:RoundedRectangle(cornerRadius:10)).disabled(model.exporting)
                    .accessibilityIdentifier("exportBasket")
                if let url=model.exportedURL {
                    Button {NSWorkspace.shared.activateFileViewerSelecting([url])} label: {
                        Label("Basket saved · Show in Finder",systemImage:"checkmark.circle.fill").font(.system(size:11))
                    }.buttonStyle(.plain).foregroundStyle(accent)
                } else {Text("Separate STL · four string holes · millimetres").font(.system(size:10)).foregroundStyle(.secondary)}
            }.padding(20).background(.white.opacity(0.45))
        }
    }
    private var preview:some View {
        VStack(alignment:.leading,spacing:14) {
            HStack {
                Text("\(model.parameters.style.title) basket").font(.system(size:18,weight:.semibold,design:.rounded))
                Spacer()
                Text(model.updating ? "Updating…":"Live preview").font(.system(size:10,weight:.medium)).foregroundStyle(accent)
            }
            ZStack(alignment:.topLeading) {
                BalloonPreview(mesh:model.mesh,revision:model.revision,color:colors[colorIndex],showPlate:showPlate,
                               wireframe:wireframe,resetCamera:resetCamera,cutaway:cutaway,inspectOpening:false,
                               neckDiameter:0,compactObject:true,sharpEdges:true,smoothAngle:.pi/6,
                               smoothBelowHeight:model.parameters.holeCenter-model.parameters.cordClearance/2-0.6)
                    .clipShape(RoundedRectangle(cornerRadius:16))
                Label("4 cord holes · open top",systemImage:"link")
                    .font(.system(size:11,weight:.medium)).foregroundStyle(.white)
                    .padding(.horizontal,11).padding(.vertical,8).background(.black.opacity(0.27),in:Capsule()).padding(15)
                VStack {
                    Spacer()
                    HStack {
                        Text("Drag to orbit  ·  Scroll to zoom").font(.system(size:10)).foregroundStyle(.white.opacity(0.65))
                        Spacer()
                        Button {resetCamera += 1} label: {
                            Image(systemName:"arrow.counterclockwise").frame(width:29,height:29)
                        }.buttonStyle(.plain).foregroundStyle(.white)
                            .background(.white.opacity(0.12),in:RoundedRectangle(cornerRadius:7)).help("Reset basket camera")
                    }.padding(15)
                }
            }.frame(maxWidth:.infinity,maxHeight:.infinity).frame(minHeight:310)
            HStack(spacing:9) {
                ForEach(0..<colors.count,id:\.self) {i in
                    Button {colorIndex=i} label: {
                        Circle().fill(Color(nsColor:colors[i])).frame(width:18,height:18).padding(3)
                            .overlay(Circle().stroke(colorIndex == i ? accent:.clear,lineWidth:1.5))
                    }.buttonStyle(.plain).help("Preview colour only")
                }
                Spacer()
                Toggle("Cutaway",isOn:$cutaway)
                Toggle("Build plate",isOn:$showPlate)
                Toggle("Wireframe",isOn:$wireframe)
            }.font(.system(size:11)).toggleStyle(.checkbox)
            HStack(spacing:0) {
                metric("FOOTPRINT","\(Int(model.parameters.width)) × \(Int(model.parameters.actualDepth))","mm")
                Divider().frame(height:30)
                metric("HEIGHT","\(Int(model.parameters.height))","mm")
                Divider().frame(height:30)
                metric("CORD CLEARANCE",model.parameters.cordClearance.formatted(.number.precision(.fractionLength(0...1))),"mm")
            }.padding(.vertical,14).background(.white.opacity(0.8),in:RoundedRectangle(cornerRadius:12))
            HStack(alignment:.top,spacing:9) {
                Image(systemName:"link").foregroundStyle(accent)
                VStack(alignment:.leading,spacing:3) {
                    Text("Print separately, then string together").font(.system(size:11,weight:.semibold))
                    Text("Print flat base down. Tie four equal-length strings through the basket holes and the matching balloon neck holes.")
                        .font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(2).fixedSize(horizontal:false,vertical:true)
                }
            }.padding(.top,2)
        }
    }
    private func label(_ title:String) -> some View {Text(title).font(.system(size:9,weight:.bold)).tracking(1.3).foregroundStyle(.secondary)}
    private func parameter(_ title:String,_ key:WritableKeyPath<BasketParameters,Double>,_ range:ClosedRange<Double>,_ unit:String,step:Double=1) -> some View {
        ParameterControl(title:title,value:model.binding(key),range:range,step:step,unit:unit)
    }
    private func metric(_ title:String,_ value:String,_ unit:String) -> some View {
        VStack(alignment:.leading,spacing:5) {
            Text(title).font(.system(size:8,weight:.bold)).tracking(0.7).foregroundStyle(.secondary)
            HStack(alignment:.firstTextBaseline,spacing:4) {
                Text(value).font(.system(size:21,weight:.medium,design:.rounded)).monospacedDigit()
                Text(unit).font(.system(size:10)).foregroundStyle(.secondary)
            }
        }.frame(maxWidth:.infinity,alignment:.leading).padding(.leading,16)
    }
}
