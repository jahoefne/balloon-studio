import Foundation

enum LampSettingsFile {
    enum ReadError: LocalizedError {
        case invalidSettings

        var errorDescription: String? {
            "This file doesn’t contain valid cloud or sun lamp settings. Choose cloud-settings.json or sun-settings.json from an exported lamp kit."
        }
    }

    static func decode(_ data: Data) throws -> CloudParameters {
        do {
            return try JSONDecoder().decode(Document.self, from: data).parameters.normalized()
        } catch {
            throw ReadError.invalidSettings
        }
    }

    private struct Document: Decodable {
        let parameters: CloudParameters

        init(from decoder: Decoder) throws {
            // Preferences allow missing values for migration. An opened file must
            // identify a lamp before those defaults can replace the current design.
            let fields = try decoder.container(keyedBy: CloudParameters.CodingKeys.self)
            for key: CloudParameters.CodingKeys in [.width, .depth, .diffuserThickness] {
                _ = try fields.decode(Double.self, forKey: key)
            }
            parameters = try CloudParameters(from: decoder)
        }
    }
}
