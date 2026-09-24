/**
 * "Check for updates": ask GitHub which release of this plugin is the latest
 * and compare it with the one installed.
 *
 * Obsidian's rules forbid a plugin updating itself, so this downloads
 * nothing: a newer release is named, with its notes and a link to its page.
 * Updates come through Obsidian itself once the plugin is in the community
 * catalogue, or through the BRAT plugin before that.  This is the only
 * request the plugin makes: once a day at start unless turned off in the
 * settings, and on the settings' button.
 */

/** GitHub's answer for the latest published (not draft, not pre-release) release. */
export const LATEST_RELEASE_URL = "https://api.github.com/repos/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/latest";
/** Where a person reads about every release. */
export const RELEASES_PAGE_URL = "https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases";

/** How often the automatic check asks GitHub, at most. */
export const AUTOMATIC_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
/** The longest release notes kept: a summary of what changed, not a manual. */
const MAX_NOTES_LENGTH = 4000;

/** A newer release found by a check, kept until it is installed. */
export interface AvailableUpdate {
	readonly version: string;
	readonly url: string;
	/** The release's own notes, as Markdown. */
	readonly notes: string;
}

export type UpdateCheck =
	| ({ readonly kind: "newer" } & AvailableUpdate)
	| { readonly kind: "current"; readonly version: string }
	| { readonly kind: "unpublished" }
	| { readonly kind: "failed" };

/** The part of Obsidian's `requestUrl` this needs, passed in so tests need no network. */
export type ReleaseRequest = (url: string) => Promise<{ readonly status: number; readonly json: unknown }>;

/** A version's numbers - "v1.2.10" is [1, 2, 10] - or undefined when it is not one. */
export function versionNumbers(version: string): readonly number[] | undefined {
	const match = /^v?(\d+(?:\.\d+)*)$/u.exec(version.trim());
	return match === null ? undefined : match[1]!.split(".").map(Number);
}

/** Whether `candidate` is a later version than `installed`; 1.10 is later than 1.9. */
export function isNewerVersion(candidate: string, installed: string): boolean {
	const newer = versionNumbers(candidate);
	const older = versionNumbers(installed);
	if (newer === undefined || older === undefined) return false;
	for (let index = 0; index < Math.max(newer.length, older.length); index += 1) {
		const difference = (newer[index] ?? 0) - (older[index] ?? 0);
		if (difference !== 0) return difference > 0;
	}
	return false;
}

/** Compare the installed version with the latest release on GitHub. */
export async function checkForUpdate(request: ReleaseRequest, installed: string): Promise<UpdateCheck> {
	let response: { readonly status: number; readonly json: unknown };
	try {
		response = await request(LATEST_RELEASE_URL);
	} catch {
		return { kind: "failed" };
	}
	// GitHub answers 404 while the repository has no published release.
	if (response.status === 404) return { kind: "unpublished" };
	if (response.status !== 200 || response.json === null || typeof response.json !== "object") return { kind: "failed" };
	const release = response.json as { readonly tag_name?: unknown; readonly html_url?: unknown; readonly body?: unknown };
	if (typeof release.tag_name !== "string" || versionNumbers(release.tag_name) === undefined) return { kind: "failed" };
	const version = release.tag_name.trim().replace(/^v/u, "");
	if (!isNewerVersion(version, installed)) return { kind: "current", version: installed };
	const url = typeof release.html_url === "string" && release.html_url.startsWith("https://github.com/") ? release.html_url : RELEASES_PAGE_URL;
	const notes = typeof release.body === "string" ? release.body.trim().slice(0, MAX_NOTES_LENGTH) : "";
	return { kind: "newer", version, url, notes };
}

/** Whether the automatic check is due: turned on, and a day since the last one. */
export function automaticCheckDue(enabled: boolean, lastCheck: number, now: number): boolean {
	return enabled && (!(lastCheck > 0) || now - lastCheck >= AUTOMATIC_CHECK_INTERVAL || now < lastCheck);
}

/** A stored update as the settings file keeps it, or undefined when it is not one. */
export function readAvailableUpdate(value: unknown): AvailableUpdate | undefined {
	if (value === null || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	if (typeof record.version !== "string" || versionNumbers(record.version) === undefined) return undefined;
	if (typeof record.url !== "string" || !record.url.startsWith("https://github.com/")) return undefined;
	const notes = typeof record.notes === "string" ? record.notes.slice(0, MAX_NOTES_LENGTH) : "";
	return Object.freeze({ version: record.version, url: record.url, notes });
}
