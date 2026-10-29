import Foundation

extension GeometryTests {
    static func checkBasketHoles(_ mesh:BalloonMesh,parameters p:BasketParameters) {
        let radius=p.cordClearance/2,mouth=radius+0.35
        // Restrict ray checks to the attachment band; the woven wall is unrelated.
        let band=BalloonMesh(vertices:mesh.vertices,triangles:mesh.triangles.filter {t in
            let heights=[mesh.vertices[t.a].z,mesh.vertices[t.b].z,mesh.vertices[t.c].z]
            return heights.min()!<=p.holeCenter+mouth+0.1 && heights.max()!>=p.holeCenter-mouth-0.1
        },maxOverhang:0)
        for side in 0..<4 {
            let theta=Double(side)*Double.pi/2
            let normal=Point3(x:cos(theta),y:sin(theta),z:0)
            let tangent=Point3(x:-sin(theta),y:cos(theta),z:0)
            let center=Point3(x:0,y:0,z:p.holeCenter)
            require(ray(band,center,normal)==nil,"Basket cord hole center is obstructed")
            for sample in 0..<32 {
                // Include directions between the modeled circular contour's nodes.
                let angle=2*Double.pi*(Double(sample)+0.25)/32
                let direction=tangent*cos(angle)+Point3(x:0,y:0,z:sin(angle))
                require(ray(band,center+direction*(radius-0.0001),normal)==nil,
                        "Basket cord bore is narrower than its selected clearance")
                require(ray(band,center+direction*(radius+0.02),normal) != nil,
                        "Basket cord bore is not round or is oversized")
                // Both mouths must be wider than the throat, while a little
                // farther out the ray should meet the original basket wall.
                let inBevel=center+direction*(radius+0.17)
                let outsideMouth=center+direction*(mouth+0.05)
                let innerBevel=ray(band,inBevel,normal)!
                let innerWall=ray(band,outsideMouth,normal)!
                let outerBevel=ray(band,inBevel+normal*150,normal * -1)!
                let outerWall=ray(band,outsideMouth+normal*150,normal * -1)!
                require(innerBevel.0>innerWall.0+0.04 && outerBevel.0>outerWall.0+0.04,
                        "Cord mouths must have a bevel on both sides")
            }
        }
    }
}
