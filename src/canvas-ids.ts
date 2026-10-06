/**
 * Ids for what goes on a board: cards, lines, comments, export pages.
 *
 * Kept apart from the session so that anything writing a board - the plugin
 * or an agent's tool working on the file - makes ids the way native Canvas
 * does.
 */

/** A node or connector id as native Canvas makes one: sixteen hex digits. */
export function newCanvasId(): string {
	const bytes = new Uint8Array(8);
	const cryptoHost = typeof window === "undefined" ? crypto : window.crypto;
	cryptoHost.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
