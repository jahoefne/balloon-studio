// Placeholder shell for milestone M0. WP-U1/U5 replace this with the real
// header, part switcher and editors (see docs/plan.md, Abschnitt 6).
export function App() {
  return (
    <main className="shell">
      <header className="header">
        <h1>Balloon Studio</h1>
        <p className="subtitle">A little shape. A lot of possibility.</p>
      </header>
      <section className="notice" aria-live="polite">
        <p>
          The web version of Balloon Studio is being built. The native Mac app remains the
          reference implementation until the parts below are ported.
        </p>
        <ul>
          <li>Balloon, Basket, Ring, Cloud, Sun, Figures, Cable clip</li>
          <li>Identical STL, 3MF and ZIP kit exports</li>
        </ul>
        <p className="version">Version {__APP_VERSION__}</p>
      </section>
    </main>
  );
}
