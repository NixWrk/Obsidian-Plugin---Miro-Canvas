import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { M1CanvasSession } from "../src/m1-session";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";
import type { M1ControlsActions } from "../src/m1-controls";

// Only the presentation is replaced; the adapter and the metadata store are the real ones.
vi.mock("../src/m1-controls", () => ({
	M1Controls: class {
		element = new HostElement();
		minimapElement = new HostElement();
		constructor(public actions: M1ControlsActions) {}
		update() {}
		dispose() {}
	},
}));

interface View {
	zoom: number;
	panX: number;
	panY: number;
}

/** How the board is shown: a board point lands at (point - pan) * zoom from the root's corner. */
const view: View = { zoom: 1, panX: 0, panY: 0 };
const ROOT_LEFT = 100;
const ROOT_TOP = 50;

/** Every page box measured, so a test can count the cards measured for one placement. */
const measuredBoxes: HostElement[] = [];

class HostElement extends EventTarget {
	nodeType = 1;
	parentElement?: HostElement;
	children: HostElement[] = [];
	attributes = new Map<string, string>();
	classes = new Set<string>();
	properties = new Map<string, string>();
	style = {
		left: "", top: "", width: "", height: "",
		setProperty: (name: string, value: string) => { this.properties.set(name, value); },
		removeProperty: (name: string) => { this.properties.delete(name); },
		getPropertyValue: (name: string) => this.properties.get(name) ?? "",
		getPropertyPriority: () => "",
	};
	clientWidth = 1200;
	clientHeight = 800;
	/** Native Canvas takes cards out of view off the page; they measure as an empty box. */
	isConnected = true;
	ownerDocument?: { createElement: () => HostElement };
	/** Where this element is on the page, worked out when measured. */
	box?: () => { left: number; top: number; right: number; bottom: number };
	classList = {
		add: (name: string) => { this.classes.add(name); },
		remove: (name: string) => { this.classes.delete(name); },
		contains: (name: string) => this.classes.has(name),
	};
	constructor(public className = "") { super(); }
	appendChild(child: HostElement) { child.parentElement = this; this.children.push(child); return child; }
	removeChild(child: HostElement) { this.children = this.children.filter((item) => item !== child); return child; }
	remove() { this.parentElement?.removeChild(this); }
	setAttribute(key: string, value: string) { this.attributes.set(key, value); }
	getAttribute(key: string) { return this.attributes.get(key) ?? null; }
	hasAttribute(key: string) { return this.attributes.has(key); }
	removeAttribute(key: string) { this.attributes.delete(key); }
	contains(target: unknown): boolean { return target === this || this.children.some((child) => child.contains(target)); }
	closest() { return null; }
	getBoundingClientRect() {
		if (this.box === undefined) return { left: ROOT_LEFT, top: ROOT_TOP, right: ROOT_LEFT + this.clientWidth, bottom: ROOT_TOP + this.clientHeight };
		measuredBoxes.push(this);
		if (!this.isConnected) return { left: 0, top: 0, right: 0, bottom: 0 };
		return this.box();
	}
}

type Data = Record<string, any>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** A native card: its live position, and its element's page box drawn from it and the view. */
class NativeNode {
	nodeEl = new HostElement("canvas-node");
	x: number;
	y: number;
	width: number;
	height: number;
	constructor(public data: Data, rotation = 0) {
		this.x = data.x;
		this.y = data.y;
		this.width = data.width;
		this.height = data.height;
		// A turned card's page box is the box around its turned outline.
		this.nodeEl.box = () => {
			const angle = (rotation * Math.PI) / 180;
			const halfWidth = (Math.abs(Math.cos(angle)) * this.width + Math.abs(Math.sin(angle)) * this.height) / 2;
			const halfHeight = (Math.abs(Math.sin(angle)) * this.width + Math.abs(Math.cos(angle)) * this.height) / 2;
			const centreX = this.x + this.width / 2;
			const centreY = this.y + this.height / 2;
			return {
				left: (centreX - halfWidth - view.panX) * view.zoom + ROOT_LEFT,
				top: (centreY - halfHeight - view.panY) * view.zoom + ROOT_TOP,
				right: (centreX + halfWidth - view.panX) * view.zoom + ROOT_LEFT,
				bottom: (centreY + halfHeight - view.panY) * view.zoom + ROOT_TOP,
			};
		};
	}
	get id() { return this.data.id; }
	getData() { return { ...clone(this.data), x: this.x, y: this.y, width: this.width, height: this.height }; }
}

