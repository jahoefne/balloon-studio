# Manual browser checklist

Run this before a release, on the deployed page or `npm run build && npm run preview`. Results below are from 2026-10-30, on a Mac with macOS 26, on the stub core and with `VITE_CORE=real`, unless a cell says otherwise. Chromium, Firefox and WebKit are the Playwright builds; Chrome is the installed Google Chrome, headless.

Legend: ✅ checked and fine · 🔶 checked by script with a synthetic stand-in, a person should still do it once · ⬜ not checked · ➖ does not apply.

## Results

| Check | Chromium 156 | Chrome 156 | Firefox 157 | WebKit 27.2 (Playwright) | Safari.app | Chrome, Edge (Windows) |
| --- | --- | --- | --- | --- | --- | --- |
| All seven tabs render, no uncaught error | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| WebGL stage draws | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| `showSaveFilePicker` present | yes | yes | no, uses the fallback | no, uses the fallback | ⬜ | ⬜ |
| Export through File System Access | 🔶 | 🔶 | ➖ | ➖ | ➖ | ⬜ |
| Export through the download fallback | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| Drag and drop a settings JSON | 🔶 | 🔶 | 🔶 | 🔶 | ⬜ | ⬜ |
| Shortcuts: Mod+E, Mod+O, Alt+N | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| Reload keeps settings under `BalloonStudio.*.v1` | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| JSON as `defaults read` prints it loads | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| WebGL off: fallback text, editors usable | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| 980×730: no sideways scrolling, header intact | ✅ | ✅ | ✅ | ✅ | ⬜ | ⬜ |
| Tab through every tab: no trap, focus visible | ✅ | ➖ | ✅ | ✅ with ⌥Tab | ⬜ | ⬜ |
| Dialogs: focus inside, Esc, Enter, focus back | ✅ | ➖ | ✅ | ✅, see notes | ⬜ | ⬜ |
| Export dialog: name field focused, Esc, Enter, focus back, axe clean | ✅ | ➖ | ✅ | ✅ | ⬜ | ⬜ |
| axe-core on all tabs and states | ✅, see notes | ➖ | ✅, see notes | ✅, see notes | ⬜ | ⬜ |

**Not checked, and why:**

- **Safari.app:** `safaridriver` and scripting need “Allow remote automation” in Safari’s Developer settings, which only the user can turn on. Playwright’s WebKit is the same engine family but not Safari. WP-U7 and WP-U8 ran a page in the system’s WKWebView (WebKit 26.6.2), which is also not Safari.
- **Windows:** no Windows machine in this setup.
- **Real drags from the Finder or Explorer:** only synthetic `DragEvent`s were dispatched, with a real `File` in a `DataTransfer`. Do this by hand once.
- **The system’s save dialog:** for File System Access a script answered `showSaveFilePicker` with a real handle from the origin private file system, so the write was real and the native dialog was not shown. The export rows ran for the clip on the stub and on the real core (40484 bytes, the same in all four browsers). WP-U9’s PR holds the hash comparison of downloaded files with the references.
- **Mod+O’s system dialog:** the file chooser event fires in all browsers; picking a file by hand was not done.

**Notes:**

- The stage draws through software WebGL in these runs. Orbit by mouse was only checked in Chromium (parity rows “undoes an orbit”).
- axe-core 4 finds one rule in all three engines: `label-content-name-mismatch` on the Basket, Cloud, Sun and Figures cards. Their `aria-label` is the Swift `accessibilityLabel` (“Wicker basket”, “Classic cloud, Soft & familiar”), which starts with the visible title but leaves out the subtitle. Plan §6 keeps these labels; the subtitle or note is now the card’s `aria-describedby`. Accepted.
- Firefox makes each scrolling sidebar a tab stop of its own, with its default focus ring. It helps keyboard scrolling and is not a trap.
- WebKit with default macOS settings only tabs to text fields, as Safari does; ⌥Tab, or “Keyboard navigation” in System Settings, reaches every control. The walk used ⌥Tab.
- WebKit: after Esc in the import review, focus lands on the page instead of on “Open…”, which is disabled during the review. Tab goes on from the top of the page. No trap. Chromium and Firefox give focus back to “Open…”.
- In headless runs Tab at the end of the page or of a dialog passes through the (absent) browser chrome before it wraps. That is the browsers’ native `<dialog>` behaviour.

