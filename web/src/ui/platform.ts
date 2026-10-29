// Platform detection for shortcut handling and labels. The browser reserves Mod+N, so
// Reset is Alt+N (⌥N) on the web (docs/plan.md, Abschnitt 6, Shortcuts).

interface NavigatorLike {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
}

function currentNavigator(): NavigatorLike | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as NavigatorLike);
}

/** True on macOS, iOS and iPadOS, where the command key is ⌘. */
export function isApplePlatform(nav: NavigatorLike | undefined = currentNavigator()): boolean {
  if (!nav) return false;
  const platform = nav.userAgentData?.platform || nav.platform || '';
  if (platform) return /^(mac|iphone|ipad|ipod)/i.test(platform);
  return /Macintosh|Mac OS X|iPhone|iPad|iPod/.test(nav.userAgent ?? '');
}

/** "⌘" on Apple platforms, "Ctrl+" elsewhere, so `${modKeyLabel()}E` reads ⌘E or Ctrl+E. */
export function modKeyLabel(apple: boolean = isApplePlatform()): string {
  return apple ? '⌘' : 'Ctrl+';
}

/** "⌥" on Apple platforms, "Alt+" elsewhere. */
export function altKeyLabel(apple: boolean = isApplePlatform()): string {
  return apple ? '⌥' : 'Alt+';
}
