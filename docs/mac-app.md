> Documentation of the original native Mac app, now kept under `mac/` as the reference implementation for the web app. See the repository README for the web app.

# Balloon Studio

A small, self-contained native Mac app for creating printable hot-air balloon envelopes, separate baskets, hanging mobile rings, figures to hang from the mobile, cloud and sun wall lamps with a back, a diffuser, a flexible cable seal and a screwed strain relief, and a one-piece wall clip for the cable between the lamps. The app translates the original Blender model into a parametric mesh generator, with live 3D previews, binary STL export, and two-color 3MF pattern export. Blender is not required to run it.

## Open the app

Open **dist/Balloon Studio.app**, or copy it to your Applications folder. This build is for Apple Silicon Macs running macOS 14 or newer. It is locally signed, not notarized for public distribution.

## Use

1. On the **Balloon** tab, start from Classic, Round, or Tall, or edit the sliders and number fields.
2. Drag the 3D preview to orbit and scroll to zoom. The reset camera button restores the starting view. Toggle the build plate or wireframe as needed.
3. For a light-up balloon, enable **Hollow for LEDs** and choose the wall thickness. **Cutaway** reveals the cavity; **View opening** looks up through the neck. Both affect only the preview.
4. Optionally choose **Horizontal stripes**, **Hearts**, **Polka dots**, **Diamonds**, **Text**, **Night Flight**, or **Summit Cable Car** under **Pattern & Color**. Set the amount and colors, then check the live P2S waste estimate.
5. Choose **Export 3MF…** for a pattern or **Export STL…** for a solid balloon, or press **Command-E**.
6. Import into Bambu Studio in millimetres at 100% scale. For 3MF, map the two colors to your filaments and choose your P2S printer/process. Print with the narrow, flat base down.

Shape, pattern, color, and waste-assumption settings are saved automatically between launches. The swatches below an unpatterned preview remain visualization-only; STL has no color information. Pattern colors are saved in the 3MF.

The **Basket**, **Ring**, **Figures**, **Cloud**, **Sun** and **Cable clip** tabs have their own parameters and export buttons. **Command-E** exports the currently selected part, so balloons, baskets, rings, figures, cloud kits, sun kits and cable clips are separate files. Baskets, one-piece rings, figures and cable clips export STL; split rings export a ZIP kit of individual STLs and assembly notes. **Command-N** resets the selected part; each part's dimensions are saved separately between launches.

## Cloud wall lamp

Choose **Cloud** for a wall lamp behind the balloons. The default is **230 × 133.4 × 23.2 mm**, with a 22 mm-deep backing and a **1.2 mm white PLA diffuser**. The silhouette has a flat lower edge and rounded cloud lobes. The balloons hang independently; the cloud mount carries only the lamp. Existing saved dimensions remain unchanged when updating.

### A family of cloud shapes

Choose a silhouette under **Shapes for your sky**. The six forms share soft, round lobes and a flat lower edge, with different proportions and rhythms:

| Shape | Character | Height at 230 mm width |
| --- | --- | --- |
| Classic | The original cloud, with a broad central lobe | 133.4 mm |
| Drift | A lower, flowing bank of smaller lobes | 112.7 mm |
| Billow | A tall, pillowy cloud with three generous lobes | 163.3 mm |
| Twin | Two gently overlapping upper peaks | 133.4 mm |
| Breeze | A big head, its puffs stepping down towards the other end as if the wind were carrying it | 131.1 mm |
| Cotton | A crown of little puffs in an arc over a full, round body | 142.6 mm |

**Mirror silhouette** adds a second orientation for every shape. Mix widths and leave different amounts of space between clouds: a large Billow, a medium Classic and smaller Drift/Twin clouds make a varied sky. Two Breezes, one mirrored, drift towards each other or apart; a Cotton between smooth clouds adds texture. Switching shapes retains your width, depth, diffuser and hardware settings. At compact widths the height adapts to leave room for the real fittings; the displayed dimensions and bed-fit notice use the chosen shape.

The preview, matching front/back STLs and LED placement template all use the selected outline. Shape and mirror choice persist between launches and in `cloud-settings.json`; settings from older versions open as the original, unmirrored Classic. Each variant has a distinct suggested ZIP filename (the original Classic keeps its existing filename). Keep each kit's parts together: fronts and backs from different silhouettes are not interchangeable. The nail pocket keeps its installation orientation when the silhouette is mirrored, and the cable exit stays on the side you chose. An exit at the top follows the highest point of the mirrored outline.

### Sculpted surfaces for clouds and suns

Under **Front surface**, choose **Flat** or **3D surface**. The 3D front is a rounded body, not a relief on a plate: every part of the silhouette becomes a dome that rolls up directly from the outline. Clouds get separate puffs, the larger lobes standing taller, with a soft crease where two puffs meet and a base that melts into them. A sun's rays rise from their tips towards the middle; each of the four suns has its own surface, described under **Sun wall lamp**. Mirrored designs mirror the surface. **Surface depth** sets the height of the tallest dome: 2–30 mm, limited to 12% of the lamp width; the initial setting is 18 mm. Shallow settings read as a gentle cushion, about 15 mm and more as distinct puffs. Assembled depth includes the raised surface. All six clouds and all four suns support this option. On a Cotton the little puffs of the crown become small domes around the large ones of the body, like the head of a cauliflower cloud.

The sculpted front is a hollow diffuser shell. Inside the skirt its inner face follows the outside, with nominal thickness measured against the curved surface and a small allowance for triangulation. The rolled rim above the seating ledge and skirt is solid; like the border of a flat front, it is not lit from behind. The outline, LED cavity, matching back, seating face and four clips keep their original dimensions and clearances. The existing LED plan remains applicable; the raised areas add space above the minimum LED-to-front gap. Preview and STL export both contain the sculpted geometry. Surface choice and depth persist independently for clouds and suns and are included in the kit settings. Existing designs reopen as **Flat**, retaining their dimensions and original export filenames; sculpted kits add `-3d-<depth>mm` to the ZIP name.

**Printing changes with the surface.** Flat fronts still print face-down, clips-up. Sculpted fronts export **curved face up, clips down**, with the skirt tips at Z = 0. Use a brim and supports from the bed under the diffuser and its outer ledge. Keep supports off the spring tabs, catches and slots; remove them through the open rear before assembly. Inspect the ledges and curved roof in the slicer, and prototype the supports and clip fit. Layer steps show most on the gently sloping crowns of the domes: use fine or adaptive layers for the upper part. Print the shell material solid while leaving the modeled light cavity empty. The export guide and front print preview show the selected orientation. The back continues to print cavity-up. Physical print quality and light diffusion require a prototype.

Run `bash scripts/test.sh lamp-surfaces` to check sculpted fronts at both resolutions across every silhouette and cloud orientation, including compact and maximum sizes. Checks cover exported STL topology, nominal shell clearance, preserved back geometry, seated clips and LED clearance, print orientation, assembled dimensions, settings migration, mirrored clouds and symmetric sun relief, the rounded outline without a flat border, distinct cloud puffs, and for each sun a domed middle above rays that stand over their notches and fall towards their tips. The exported shell is held to the tight thickness tolerance; a sun's coarser preview mesh may be off by a little more at sharp seams. Representative kits are written to `.build/test-output/surfaces` and can be checked independently with `scripts/verify-cloud-blender.py`.

**Export Cloud Kit…** or **Command-E** exports a ZIP with five individual STL files (three without the strain relief, one more with the slot insert), a full-size **LED-LAYOUT.svg** placement template, settings, a numbered cut list and assembly instructions:

- **A · Opaque back:** a flat, closed 3 mm mounting floor, 2.4 mm perimeter walls, an internal clip groove, a blind nail pocket, and a cable window in the outer wall (left, right, top or bottom) with a pocket for the seal behind it.
- **B · White PLA front:** a solid thin diffuser and a 12 mm skirt with four slotted spring tabs. Ramped catches clip into the back's groove. The opaque wall overlaps the skirt and conceals its relief slots. Where the skirt would meet the seal's pocket, it has a notch.
- **C · Cable seal in black TPU:** a small flexible block that grips the cable and closes the window to light.
- **D · Clamp bar** and **E · Clamp anvil:** the two loose parts of the strain relief. They hold the cable between two posts of the back, with two M3 × 10 screws.
- **F · Slot insert** (optional): a small slider that narrows the nail slot for a nail whose head would slip through it. See below.

**Compact sizes:** width goes down to **100 mm** and back depth to **16 mm**. At small widths the internal features move closer together and the cloud becomes taller as needed, preserving actual hardware clearances. With the default fittings, a 100 mm cloud is 75.4 mm tall. Straight LED sections can now extend across the floor into the side lobes. At 16 mm back depth, the 12 mm skirt still clears the 3 mm floor by 1 mm. A shallow back may show LED hotspots, so test diffusion with your strip and PLA.