## Bundle budget

`npm run build && npm run size` on the stub build of this branch: entry 71.0 KiB gz, total 312.9 KiB gz. Limits: 2 MiB gzipped in total, 300 KiB for the entry chunk (`scripts/check-bundle-size.mjs`).

## The steps

Do these in each browser of the table. Automated parts: `npm run e2e` (smoke, all three engines) and `npm run e2e:parity` (`docs/parity-checklist.md`).

### File System Access (Chrome, Edge)

1. Export from each tab with Mod+E or the button. The dialog shows the Mac’s title and message, the editable name and the prompt button.
2. Press the prompt button: the system’s save dialog opens right away.
3. Cancel there: nothing changes, no error.
4. Save: the footer reads “<Prefix> saved · <filename>”. Check the file with `shasum -a 256` against a Mac export of the same settings where the plan expects byte identity.

### Download fallback (Firefox, Safari)

1. Export from each tab. The dialog opens, the prompt button starts generating.
2. The browser downloads the file under the name in the field. The footer reads “<Prefix> downloaded · <filename>”.

### Drag and drop

1. Drag a balloon STL from the Finder or Explorer onto the window. The overlay shows “Open Balloon or Lamp Settings” and the message.
2. Drop it: the import review opens. Enter takes the balloon, Esc cancels.
3. Drag out without dropping: the overlay goes away.
4. Drop `cloud-settings.json` and `sun-settings.json` from an exported kit: the tab switches and the values match.
5. Drop a `.obj`: the “Couldn’t open file” alert.

### Shortcuts

1. Mod+E exports the current tab. Mod+O opens the chooser. Alt+N resets the current part, and “Reset part” does too. `⌘` is shown on Apple systems, `Ctrl` elsewhere.
2. In a text field Alt+N types its character on a Mac (ñ) and does not reset.
3. With a dialog open, none of the shortcuts fire.

### Reload persistence

1. Change a value in each tab, reload: the values stay; the selected tab goes back to Balloon, as on the Mac.
2. In the console: `Object.keys(localStorage).filter((key) => key.startsWith('BalloonStudio.'))`. Keys are `parameters`, `pattern`, `purge`, `basket`, `ring`, `cloud`, `sun`, `figure`, `cableClip`, each with `.v1`.
3. On a Mac with the app: `defaults read <bundle id> BalloonStudio.ring.v1` prints data. Decode it, put it into `localStorage` under the same key and reload: the app shows the same values, and the Mac’s defaults migrate as they do there.

### WebGL off

1. Chrome: `--disable-gpu --disable-software-rasterizer`, or Firefox `webgl.disabled = true` in `about:config`. Safari: turn WebGL off under Develop → Feature Flags, if your version lists it.
2. Every stage shows “The 3D preview needs WebGL, which this browser doesn’t provide. You can still export the model.” All controls and export keep working.

### 980 px

1. Set the window to 980×730, the Mac’s minimum. Nothing is cut off and nothing scrolls sideways; the part picker takes a row of its own below 1200 px.
2. Make it smaller: the page scrolls and the layout stays at 980×730.

### Keyboard

1. Tab through every tab from the part picker: each stop has a visible focus mark, also on the dark stage. Arrow keys move inside the part picker and other segmented controls. Sliders move by one step.
2. Enter in a number field commits. Tab away commits. Invalid text goes back to the last value.
3. Open About, a guide, an alert and the import review: focus is inside, Tab stays inside, Esc closes, Enter runs the default action, focus returns to where it was.
4. With a screen reader: the status line (“Updating…”, “Live preview”), the saved line and the warnings are announced when they change.
