/**
 * updateOverrideBadge — Toggles the display style of an override badge element.
 *
 * @param badgeId - The DOM element ID of the badge to update.
 * @param value   - A truthy value shows the badge (display: block); a falsy value hides it (display: none).
 */
export function updateOverrideBadge(badgeId: string, value: unknown): void {
  const badge = document.getElementById(badgeId);
  if (badge) {
    badge.style.display = value ? "block" : "none";
  }
}