The **Assembled**, **Exploded**, **Back · inside**, **Back · wall side**, **Front · print view**, **Cable seal · print view**, **Cable clamp · print view** and **Slot insert · print view** previews show the fit and print orientation. Green rectangles in the inside view mark suggested LED positions; they are preview guides, not extra STL bodies or printed recesses. The seal is shown in orange to find it; print it in black. Bar and anvil are shown in blue, with their screws in place. The screws are shown only, not exported. Settings persist separately, including migration from the earlier single-bed version; **Command-N** resets only the selected part. Cloud STLs are not supported by the balloon STL importer.

### Mounting and light control

The rear keyhole has a square head entry and a narrower upward shaft slot. A 2.4 mm retaining lip captures the head in a 3 mm-deep chamber. **A solid 3 mm cap separates the entire nail pocket from the LED cavity**: it is a blind recess, with no through-hole. Enter clear dimensions including printing allowance around the actual nail; the default entry is 8 mm and the shaft slot is 3.5 mm. Insert the head, then lower the lamp into the narrow slot.

**Slot insert for a small nail head.** A head barely wider than the shaft slot pulls straight through it: a nail of 1.8 mm with a 3.3 mm head in the default 3.5 mm slot, for instance. Turn on **Slot insert for a small nail head** and enter the nail's shaft and head as measured. The kit then has one more part, `F-nail-slot-insert.stl`, which also fits a back that is already printed: an 8.4 × 7.4 × 2.7 mm slider (default keyhole) with a slot 0.4 mm wider than the shaft. It goes in through the square entry, flat face towards the wall, and slides up behind the lip until it stops at the top of the chamber. The head then bears on its 1 mm plate, which rests on the lip. Two fingers at its sides stand 0.2 mm beyond the chamber's walls and spring against them, so the insert stays up while the lamp is hung; then the nail holds it against the top. A flared mouth leads the shaft into its slot, a ramp on the plate's lower edge leads the head behind it. With the insert the head's underside should stand 3.5 to 3.8 mm off the wall (2.4 mm lip and 1 mm plate); each extra millimetre lets the top of the lamp lean off the wall by as much. Print it solid, flat face down, with elephant foot compensation. The app explains when the insert does not suit a nail or keyhole (a head too small for its shaft, a shaft too thick for the slot, a keyhole too small for the insert, a head too large to pass between its fingers) and leaves it out. The fit of the fingers and the grip on the head are calculated, not yet tried in print.

### Cable outlet in the wall

The cable leaves through the **outer wall**, not the rear, so the back lies flat against the wall without spacers. Under **Cable exit**, choose **Left**, **Right**, **Top** or **Bottom**. Left and right are as you face the lamp. The floor has no opening.

For chaining cloud or sun lamps, enable **Second cable outlet** and choose a different side. All six pairs are available, including adjacent sides. The second outlet initially faces opposite the first; changing the first onto the second's side swaps them. Once the second outlet is on, **Third cable outlet** adds one on either of the two remaining sides, and **Fourth cable outlet** then takes the last side, so a lamp can have an outlet on all four sides. A new outlet faces the one before it where that side is free, otherwise it goes to the bottom, or the top where the bottom is taken. Choosing a side another outlet already uses swaps the two. Turning an outlet off also removes the ones after it. All leads use the selected cable diameter. Existing settings retain their outlets.

Each outlet has its own window, seal pocket, matching TPU seal and skirt notch where needed. A screwed clamp is included at each outlet that has room for it. The previews show every set of fittings, and the LED plan reserves space for all of them. With more than one outlet the ZIP name includes every side, in alphabetical order (`-cable-bottom-left-right-top` for all four); seal, bar and anvil STL filenames identify their side. Print one of every supplied STL and fit each seal to its named outlet, since the seals follow the local wall contour.

| Cable exit | Cloud | Sun |
| --- | --- | --- |
| Right | Widest point of the outline | Between two rays, just below the horizontal one |
| Left | Widest point of the outline | Between two rays, just above the horizontal one |
| Top | Highest point of the outline | Between two rays, just right of the vertical one |
| Bottom | Middle of the flat base | Between two rays, just left of the vertical one |

A sun's four exits are a quarter turn apart, each in the notch clockwise of the ray on its side, so all four seals of a sun are alike. A Pinwheel's notch is close to that ray: in a small Pinwheel the exit moves away from it, at most to midway between the two rays, so the ray's ridge stays clear of the outlet.

The cable leaves along a line through the middle of the lamp. At the top of a cloud it therefore leans towards the highest puff: at the default size about 3° on a Classic, 4° on a Cotton, 9° on a Drift or a Billow, 18° on a Breeze and 20° on a Twin, less on small clouds. On a sun it leans 15°, on a Bold eight 22.5°, on a Pinwheel 7.5° to 15°. On small clouds with a thick cable a side outlet turns a few degrees, away from the nearest clip; top and bottom are far enough from the clips. A sun's clips are a ray away from every exit.

Two things differ with the exit at the top or the bottom of a **cloud**:

- **Top, clouds up to 138 mm wide:** the nail pocket stands close behind the seal's pocket. Instead of 12 mm, 7 to 12 mm of floor are free to slide the seal in; ASSEMBLY.md gives the figure for your lamp. Set the seal down right in front of the nail pocket and push it home from there.
- **Top:** the seal holds the cable lightly. Fix the lead to the wall close to the lamp, so its weight does not hang on the seal.

The LED plan keeps the rows clear of every outlet wherever it is: rows that would cross a fitting are split.

The outlet is a square window, cable diameter + 1.4 mm, low in the wall: its center is cable diameter ÷ 2 + 4.6 mm from the rear. Older settings, which had the outlet at the rear, open with the exit on the right. Kits with another exit add `-cable-left`, `-cable-top` or `-cable-bottom` to the ZIP name. Back, front and seal of a kit belong together: a front made for another exit has its notch in the wrong place.

### The cable seal

Light is kept in by a third printed part, the **cable seal**, in flexible TPU. It replaces the former duct, baffle and sealant. Two printed cheeks on the floor form a pocket behind the window; the seal slides into it along the floor.

| Feature of the seal | What it does |
| --- | --- |
| Bore, 0.3 mm smaller than the cable | Closes around the cable's jacket and holds it lightly |
| Nozzle, 0.2 mm larger than the window | Fills the window, ending 0.4 mm inside the outer surface |
| Flange around the nozzle | Covers the wall around the window from inside |
| Slit under the bore, 0.4 mm | Opens to lay the cable in. No need to thread the cable through the seal |
| Body, 0.6 mm wider than the pocket | The cheeks press the slit shut and the bore onto the cable |

The seal is made for the **cable diameter** you set: measure the lead and enter it. Use a round, flexible lead. Pass its bare end through the window from outside, press it into the seal with the slit facing the floor, then slide the seal between the cheeks until the nozzle sits in the window. The floor in front of the pocket is kept free of LEDs. The ends of the seal follow the wall of your lamp, so a seal belongs to its kit.

**Print the seal in black or another fully opaque TPU**, about 95A. White and translucent TPU glow. It is exported standing on its flat end, nozzle up, and needs no supports. Print it solid, slowly, with fine layers. Open a fused slit with a sharp blade.

The pocket is 6.4 mm tall for a 3 mm cable. Where the back is too shallow for the skirt to pass above it, the front gets a **notch** in its skirt at the outlet: with the default 3 mm cable, below 22 mm back depth. The notch is inside the opaque wall. A thick cable in a shallow lamp brings the pocket close to the diffuser, which may show as a darker spot at the edge.

Use an **opaque back or opaque exterior coating**; white PLA can glow through even a closed wall. Adjust nail projection for the retaining lip and actual head thickness. The seal is not a strain relief: the clamp behind it takes the pull.

### The strain relief

A pull on the cable is taken by a **clamp with two screws**, just behind the seal. It is on by default; **Screwed strain relief** under **Wall mount & cable** turns it off. You need **two screws M3 × 10 mm** with a pan head or a button head, as machine screws or as screws for plastic of 3 mm.

| Part | What it does |
| --- | --- |
| Two posts in the back, 7 × 7 mm | Stand either side of the seal's way into its pocket, 3.2 mm before the pocket. Each has a blind hole of 2.8 mm in which a screw forms its thread |
| Anvil (part E) | Drops between the posts once the seal is seated, and lies on the floor under the cable. Two rails keep the cable in line with the seal's bore. Its cross bars hold it before and behind the posts, and keep the seal from moving back |
| Bar (part D) | Lies across the posts. Its tongue presses the cable onto the anvil. Between the screw heads it is as tall as they are, which makes it stiff |
| Ribs | Three on the anvil and two on the bar, by turns, 1.5 mm apart. They bend the jacket into a shallow wave instead of crushing it at one place |
| The posts as a stop | The bar is screwed down until it rests on the posts. The cable is squeezed to 80% of its diameter under the ribs, whatever the torque |

