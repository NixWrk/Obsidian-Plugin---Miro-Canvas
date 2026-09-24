import { describe, expect, it } from "vitest";

import { normalizeSettings } from "../src/settings";
import {
  AUTOMATIC_CHECK_INTERVAL,
  LATEST_RELEASE_URL,
  RELEASES_PAGE_URL,
  automaticCheckDue,
  checkForUpdate,
  isNewerVersion,
  readAvailableUpdate,
  versionNumbers,
  type ReleaseRequest,
} from "../src/update-check";

function answering(status: number, json: unknown): { readonly request: ReleaseRequest; readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    request: async (url) => {
      asked.push(url);
      return { status, json };
    },
  };
}

describe("versions", () => {
  it("reads a version's numbers, with or without a leading v", () => {
    expect(versionNumbers("0.1.0")).toEqual([0, 1, 0]);
    expect(versionNumbers("v1.10.2")).toEqual([1, 10, 2]);
    expect(versionNumbers("1.0.0-beta")).toBeUndefined();
    expect(versionNumbers("latest")).toBeUndefined();
  });

  it("compares versions number by number, so 1.10 comes after 1.9", () => {
    expect(isNewerVersion("0.2.0", "0.1.0")).toBe(true);
    expect(isNewerVersion("1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.1", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.0.9", "0.1.0")).toBe(false);
    expect(isNewerVersion("nonsense", "0.1.0")).toBe(false);
  });
});

describe("checkForUpdate", () => {
  it("asks only GitHub's latest release, and names a newer one with its notes and page", async () => {
    const github = answering(200, { tag_name: "v0.2.0", html_url: "https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/tag/0.2.0", body: "  - Fonts\n- Labels  " });
    const result = await checkForUpdate(github.request, "0.1.0");
    expect(github.asked).toEqual([LATEST_RELEASE_URL]);
    expect(result).toEqual({
      kind: "newer", version: "0.2.0",
      url: "https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/tag/0.2.0",
      notes: "- Fonts\n- Labels",
    });
  });

  it("says the installed version is the latest when nothing newer is out", async () => {
    expect(await checkForUpdate(answering(200, { tag_name: "0.1.0" }).request, "0.1.0")).toEqual({ kind: "current", version: "0.1.0" });
    expect(await checkForUpdate(answering(200, { tag_name: "0.0.9" }).request, "0.1.0")).toEqual({ kind: "current", version: "0.1.0" });
  });

  it("tells an unpublished repository from a failure", async () => {
    expect(await checkForUpdate(answering(404, { message: "Not Found" }).request, "0.1.0")).toEqual({ kind: "unpublished" });
    expect(await checkForUpdate(answering(500, undefined).request, "0.1.0")).toEqual({ kind: "failed" });
    expect(await checkForUpdate(answering(200, { tag_name: 7 }).request, "0.1.0")).toEqual({ kind: "failed" });
    expect(await checkForUpdate(async () => { throw new Error("offline"); }, "0.1.0")).toEqual({ kind: "failed" });
  });

  it("links only to GitHub, whatever the answer says", async () => {
    const result = await checkForUpdate(answering(200, { tag_name: "0.2.0", html_url: "https://example.com/evil" }).request, "0.1.0");
    expect(result).toMatchObject({ kind: "newer", url: RELEASES_PAGE_URL });
  });
});

describe("the automatic check", () => {
  it("runs at most once a day, and never when turned off", () => {
    const now = 1_800_000_000_000;
    expect(automaticCheckDue(true, 0, now)).toBe(true);
    expect(automaticCheckDue(true, now - 1000, now)).toBe(false);
    expect(automaticCheckDue(true, now - AUTOMATIC_CHECK_INTERVAL, now)).toBe(true);
    // A clock set back does not stop the check for good.
    expect(automaticCheckDue(true, now + 60_000, now)).toBe(true);
    expect(automaticCheckDue(false, 0, now)).toBe(false);
  });

  it("is on by default and keeps what it found in the settings, checked on reading", () => {
    const defaults = normalizeSettings({});
    expect(defaults.checkUpdatesAutomatically).toBe(true);
    expect(defaults.lastUpdateCheck).toBe(0);
    expect(defaults.availableUpdate).toBeUndefined();
    const stored = normalizeSettings({
      checkUpdatesAutomatically: false,
      lastUpdateCheck: 1234,
      availableUpdate: { version: "0.2.0", url: "https://github.com/NixWrk/Obsidian-Plugin---Miro-Canvas/releases/tag/0.2.0", notes: "- Fonts" },
    });
    expect(stored.checkUpdatesAutomatically).toBe(false);
    expect(stored.lastUpdateCheck).toBe(1234);
    expect(stored.availableUpdate?.version).toBe("0.2.0");
    expect(readAvailableUpdate({ version: "0.2.0", url: "https://evil.example/", notes: "" })).toBeUndefined();
    expect(readAvailableUpdate({ version: "soon", url: "https://github.com/x", notes: "" })).toBeUndefined();
    expect(normalizeSettings({ lastUpdateCheck: -5 }).lastUpdateCheck).toBe(0);
  });
});
