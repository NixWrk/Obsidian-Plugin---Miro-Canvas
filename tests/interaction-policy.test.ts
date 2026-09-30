import { describe, expect, it } from "vitest";

import {
	canEdit,
	createInteractionPolicy,
	decideEdit,
	decideEditOperation,
	decideInteraction,
	reduceInteractionMetadata,
	reduceInteractionMetadataResult,
} from "../src/interaction-policy";

describe("M1 interaction policy", () => {
	it("blocks every board edit in review mode while keeping read operations available", () => {
		const policy = {
			settings: { reviewMode: true },
			localOverrides: { node: { locked: false } },
		};

		expect(decideEdit(policy, { operation: "move", elementId: "node" })).toMatchObject({
			allowed: false,
			blocked: true,
			reason: "review-mode",
		});
		expect(decideInteraction(policy, { operation: "pan" })).toMatchObject({
			allowed: true,
			blocked: false,
			reason: "allowed",
		});
		expect(decideInteraction(policy, { operation: "comment", targetId: "node" }).allowed).toBe(true);
	});

	it("honors per-element locks and group descendants deterministically", () => {
		const policy = createInteractionPolicy({
			settings: { reviewMode: false },
			localOverrides: {
				lockedNode: { locked: true },
				lockedGroup: { locked: true },
			},
			groupDescendants: { lockedGroup: ["child", "nestedGroup"], nestedGroup: ["nestedChild"] },
		});

		expect(policy.valid).toBe(true);
		expect(decideEdit(policy, { operation: "resize", elementId: "lockedNode" }).lockedElementIds).toEqual(["lockedNode"]);
		expect(decideEdit(policy, { operation: "resize", elementId: "child" })).toMatchObject({
			allowed: false,
			reason: "element-locked",
			lockedElementIds: ["child"],
		});
		expect(decideEdit(policy, { operation: "resize", elementIds: ["nestedChild", "free"] })).toMatchObject({
			allowed: false,
			lockedElementIds: ["nestedChild"],
		});
		expect(decideEditOperation(policy, "delete", ["free"])).toMatchObject({ allowed: true, reason: "allowed" });
	});

	it("answers each card of a large selection as it answers the whole, reading the policy once", () => {
		const policy = createInteractionPolicy({
			localOverrides: { "card-7": { locked: true }, outer: { locked: true } },
			// Frames inside frames, one of them holding its holder: every card inside is covered once.
			groupDescendants: { outer: ["inner", "card-20"], inner: ["card-30", "outer"], other: ["card-40"] },
		});
		const cards = Array.from({ length: 2000 }, (_, index) => `card-${index}`);
		const refused = cards.filter((id) => !decideEdit(policy, { operation: "move", elementIds: [id] }).allowed);
		expect(refused).toEqual(["card-7", "card-20", "card-30"]);
		expect(decideEdit(policy, { operation: "move", elementIds: cards })).toMatchObject({
			allowed: false,
			reason: "element-locked",
			lockedElementIds: ["card-20", "card-30", "card-7"],
		});
		expect(decideEdit(policy, { operation: "move", elementId: "inner" }).lockedElementIds).toEqual(["inner"]);
		// A policy made here is read once; the reading is the same each time.
		expect(createInteractionPolicy(policy)).toBe(createInteractionPolicy(policy));
		// An unverifiable policy still refuses as before: read again, it is review mode.
		const unverifiable = createInteractionPolicy(undefined);
		expect(unverifiable.valid).toBe(false);
		expect(decideEdit(unverifiable, { operation: "move", elementId: "card-1" }).reason).toBe("review-mode");
	});

	it("reads a plain metadata object afresh on every decision", () => {
		const metadata: { localOverrides: Record<string, { locked: boolean }>; settings: { reviewMode: boolean } } = {
			localOverrides: {},
			settings: { reviewMode: false },
		};
		expect(decideEdit(metadata, { operation: "move", elementId: "card" }).allowed).toBe(true);
		metadata.localOverrides.card = { locked: true };
		expect(decideEdit(metadata, { operation: "move", elementId: "card" }).reason).toBe("element-locked");
		metadata.settings.reviewMode = true;
		expect(decideEdit(metadata, { operation: "move", elementId: "other" }).reason).toBe("review-mode");
	});

	it("fails closed for malformed, inherited, and prototype-hostile input", () => {
		expect(decideEdit({ settings: { reviewMode: "yes" } }, { operation: "move", elementId: "node" })).toMatchObject({
			allowed: false,
			reason: "invalid-input",
		});
		const inherited = Object.create({ settings: { reviewMode: false } }) as Record<string, unknown>;
		expect(decideEdit(inherited, { operation: "move", elementId: "node" }).reason).toBe("invalid-input");
		const polluted = { settings: { reviewMode: false } } as Record<string, unknown>;
		Object.defineProperty(polluted, "localOverrides", {
			configurable: true,
			get: () => {
				throw new Error("hostile getter");
			},
		});
		expect(() => decideEdit(polluted, { operation: "move", elementId: "node" })).not.toThrow();
		expect(decideEdit(polluted, { operation: "move", elementId: "node" }).reason).toBe("invalid-input");
		const revoked = Proxy.revocable({ settings: { reviewMode: false } }, {});
		revoked.revoke();
		expect(() => createInteractionPolicy(revoked.proxy)).not.toThrow();
		expect(createInteractionPolicy(revoked.proxy).valid).toBe(false);
	});

	it("returns immutable detached metadata from pure reducers", () => {
		const source = {
			schemaVersion: 1,
			settings: { reviewMode: false, showAttachmentNames: true },
			localOverrides: { node: { showAttachmentName: false, custom: { keep: true } } },
		};
		const next = reduceInteractionMetadata(source, { type: "set-lock", elementId: "node", locked: true });
		expect(next).toBeDefined();
		expect(next).not.toBe(source);
		expect(next?.localOverrides).not.toBe(source.localOverrides);
		expect(next?.localOverrides?.node).not.toBe(source.localOverrides.node);
		expect(next).toMatchObject({
			schemaVersion: 1,
			settings: { reviewMode: false, showAttachmentNames: true },
			localOverrides: { node: { locked: true, showAttachmentName: false, custom: { keep: true } } },
		});
		expect(source.localOverrides.node).not.toHaveProperty("locked");
		expect(Object.isFrozen(next)).toBe(true);
		expect(Object.isFrozen(next?.localOverrides)).toBe(true);
		expect(Object.isFrozen(next?.localOverrides?.node)).toBe(true);
		expect(reduceInteractionMetadata(source, { type: "set-review-mode", enabled: true })).toMatchObject({
			settings: { reviewMode: true, showAttachmentNames: true },
		});
		expect(reduceInteractionMetadataResult(source, { type: "unknown" })).toMatchObject({
			ok: false,
			changed: false,
		});
	});

	it("supports direct lock actions and does not allow invalid element IDs", () => {
		const source = { settings: { reviewMode: false }, localOverrides: {} };
		expect(reduceInteractionMetadata(source, { type: "lock", elementId: "node" })).toMatchObject({
			localOverrides: { node: { locked: true } },
		});
		expect(reduceInteractionMetadata(source, { type: "unlock", elementId: "node" })).toMatchObject({
			localOverrides: { node: { locked: false } },
		});
		expect(reduceInteractionMetadata(source, { type: "set-locks", elementIds: ["a", "b"], locked: true })).toMatchObject({
			localOverrides: { a: { locked: true }, b: { locked: true } },
		});
		expect(reduceInteractionMetadata(source, { type: "lock", elementId: "bad\nvalue" })).toBeUndefined();
		expect(canEdit({ settings: { reviewMode: false } }, { operation: "delete", elementId: "node" })).toBe(true);
	});
});