Fit the seal first, then lift the cable, drop the anvil in, lay the cable between its rails, set the bar on and turn the screws in by turns until the bar rests on both posts. Bar and anvil fit either way round. ASSEMBLY.md has the steps and the dimensions for your lamp.

Print bar and anvil in the back's filament, or in PETG where the lamp runs warm. The bar is exported **on its side**: its layers run along the bar, its screw holes lie, and the ribs rise at 45°. The anvil prints flat, ribs up. Neither needs supports.

The clamp stands on the floor the seal needs anyway, so window, pocket, seal and front are the same with and without it. A back with posts takes the front and the seal of the same kit without them, and the kit keeps its name. Only the LED plan changes: the strip stays clear of the posts.

**Where it fits.** The clamp needs 1.5 mm to the front's skirt and to the nail pocket, and the seal's full 12 mm way in. From 190 mm width every lamp has room for it at every exit, and every sun does from its smallest size. Smaller lamps have room in most cases. Without room are:

| Lamp | Exit | Up to a width of |
| --- | --- | --- |
| Classic and Drift clouds | Top | 145 to 155 mm, depending on cable and nail |
| Twin cloud | Top | 145 to 185 mm, depending on cable and nail |
| Billow cloud | Top | 115 mm, with a cable of 3 mm or more and a large nail |
| Twin cloud | Left, right | 135 mm, with a small nail and a narrow strip |
| Breeze cloud | Top | 130 to 165 mm, depending on cable and nail |
| Cotton cloud | Top | 110 to 145 mm, depending on cable and nail |

There the app says so and names the width from which the clamp fits. The kit then comes without bar and anvil, and the lead has to be secured outside the lamp.

With a cable of 6 mm the screw heads end 1 mm below the diffuser of a 16 mm back. Cap head screws are 0.4 mm taller than the 2.6 mm allowed for: use pan or button heads. The clamp's hold is calculated, not yet tried in print: the fits are constants at the top of `CableClamp.swift`.

### LED fit, printing and prototype checks

The LED plan distributes **straight sections** over the cloud at a fixed, adjustable row spacing (14 mm by default). Each section is rounded down to a whole number of cut intervals, with 3 mm of free space at each end for flexible soldered wire links. The planner checks the full strip band against the concave silhouette, skirt, nail pocket and cable seal, including the upper and side lobes. Large cut intervals may leave a small cloud with no fitting sections; the app reports this rather than inventing a cut point. The floor stays smooth and accessible, so the actual strip can be positioned after a loose lighting trial. Print the SVG at 100% and verify its 50 mm scale bar; section numbers match the cut list in ASSEMBLY.md.

