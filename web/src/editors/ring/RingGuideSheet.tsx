// `assemblyGuide` (RingEditor.swift:363-395).

import type { RingParameters } from '../../core/types';
import { number01, Sheet } from '../../ui';

function Guide({ title, children }: { title: string; children: string }) {
  return (
    <section className="ring-guide__step">
      <h3 className="ring-guide__title">{title}</h3>
      <p className="ring-guide__body">{children}</p>
    </section>
  );
}

export interface RingGuideSheetProps {
  open: boolean;
  parameters: RingParameters;
  onDone: () => void;
}

export function RingGuideSheet({ open, parameters, onDone }: RingGuideSheetProps) {
  const strip = number01(parameters.stripWidth);
  return (
    <Sheet
      open={open}
      title={parameters.segmented ? 'Six-section ring · assembly' : 'Solid ring · printing & lighting'}
      onDone={onDone}
      width={640}
      height={620}
      testId="ringGuideSheet"
    >
      <div className="ring-guide">
        {parameters.segmented ? (
          <>
            <Guide title="1 · Print and dry-fit">
              Print 3 cord-guide sections A, 3 plain sections B, 6 underside plates C and 12 pins D. Print a plate and pin first to check the joint fit. All exports are already oriented flat on the bed; print pins upright. Start with 0.2 mm layers, 6 walls and 40% infill for A/B, solid plates and pins. These are prototype settings, not a load rating.
            </Guide>
            <Guide title="2 · Glue a complete circle">
              Alternate A–B–A–B–A–B with the channels up. Put a curved plate underneath each seam and align with two pins. Use a PLA-compatible adhesive on the broad plate surfaces, seam faces and pins, following its preparation and full-cure instructions. Keep the three large guides and channel free of glue. Pins align the parts; they do not lock the joint.
            </Guide>
            <Guide title="3 · Route continuous main cords">
              Run three separate, continuous cords from rated ceiling hardware, through the large guides in A, to the balloons. Use retainers below the guides to carry the ring on the cords. Do not end a main cord at the ring and start a separate balloon cord underneath. Keep upper legs reasonably steep and balanced; the ring still sees sideways forces.
            </Guide>
            <Guide title="4 · Test before hanging">
              The planned balloons weigh about 1 kg each, plus ring and LEDs. The kit and existing balloon eyelets have not been load-tested. Check the fully cured, printed and rigged assembly at low height over a clear area, including sustained loading, cord wear and deformation. Use proven attachments and suitably rated cord/hardware. PLA can creep over time.
            </Guide>
            <Guide title="5 · Add the light">
              {parameters.reflectedLED
                ? `Install the ${strip} mm strip upright against the green mounting face on the outer wall, after all joints cure. Its lower edge sits on the ledge and its LEDs face the white slope. Use mounting adhesive compatible with the strip and PLA, and smooth every seam first. Keep one continuous run across the six sections; trim only at a marked cut point, leave a small end gap and route the lead over the outer rim. Print and light one section first: PLA scatters light and may transmit a glow. Check the strip's bend radius, cooling requirements and temperature; PLA is not a heat sink. The thickness setting must include LEDs, coating and mounting tape.`
                : `Install the ${strip} mm strip after the joints cure. The flat circular channel requires a strip that bends sideways or short connected sections. Follow the cut points and bend limits. Check heat-sink requirements and operating temperature against PLA and adhesive. Route the lead over the rim.`}
            </Guide>
            <p className="ring-guide__body">The ZIP includes detailed assembly notes, exact dimensions and print quantities.</p>
          </>
        ) : (
          <>
            <Guide title="1 · Choose a print size">
              Export saves one continuous STL, with a flat underside. The 450 mm design exceeds the 256 mm P2S bed. Set the diameter to 240 mm in the app for a smaller test ring; the LED mount and cord clearances retain their size. Do not scale the STL in the slicer, as that changes those clearances. Print trough-up at 100% scale. Start with 0.2 mm layers, 6 walls, 6 top/bottom layers and 40% infill as prototype settings, not a load rating.
            </Guide>
            <Guide title="2 · Attach ceiling and balloon cords">
              Use every other hole for ceiling suspension and the three holes in between for the balloons. Each group forms a triangle with holes 120° apart; the groups are offset by 60°. Join the three ceiling cords above the ring at suitable ceiling hardware. Tie a separate balloon cord to each remaining hole. The ring now carries the full balloon load, as well as its own weight and the LEDs. The printed ring and balloon attachments have not been load-tested for the planned 3 × 1 kg.
            </Guide>
            <Guide title="3 · Add the light">
              {parameters.reflectedLED
                ? `Mount the ${strip} mm strip upright on the green outer-wall face, LEDs facing the white 45° slope. The lower edge rests on the ledge; use mounting adhesive compatible with the strip and PLA. The strip curves in its natural bending direction. Follow its minimum bend radius and marked cut points, leave a small end gap and route the supply lead over the rim. The thickness setting includes LEDs, coating and mounting tape.`
                : "The flat circular channel needs a strip designed to bend sideways, or short connected sections. Follow the strip's cut points and bend limits, and route the lead over the rim."}
            </Guide>
            <Guide title="4 · Check the printed prototype">
              Illuminate the ring to check reflection, underside glow and temperature. White PLA scatters light but may transmit a glow, and is not a heat sink; follow the strip's cooling requirements. For the planned 3 × 1 kg balloons, test the actual printed ring, rigging and attachments at low height over a clear area, including sustained loading, deformation and cord wear. PLA can creep over time. Geometry checks do not establish a load rating.
            </Guide>
          </>
        )}
      </div>
    </Sheet>
  );
}