const sessions: M1CanvasSession[] = [];
beforeEach(() => {
	view.zoom = 1;
	view.panX = 0;
	view.panY = 0;
	measuredBoxes.length = 0;
});
afterEach(() => {
	sessions.splice(0).forEach((session) => session.dispose());
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/**
 * A board of `count` cards on a grid, a sticky note turned by 20 degrees
 * among them, and a frame around the first few - the frame and its cards
 * make a group selection.
 */
function fixture(count: number) {
	const root = new HostElement("canvas-wrapper");
	const cards: Data[] = Array.from({ length: count }, (_, index) => ({
		id: `card-${index}`, type: "text", text: `Card ${index}`,
		x: (index % 8) * 300, y: Math.floor(index / 8) * 200, width: 240, height: 120,
	}));
	const frame: Data = { id: "frame", type: "group", label: "Frame", x: -40, y: -40, width: 1000, height: 400 };
	const initial: Data = {
		nodes: [...cards, frame],
		edges: [],
		miroCanvas: {
			schemaVersion: 1,
			settings: {},
			localOverrides: { "card-3": { item: { type: "sticky_note", color: "yellow" }, rotation: 20 } },
		},
	};
	const nodes = new Map<string, NativeNode>();
	for (const item of initial.nodes) nodes.set(item.id, new NativeNode(item, item.id === "card-3" ? 20 : 0));
	const selection = new Set<NativeNode>();
	const canvas = {
		wrapperEl: root, nodes, edges: new Map(), selection,
		data: clone(initial), readonly: false,
		getData() { return { ...clone(this.data), nodes: [...nodes.values()].map((node) => node.getData()) }; },
		setViewport() {}, requestRender() {},
		select(node: NativeNode) { selection.add(node); },
		deselectAll() { selection.clear(); },
		requestSave() { this.data = this.getData(); },
	};
	const store = createObsidianMetadataStore({ canvas }).store;
	const session = new M1CanvasSession({ canvas }, new MetadataWriter(store!), {});
	sessions.push(session);
	expect(session.mount()).toBe(true);
	return { root, canvas, nodes, selection, session };
}

/** The session's own private parts these tests look at. */
interface Inside {
	pointerHeld: boolean;
	selectionPlacement(): { x: number; y: number; below?: true } | undefined;
	selectionKinds(): readonly string[];
	updateMixedSelectionFrame(): void;
	retargetFollow(): void;
	followTargets: readonly unknown[];
	mixedSelectionFrame?: HostElement;
	toolbarBounds: { reset(): void };
	frameBounds: { reset(): void };
}

const inside = (session: M1CanvasSession): Inside => session as unknown as Inside;

/** The placement measuring every selected card afresh, as the toolbar always did. */
function measuredAfresh(session: M1CanvasSession) {
	inside(session).toolbarBounds.reset();
	return inside(session).selectionPlacement();
}

/** Selects the cards, and lets the page measure them: native Canvas's elements are HTML elements. */
function select(context: ReturnType<typeof fixture>, ids: readonly string[]): void {
	for (const id of ids) context.selection.add(context.nodes.get(id)!);
	context.session.refresh();
	vi.stubGlobal("HTMLElement", HostElement);
}

function moveSelected(context: ReturnType<typeof fixture>, dx: number, dy: number): void {
	for (const node of context.selection) {
		node.x += dx;
		node.y += dy;
	}
}

function expectPlacement(actual: ReturnType<Inside["selectionPlacement"]>, expected: ReturnType<Inside["selectionPlacement"]>): void {
	expect(actual).toBeDefined();
	expect(actual!.x).toBeCloseTo(expected!.x, 6);
	expect(actual!.y).toBeCloseTo(expected!.y, 6);
	expect(actual!.below).toBe(expected!.below);
}

describe("the selection toolbar over a large selection being dragged", () => {
	it("follows the cards before release at zoom 0.5, turned sticky and frame included, measuring two cards a frame", () => {
		const context = fixture(80);
		view.zoom = 0.5;
		view.panX = -200;
		view.panY = -300;
		select(context, [...context.nodes.keys()]);
		const session = context.session;
		const first = inside(session).selectionPlacement();
		expectPlacement(first, measuredAfresh(session));
		inside(session).pointerHeld = true;
		for (let frame = 1; frame <= 5; frame += 1) {
			moveSelected(context, 30, 12);
			measuredBoxes.length = 0;
			const during = inside(session).selectionPlacement();
			expect(measuredBoxes.length).toBe(2);
			expectPlacement(during, measuredAfresh(session));
		}
	});

	it("keeps up with a pan and a zoom in the middle of the drag", () => {
		const context = fixture(60);
		select(context, [...context.nodes.keys()]);
		const session = context.session;
		inside(session).selectionPlacement();
		inside(session).pointerHeld = true;
		moveSelected(context, -50, 20);
		view.panX += 90;
		expectPlacement(inside(session).selectionPlacement(), measuredAfresh(session));
		view.zoom = 0.5;
		moveSelected(context, 10, 10);
		expectPlacement(inside(session).selectionPlacement(), measuredAfresh(session));
	});

	it("sits where measuring every card puts it after the drag is committed or cancelled", () => {
		const context = fixture(50);
		view.zoom = 0.5;
		select(context, [...context.nodes.keys()]);
		const session = context.session;
		inside(session).selectionPlacement();
		inside(session).pointerHeld = true;
		moveSelected(context, 120, 80);
		inside(session).selectionPlacement();
		// Committed: native Canvas saves, the board is read again, every card is measured once.
		inside(session).pointerHeld = false;
		vi.unstubAllGlobals();
		context.canvas.requestSave();
		context.session.refresh();
		vi.stubGlobal("HTMLElement", HostElement);
		measuredBoxes.length = 0;
		const committed = inside(session).selectionPlacement();
		expect(measuredBoxes.length).toBe(context.selection.size);
		expectPlacement(committed, measuredAfresh(session));
		// Cancelled: the cards go back where they were, unsaved.
		inside(session).pointerHeld = true;
		moveSelected(context, 70, -30);
		inside(session).selectionPlacement();
		moveSelected(context, -70, 30);
		inside(session).pointerHeld = false;
		expectPlacement(inside(session).selectionPlacement(), measuredAfresh(session));
	});

	it("measures every card again when one of them moves on its own", () => {
		const context = fixture(50);
		select(context, [...context.nodes.keys()]);
		const session = context.session;
		inside(session).selectionPlacement();
		inside(session).pointerHeld = true;
		context.nodes.get("card-0")!.x -= 900;
		measuredBoxes.length = 0;
		const placement = inside(session).selectionPlacement();
		expect(measuredBoxes.length).toBeGreaterThan(2);
		expectPlacement(placement, measuredAfresh(session));
	});

	it("sits over the cards on the page, and reaches a card native Canvas puts on the page mid-drag", () => {
		const context = fixture(60);
		view.zoom = 0.25;
		// A card far to the right, out of view.
		const far = context.nodes.get("card-59")!;
		far.x += 3000;
		far.nodeEl.isConnected = false;
		select(context, [...context.nodes.keys()]);
		const session = context.session;
		const onPage = inside(session).selectionPlacement();
		// Measured without the card off the page, which would pull the toolbar to the corner.
		far.nodeEl.isConnected = true;
		const everything = measuredAfresh(session);
		far.nodeEl.isConnected = false;
		expectPlacement(onPage, measuredAfresh(session));
		expect(onPage!.x).not.toBeCloseTo(everything!.x, 1);
		inside(session).pointerHeld = true;
		moveSelected(context, 20, 20);
		inside(session).selectionPlacement();
		far.nodeEl.isConnected = true;
		const reached = inside(session).selectionPlacement();
		expectPlacement(reached, measuredAfresh(session));
		expect(reached!.x).toBeGreaterThan(onPage!.x);
	});

	it("still measures a small selection card by card", () => {
		const context = fixture(40);
		const chosen = ["card-0", "card-1", "card-2", "card-3"];
		select(context, chosen);
		const session = context.session;
		inside(session).selectionPlacement();
		inside(session).pointerHeld = true;
		moveSelected(context, 15, 15);
		measuredBoxes.length = 0;
		expectPlacement(inside(session).selectionPlacement(), measuredAfresh(session));
		expect(measuredBoxes.length).toBe(chosen.length * 2);
	});
});

describe("the toolbar following a drag frame by frame", () => {
	it("moves the toolbar when the placement changes, and signs the unchanged rest of its state once", () => {
		const context = fixture(60);
		view.zoom = 0.25;
		select(context, [...context.nodes.keys()]);
		context.root.ownerDocument = { createElement: () => new HostElement() };
		const session = context.session;
		const internals = session as unknown as {
			toolbar: { update(state: { placement?: unknown }): void };
			followViewport(): void;
			lastToolbarState: { placement?: { x: number; y: number } };
		};
		const update = vi.spyOn(internals.toolbar, "update");
		const stringify = vi.spyOn(JSON, "stringify");
		inside(session).pointerHeld = true;
		internals.followViewport();
		update.mockClear();
		stringify.mockClear();
		// A frame of the drag: the toolbar moves with the cards.
		moveSelected(context, 40, 0);
		internals.followViewport();
		expect(update).toHaveBeenCalledTimes(1);
		expectPlacement(internals.lastToolbarState.placement as never, measuredAfresh(session));
		// Nothing signed holds every selected id again.
		const signed = stringify.mock.calls.map(([value]) => value);
		stringify.mockRestore();
		expect(signed.filter((value) => JSON.stringify(value ?? null).includes("card-59"))).toHaveLength(0);
		// A frame where nothing moved leaves the toolbar alone.
		update.mockClear();
		internals.followViewport();
		expect(update).not.toHaveBeenCalled();
	});
});

describe("the shared frame around a large selection being dragged", () => {
	it("frames the cards where measuring every card would, before and during the drag", () => {
		const context = fixture(60);
		view.zoom = 0.5;
		select(context, [...context.nodes.keys()]);
		context.root.ownerDocument = { createElement: () => new HostElement() };
		const session = context.session;
		const frameBox = () => {
			const style = inside(session).mixedSelectionFrame!.style;
			return [style.left, style.top, style.width, style.height];
		};
		const afresh = () => {
			inside(session).frameBounds.reset();
			inside(session).updateMixedSelectionFrame();
			return frameBox();
		};
		inside(session).updateMixedSelectionFrame();
		expect(frameBox()).toEqual(afresh());
		inside(session).pointerHeld = true;
		moveSelected(context, 44, -18);
		measuredBoxes.length = 0;
		inside(session).updateMixedSelectionFrame();
		expect(measuredBoxes.length).toBe(2);
		const followed = frameBox();
		expect(followed).toEqual(afresh());
	});
});

describe("what kinds of item are selected", () => {
	it("works the kinds out once for a selection and a saved board, and again once either changes", () => {
		const context = fixture(20);
		const session = context.session;
		const workOut = vi.spyOn(session as unknown as { workOutSelectionKinds(): readonly string[] }, "workOutSelectionKinds");
		const workedOut = () => workOut.mock.calls.length;
		select(context, ["card-3", "frame", "card-0"]);
		const kinds = inside(session).selectionKinds();
		expect([...kinds].sort()).toEqual(["frame", "shape", "sticky"]);
		const before = workedOut();
		expect(before).toBe(1);
		// A drag moves the cards; the kinds are not worked out again.
		inside(session).pointerHeld = true;
		moveSelected(context, 10, 10);
		expect(inside(session).selectionKinds()).toBe(kinds);
		expect(workedOut()).toBe(before);
		inside(session).pointerHeld = false;
		// Another saved board is worked out afresh, though the selection is the same.
		vi.unstubAllGlobals();
		context.canvas.requestSave();
		session.refresh();
		expect(workedOut()).toBe(before + 1);
		expect([...inside(session).selectionKinds()].sort()).toEqual(["frame", "shape", "sticky"]);
		// So is another selection.
		context.selection.delete(context.nodes.get("card-3")!);
		session.refresh();
		expect([...inside(session).selectionKinds()].sort()).toEqual(["frame", "shape"]);
	});
});

describe("watching the selected cards for native moves", () => {
	it("watches exactly the selected cards' elements", () => {
		const context = fixture(30);
		select(context, ["card-1", "card-7", "frame"]);
		inside(context.session).retargetFollow();
		const expected = ["card-1", "card-7", "frame"].map((id) => context.nodes.get(id)!.nodeEl);
		expect(new Set(inside(context.session).followTargets)).toEqual(new Set(expected));
	});
});
