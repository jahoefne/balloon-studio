# Solid ring with reflected uplight

The current design is one continuous ring. It has no section seams, joint plates or alignment pins.

| Feature | Full-size design | Test print |
| --- | --- | --- |
| Outside diameter | 450 mm | 240 mm |
| Band width | 40 mm | 40 mm |
| Base thickness | 12 mm | 12 mm |
| Total height | 22.5 mm | 22.5 mm |
| Ceiling holes | 3, spaced 120° apart | Same |
| Balloon holes | 3, midway between ceiling holes | Same |
| Cord clearance | 6 mm, with bevelled entries | Same |
| LED width | 8 mm + 0.5 mm fit allowance | Same |
| LED thickness envelope | Assumed 3 mm, including LEDs/coating/tape | Same |
| Approximate mounting path | 1,399 mm | 739 mm |

**The 450 mm model exceeds the 256 mm P2S bed.** Start with the separate 240 mm test ring to check LED fit and reflection. In the app, change the ring diameter rather than scaling an STL: scaling would also change the LED and cord clearances. The full-size solid is the starting design for any later decision about splitting it.

Print at 100% scale in millimetres, flat underside down and trough facing up. Starting prototype settings are 0.2 mm layers, 6 walls, 6 top/bottom layers and 40% infill. Inspect the sliced preview; these settings are not a load rating.

Mount the LED strip upright against the inside of the outer wall, with its lower edge on the ledge and LEDs facing the white 45° reflector. This lets the strip bend naturally around the ring without short wired sections. The ledge supports it; use mounting adhesive suitable for the strip and PLA. Follow the strip maker's bend limits and marked cut points, leave an end gap and route the supply lead over the rim. Measure the actual strip thickness before printing.

The floor and inner lip obstruct direct views of the LEDs from below. White PLA scatters light and may also glow through, so check the actual lit print for brightness, underside glow and temperature. The diagram and geometry checks do not establish optical performance. PLA is not a heat sink; follow the LED strip's cooling requirements.

Use every other hole for ceiling suspension and the three holes in between for the balloons. The two groups are each spaced 120° apart, with a 60° offset between groups. Join three suspension cords above the ring at suitable ceiling hardware, and tie separate balloon cords to the remaining holes. The ring now carries the full weight of the planned three balloons of about 1 kg each, plus its own weight and the LEDs. It has not been load-tested for that load. Use proven balloon/basket attachments and test the actual rigging at low height over a clear area, including sustained loading, deformation and cord wear. PLA can creep over time.

The app exports one connected, watertight STL. The tests check geometry, clearances and sampled sightlines, not printed strength, lifetime, temperature or opacity.
