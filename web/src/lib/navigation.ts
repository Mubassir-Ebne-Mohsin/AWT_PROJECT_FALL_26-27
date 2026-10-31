/**
 * A full page load, not a client-side route change. Used after an account is deleted: the in-memory session is gone
 * with the page, and there is no route guard left to send the person to the login screen first.
 * Kept in its own module so tests can replace it.
 */
export function hardNavigate(url: string) {
  window.location.assign(url);
}