The [Aclorol B0BP7SVX5T listing](https://www.amazon.de/dp/B0BP7SVX5T), checked on 2026-09-28, specifies **8 mm width, 5 V USB, 320 LEDs/m, 9 W/m, 3000 K and 16 mm cut marks**. These are the layout defaults; confirm cut pitch on the delivered strip because other listings report different intervals. Strip thickness is an allowance to measure, including LEDs and adhesive, not a verified product dimension. At the default 22 mm depth and 3 mm allowance, the LED-to-front gap is 16 mm. For this single-color strip, wire all positive pads to +5 V and all negative pads to ground (parallel). Solder and insulate outside the lamp, then lay the assembly on the flat floor. Keep wire links low and clear of the clips; bulky connectors are not included in the mounting allowance.

The plan is **not an optical simulation**. Test row spacing and the diffuser with the actual strip/PLA, especially near the raised fittings. A matte white interior over an opaque shell can help reflection. The app and instructions estimate total strip length and full-power demand at 9 W/m; a large cloud may need more than one 1 m strip, separate power feeds and a suitable heat-spreading mount. Do not assume the original USB lead or supply can power an extended layout. Use dimming, size wiring and supply for the installed load, and check the closed lamp's stabilized temperature; PLA is not a heat sink. The power supply stays outside.

All parts are exported with their lowest point at Z = 0: print the back cavity-up and a **flat** front face-down, clips-up. A **3D surface** front prints curved face up, clips down, with supports as described above. Import at 100% scale. Use a solid diffuser shell to avoid visible infill; start with 0.2 mm layers and enough walls to fill the 1.6 mm tabs, their 2.0 mm roots and 2.4 mm backing walls. Inspect the bridges over the nail chamber and cable window; avoid inaccessible internal supports. Widths up to 240 mm fit the P2S with an 8 mm brim. Larger designs remain exportable with a bed-size notice.

The four clips are reinforced inward: each 2.0 mm root tapers over 4 mm to a 1.6 mm spring tab. The rest of the skirt stays 1.2 mm thick. The outer running fit, lead-in and 0.35 mm catch interference are unchanged. LED and clamp placement reserve space for the thicker roots and inward flex. This geometry applies to flat and sculpted fronts of both clouds and suns. A cloud's tabs sit on its rounded shoulders; a sun's sit on the straight flanks of four rays, where the skirt is a flat wall; physical break resistance and holding force still need a printed fit test.

Dry-fit before installing LEDs. These PLA clips have not been physically validated for fit or repeated removal. The exported notes explain assembly, the cable seal and the strain relief. Verify the actual printed lamp's nail retention, the seal's fit on your cable, the clamp's hold, opacity, light uniformity and operating temperature. The seal's fits are calculated, not yet tried in print. A dark-room test of the assembly with the seal in place is required to confirm no visible leakage. Geometry checks alone cannot establish that result.

| Cloud control | Range / default |
| --- | --- |
| Shape | Classic (default), Drift, Billow, Twin, Breeze, Cotton |
| Mirror silhouette | Off / on; keeps the hardware orientation |
| Width | 100–500 mm / 230 mm; P2S with brim up to 240 mm |
| Back depth | 16–40 mm / 22 mm |
| White PLA face | 0.8–2 mm / 1.2 mm |
| LED strip width | 3.5–12 mm / 8 mm |
| Strip thickness incl. LEDs | 1–6 mm / 3 mm |
| Distance between cut marks | 5–100 mm / 16 mm; match the actual strip |
| LED row spacing | Strip width + 4 mm to 40 mm / 14 mm |
| Clip radial fit | 0.2–0.5 mm / 0.2 mm |
| Cable diameter | 2–6 mm / 3 mm |
| Cable exit | Left, right, top or bottom; left and right as you face the lamp / right |
| Second, third and fourth cable outlet | Optional, each on a side of its own / off |
| Screwed strain relief | On / off; on |
| Nail head entry | 5–10 mm / 8 mm |
| Nail shaft slot | 2–5 mm, at least 2 mm narrower than head / 3.5 mm |
| Slot insert for a small nail head | On / off; off |
| Measured nail shaft and head | 1–4 mm / 1.8 mm, 2–8 mm / 3.3 mm |

Run `bash scripts/test.sh cloud` for 38 parameter combinations at both preview and export resolution. Tests parse the exported STL independently, validate connected manifold topology, exact dimensions, bed fit, diffuser and nail-cap thickness, nail retention, the closed floor, the cable's way out on all four sides, the window and pocket dimensions, the seal's fit and its grip on the cable, blocked sightlines through the outlet, skirt clearance over the pocket, clip engagement/relief, seated clearance, flat floor under the planned LEDs, and settings migration. A further 80 layout combinations check cut multiples, concave-outline clearance, wire landing areas and fitting avoidance. A 131-width sweep checks feature separation and the outline transition. Independent Blender checks use `scripts/verify-cloud-blender.py` for self-intersections and collisions between the seated parts.

Run `bash scripts/test.sh clamp` for the strain relief alone: 533 kits on all nine silhouettes and all four exits, from the smallest lamp on, each against the same kit without the clamp. Checks cover the posts and their pilot holes, the closed floor beneath them, the floor's surface around them, the seal's way between them, bar and anvil as printed (closed bodies, no supports) and as seated, the squeeze under every rib, the screws' way and thread, and clearance to the skirt, the diffuser, the seal and the nail pocket. Front and seal must be the same files with and without the clamp. A sweep of 15,168 lamps checks where the clamp fits. The default kits are written under `.build/test-output/clamp`, with the small parts as they sit, for `scripts/verify-cloud-blender.py`.

Run `bash scripts/test.sh nail-insert` for the slot insert: the default cloud and sun kits with and without it, and a sweep of 2,160 keyholes and nails. It checks that every other part of the kit stays the same file, the insert's closed body, size and print orientation (nothing overhangs more than 45°), its slot, plate, mouth, ramp and slits, the shaft at rest and the head's way up behind the plate, and, measured on the back, its passage through the entry, the play to the cap and the walls, and that only the finger tips press on the walls. Every refusal must give a reason. The default kits are written under `.build/test-output/nail-insert`, with the insert as it sits, for `scripts/verify-cloud-blender.py`.

Run `bash scripts/test.sh outlets` for the exits at the top and the bottom alone: 144 kits on all eleven silhouettes, at the smallest and largest sizes and fittings, with the same checks of window, pocket, seal, sightlines, skirt, clips and LED layout. A sweep of 3,080 placements checks where the outlet sits on the outline, that the fittings stay where they are whatever the exit, and that the floor between them and the seal's pocket is free. The default kits with the exit at the top and the bottom are written under `.build/test-output/outlets`.

Run `bash scripts/test.sh chained-outlets` for all six pairs, the four triples and all four sides together, across all twelve cloud silhouettes and four suns at compact, default and large sizes, at preview and export resolution. Which outlet comes first changes from kit to kit, since the back is built from the outlets in that order. These checks cover one wall opening per outlet in one connected back, every seal and skirt clearance, clamp fittings, LED avoidance, settings migration and side-labeled exports. A sample left/right kit is written under `.build/test-output/chained-outlets`, a sample kit with all four outlets under `.build/test-output/chained-outlets-four`.

The cloud test command also runs **120 shape kits** at preview and export resolution, covering all six silhouettes and both orientations, from 100 to 500 mm and with large fittings. It checks saved shape choices, distinct filenames, exact bounds, clip engagement, closed STL solids and LED clearance. A **1,692-case sweep** checks the core and fittings across 100–240 mm for every silhouette/orientation; additional checks compare mirrored contours and ensure the profiles are visibly distinct. Run `bash scripts/test.sh cloud-shapes` for this portion alone. Representative 100 mm and 230 mm kits for all twelve variants are written under `.build/test-output/cloud-shapes` for independent Blender checks.

## Sun wall lamp

Choose **Sun** for a matching lamp in one of four designs, each with pointed rays around a small round middle:

| Design | Silhouette | 3D surface |
| --- | --- | --- |
| **Soft star** | Twelve slim rays | Plump rays with a ridge from tip to middle, flowing into a dome without a seam |
| **Cones** | The same twelve rays | Round, tapering rays, each half a cone, around a dome |
| **Pinwheel** | Twelve leaning rays | Ridges that swirl into the middle, crisp on the rays and softer where they turn; no separate dome |
| **Bold eight** | Eight broad rays | Flat-faceted rays with a ridge, around a button dome |

Soft star and Cones share their outline and therefore their back; with a flat front they are the same lamp. The broad rays of a Bold eight take the most light. A ray is lit from behind only where it is wider than about 8 mm, so the last 8 to 14 mm of every tip stay dark.

The sun uses the same construction as the clouds: an opaque back with a flat LED mounting floor, a thin diffuser, four concealed clips, a blind nail pocket, and a cable outlet in the wall (left, right, top or bottom) with a flexible seal and a screwed strain relief. Sun settings are saved separately from cloud settings; **Command-N** resets only the selected part.

The default is **200 × 200 × 23.2 mm**, including a 22 mm back and 1.2 mm diffuser. **Diameter including rays** ranges from **160–500 mm**. The sun stays circular at every size; its fittings retain their actual dimensions. Both pieces fit the P2S with an 8 mm brim up to **240 mm**. Depth, diffuser thickness, LED dimensions/cut pitch/row spacing, clip fit and mounting clearances use the same controls as the clouds.

The warm yellow preview is illustrative. Print the diffuser in white or translucent yellow PLA and test it with your LEDs; filament and strip determine the actual color and brightness. The rays receive light from the shared cavity, but uniformity still needs a physical lighting trial. The **Back · inside** view shows the numbered plan's LED positions in green. Assembled, exploded, wall-side and front print views are also available.

The buttons under **Four ways to shine** show the actual outlines. Switching designs preserves your dimensions, LEDs and fittings. The selected design persists between launches and in `sun-settings.json`. The earlier **Rounded**, **Radiant** and **Halo** designs have been removed: suns saved or exported with one of them reopen as a Soft star, with their dimensions, LEDs and fittings, and need a new front and back. Each design has its own suggested ZIP filename, such as `Sun-Lamp-soft-star-200mm-kit.zip` or `Sun-Lamp-pinwheel-200mm-kit.zip`; none reuses the name of an earlier design's kit. Keep each kit’s matching parts together.

**Inside a sun.** The middle of these suns is small, so the fittings are laid out differently from the earlier suns. The nail pocket sits around the middle, its top 11.8% of the width above it, with the first LED row right below. A cable seal at the top then has its whole 12 mm way in, and the strain relief has room at all four exits of every sun. The four spring clips sit on the straight flanks of four rays, a quarter turn apart, near the notches: 10 mm of flat wall each, with a 1 mm slot on either side. At a ray's tip or in a notch a tab would be a stiff corner. Smaller middles also hold fewer LEDs: a 200 mm Soft star takes about 290 mm of the default strip, a Bold eight about 530 mm.

**Export Sun Kit…** or **Command-E** saves a ZIP containing:

- `A-sun-back-opaque.stl` — print flat underside down, cavity up.
- `B-sun-front-diffuser.stl` — flat: diffuser face down, clips up; 3D surface: curved face up, clips down, with supports.
- `C-cable-seal-TPU.stl` — black TPU; flat end down, nozzle up.
- `D-cable-clamp-bar.stl` and `E-cable-clamp-anvil.stl` — the strain relief; bar on its side, anvil flat. Two M3 × 10 screws hold them.
- `LED-LAYOUT.svg` — full-size LED placement template with a 50 mm scale bar.
- `ASSEMBLY.md` — matching cut list, printing, wiring, cable seal, strain relief and assembly notes.
- `sun-settings.json` — the sun's dimensions and hardware settings.

Import the STLs at 100% scale. Use an opaque back, fit the cable seal and test the fit before adding LEDs, as described in the cloud mounting guide above. The sun is a separate lamp, with its own matching front and back; hang the balloons independently. Physical clip fit, mounting strength, diffusion and operating temperature remain unvalidated.

Run `bash scripts/test.sh sun` for 52 kits across all four designs at both preview and export resolution, including minimum/maximum dimensions and hardware clearances. Checks cover closed connected STL solids, dimensions, print orientation, bed fit, diffuser thickness, nail retention, cable outlet on all four sides and seal, clip engagement, seated fit, LED floor clearance, ray symmetry, settings migration and kit contents. For each design, a sweep over every diameter from 160 to 240 mm checks the fittings, 18 layouts check LED cut intervals and spacing, and a sweep from 160 to 500 mm checks that every clip lies on the flat flank of one ray with room to bend. The checks also verify distinct silhouettes (Soft star and Cones sharing theirs), design persistence, unique kit filenames and that suns saved with the removed designs still open. `scripts/verify-cloud-blender.py` also accepts a sun kit folder for independent intersection checks.

## Mobile ring for three balloons

Choose **Ring → One piece → Reflected uplight** for the current **450 mm solid ring**. It has a 40 mm band, a 12 mm base and six bevelled attachment holes: three for the ceiling and three for the balloons, with no joints, plates or pins. The raised light trough makes it **22.5 mm tall**. New installations and the one-piece reset start with this design; existing saved settings remain available. Switching construction keeps the dimensions and LED settings within the selected mode's limits.

**Export Ring STL…** saves one continuous, connected solid. The **450 mm design exceeds the 256 mm P2S bed** and is the full-size design model. The preview and export dialog say so. **Use 240 mm for a test print** changes only the diameter, leaving the LED fit and cord clearances intact; this fits the bed including an 8 mm brim. Do not shrink the STL in the slicer, because that would also shrink the LED mount. Import in millimetres at 100% scale, flat underside down and trough facing up. Suggested PLA prototype settings are 0.2 mm layers, 6 walls, 6 top/bottom layers and 40% infill; inspect the sliced result before printing.

The default mount holds one continuous **8 mm-wide LED strip upright**, against the inside of the outer wall, with the LEDs facing a white 45° reflector. The strip follows the cylinder in its natural bending direction, rather than bending sideways on a flat circular surface. Its lower edge rests on a ledge; the strip needs suitable mounting adhesive. The open top releases light upward, and the solid floor and raised inner lip obstruct direct sight of the LEDs from below.

- **LED fit:** the vertical mounting space is 8.5 mm, including 0.5 mm allowance. **Strip thickness incl. LEDs** defaults to an assumed 3 mm; measure the actual LEDs, coating and mounting tape and adjust it. The shelf extends 0.5 mm beyond that envelope, with a clear gap before the reflector. The strip path is approximately 1,399 mm at 450 mm diameter. Follow the strip's marked cut points and minimum bend radius; leave an end gap instead of overlapping. Route and secure the supply lead over the rim.
- **Reflection and visibility:** white PLA scatters light broadly. The cross-section diagram shows the intended path, not a predicted beam. PLA may transmit a glow despite the geometric shielding. Illuminate a printed prototype to check brightness and underside glow; an opaque coating may be needed for a dark underside.
- **Mounting and temperature:** the ledge supports the strip without locking it in place. Follow the strip maker's adhesive and cooling requirements; PLA is not a heat sink. Check actual filament, strip and adhesive temperatures. No physical optical or thermal validation has been performed.
- **Cords and load:** use every other hole for ceiling suspension and the three holes in between for the balloons. Each group is spaced 120° apart, with a 60° offset between groups. Join the three ceiling cords above the ring at suitable ceiling hardware, and tie a separate balloon cord to each remaining hole. The ring carries the full weight of the planned three balloons of about 1 kg each, plus its own weight and the LEDs. Use proven balloon/basket attachments. This is an untested prototype, not a load-rated 3 kg assembly. Test the actual printed ring and rigging at low height, including sustained loading, deformation and cord wear; PLA can creep over time.

| Solid uplight control | Range / default |
| --- | --- |
| Outer diameter | 140–600 mm / 450 mm; up to 240 mm for P2S with brim |
| Band width | Automatic minimum–60 mm / 40 mm |
| Base thickness | 8–16 mm / 12 mm |
| Cord clearance | 4–8 mm / 6 mm, with 0.8 mm entry bevels |
| LED strip width | 3.5–12 mm / 8 mm |
| LED fit allowance | 0.2–1 mm / 0.5 mm |
| Strip thickness incl. LEDs | 1–6 mm / assumed 3 mm |

Uplight adds strip width + fit allowance + 2 mm above the base. Cord clearance is the inscribed diameter of each diamond-shaped hole; band width grows automatically to keep material around the holes. The green preview face is where the strip backing mounts. Settings persist in the app; the balloon STL importer cannot reopen rings.

The earlier **Flat top channel** remains selectable. It needs a strip designed to curve sideways, or short wired sections, and has six alternating tie/suspension holes in one-piece mode. Its base thickness is 4–10 mm, cord clearance 2–5 mm and channel depth 0.6–3 mm with at least 3 mm of floor.

The earlier **Six sections** option remains available separately. It exports a ZIP with 3 guided arcs, 3 plain arcs, 6 underside plates and 12 alignment pins, plus assembly notes. It is not used for the current solid-ring model. All parts fit the P2S; plates are glued beneath the seams. Switching to it retains the light mount but adjusts dimensions to its permitted range. Its detailed guide covers dry fitting, gluing, curing and continuous-cord routing. Its joints remain untested and are not load-rated.

## Figures for a baby mobile

Choose **Figures** for small shapes to hang from the mobile ring, on threads of different lengths. There are seven, all in the sky of the balloons:

| Figure | Drawing |
| --- | --- |
| **Balloon** | The studio's classic envelope with its neck, two ropes and a basket; the window between the ropes is open |
| **Cloud** | The Classic cloud silhouette |
| **Star** | Five soft points |
| **Moon** | A thick crescent, leaning back with its tips up |
| **Sun** | The Bold eight sun's outline |
| **Heart** | Full and round |
| **Raindrop** | For hanging under a cloud |

Every figure is a flat-backed body with a rounded front. Under **Surface**, **Pillow** rolls the edge up into a level middle, like a cushion; **Puffy** domes the whole figure like a foil balloon; **Flat** is a plain slab. The dome rises straight out of a vertical **edge band**, so there is no knife edge and no thin rim to break. **Height** sets the figure's size; the width follows the drawing (a 60 mm cloud is 101 mm wide, a 60 mm raindrop 38 mm). Sharp corners of the drawings are rounded by 1–3% of the height, so star tips and the moon's horns print without needles.

Each figure has a **thread hole**, placed as high up as the figure allows on the vertical through its centre of gravity, with at least the chosen **material around hole** on every side, so the figure hangs straight on one thread. The hole sits in the balloon's crown, the cloud's big lobe, below the star's upper point, on the moon's back, below the heart's cleft and in the raindrop's tip. **Second hole at the bottom** adds a hole for a figure hanging below: raindrops under a cloud, a star under the moon. Where a figure is too small for a hole, the app says so.

| Figure control | Range / default |
| --- | --- |
| Height | 40–120 mm / 60 mm |
| Surface | Pillow (default), Puffy, Flat |
| Edge band (thickness when flat) | 0.8–6 mm / 1.6 mm |
| Dome height | 0.8–10 mm / 3.2 mm |
| Domed on both sides | Off / on; off |
| Thread hole | 1.5–4 mm / 2 mm |
| Material around hole | 1.5–6 mm / 2.5 mm |
| Second hole at the bottom | Off / on; off |

**Export Figure STL…** or **Command-E** saves the selected figure; **Export all seven as a set** saves a ZIP with one STL per figure at the current settings, `FIGURES.md` with printing and hanging notes, and `figure-settings.json`. Figures are exported lying on their flat back with Z = 0 on the bed: print them that way, without supports, with a brim for the slim ones. **Domed on both sides** makes a figure that is rounded front and back; it needs supports under the lower dome, or print the flat-backed figure twice and glue the pair back to back. The **Hanging view** shows the figure upright with a thread in its hole; the **Print view** shows it on the bed. Settings persist between launches; **Command-N** resets them.

The figures are drawn as outlines, turned into a signed distance field, meshed on a grid clipped to the silhouette and refined until the dome is smooth and the edge follows the drawing to 0.02 mm. The holes are part of the same field, so every figure is one watertight solid. Nothing has been printed yet: check the thread hole and the strength of the balloon's ropes on a first print, keep the whole mobile out of the baby's reach, and take it down once the baby can push up on hands and knees.

Run `bash scripts/test.sh figures` for all seven figures at preview and export resolution, their extremes, the flat, puffy, two-sided and chained variants, hole clearance and the material around each hole, the dome's rise from the edge band, the drawings' freedom from self-intersections, settings round trips and migration, and the exported set. Representative STLs and a set are written to `.build/test-output/figures`.

## Wall clip for the lamp cable

Choose **Cable clip** for a small one-piece holder that fixes the lead between cloud and sun lamps to the wall. A plate lies under the cable; a strap rises from one side of it, arches over the cable and ends free on the other side, a little below the cable's middle. The cable is pressed in from the open side: the strap springs open and closes over it. The plate runs on past the strap on one side, and the nail goes through that extension, so the hammer meets flat plate and never the strap. With the default 3.75 mm fabric-sheathed cable the clip is **5.4 × 13.6 × 6.6 mm**: 1.6 mm wider than the cable, 2.8 mm higher than a cable lying on the wall, with the nail 3 mm past the strap.

| Part of the clip | Shape | What it does |
| --- | --- | --- |
| **Plate** | 2 mm thick throughout (**Plate thickness**), as wide as the strap's arch or the nail's counterbore needs. Under the strap it ends 0.75 mm past the cable's middle on the open side; past the strap it widens along a slant to its full width for the nail | Carries the cable and the nail. The short open side gives the cable room to pass under the strap's tip, and the slant lets the standing print build the wider extension without support. A 1.8 mm nail with a 3.3 mm head goes through a 2.1 mm bore into a 3.6 × 0.7 mm counterbore that starts **Nail gap** (3 mm) past the strap, so the hammer or a nail punch has room, and 0.7 mm clear of the slanted edge; the head ends flush under the cable |
| **Strap** | 0.7 mm thick, 6 mm long, inner radius cable/2 + 0.1 mm, a 0.6 mm fillet at its root, a round tip | The spring. It ends 0.5 mm below the cable's middle on the open side (**Overlap**), leaving a 1.6 mm passage between its tip and the ridge; the squeezed cable lifts it about 1.6 mm on the way in, an estimated 2 % strain |

| Cable clip control | Range / default |
| --- | --- |
| Cable diameter | 2–6 mm / 3.75 mm, in 0.05 mm steps; measure over the sheath |
| Fixing | Nail (default), Adhesive |
| Nail shaft, head, head height | 1–4 / 1.8 mm; 2–8 / 3.3 mm; 0.3–2 / 0.7 mm |
| Nail gap from the strap | 0.4–10 mm / 3 mm |
| Plate thickness | 1.2–4 mm / 2 mm |
| Length along the cable | 4–12 mm / 6 mm |
| Thickness | 0.6–1.2 mm / 0.7 mm |
| Overlap below the cable | 0.3–1.5 mm / 0.5 mm |
| Print lying on the plate | Off / on; off |

The plate is as wide as the strap's outside, at least 3 mm, and with a nail at least 1.4 mm wider than the head's counterbore. **Adhesive** drops the extension and the hole: the plate is as long as the strap, 5.4 × 6 mm for the default cable. A tall nail head thickens the plate beyond the set thickness so the head still ends flush, keeping 0.6 mm under it; a thicker plate also lengthens the strap's root, which eases the spring a little. The app says when a head is too small for its shaft and holds the export back, and when it has limited the overlap to keep the strap's tip 0.3 mm off the plate. The **opening** it reports is the narrowest passage between the strap's tip and the plate, which the cable has to get through: it lies diagonally between the tip and the plate's edge. The sidebar estimates the strain in the strap as the cable goes in (about 2 % at the default settings; PLA takes about 2 %, PETG more) and turns orange above that: a thinner strap or less overlap lowers it.

The **On the wall** preview shows the clip with a length of cable and the nail in its counterbore; **Print view** shows the print orientation. The colour swatches recolour the clip for the preview only.

**Export Clip STL…** or **Command-E** saves one STL, `Cable-Clip-3.75mm.stl`, in print orientation with Z = 0 on the bed; variants add `-adhesive` and `-flat`. By default the clip **stands on the strap's end** with its profile on the bed, so the strap bends within its layers rather than across them; print it with 0.12–0.16 mm layers, two walls, a brim, ten at a time, in PETG or PLA in the cable's colour. **Print lying on the plate** puts the plate on the bed and bridges the arch, which prints without a brim, but then the strap bends across its layers: PETG rather than PLA. Neither needs supports; the slant past the strap is the only overhang, at about 42°.

Nail the plate with its extension along the cable, finishing with a nail punch, or stick it on with tape cut to the plate. Then press the cable in from the open side until the strap closes over it. A clip every 30 to 40 cm of cable, two 15 to 20 mm apart where the cable turns. To take the cable out, lift the strap's tip with a fingernail. Settings persist between launches; **Command-N** resets them. Cable and nail settings from the earlier two-part clip carry over.

This replaces the two-part clip of version 1.28, whose snap hooks were too fine for a 0.4 mm nozzle and broke when the nail was driven through the base under them. The one-piece strap has not been print-tested yet: the fits are constants at the top of `CableClip.swift`.

Run `bash scripts/test.sh cable-clip` for fourteen clips at preview and export resolution, including a 2 mm and a 6 mm cable, adhesive and flat variants, a thick strap, the deepest overlap and the nail at 0.4 and 10 mm from the strap: stated dimensions, the cable's room under the arch, the strap's root, tip and opening, the plate's thickness, its edge under the strap and its slant past it, bore and counterbore in the extension, print orientation with a 45° overhang limit on the standing clip, STL round trips, preview colours, settings migration from the two-part clip and the notes. The default clip, seated with a cable, is written to `.build/test-output/cable-clip`, which `scripts/verify-cable-clip-blender.py` checks independently for topology, self-intersections and the cable clear of the clip.

## Reopen cloud and sun settings

Click **Open…** in the header or choose **File → Open…** (**Command-O**), then select `cloud-settings.json` or `sun-settings.json` from an extracted lamp kit. Finder’s **Open With → Balloon Studio** works too. The matching Cloud or Sun tab opens with the saved dimensions, shape, surface, LEDs and fittings, ready to edit and export again. Renamed JSON files are also accepted; the settings determine which lamp opens.

Opening settings replaces that lamp’s current design and saves it between launches. Older settings retain their dimensions and use the existing migration defaults for newer options. Invalid or unrelated JSON shows an error without replacing the design. The source file is left unchanged; **Command-E** exports a new kit with the updated settings.

Run `bash scripts/test.sh lamp-settings` to check reopening exported kits, saved options, legacy files, migration, supported dimensions and invalid-file rejection.

## Open and edit a balloon STL

Click **Open…** in the header or choose **File → Open…** (**Command-O**). You can also use Finder’s **Open With → Balloon Studio**. Select a binary or ASCII STL, compare the opened mesh with the editable balloon, then click **Use Editable Balloon**. The Balloon tab provides the existing shape, hollow-wall, string-hole, hanging-loop, and pattern controls. Export the result with **Command-E**; adding a pattern uses 3MF.

- **New Balloon Studio STL exports:** the standard binary STL header retains shape, wall, and attachment settings. A digest binds those settings to the file contents; externally modified files fall back to reconstruction. Geometry remains compatible with STL readers. Settings are stored with single-precision accuracy, matching STL coordinates.
- **Older balloon STLs:** the app estimates dimensions, neck, shoulder, panel count/depth, hollow mode, and nominal wall thickness from an upright balloon mesh. The original Blender export in `output/` is supported. This rebuilds the surface; custom details and existing holes/hangers are not preserved. Review the comparison and add attachments again. In particular, a reinforced neck can overestimate the main shell’s wall thickness.
- **Scope:** this converts compatible balloon envelopes to the app’s parametric model. It is not a general mesh editor. Baskets, arbitrary meshes, rotated models, and shapes outside the app’s size limits cannot be reconstructed. Use millimetres with the neck down. Import limits are 150 MB and 2 million triangles.

Opening and cancelling a review leaves the current design unchanged. Accepting replaces the current balloon settings and starts with a solid color, since STL has no pattern or filament-color settings. The source file is only changed if you explicitly choose it as an export destination. Accepted settings are saved between launches.

## Patterns, multicolor 3MF, and P2S filament waste

Patterns use two selectable filament colors, with live preview:

- **Horizontal stripes:** 2–24 total alternating bands across the envelope. The final band continues over an enabled hanger. Stripe boundaries cut the surface at exact heights, including the inside of hollow shells, so each horizontal section uses one color.
- **Hearts, polka dots, and diamonds:** 1–24 shapes per row, 1–6 rows, and adjustable shape size. A single row sits around the middle; multiple rows spread vertically with staggered positions. Size automatically limits to fit the rows and circumference. Motifs paint the outer envelope; the neck, cavity, and attachments remain the base color.
- **Text:** enter a name or message of up to 64 characters, choose Rounded, Sans serif, Serif, Handwritten, or Monospaced, and set **Repeats around balloon** from 1 to 24. Copies wrap around the middle of the envelope in one evenly spaced row; one copy faces the starting camera. **Text height** sets the requested letter height; long messages shrink proportionally to leave a gap between copies. Short messages and fewer repeats produce larger, clearer letters. Accents and font fallback are supported for outline glyphs; color emoji are not supported. Blank text leaves the balloon plain. Text uses the pattern filament on the outside only and is included in both preview and 3MF painting. The message, font, repeat count and height are saved between launches and recorded in the 3MF's `Metadata/pattern-settings.json`.
- **Night Flight:** two large banked propeller planes sit exactly 180° apart in a panoramic night scene, each with a looping dashed flight path, among six cloud banks, a crescent moon and scattered stars. Both full-size vintage planes have ribbed wings with inset fasteners and a roundel, detailed tail surfaces, a recessed divided canopy with a pilot silhouette, a sculpted engine cowling with cooling slots and fasteners, landing wheels with recessed rims and spoked hubs, a tapered fuselage stripe and access hatch, and swept propeller blades with inset details. The rear plane wraps continuously across the panorama seam. Clouds have a continuous, gently rounded face without engraved puff lines. The crescent uses a single joined outline, keeping its open side clear of stray rim fragments. Crisp layered relief bridges the balloon's grooves so the objects retain their shapes. **Relief depth** is 1.2–4 mm above the panel crests, initially 2.4 mm. **Cap height** is 10–28% of envelope height. The cream artwork shares the body filament; the initially midnight-blue cap colors the complete upper cross-section, including the inner wall and optional hanger, for one estimated filament change. Relief adds material outside the original envelope and preserves its hollow cavity, neck and attachments. The actual geometry appears in both preview and exported 3MF; the diameter readout includes the raised details. Inspect relief edges, fine details and supports in the slicer before printing; physical print quality has not been tested. Existing panoramic Night Flight settings upgrade to the opposite-plane composition while preserving relief depth, cap height and colors. Settings from the original repeated scene still receive at least 2.4 mm relief. Other designs retain their settings.
- **Summit Cable Car:** two summits stand exactly 180° apart, each carrying a timber station astride the peak with twin bullwheels, a round window and a flag. The cable hangs between the stations in two parabolic swags, and on each rising half a vintage Swiss cabin climbs: a trapezoid body on a two-wheel carriage, tilted with the cable, with a recessed window band showing a parent, a waving child and a dog, a waist band, a door, an edelweiss badge, rivets and a keel rail. The mountains are paper-cut facets: a broad lit face with a buttress at its foot, a shadow face with a lower spur, a scalloped snow mantle with a tongue down the ridge and a dashed hiking trail. A lower snow-tipped peak sits in each saddle, a back range and a front meadow run all round, with firs and a chalet with lit windows in the valley, and a crescent moon, two cloud banks and stars in the sky. Motifs are laid out in millimetres around their own meridian and warped onto the envelope, so cabins and stations keep their proportions where the balloon narrows. The scene was drawn for the classic envelope; on other shapes heights follow the artwork height and motif sizes the smaller of height and circumference. Relief depth, cap height, colors, the cap's single filament change, groove bridging and export behave as for Night Flight. Nothing has been printed yet; inspect the fine cabin and station details in the slicer.
- Matching base and pattern colors use one filament and estimate zero color changes. Night Flight and Summit Cable Car keep their raised artwork when both colors match. Choose **Solid** to return to STL export.

The 3MF stores a single connected, watertight model, standard 3MF color-group properties, and Bambu Studio triangle filament painting. It is a model with colors, not a sliced printer project. There are no machine commands or bundled machine presets. Pattern edges follow refined mesh facets; printed detail also depends on your nozzle and layer height. Export uses finer geometry than preview. Cutaway never affects the exported model.

In Bambu Studio, open/import the 3MF and use **Standard 3mf Import color** to append or map its two colors. Confirm that both are distinct filament slots, select the P2S profile and compatible filament profiles, and set the object's default filament to your base color. Bambu Studio 2.8.2 may first show an “invalid config / load geometry data only” notice for this standard model-only file: continue to the color-mapping dialog. The geometry and paint are intact. Later versions may describe this as importing geometry and colors only. Inspect the sliced result before printing.

**Estimated filament poop** reports color changes, layers containing both colors, and grams of change-related chute waste. Open **P2S waste assumptions** to set:

- Layer height (0.08–0.32 mm).
- Base → pattern and pattern → base flushing volumes (mm³), copied from Bambu Studio's flushing matrix.
- The flushing multiplier, applied once to those matrix values.
- Filament density in g/cm³ (default 1.24, a representative PLA value).

The example 400 mm³ per direction and multiplier 1 are **assumptions, not measured P2S defaults**. The calculation is `sum(directional changes × directional mm³) × multiplier × density / 1000`. It samples horizontal sections of the painted mesh and counts each color once per layer, regardless of how many separate shapes use it. It compares schedules that retain the previous layer's filament against schedules with a fixed color order, reporting their range. This is a planning range, not a guaranteed bound on slicer behavior.

Six bands on the classic balloon estimate five changes and about **2.5 g** under the example assumptions. Hearts and dots occupy mixed-color layers and can require hundreds of changes. Reducing motif height or row count can reduce waste substantially; removing some shapes on the same layers may not. Keep motifs in one short row when minimizing color changes matters.

The estimate excludes startup/end purge, the prime tower, supports, extra machine purge and calibration, and credits for flushing into infill or other objects. It assumes a single balloon, neck down, two compatible filaments, and constant layer height. Slicer painting depth, supports, layer placement, and material settings can change actual consumption. Verify after slicing; no physical purge calibration has been performed. The 3MF contains a text record of its export-resolution estimate and assumptions, separate from printer settings.

Implementation references: [Bambu flushing volumes](https://wiki.bambulab.com/en/software/bambu-studio/reduce-wasting-during-filament-change), [Bambu Studio 3MF importer/exporter](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/Format/bbs_3mf.cpp), and [filament paint serialization](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/TriangleSelector.cpp).

## Baskets and string attachment

Choose from three designs:

| Design | Shape and detail |
| --- | --- |
| **Wicker** | A tapered rounded rectangle with alternating over/under reeds, rounded edges and fine lengthwise grooves |
| **Ribbed** | A round basket with vertical fluting and a broad upper band |
| **Voyager** | A chamfered rectangular basket with faceted sides and horizontal bands |

All baskets have an open top, a solid flat floor, and four round cord holes near the rim. Each opening has a straight circular bore and a 0.35 mm bevel at both mouths to soften the edges against the cord. The chosen clearance is the minimum bore diameter; the bevels make the visible mouths 0.7 mm wider. The holes are part of the connected wall. Inspect the short curved roofs in the slicer.

Adjust width or diameter (40–100 mm), rectangular depth (30–90 mm), height (24–70 mm), wall thickness (1.6–3.2 mm), surface detail (0–1), and nominal cord clearance (2–5 mm). The floor is at least 2.4 mm thick. **Match balloon** sets the basket dimensions in proportion to the current balloon; later balloon changes do not silently resize the basket.

Wicker's weave is modeled in both the live preview and exported STL. Reeds are spaced about 3.6 mm around the outline with 2.4 mm rows; spacing follows the rounded corners and the pattern closes continuously around the basket. **Surface detail** controls relief strength, with 0 giving a smooth wall. The reinforced upper band and cord openings stay clear of the weave. Fine grooves depend on nozzle size and layer height; inspect the sliced result. Run `bash scripts/test.sh basket` for basket topology, dimensions and weave checks.

To assemble:

1. Choose a cord clearance larger than the string you plan to use, allowing for your printer's hole tolerances.
2. Click **Add matching balloon holes** in the basket controls, for either a filled or hollow balloon. This adds four holes around the balloon's neck and matches their cord clearance to the basket.
3. Export the basket and export the updated balloon separately. An STL already exported before adding the neck holes will not change.
4. Print the basket with its flat base down in standard mode. About 0.2 mm layers and enough wall loops to fill the modeled basket walls are useful starting settings. Inspect the relief, cord holes, and first layer in your slicer.
5. Tie four equal-length strings through the basket holes and corresponding balloon neck holes. On a filled balloon, run two strings through opposite pairs of neck openings and tie their four ends to the basket. On a hollow balloon, the central neck opening remains available for the LEDs.

Balloon attachment holes are optional and work in both filled and hollow modes. In filled mode, two straight diamond-section through-holes cross at right angles through the neck, joining opposite side openings. The underside remains completely closed and flat, with no threading pocket. Feed a string in one side and out the opposite side; use the two ends for opposite basket attachments. The neck automatically becomes at least 12 mm tall and wide enough to leave material between the holes. In hollow mode its wall is reinforced to at least 2 mm, with an additional allowance for faceting. This slightly reduces the LED opening, whose updated size is displayed. In hollow mode, the thin main envelope retains the chosen shell thickness. The balloon's **Basket string holes** checkbox can disable the attachment holes again.

## Ceiling hanging loop

Enable **Ceiling hanging loop** in the Balloon tab's **Attachments** section. The reinforced default is a **12 mm thick eyelet with 6 mm of material beside and above its round bore**, a 4 mm flare into the crown and a 5 mm nominal crown thickness on hollow balloons. The foot and flat crown pad grow with the eyelet, keeping everything joined as one watertight surface. The edges retain 2 mm rounding and the cord hole has a 0.8 mm chamfer at each mouth.

| Hanger control | Range | Default |
| --- | --- | --- |
| Hanging cord clearance | 2–5 mm | 4 mm |
| Eyelet thickness, front to back | 8–16 mm | 12 mm |
| Material around hole, beside and above | 4–8 mm | 6 mm |
| Base flare radius | 2.5–5 mm | 4 mm |
| Crown thickness, shown in hollow mode | 3.4–8 mm | 5 mm |

Choose a clearance larger than the actual string to allow for printing tolerances, thread through the eyelet, and tie a hanging loop. Increasing thickness or material around the hole enlarges the eyelet; increasing the flare widens its foot and raises the bore to keep the chamfer clear. **View hanger** zooms in on the attachment. These controls update both the preview and exports. Shape presets preserve all attachment adjustments, and they are saved between launches and embedded in new STL exports for reopening.

The eyelet works with filled or hollow balloons and with basket string holes. Hollow crowns gradually thicken beneath the attachment, over an area that grows with its footprint. This can make the crown less translucent. **View opening** and **Cutaway** help inspect the cavity; **View neck** shows the string holes on filled balloons.

**Envelope height** controls the balloon body. The hanger adds cord clearance + material around hole + base flare radius + 2 mm. The default adds 16 mm; the available range adds 10.5–20 mm. The app automatically limits envelope height so the complete print stays within 256 mm. With the defaults, the maximum envelope height is 240 mm and total height is 256 mm. Older saved settings and version 1 Balloon Studio STLs receive the reinforced defaults while retaining the attachment on/off state; a body near the previous height limit may become shorter on reopening or next generation. Existing exported geometry is unchanged until exported again.

Slice the **eyelet and its crown base solid**, using a local 100% infill modifier while keeping a hollow balloon's light cavity empty. Inspect the round bore, crown layers and support needs in the slicer. The larger geometry is intended to improve strength, but print quality, layer adhesion, infill and material determine the actual load capacity. The printed assembly still needs physical load testing before hanging; no load rating is implied.

The baskets and attachment points are intended for a small decorative assembly. They have not been physically printed or load-tested.

| Parameter | Range |
| --- | --- |
| Envelope height | 80–250 mm; reduced automatically when the hanging loop is enabled |
| Widest diameter | 60–240 mm |
| Vertical panels | 8–32, in groups of four |
| Panel depth | 0–8% of the radius |
| Shoulder height | 50–75% of the total height |
| Neck diameter | 12–80 mm, limited to 60% of the envelope diameter |
| Neck height | 3–20 mm, limited to 15% of the total height |
| Hollow shell | On/off; preserved when changing shape presets |
| Shell wall thickness | 0.8–2.4 mm; default 1.2 mm |

These limits keep the complete balloon, including its optional hanging loop, inside the Bambu Lab P2S's 256 × 256 × 256 mm build volume. Four-panel increments preserve exact X/Y dimensions and the circular neck. Values outside the allowed range are clamped; invalid number entries return to the last valid value.

With hollow mode off, the output is a filled envelope with a flat base and no basket. The bottom stays capped even with basket through-holes enabled. Set walls and infill in your slicer. The app suggests 0.2 mm layers, 3 walls, 10% infill, and an 8 mm brim as a starting point. Wide, short shapes can need supports; the app displays a warning when the outward overhang exceeds 45° from vertical.

## Hollow shells for LEDs

Hollow mode models the inner wall explicitly and connects it to the exterior with a flat ring at the bottom. The crown remains closed and the neck is open. The material itself is still a single watertight mesh, so the slicer recognizes the large empty cavity correctly.

- Without string holes, the opening diameter is the neck diameter minus twice the wall thickness. With a 32 mm neck and 1.2 mm wall, the opening is **29.6 mm**. A neck with string holes is reinforced, so use its updated opening readout. Increase the neck diameter to fit your LED assembly.
- Wall thickness is nominal. A small clearance allowance at curved surfaces and grooves prevents thin spots caused by triangulation. The inner surface is offset using distance to the actual outer triangles, rather than scaling a duplicate.
- Start with a light or translucent filament and a 1.2 mm wall; the actual glow depends on your filament, colour, and LEDs.
- In Bambu Studio use **standard mode, 0% infill**, about 0.2 mm layers, sufficient wall loops to fill the modeled shell, and an outer brim. Keep normal top/bottom layers enabled; the opening is modeled in the STL. Do not use vase mode or hollow the shell a second time.
- The unsupported inner crown can need supports even when the lower exterior prints without them. Inspect the sliced layers and ensure any internal supports can be removed through the neck. This is not a guaranteed support-free print.
- Use low-heat LEDs, with the power supply outside the balloon.

The cutaway is only a viewing aid: export always contains the complete shell. Your old shape settings are retained when upgrading; hollow mode and wall thickness are saved between launches. No physical print has been performed.

## Build and test

Requires Xcode or its command-line tools. No third-party packages or network access are needed.

```sh
bash scripts/build-app.sh
bash scripts/test.sh
bash scripts/test-patterns.sh
bash scripts/test-stl-import.sh
```

The build script creates the icon, compiles the SwiftUI/SceneKit app, packages it, and applies a local ad-hoc signature. The source targets Apple Silicon and macOS 14+.

Run `bash scripts/test.sh balloon` for all balloon cases, or `bash scripts/test.sh hanger` for the adjustable hanger cases. These cover extreme dimensions, smooth envelopes, hollow shells, filled necks with crossing through-holes and closed bottoms, reinforced string attachments, ceiling eyelets, and combined attachments, including eight combinations of minimum/maximum eyelet thickness, material around the hole and base flare. Each basket design is checked at default, small/thick, and large/thin settings. Tests independently parse exported STLs, weld identical vertices, check dimensions and normals, and verify connected watertight topology, the number of through-holes, the eyelet's clear round bore, full thickness and filleted foot, crown thickness, opening size, and sampled shell clearance. They also verify old-settings migration, settings persistence, invalid-input normalization, and rejection of missing/reversed faces.

The legacy flat-channel one-piece ring tests cover the default design and 64 combinations of minimum/maximum dimensions. They independently parse the STL, check connected manifold topology and volume, and trace rays through the cord bores and LED channel. Run these with `bash scripts/test.sh ring`.

The split-ring tests cover another 65 kits at preview and export resolution. They check all four printable solids, STL round trips, analytic arc volume, guide/pin clearances, channel floors and open ends, pin registration at every seam, flat print orientation and P2S bed fit with an 8 mm brim. They also cover settings persistence, legacy migration and invalid-input normalization, and produce a complete default ZIP fixture. Run these with `bash scripts/test.sh split-ring`.

The reflected-uplight tests cover 129 more kits, including strip width/thickness and ring-size extremes. They validate exported and preview geometry, independent swept volumes, continuous profiles across seams, flange/guide clearance, bed fit, the mounting-face highlight, and open upward paths. Ray checks from LED positions verify that the 45° ramp faces the strip and that the assembled solid geometry obstructs sampled viewing directions from below, including across seams. These geometric checks do not model translucent PLA or predict photometric performance. Run with `bash scripts/test.sh uplight`.

The STL import tests check binary and ASCII parsing, malformed-file rejection, original Blender and legacy balloon reconstruction, settings round trips, metadata integrity, translated meshes, and editing a reopened model into a hollow balloon with attachments and a patterned 3MF.

The pattern tests additionally check exact stripe topology, refined motif boundaries, combined hollow/filled attachments, color-change scheduling, directional flushing, unit conversion, settings normalization, and settings persistence. Text checks cover all five fonts, upright lettering, glyph counters, accented/fallback characters, 1–24 copies including the wrap seam, fitting long messages, blank input, and migration of older settings. Night Flight checks cover nine shapes at preview and export resolution, full-body artwork coverage, two opposite planes with matching details and a continuous wrap seam, a fragment-free crescent opening, smooth cloud faces, groove bridging, migration from the repeated scene, preserved cavity and attachments, exported STL topology, extreme proportions, matching-color relief, and a single cap change at three layer heights. Summit Cable Car checks cover the same nine shapes and export round trip, plus both stations with their bullwheels and flags, the cable at the bottom of each swag with clear sky around it, cabins with recessed windows and passengers, the summit's lit face, buttress, shadow face, spur, snow hem and trail groove, moon, star, cloud, chalet and fir, identical opposite halves, the landscape across the wrap seam, groove bridging under the cabin, the station and cable on the round and tall envelopes, matching-color relief, and settings persistence beside unchanged Night Flight settings. An independent ZIP/XML reader checks 3MF packaging, palette, assignments, pattern metadata, the exact cap boundary, and manifold edges. The standard-color import was also verified in Bambu Studio 2.8.2; its P2S slice of six bands reported five filament changes. A 16-heart test slice reported 164 changes, close to the estimator’s 168-change retained-tool scenario (the difference comes from slicing/painting boundaries).

Every app export validates finite coordinates, triangle areas, manifold edges, winding, Euler characteristic, and positive volume before saving. Export uses higher resolution than the interactive preview. Generation and export run off the main thread; a saved file captures the values active when the export dialog opens.

The exported model was also checked independently by importing an STL saved through the app into Blender: exact requested dimensions, zero nonmanifold edges, zero inconsistent edges, and zero degenerate faces.

The four hollow exports were independently imported into Blender to check topology, opening diameters, and nearest-surface wall clearance using Blender's own geometry implementation.

The attachment exports were independently checked in Blender for connected manifold geometry, clear paths through the neck holes and ceiling eyelet, and closed filled bottoms or the hollow crown.

The basket exports were also independently checked in Blender. Ray tests through each of the four openings verify clearance; a ray through the open top verifies the floor thickness. The basket exported using the app's actual Save dialog was checked as well.

## Project files

- `Sources/BalloonStudio/`: native app and mesh generator.
- `Tests/GeometryTests.swift`: mesh and STL round-trip checks.
- `scripts/`: build, icon generation, and test scripts.
- `dist/Balloon Studio.app`: runnable app.
- `create_balloon.py` and `output/`: original Blender model and STL, preserved.

The solid reflected-uplight tests cover 130 rings, including the 450 mm design, 240 mm prototype and dimension/LED-fit extremes at preview and export resolution. They check connected manifold STL, exactly six clear bevelled holes in two alternating groups of three, independent swept volume, dimensions, bed-fit reporting, continuous circular profiles, LED-face highlights and settings persistence. Rays verify the facing reflector, clear upward paths and sampled shielding from below. These are geometry checks, not strength, opacity or temperature validation. Run with `bash scripts/test.sh solid-uplight`.
