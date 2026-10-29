import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct STLImportReview: Identifiable {
    let id = UUID()
    let url: URL
    let imported: ImportedBalloon
    let editable: BalloonMesh
}

@MainActor
final class StudioImportModel: ObservableObject {
    @Published private(set) var loading = false
    @Published var review: STLImportReview?
    @Published var error: String?

    func chooseFile(useSettings: @escaping (CloudParameters) -> Void) {
        guard !loading, review == nil else {return}
        NotificationCenter.default.post(name:.commitBalloonEditing,object:nil)
        NSApp.keyWindow?.makeFirstResponder(nil)
        let panel = NSOpenPanel()
        panel.title = "Open Balloon or Lamp Settings"
        panel.prompt = "Open"
        panel.allowedContentTypes = [UTType(filenameExtension:"stl") ?? .data, .json]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Choose a balloon STL, cloud-settings.json, or sun-settings.json from an exported lamp kit."
        guard let window = NSApp.keyWindow else {return}
        panel.beginSheetModal(for:window) { [weak self] response in
            guard response == .OK, let url = panel.url else {return}
            self?.open(url, useSettings: useSettings)
        }
    }

    func open(_ url: URL, useSettings: @escaping (CloudParameters) -> Void) {
        guard !loading, review == nil else {return}
        let fileExtension = url.pathExtension.lowercased()
        guard ["stl", "json"].contains(fileExtension) else {
            error = "Choose a balloon STL or a cloud or sun settings JSON file.";return
        }
        error = nil
        loading = true
        Task {
            do {
                let result = try await Task.detached(priority:.userInitiated) { () -> OpenedFile in
                    let access = url.startAccessingSecurityScopedResource()
                    defer {if access {url.stopAccessingSecurityScopedResource()}}
                    if fileExtension == "json" {
                        return .settings(try LampSettingsFile.decode(Data(contentsOf: url)))
                    }
                    let imported = try BalloonSTL.open(url)
                    let editable = BalloonGenerator.generate(imported.parameters)
                    return .balloon(STLImportReview(url:url,imported:imported,editable:editable))
                }.value
                switch result {
                case .balloon(let imported): review = imported
                case .settings(let parameters): useSettings(parameters)
                }
            } catch {self.error = error.localizedDescription}
            loading = false
        }
    }

    private enum OpenedFile {
        case balloon(STLImportReview)
        case settings(CloudParameters)
    }
}

struct STLImportReviewView: View {
    let review: STLImportReview
    let useBalloon: () -> Void
    let cancel: () -> Void
    @State private var wireframe = false
    @State private var resetCamera = 0

    var body: some View {
        VStack(alignment:.leading,spacing:16) {
            Text(review.imported.restoredSettings ? "Open editable balloon" : "Review reconstructed balloon")
                .font(.system(size:22,weight:.semibold,design:.rounded))
            Text(review.url.lastPathComponent).font(.subheadline).foregroundStyle(.secondary).lineLimit(1).help(review.url.path)
            Text(review.imported.notes).font(.system(size:12)).fixedSize(horizontal:false,vertical:true)
            HStack(spacing:16) {
                preview("Opened STL",mesh:review.imported.mesh)
                preview("Editable balloon",mesh:review.editable)
            }
            HStack {
                Toggle("Wireframe",isOn:$wireframe)
                Button("Reset views") {resetCamera += 1}
                Spacer()
                Text(review.imported.restoredSettings ? "Recovered settings" : "Estimated settings · review before editing")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Text("Continue to adjust the balloon’s shape, hollow walls, string holes, hanging loop, and patterns. This replaces the current balloon settings. The source file stays unchanged until you explicitly export over it.")
                .font(.system(size:12)).foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Cancel",action:cancel).keyboardShortcut(.cancelAction)
                Button("Use Editable Balloon",action:useBalloon).keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
        }.padding(24).frame(width:860).background(paper).tint(accent)
    }

    private func preview(_ title:String,mesh:BalloonMesh) -> some View {
        VStack(alignment:.leading,spacing:8) {
            Text(title).font(.headline)
            BalloonPreview(mesh:mesh,revision:0,color:NSColor(calibratedRed:0.86,green:0.43,blue:0.18,alpha:1),
                showPlate:true,wireframe:wireframe,resetCamera:resetCamera,cutaway:false,inspectOpening:false,neckDiameter:32)
                .frame(height:300).clipShape(RoundedRectangle(cornerRadius:12))
            let d = mesh.dimensions
            Text(String(format:"%.1f × %.1f × %.1f mm",d.x,d.y,d.z)).font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth:.infinity)
    }
}
