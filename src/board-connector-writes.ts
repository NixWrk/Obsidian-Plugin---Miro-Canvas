/**
 * What storing the board's own connectors changes in the plugin's record.
 *
 * The board's own connectors - lines with an end on empty board, on another
 * line or on a comment pin - live under `miroCanvas.connectors`.  Adding,
 * replacing or taking some away also touches every line that held on to one
 * taken away: its end stays where it was, free.  This works on the board's
 * JSON alone, so the session and an agent's tool working on the file plan the
 * same change; the caller decides how to write it.
 */

import type { AnchorPoint, CanvasAnchor } from "./anchors";
import { boardConnectors, type BoardConnector } from "./board-connectors";
import { buildCanvasAnchorGeometry } from "./connector-endpoints";

type UnknownRecord = Record<string, unknown>;

/** The connectors and local overrides to store, or why the change cannot be made. */
export type BoardConnectorPlan =
	| {
		readonly ok: true;
		/** Every board connector after the change, by id. */
		readonly connectors: Readonly<Record<string, BoardConnector>>;
		/** `miroCanvas.localOverrides` after the change. */
		readonly localOverrides: Readonly<Record<string, unknown>>;
	}
	| {
		readonly ok: false;
		/**
		 * `locked`: `editAllowed` refused a line the change touches.
		 * `end-unresolved`: a native edge held on to a connector taken away,
		 * and where its end was cannot be told.
		 * `target-invalid`: a connector would end on something not on the board.
		 */
		readonly reason: "locked" | "end-unresolved" | "target-invalid";
	};

function isRecord(value: unknown): value is UnknownRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Plan storing the board's own connectors: `items` added or replaced,
 * `remove` taken away.  A connector or native edge that held on to one taken
 * away keeps its end where it was, free.  `editAllowed` is asked about every
 * line whose record changes, in the order the change reaches them.
 */
export function planBoardConnectors(
	document: unknown,
	items: readonly BoardConnector[],
	remove: readonly string[],
	editAllowed: (ids: readonly string[]) => boolean,
): BoardConnectorPlan {
	const old = boardConnectors(document);
	const kept = old.filter((connector) => !remove.includes(connector.id) && !items.some((item) => item.id === connector.id));
	const next = kept.concat(items);
	const geometry = buildCanvasAnchorGeometry(document);
	const freed = (anchor: CanvasAnchor, point: AnchorPoint | undefined): CanvasAnchor => {
		if (anchor.type === "edge" && remove.includes(anchor.edgeId) && point !== undefined) {
			return { type: "free", x: point.x, y: point.y };
		}
		return anchor;
	};
	const detached = next.map((connector) => {
		const route = geometry.edges?.[connector.id];
		return { ...connector, from: freed(connector.from, route?.start), to: freed(connector.to, route?.end) };
	});
	const changed = detached.filter((connector) => {
		const before = old.find((item) => item.id === connector.id);
		return JSON.stringify(connector) !== JSON.stringify(before);
	});
	if (changed.length > 0 && !editAllowed(changed.map((connector) => connector.id))) {
		return { ok: false, reason: "locked" };
	}
	const metadata = isRecord(document) ? document.miroCanvas : undefined;
	const overrides: UnknownRecord = { ...(isRecord(metadata) && isRecord(metadata.localOverrides) ? metadata.localOverrides : {}) };
	// Native edges that held on to a connector taken away keep their end too.
	for (const [id, value] of Object.entries(overrides)) {
		if (!isRecord(value) || !isRecord(value.connectorAnchors)) continue;
		const anchors = { ...value.connectorAnchors };
		let edited = false;
		for (const end of ["from", "to"] as const) {
			const anchor = anchors[end];
			const route = geometry.edges?.[id];
			const point = end === "from" ? route?.start : route?.end;
			if (!isRecord(anchor) || anchor.type !== "edge" || !remove.includes(anchor.edgeId as string)) continue;
			if (point === undefined) return { ok: false, reason: "end-unresolved" };
			if (!editAllowed([id])) return { ok: false, reason: "locked" };
			anchors[end] = { type: "free", x: point.x, y: point.y };
			edited = true;
		}
		if (edited) overrides[id] = { ...value, connectorAnchors: anchors };
	}
	const connectors = Object.fromEntries(detached.map((connector) => [connector.id, connector]));
	const proposed = {
		...(isRecord(document) ? document : {}),
		miroCanvas: { ...(isRecord(metadata) ? metadata : {}), connectors, localOverrides: overrides },
	};
	// Every connector must still end on something the board has.
	const nextGeometry = buildCanvasAnchorGeometry(proposed);
	if (detached.some((connector) => nextGeometry.edges?.[connector.id] === undefined)) {
		return { ok: false, reason: "target-invalid" };
	}
	return { ok: true, connectors, localOverrides: overrides };
}
