/** Nonmodal drawers enter at their primary control and keep normal document tab order.
 * Return focus on close unless the user already moved to another part of the page.
 */
export function enterDrawer(target: HTMLElement | null) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const drawer = target?.closest("aside");
  target?.focus();
  return () => {
    const active = document.activeElement;
    if (opener?.isConnected && (active === document.body || (active && drawer?.contains(active)))) {
      opener.focus();
    }
  };
}
