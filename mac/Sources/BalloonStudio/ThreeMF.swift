import Foundation

extension PaintedBalloon {
    func threeMF(settings:PatternSettings, purge:PurgeSettings) throws -> Data {
        try mesh.validate()
        guard colors.count == mesh.triangles.count,colors.allSatisfy({$0==0 || $0==1}) else {throw MeshError.invalid("invalid filament assignments")}
        var xml="""
        <?xml version="1.0" encoding="UTF-8"?>
        <model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02" requiredextensions="m">
        <metadata name="Application">Balloon Studio 1.4</metadata>
        <metadata name="Title">Patterned balloon</metadata>
        <resources><m:colorgroup id="2"><m:color color="\(settings.baseColor.hex)"/><m:color color="\(settings.detailColor.hex)"/></m:colorgroup>
        <object id="1" type="model" name="Balloon" pid="2" pindex="0"><mesh><vertices>
        """
        for v in mesh.vertices {xml += "<vertex x=\"\(v.x)\" y=\"\(v.y)\" z=\"\(v.z)\"/>\n"}
        xml += "</vertices><triangles>\n"
        for (i,t) in mesh.triangles.enumerated() {
            let c=colors[i]
            // Bambu's unsplit facet state is the 1-based filament index shifted left two bits.
            xml += "<triangle v1=\"\(t.a)\" v2=\"\(t.b)\" v3=\"\(t.c)\" pid=\"2\" p1=\"\(c)\" p2=\"\(c)\" p3=\"\(c)\" paint_color=\"\(c == 0 ? "4":"8")\"/>\n"
        }
        xml += "</triangles></mesh></object></resources><build><item objectid=\"1\" transform=\"1 0 0 0 1 0 0 0 1 128 128 0\"/></build></model>"
        let config:[String:Any]=[
            "filament_colour":[settings.baseColor.hex,settings.detailColor.hex],
            "filament_type":["PLA","PLA"], "filament_diameter":["1.75","1.75"],
            "filament_density":[String(purge.normalized().density),String(purge.normalized().density)]
        ]
        // Estimator inputs are descriptive metadata only, never silently applied as printer settings.
        let estimate=PurgeEstimate.calculate(self,settings:purge)
        let note="""
        Balloon Studio: two-color surface-painted model, millimetres, neck down.
        Import in Bambu Studio, use the color-mapping dialog to add or map both colors, choose your P2S printer/process,
        and inspect sliced colors and flushing volumes. This file contains no printer G-code.
        Pattern: \(settings.style.rawValue). Estimated changes: \(estimate.minimumChanges)–\(estimate.maximumChanges).
        Estimated change-related chute waste: \(estimate.minimumGrams)–\(estimate.maximumGrams) g.
        Assumed layer height: \(purge.layerHeight) mm; base to pattern: \(purge.baseToDetail) mm³;
        pattern to base: \(purge.detailToBase) mm³; multiplier: \(purge.multiplier); density: \(purge.density) g/cm³.
        Excludes startup purge, prime tower, supports, and flushing into the model. Confirm after slicing.
        """
        let entries:[(String,Data)]=[
            ("[Content_Types].xml",Data("""
            <?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="json" ContentType="application/json"/><Default Extension="txt" ContentType="text/plain"/></Types>
            """.utf8)),
            ("_rels/.rels",Data("""
            <?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>
            """.utf8)),
            ("3D/3dmodel.model",Data(xml.utf8)),
            ("Metadata/balloon-settings.json",try JSONSerialization.data(withJSONObject:config,options:.sortedKeys)),
            ("Metadata/pattern-settings.json",try StableJSON.encode(settings)),
            ("Metadata/balloon-studio.txt",Data(note.utf8))
        ]
        return StoredZIP.archive(entries)
    }
}

// Small standards-compliant ZIP writer. Stored entries keep export dependency-free on macOS.
enum StoredZIP {
    static let table:[UInt32]=(0..<256).map {i in
        var n=UInt32(i)
        for _ in 0..<8 {n = n&1 == 1 ? (n>>1)^0xEDB88320:n>>1}
        return n
    }
    static func archive(_ entries:[(String,Data)]) -> Data {
        var out=Data(),central=Data()
        func u16(_ v:Int,_ d:inout Data) {var n=UInt16(v).littleEndian;withUnsafeBytes(of:&n) {d.append(contentsOf:$0)}}
        func u32(_ v:UInt32,_ d:inout Data) {var n=v.littleEndian;withUnsafeBytes(of:&n) {d.append(contentsOf:$0)}}
        for (path,bytes) in entries {
            let name=Data(path.utf8),offset=out.count,size=UInt32(bytes.count)
            var crc=UInt32.max
            for byte in bytes {crc=table[Int((crc^UInt32(byte))&255)]^(crc>>8)}
            crc ^= UInt32.max
            u32(0x04034b50,&out);u16(20,&out);u16(0,&out);u16(0,&out);u16(0,&out);u16(33,&out)
            u32(crc,&out);u32(size,&out);u32(size,&out);u16(name.count,&out);u16(0,&out)
            out.append(name);out.append(bytes)
            u32(0x02014b50,&central);u16(20,&central);u16(20,&central);u16(0,&central);u16(0,&central)
            u16(0,&central);u16(33,&central);u32(crc,&central);u32(size,&central);u32(size,&central)
            u16(name.count,&central);u16(0,&central);u16(0,&central);u16(0,&central);u16(0,&central)
            u32(0,&central);u32(UInt32(offset),&central);central.append(name)
        }
        let offset=out.count;out.append(central)
        u32(0x06054b50,&out);u16(0,&out);u16(0,&out);u16(entries.count,&out);u16(entries.count,&out)
        u32(UInt32(central.count),&out);u32(UInt32(offset),&out);u16(0,&out)
        return out
    }
}
