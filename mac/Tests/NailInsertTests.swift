import Foundation

extension GeometryTests {
    /// Odd crossings along a slightly skewed ray, which misses edges.
    static func inside(_ mesh:BalloonMesh,_ o:Point3) -> Bool {
        let d=Point3(x:0.000123,y:0.000271,z:1).unit
        var count=0
        for t in mesh.triangles {
            let a=mesh.vertices[t.a],e1=mesh.vertices[t.b]-a,e2=mesh.vertices[t.c]-a
            let h=d.cross(e2),det=e1.dot(h)
            if abs(det)<1e-12 {continue}
            let s=o-a,u=s.dot(h)/det
            if u<0 || u>1 {continue}
            let q=s.cross(e1),v=d.dot(q)/det
            if v<0 || u+v>1 {continue}
            if e2.dot(q)/det>0 {count += 1}
        }
        return count%2 == 1
    }

    /// The slot insert, measured on its exported triangles and against the
    /// back's pocket. Dimensions are stated here, independently of the
    /// generator: a body 0.2 mm clear of the chamber's walls, finger tips
    /// 0.2 mm beyond them, a slot 0.4 mm wider than the shaft ending 1.8 mm
    /// below the top, a 1 mm plate under the head, 2.7 mm deep in a 3 mm
    /// chamber, and 0.6 mm shorter than the entry, up to the slot's 8 mm.
    static func checkNailInserts() throws {
        let up=Point3(x:0,y:0,z:1),down=Point3(x:0,y:0,z:-1)
        func close(_ actual:Double,_ expected:Double,_ message:String,_ tolerance:Double=0.003) {
            require(abs(actual-expected)<tolerance,"\(message): \(actual) instead of \(expected)")
        }
        func distance(_ mesh:BalloonMesh,_ o:Point3,_ d:Point3) -> Double {ray(mesh,o,d)?.0 ?? .infinity}
        /// The insert as printed. `full` adds the slower point checks.
        func checkShape(_ mesh:BalloonMesh,_ p:CloudParameters,full:Bool) throws {
            let label="entry \(p.nailHead), slot \(p.nailShaft), nail \(p.nailDiameter)/\(p.nailHeadDiameter)"
            try mesh.validate()
            let e=p.nailHead,s=p.nailShaft,a=p.nailDiameter/2+0.2,head=p.nailHeadDiameter/2
            let h=min(e-0.6,8),body=e/2-0.2,tip=e/2+0.2
            let dims=mesh.dimensions,low=mesh.vertices.map(\.z).min()!
            close(dims.x,2*tip,"Width across the finger tips, \(label)",1e-5)
            close(dims.y,h,"Height, \(label)",1e-5)
            close(dims.z,2.7,"Depth, \(label)",1e-5)
            require(abs(low)<1e-9,"Insert below the bed, \(label)")
            // Printable flat face down: nothing overhangs more than 45° above the bed.
            for t in mesh.triangles {
                let v=[t.a,t.b,t.c].map {mesh.vertices[$0]},n=(v[1]-v[0]).cross(v[2]-v[0]).unit
                require(n.z > -0.7072 || v.allSatisfy {abs($0.z)<1e-9},"Overhang on the insert, \(label)")
            }
            let mid=min(2.4,h-1.8-a-0.3)
            // Slot and plate: the ray from the slot's middle meets its edge,
            // the ray from behind the cheek meets the plate's back at 1 mm.
            close(distance(mesh,Point3(x:0,y:mid,z:0.5),Point3(x:1,y:0,z:0)),a,"Slot, \(label)")
            close(distance(mesh,Point3(x:0,y:mid,z:0.5),Point3(x:-1,y:0,z:0)),a,"Slot, \(label)")
            close(distance(mesh,Point3(x:0,y:0.5,z:0.5),Point3(x:0,y:1,z:0)),h-1.8-0.5,"End of the slot, \(label)")
            close(distance(mesh,Point3(x:a+0.05,y:mid,z:2.5),down),1.5,"Plate under the head, \(label)")
            // Finger tips 0.2 mm beyond the walls, body and roots inside them.
            close(distance(mesh,Point3(x:9,y:0.001,z:0.5),Point3(x:-1,y:0,z:0)),9-tip,"Finger tip, \(label)",0.002)
            close(distance(mesh,Point3(x:-9,y:h-0.6,z:0.5),Point3(x:1,y:0,z:0)),9-body,"Body, \(label)")
            // The mouth is as wide as the lamp's slot or close to it.
            require(distance(mesh,Point3(x:0,y:0.002,z:0.25),Point3(x:1,y:0,z:0))>=min(s/2,body-1.3-0.5)-0.01,"Narrow mouth, \(label)")
            // The ramp: the plate's lower back edge is cut off.
            let ramp=distance(mesh,Point3(x:body-1.5,y:0.02,z:3),down)
            require(ramp>2.35 && ramp<2.6,"No ramp for the head, \(label)")
            guard full else {return}
            // The shaft at rest and the head's way up behind the plate are free.
            let rest=h-1.8-p.nailDiameter/2
            for step in 0..<24 {
                let angle=Double(step)*Double.pi/12
                // The slot's round end is a polygon inside its circle.
                for r in [p.nailDiameter/2-0.05,0.3] {
                    for z in [0.05,0.5,0.95] {
                        let o=Point3(x:r*cos(angle),y:rest+r*sin(angle),z:z)
                        require(!inside(mesh,o),"Shaft blocked at \(o), \(label)")
                    }
                }
                for r in [head,head*0.6] {
                    for y in stride(from:-2.0,through:rest,by:0.5) {
                        for z in [1.05,1.6,2.25] {
                            let o=Point3(x:r*cos(angle),y:y+r*sin(angle),z:z)
                            require(!inside(mesh,o),"Head's way blocked at \(o), \(label)")
                        }
                    }
                }
                // The head bears on the plate all round its slot.
                let r=(a+head)/2,o=Point3(x:r*cos(angle),y:rest+r*sin(angle),z:0.5)
                require(abs(o.x)<a || inside(mesh,o),"No plate under the head at \(o), \(label)")
            }
            // The slits free the fingers along their length.
            let cheek=body-1.3
            for y in [0.2,1,2,3] {
                require(!inside(mesh,Point3(x:cheek+0.15,y:y,z:0.5)) && !inside(mesh,Point3(x:-cheek-0.15,y:y,z:0.5)),"No slit at \(y), \(label)")
                require(inside(mesh,Point3(x:cheek-0.15,y:y,z:0.5)),"No plate beside the slit at \(y), \(label)")
            }
        }

        // The default lamps: with and without the insert.
        var shapes=0
        for kind in [WallLampKind.cloud,.sun] {
            var p=kind.defaults
            p.nailInsert=true
            p=p.normalized()
            var off=p;off.nailInsert=false
            let kit=CloudKit(p,quality:.export),plain=CloudKit(off,quality:.export)
            require(plain.insertMesh == nil && kit.insertMesh != nil && kit.printedParts == plain.printedParts+1,"Parts with the insert")
            let entries=try kit.entries(),plainEntries=try plain.entries()
            let stls=entries.filter {$0.0.hasSuffix(".stl")},plainSTLs=plainEntries.filter {$0.0.hasSuffix(".stl")}
            require(stls.count == kit.printedParts && stls.map(\.0) == plainSTLs.map(\.0)+[CloudParameters.insertFilename],"Kit files with the insert")
            for (name,data) in plainSTLs {
                require(stls.first {$0.0 == name}!.1 == data,"\(name) changes with the insert")
            }
            require(kit.assemblyColors.count == kit.assembly().triangles.count && kit.assemblyColors.count == kit.assembly(exploded:true).triangles.count
                    && kit.rearColors.count == kit.rear.triangles.count && plain.rearColors.isEmpty,"Preview colors")
            require(kit.instructions.contains("## Slot insert for a small nail head") && kit.instructions.contains("- \(CloudParameters.insertFilename)")
                    && kit.instructions.contains("narrows the 3.5 mm shaft slot to 2.2 mm") && kit.instructions.contains("3.5 to 3.8 mm")
                    && !plain.instructions.contains("Slot insert") && !plain.instructions.contains("F:"),"Assembly notes")
            let mesh=parseSTL(stls.last!.1)
            try checkShape(mesh,p,full:true)
            shapes += 1
            let folder=".build/test-output/nail-insert/\(kind.rawValue)"
            try FileManager.default.createDirectory(atPath:folder,withIntermediateDirectories:true)
            for (name,data) in entries {try data.write(to:URL(fileURLWithPath:"\(folder)/\(name)"))}
            try kit.placedInsert()[0].binarySTL().write(to:URL(fileURLWithPath:"\(folder)/seated-insert.stl"))

            // In the back's pocket, measured on the back. The chamber is found
            // by rays from the nail's center: wall side, cap, walls and top.
            let back=parseSTL(stls[0].1),cy=p.nailCenterY
            let near={ () -> BalloonMesh in
                var m=back
                m.triangles=back.triangles.filter { t in
                    let v=[t.a,t.b,t.c].map {back.vertices[$0]}
                    return v.map(\.x).min()!<12 && v.map(\.x).max()! > -12 && v.map(\.y).min()!<cy+22 && v.map(\.y).max()!>cy-12
                }
                return m
            }()
            let entryTop=cy+distance(near,Point3(x:3,y:cy,z:1.2),Point3(x:0,y:1,z:0))
            let entryBottom=cy-distance(near,Point3(x:3,y:cy,z:1.2),Point3(x:0,y:-1,z:0))
            let chamberTop=cy+distance(near,Point3(x:0,y:cy,z:3.9),Point3(x:0,y:1,z:0))
            let cap=3.9+distance(near,Point3(x:0,y:cy,z:3.9),up)
            let lip=distance(near,Point3(x:2.5,y:chamberTop-1,z:3.9),down)
            let wall=distance(near,Point3(x:0,y:chamberTop-1,z:3.9),Point3(x:1,y:0,z:0))
            close(entryTop-entryBottom,8,"Entry");close(cap,5.4,"Cap");close(3.9-lip,2.4,"Lip");close(wall,4,"Chamber")
            close(chamberTop-entryTop,8,"Chamber above the entry")
            let placed=kit.placedInsert()[0],box=placed.dimensions
            let low=Point3(x:placed.vertices.map(\.x).min()!,y:placed.vertices.map(\.y).min()!,z:placed.vertices.map(\.z).min()!)
            close(low.y+box.y,chamberTop,"Insert against the top of the chamber")
            close(low.z,3.9-lip,"Insert on the lip")
            require(low.y>=entryTop+0.5 && box.y<=entryTop-entryBottom-0.5,"Insert must pass the entry and clear the shoulder")
            close(cap-(low.z+box.z),0.3,"Play to the cap")
            // No material shared with the back, but for the finger tips' spring.
            var shared=0,springs=0
            for x in stride(from:-4.15,through:4.15,by:0.1) {
                for y in stride(from:low.y+0.05,to:low.y+box.y,by:0.25) {
                    for z in stride(from:low.z+0.05,to:low.z+box.z,by:0.3) {
                        let o=Point3(x:x,y:y,z:z)
                        guard inside(placed,o) else {continue}
                        if inside(near,o) {
                            require(abs(x)>3.99,"Insert and back collide at \(o), \(p.displayName)")
                            shared += 1
                        }
                        if abs(x)>4 {springs += 1}
                    }
                }
            }
            require(shared>0 && shared==springs,"Finger tips must press on the chamber's walls")
            // The nail at rest: the head behind the plate, the plate on the lip.
            let rest=kit.nailInsert!.nailY
            close(rest,chamberTop-1.8-0.9,"Nail at rest")
            for angle in stride(from:0.0,to:2*Double.pi,by:Double.pi/8) {
                let r=1.65-0.05,o=Point3(x:r*cos(angle),y:rest+r*sin(angle),z:cap-0.05)
                if abs(o.x)<1.15 && o.y<rest+0.9 {continue}
                close(distance(placed,o,down),cap-0.05-(low.z+1),"Head on the plate")
            }
            print("PASS \(p.displayName) slot insert: kit files, unchanged parts, fit in the pocket, finger springs, nail at rest")
        }

        // Keyholes and nails: every insert that is offered is sound, every
        // refusal says why.
        var offered=0,refused=0
        for entry in stride(from:6.0,through:10,by:0.5) {
            for slot in stride(from:2.0,through:min(5,entry-2),by:0.5) {
                for shaft in [1.0,1.5,1.8,2.2,2.6,3.0] {
                    for headSize in [2.4,3.0,3.3,4.0,4.6,6.0] {
                        var p=CloudParameters()
                        p.nailHead=entry;p.nailShaft=slot;p.nailDiameter=shaft;p.nailHeadDiameter=headSize;p.nailInsert=true
                        p=p.normalized()
                        let insert=NailInsert(p),problem=NailInsert.problem(p)
                        require((insert == nil) == (problem != nil),"Refusal without a reason")
                        guard let insert else {refused += 1;continue}
                        let a=shaft/2+0.2
                        require(a<=slot/2-0.25 && headSize/2-a>=0.3,"Insert offered where it cannot work: \(entry)/\(slot)/\(shaft)/\(headSize)")
                        try checkShape(NailInsertGenerator.generate(insert),p,full:offered%7 == 0)
                        offered += 1
                    }
                }
            }
        }
        var user=CloudParameters();user.nailInsert=true
        require(NailInsert(user.normalized()) != nil,"The default nail of 1.8 mm with a 3.3 mm head in the default keyhole")
        var thin=user;thin.nailHeadDiameter=2.4
        require(NailInsert.problem(thin.normalized())?.contains("head of 2.8 mm or more") == true,"Reason for a small head")
        var small=user;small.nailHead=6;small.nailShaft=3
        require(NailInsert.problem(small.normalized())?.contains("keyhole is too small") == true,"Reason for a small keyhole")
        var bad=user;bad.nailDiameter = .nan;bad.nailHeadDiameter=100
        require(bad.normalized().nailDiameter == 1.8 && bad.normalized().nailHeadDiameter == 8,"Nail normalization")
        print("PASS slot insert sweep: \(offered) inserts offered and checked (\(shapes) default kits), \(refused) refused with a reason")
    }
}
