import Foundation

/// Settings JSON written into exported kits and 3MF files. A plain JSONEncoder
/// orders keys differently in every process, which changed the bytes, CRCs and
/// offsets of every kit between two runs. Sorted keys make each export repeatable.
enum StableJSON {
    static func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return try encoder.encode(value)
    }
}
