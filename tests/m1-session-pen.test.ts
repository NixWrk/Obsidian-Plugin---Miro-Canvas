import { afterEach, describe, expect, it, vi } from "vitest";

import { M1CanvasSession } from "../src/m1-session";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";
import { DEFAULT_SETTINGS, type MiroCanvasSettings } from "../src/settings";
import { StylusWatch, strokeWidthScale } from "../src/stylus";
import type { M1ControlsActions } from "../src/m1-controls";

// Only the presentation is replaced; the adapter, the viewport, the policy
// and the writer are the real ones.  Timings are those a real S Pen session
// on a Galaxy Tab (SM-X736B, Android 16, Obsidian 1.13) reported to the page:
// a palm lands as a touch and Android takes it back 7 to 24 ms later, with no
// move in between.
vi.mock("../src/m1-controls", () => ({
	M1Controls: class {
		element = new HostElement("miro-canvas-dock");
		minimapElement = new HostElement();
		constructor(public actions: M1ControlsActions) {}
		update() {}
		dispose() { this.element.remove(); this.minimapElement.remove(); }
	},
}));

class HostElement extends EventTarget {
	nodeType = 1;
	parentElement?: HostElement;
	children: HostElement[] = [];
	attributes = new Map<string, string>();
	classes = new Set<string>();
	style: Record<string, string> & { setProperty: (name: string, value: string) => void; removeProperty: (name: string) => void };
	clientWidth = 800;
	clientHeight = 600;
	hidden = false;
	textContent = "";
	ownerDocument: unknown;
	classList = {
		add: (name: string) => { this.classes.add(name); },
		remove: (name: string) => { this.classes.delete(name); },
		contains: (name: string) => this.classes.has(name),
		toggle: (name: string, on?: boolean) => { if (on ?? !this.classes.has(name)) this.classes.add(name); else this.classes.delete(name); },
	};
	constructor(public className = "", public tagName = "DIV") {
		super();
		const properties: Record<string, string> = {};
		this.style = Object.assign(properties, {
			setProperty: (name: string, value: string) => { properties[name] = value; },
			removeProperty: (name: string) => { delete properties[name]; },
		});
	}
	get isConnected(): boolean { return this.parentElement !== undefined; }
	appendChild(child: HostElement) { child.parentElement = this; this.children.push(child); return child; }
	removeChild(child: HostElement) { this.children = this.children.filter((item) => item !== child); child.parentElement = undefined; }
	remove() { this.parentElement?.removeChild(this); }
	setAttribute(key: string, value: string) { this.attributes.set(key, value); }
	getAttribute(key: string) { return this.attributes.get(key) ?? null; }
	hasAttribute(key: string) { return this.attributes.has(key); }
	removeAttribute(key: string) { this.attributes.delete(key); }
	contains(target: unknown): boolean { return target === this || this.children.some((child) => child.contains(target)); }
	querySelector(): null { return null; }
	querySelectorAll(): HostElement[] { return []; }
	getBoundingClientRect() { return { left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight, width: this.clientWidth, height: this.clientHeight }; }
	closest(selector: string): HostElement | null {
		for (const part of selector.split(",").map((value) => value.trim())) {
			if (part.startsWith(".") && this.className.split(" ").includes(part.slice(1))) return this;
		}
		return this.parentElement?.closest(selector) ?? null;
	}
}

type Data = Record<string, any>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const sessions: M1CanvasSession[] = [];
afterEach(() => {
	sessions.splice(0).forEach((session) => session.dispose());
	vi.restoreAllMocks();
	vi.useRealTimers();
});

/** The parts of the session the board's tool bar and pen reach, which these tests drive directly. */
interface ToolHooks {
	armTool(tool: string): void;
	/** The tool a press on the board uses now. */
	armedTool: string;
	startToolGesture(event: Event): void;
	stylus: StylusWatch;
	toolGesture: unknown;
	erasing: Set<string>;
}

/** A pen line drawn across the board, as the plugin keeps it: a card with the stroke in its metadata. */
const INK = { id: "ink", type: "text", text: "", x: 100, y: 100, width: 107, height: 47 };
const INK_STROKE = {
	item: { type: "drawing", stroke: { color: "#ffffff", width: 4.78, box: { width: 106.78, height: 46.78 }, points: [3.39, 3.39, 103.39, 43.39] } },
};

interface FixtureOptions {
	/** The plugin settings; the defaults when left out. */
	readonly settings?: MiroCanvasSettings;
	/** Cards the board starts with; two text cards, the first one selected, when left out. */
	readonly nodes?: readonly Data[];
	/** The board's own metadata for them. */
	readonly overrides?: Record<string, unknown>;
	/** A stand-in for the bottom tool bar, so the session wires the tools up as it does in Obsidian. */
	readonly toolBar?: boolean;
	/** Runs before the session attaches to the board, to watch what it listens to. */
	readonly beforeMount?: (targets: { readonly window: EventTarget; readonly document: EventTarget; readonly root: HostElement }) => void;
}

/**
 * A browser matches a listener added with `true` for capture to the one
 * removed with `true`; Node's EventTarget does not, and would keep a
 * finished stroke listening.  Here, as in a browser, the flag is the flag.
 */
function captureFlagAsInBrowsers<Target extends EventTarget>(target: Target): Target {
	const add = target.addEventListener.bind(target);
	const remove = target.removeEventListener.bind(target);
	target.addEventListener = (type, listener, options) => add(type, listener, typeof options === "boolean" ? { capture: options } : options);
	target.removeEventListener = (type, listener, options) => remove(type, listener, typeof options === "boolean" ? { capture: options } : options);
	return target;
}

/** A board in a window whose frames run when told to, with native Canvas's history kept as a list. */
function fixture(options: FixtureOptions = {}) {
	const frames: Array<() => void> = [];
	const window = Object.assign(captureFlagAsInBrowsers(new EventTarget()), {
		setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
		clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
		setInterval: () => 0,
		clearInterval: () => undefined,
		requestAnimationFrame: (callback: () => void) => frames.push(callback),
		cancelAnimationFrame: () => undefined,
	});
	const element = (tagName: string): HostElement => {
		const created = new HostElement("", tagName.toUpperCase());
		created.ownerDocument = document;
		return created;
	};
	const document = Object.assign(captureFlagAsInBrowsers(new EventTarget()), {
		body: new HostElement("", "BODY"),
		defaultView: window,
		createElement: (tagName: string) => element(tagName),
		createElementNS: (_namespace: string, tagName: string) => element(tagName),
	});
	const root = new HostElement("canvas-wrapper");
	const board = root.appendChild(new HostElement("canvas-background"));
	const initial: Data = {
		nodes: options.nodes ?? [
			{ id: "plan", type: "text", text: "Plan", x: 0, y: 0, width: 200, height: 120 },
			{ id: "note", type: "text", text: "Note", x: 400, y: 0, width: 200, height: 120 },
		],
		edges: [],
		...(options.overrides === undefined ? {} : { miroCanvas: { schemaVersion: 1, localOverrides: options.overrides } }),
	};
	class NativeNode {
		nodeEl = root.appendChild(new HostElement("canvas-node"));
		constructor(public data: Data) {}
		get id() { return this.data.id; }
		getData() { return clone(this.data); }
		setData(data: Data) { this.data = clone(data); }
	}
	const nodes = new Map<string, NativeNode>();
	const selection = new Set<NativeNode>();
	/** Every state native Canvas can undo to; one entry per history step. */
	const history: Data[] = [];
	const canvas = {
		wrapperEl: root, nodes, edges: new Map(), selection,
		data: clone(initial), readonly: false,
		tx: 0, ty: 0, tZoom: 0,
		getData(): Data { return { ...clone(this.data), nodes: [...nodes.values()].map((node) => node.getData()) }; },
		setViewport(x: number, y: number, zoom: number) {
			this.tx = x;
			this.ty = y;
			this.tZoom = zoom;
		},
		requestRender() {},
		selectOnly(node: NativeNode) { selection.clear(); selection.add(node); },
		select(node: NativeNode) { selection.add(node); },
		deselectAll() { selection.clear(); },
		requestSave(addHistory?: boolean) {
			if (addHistory === true) history.push(this.getData());
		},
		importData(data: Data) {
			this.data = clone({ ...data, nodes: [] });
			for (const item of data.nodes) {
				const existing = nodes.get(item.id);
				if (existing !== undefined) existing.setData(item);
				else nodes.set(item.id, new NativeNode(clone(item)));
			}
			for (const id of [...nodes.keys()]) {
				if (!data.nodes.some((item: Data) => item.id === id)) nodes.delete(id);
			}
		},
	};
	canvas.importData(clone(initial));
	const view = { canvas };
	const store = createObsidianMetadataStore(view).store;
	const session = new M1CanvasSession(view, new MetadataWriter(store!), { settings: options.settings ?? DEFAULT_SETTINGS });
	sessions.push(session);
	root.ownerDocument = document;
	if (options.toolBar === true) {
		const toolBar = { element: new HostElement("miro-canvas-toolbar miro-canvas-tools"), update() {}, closePanels() {}, dispose() {}, placeNativeButton() {}, placeSideRows() {} };
		(session as unknown as { quickTools: unknown }).quickTools = toolBar;
	}
	options.beforeMount?.({ window, document, root });
	expect(session.mount()).toBe(true);
	const first = nodes.values().next().value;
	if (first !== undefined) canvas.selectOnly(first);
	const hooks = session as unknown as ToolHooks;
	// Each test starts on a device that has not shown a pen yet.
	hooks.stylus = new StylusWatch({ seen: false });
	/** The board's centre is board point (0, 0) at zoom 1: a board point on the screen. */
	const screen = (point: { readonly x: number; readonly y: number }) => ({ x: point.x + 400, y: point.y + 300 });
	/**
	 * A pointer event as the page sees it: the window first, then the board's
	 * tool bar (which listens on the document) for a press on the board.
	 */
	const pointer = (type: string, pointerId: number, pointerType = "touch", at = { x: 300, y: 300 }, extra: Data = {}): Event => {
		const event = new Event(type, { cancelable: true });
		const pressed = type === "pointerdown" || type === "pointermove" ? 1 : 0;
		const fields = {
			pointerId, pointerType, target: board, button: 0, buttons: pressed, clientX: at.x, clientY: at.y,
			pressure: pointerType === "pen" && pressed === 1 ? 0.17 : 0, shiftKey: false, ...extra,
		};
		for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
		window.dispatchEvent(event);
		if (type === "pointerdown" && !event.cancelBubble) hooks.startToolGesture(event);
		return event;
	};
	const runFrames = (): void => {
		for (const frame of frames.splice(0)) frame();
	};
	/** What native Canvas does with a touch on empty board: puts the selection away and pans a little. */
	const nativeTakesTouch = (): void => {
		canvas.deselectAll();
		canvas.setViewport(canvas.tx - 1, canvas.ty - 10, canvas.tZoom);
	};
	const selected = () => [...selection].map((node) => node.id);
	/** The points the pen's preview shows now, as "x,y" pairs on the board's element. */
	const preview = (): string[] => {
		const ghost = root.children.find((child) => child.getAttribute("class")?.includes("miro-canvas-tool-ghost") === true);
		return ghost?.children[0]?.getAttribute("points")?.split(" ") ?? [];
	};
	return { window, canvas, root, board, nodes, history, session, hooks, pointer, runFrames, nativeTakesTouch, selected, screen, preview };
}

describe("live pen pressure and finger drawing", () => {
	it.each([["pen", false], ["highlighter", true]] as const)("keeps constant width with pressure disabled or the highlighter: %s", (tool, penPressure) => {
		const { hooks, pointer, canvas } = fixture({ nodes: [], settings: { ...DEFAULT_SETTINGS, penPressure } });
		hooks.armTool(tool);
		pointer("pointerdown", 8, "pen", { x: 100, y: 100 }, { pressure: 0.1 });
		pointer("pointermove", 8, "pen", { x: 200, y: 100 }, { pressure: 0.8 });
		pointer("pointerup", 8, "pen", { x: 200, y: 100 });
		const override = Object.values(canvas.getData().miroCanvas.localOverrides)[0] as Data;
		expect(override.item.stroke.widths).toBeUndefined();
	});
	it("leaves no pressure drawing after cancellation at half zoom", () => {
		const { hooks, pointer, canvas, history } = fixture({ nodes: [] });
		canvas.setViewport(0, 0, -1);
		hooks.armTool("pen");
		pointer("pointerdown", 8, "pen", { x: 100, y: 100 }, { pressure: 0.1 });
		pointer("pointermove", 8, "pen", { x: 200, y: 100 }, { pressure: 0.8 });
		pointer("pointercancel", 8, "pen", { x: 200, y: 100 });
		expect(canvas.nodes.size).toBe(0);
		expect(history).toHaveLength(0);
		expect(hooks.toolGesture).toBeUndefined();
	});

	it("changes the outline before release and keeps every sampled width in one history step", () => {
		const { root, canvas, history, hooks, pointer } = fixture({ nodes: [] });
		hooks.armTool("pen");
		pointer("pointerdown", 8, "pen", { x: 100, y: 100 }, { pressure: 0.1 });
		const ghost = root.children.find(child => child.getAttribute("class")?.includes("tool-ghost"))!;
		const line = ghost.children[0]!;
		const first = line.getAttribute("d");
		pointer("pointermove", 8, "pen", { x: 150, y: 110 }, { pressure: 0.8 });
		expect(line.getAttribute("d")).not.toBe(first);
		expect(line.getAttribute("fill")).not.toBe("none");
		expect(history).toHaveLength(0);
		pointer("pointermove", 8, "pen", { x: 200, y: 100 }, { pressure: 0.15 });
		pointer("pointerup", 8, "pen", { x: 200, y: 100 });
		const override = Object.values(canvas.getData().miroCanvas.localOverrides)[0] as Data;
		expect(override.item.stroke.widths).toEqual([4.25, 8, 4.63]);
		expect(override.item.stroke.points).toHaveLength(6);
		expect(history).toHaveLength(1);
	});
	it.each([true, false])("finger drawing respects its setting: %s", enabled => {
		const { hooks, pointer, history } = fixture({ nodes: [], settings: { ...DEFAULT_SETTINGS, fingerDrawing: enabled } });
		hooks.armTool("pen");
		pointer("pointerdown", 1, "touch", { x: 100, y: 100 });
		pointer("pointermove", 1, "touch", { x: 220, y: 100 });
		pointer("pointerup", 1, "touch", { x: 220, y: 100 });
		expect(history).toHaveLength(enabled ? 1 : 0);
	});
	it("abandons a finger stroke when a second finger starts a pinch", () => {
		const { hooks, pointer, history } = fixture({ nodes: [], settings: { ...DEFAULT_SETTINGS, fingerDrawing: true } });
		hooks.armTool("pen");
		pointer("pointerdown", 1, "touch", { x: 100, y: 100 });
		pointer("pointermove", 1, "touch", { x: 160, y: 100 });
		pointer("pointerdown", 2, "touch", { x: 240, y: 100 });
		expect(hooks.toolGesture).toBeUndefined();
		pointer("pointerup", 1);
		pointer("pointerup", 2);
		expect(history).toHaveLength(0);
	});
	it("a double tap with small pen jitter leaves no drawing or history entry", () => {
		vi.useFakeTimers();
		const { hooks, pointer, history, canvas } = fixture({ nodes: [], toolBar: true });
		hooks.armTool("pen");
		pointer("pointerdown", 8, "pen", { x: 100, y: 100 });
		pointer("pointermove", 8, "pen", { x: 103, y: 102 });
		pointer("pointerup", 8, "pen", { x: 103, y: 102 });
		vi.advanceTimersByTime(290);
		pointer("pointerdown", 8, "pen", { x: 105, y: 100 });
		vi.advanceTimersByTime(200);
		pointer("pointerup", 8, "pen", { x: 105, y: 100 });
		vi.advanceTimersByTime(1000);
		expect(canvas.nodes.size).toBe(0);
		expect(history).toHaveLength(0);
		expect(hooks.armedTool).toBe("select");
	});
	it("keeps separate taps far apart instead of losing the first dot", () => {
		vi.useFakeTimers();
		const { hooks, pointer, history } = fixture({ nodes: [], toolBar: true });
		hooks.armTool("pen");
		for (const x of [100, 300]) {
			pointer("pointerdown", 8, "pen", { x, y: 100 });
			pointer("pointerup", 8, "pen", { x, y: 100 });
			vi.advanceTimersByTime(100);
		}
		vi.advanceTimersByTime(1000);
		expect(history).toHaveLength(2);
	});
});

describe("a palm Android takes back", () => {
	it("leaves the selection and the board's place as they were before it landed", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(71_671);
		const { canvas, pointer, runFrames, nativeTakesTouch, selected } = fixture();
		pointer("pointerdown", 11);
		nativeTakesTouch();
		expect(selected()).toEqual([]);
		now.mockReturnValue(71_678);
		pointer("pointercancel", 11);
		runFrames();
		expect(selected()).toEqual(["plan"]);
		expect([canvas.tx, canvas.ty, canvas.tZoom]).toEqual([0, 0, 0]);
	});

	it("keeps what a finger did when it lifts", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
		const { canvas, pointer, runFrames, nativeTakesTouch, selected } = fixture();
		pointer("pointerdown", 16);
		nativeTakesTouch();
		now.mockReturnValue(1_300);
		pointer("pointerup", 16);
		runFrames();
		expect(selected()).toEqual([]);
		expect([canvas.tx, canvas.ty]).toEqual([-1, -10]);
	});

	it("keeps what a finger did when the system takes it back well after it landed", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
		const { canvas, pointer, runFrames, nativeTakesTouch } = fixture();
		pointer("pointerdown", 16);
		nativeTakesTouch();
		now.mockReturnValue(2_000);
		pointer("pointercancel", 16);
		runFrames();
		expect([canvas.tx, canvas.ty]).toEqual([-1, -10]);
	});

	it("leaves a pinch alone when one of its fingers is taken back", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
		const { canvas, pointer, runFrames, nativeTakesTouch } = fixture();
		pointer("pointerdown", 18);
		pointer("pointerdown", 19);
		nativeTakesTouch();
		now.mockReturnValue(1_010);
		pointer("pointercancel", 19);
		runFrames();
		expect([canvas.tx, canvas.ty]).toEqual([-1, -10]);
	});

	it("does nothing for a pen or a mouse", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
		const { canvas, pointer, runFrames, nativeTakesTouch } = fixture();
		pointer("pointerdown", 7, "pen");
		nativeTakesTouch();
		now.mockReturnValue(1_005);
		pointer("pointercancel", 7, "pen");
		runFrames();
		expect([canvas.tx, canvas.ty]).toEqual([-1, -10]);
	});

	it("puts back only the view and the selection: no history step, no card moved, nothing saved", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(71_671);
		const { canvas, nodes, history, pointer, runFrames, selected } = fixture();
		const before = canvas.getData();
		const save = vi.spyOn(canvas, "requestSave");
		// A palm on the second card: native Canvas selects it on the press and
		// the board shifts a little under the hand.
		pointer("pointerdown", 11, "touch", { x: 900, y: 360 });
		canvas.selectOnly(nodes.get("note")!);
		canvas.setViewport(0, -10, 0);
		now.mockReturnValue(71_678);
		pointer("pointercancel", 11);
		runFrames();
		expect(selected()).toEqual(["plan"]);
		expect([canvas.tx, canvas.ty, canvas.tZoom]).toEqual([0, 0, 0]);
		expect(save).not.toHaveBeenCalled();
		expect(history).toEqual([]);
		expect(canvas.getData()).toEqual(before);
	});
});

describe("a pen and a hand on the same board", () => {
	it("takes a pen hovering near the board, whatever tool is armed, as the hand coming down with it", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
		const { hooks, pointer } = fixture();
		// The pen hovers while the select tool is armed: no tool listens to the board yet.
		pointer("pointermove", 7, "pen", { x: 350, y: 320 }, { buttons: 0, pressure: 0 });
		hooks.armTool("sticky");
		now.mockReturnValue(10_400);
		const palm = pointer("pointerdown", 11, "touch");
		expect(palm.defaultPrevented).toBe(false);
		expect(hooks.toolGesture).toBeUndefined();
		pointer("pointercancel", 11);
		// Long after the pen went away, a finger is a finger again and places the note.
		now.mockReturnValue(13_000);
		const finger = pointer("pointerdown", 12, "touch");
		expect(finger.defaultPrevented).toBe(true);
		expect(hooks.toolGesture).toBeDefined();
		pointer("pointercancel", 12);
		expect(hooks.toolGesture).toBeUndefined();
	});

	it("draws nothing for a palm that lands before any pen, with the pen armed", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(71_671);
		const { canvas, history, hooks, pointer, runFrames } = fixture({ settings: { ...DEFAULT_SETTINGS, fingerDrawing: true } });
		hooks.armTool("pen");
		const before = canvas.getData();
		// No pen seen yet: the touch starts a stroke, and native Canvas never sees it.
		const palm = pointer("pointerdown", 11, "touch");
		expect(palm.cancelBubble).toBe(true);
		expect(hooks.toolGesture).toBeDefined();
		now.mockReturnValue(71_678);
		pointer("pointercancel", 11);
		runFrames();
		expect(hooks.toolGesture).toBeUndefined();
		expect(history).toEqual([]);
		expect(canvas.getData()).toEqual(before);
	});

	it("erases nothing for a palm that lands on a drawing before any pen, with the eraser armed", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(106_494);
		const { canvas, history, hooks, pointer, runFrames, screen } = fixture({ nodes: [INK], overrides: { ink: INK_STROKE }, settings: { ...DEFAULT_SETTINGS, fingerDrawing: true } });
		hooks.armTool("eraser");
		const before = canvas.getData();
		// The palm lands right on the line: the eraser has caught it.
		pointer("pointerdown", 20, "touch", screen({ x: 153.39, y: 123.39 }));
		expect([...hooks.erasing]).toEqual(["ink"]);
		now.mockReturnValue(106_518);
		pointer("pointercancel", 20);
		runFrames();
		expect([...hooks.erasing]).toEqual([]);
		expect(hooks.toolGesture).toBeUndefined();
		expect(history).toEqual([]);
		expect(canvas.getData()).toEqual(before);
	});

	it("keeps a pen stroke whole when a palm lands beside it and Android takes the palm back", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(72_000);
		const { canvas, history, hooks, pointer } = fixture({ nodes: [], settings: { ...DEFAULT_SETTINGS, penPressure: false } });
		hooks.armTool("pen");
		pointer("pointerdown", 8, "pen", { x: 100, y: 100 });
		pointer("pointermove", 8, "pen", { x: 140, y: 110 });
		// The hand comes down mid-stroke and is taken back 7 ms later.
		now.mockReturnValue(72_300);
		const palm = pointer("pointerdown", 11, "touch", { x: 600, y: 450 });
		expect(palm.defaultPrevented).toBe(false);
		now.mockReturnValue(72_307);
		pointer("pointercancel", 11);
		expect(hooks.toolGesture).toBeDefined();
		pointer("pointermove", 8, "pen", { x: 180, y: 140 });
		pointer("pointermove", 8, "pen", { x: 220, y: 150 });
		pointer("pointerup", 8, "pen", { x: 220, y: 150 });
		expect(hooks.toolGesture).toBeUndefined();
		// One drawing, reaching past where the palm landed, in one history step.
		expect(history).toHaveLength(1);
		const drawn = canvas.getData().nodes;
		expect(drawn).toHaveLength(1);
		expect(drawn[0].x + drawn[0].width).toBeGreaterThan(220 - 400 - 5);
	});

	it("keeps guarding a locked card from other fingers while a pen draws", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_000);
		const locked = { id: "locked", type: "text", text: "Locked", x: 0, y: 0, width: 200, height: 120 };
		const { canvas, nodes, hooks, pointer, root } = fixture({ nodes: [locked], overrides: { locked: { locked: true } } });
		const card = nodes.get("locked")!;
		// Native Canvas drags a card only after it has seen the press that picked it up.
		let pickedUp: unknown;
		root.addEventListener("pointerdown", (event) => { pickedUp = (event as unknown as { target: unknown }).target; });
		root.addEventListener("pointermove", () => { if (pickedUp === card.nodeEl) card.data.x += 50; });
		const emit = (type: string, pointerId: number, pointerType: string, target: unknown): Event => {
			const event = new Event(type, { cancelable: true });
			const fields = { pointerId, pointerType, target, button: 0, buttons: 1, clientX: 400, clientY: 300 };
			for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
			root.dispatchEvent(event);
			return event;
		};
		hooks.armTool("pen");
		// The pen's press on the card is the tool's alone: native Canvas never sees it.
		const pen = pointer("pointerdown", 8, "pen", { x: 400, y: 300 }, { target: card.nodeEl });
		expect(pen.cancelBubble).toBe(true);
		expect(hooks.toolGesture).toBeDefined();
		emit("pointermove", 8, "pen", card.nodeEl);
		// A finger pressing the locked card meanwhile is refused before native Canvas.
		expect(emit("pointerdown", 12, "touch", card.nodeEl).defaultPrevented).toBe(true);
		emit("pointermove", 12, "touch", card.nodeEl);
		expect(pickedUp).toBeUndefined();
		expect(card.data.x).toBe(0);
		expect(canvas.getData().nodes.find((node: Data) => node.id === "locked")?.x).toBe(0);
		pointer("pointercancel", 8, "pen");
	});

	it("listens to no hover of its own: Obsidian's hover text is the only one, and it ignores a pen", () => {
		// Obsidian shows hover text on pointerover only for a mouse that has
		// moved twice since the last touch (Obsidian 1.13), so the "mouse"
		// over-events an S Pen sends while it hovers show none; the board's own
		// code has no over- or enter-listener that would react to them.
		const heard = new Set<string>();
		fixture({
			beforeMount: ({ window, document, root }) => {
				for (const target of [window, document, root]) {
					const add = target.addEventListener.bind(target);
					vi.spyOn(target, "addEventListener").mockImplementation((type, listener, options) => {
						heard.add(type);
						add(type, listener, options);
					});
				}
			},
		});
		expect(heard.has("pointermove")).toBe(true);
		for (const hover of ["pointerover", "pointerenter", "mouseover", "mouseenter", "mousemove"]) {
			expect(heard.has(hover)).toBe(false);
		}
	});
});

describe("a pen held still at the end of a stroke", () => {
	/** The one drawing on the board and its stroke, as the board keeps it. */
	const drawing = (canvas: { getData(): Data }) => {
		const data = canvas.getData();
		const overrides = Object.values(data.miroCanvas?.localOverrides ?? {}) as Data[];
		const strokes = overrides.map((override) => override.item?.stroke).filter((stroke) => stroke !== undefined);
		return { nodes: data.nodes.length, strokes };
	};

	/** A wavy stroke from (100, 300) that stops at (260, 300). */
	const wavyStroke = (pointer: ReturnType<typeof fixture>["pointer"]): void => {
		pointer("pointerdown", 8, "pen", { x: 100, y: 300 });
		for (const [x, y] of [[140, 320], [180, 290], [220, 330], [260, 300]] as const) pointer("pointermove", 8, "pen", { x, y });
	};

	it("turns the stroke into one straight line from its start after half a second", () => {
		vi.useFakeTimers();
		const { canvas, history, hooks, pointer, preview } = fixture({ nodes: [], settings: { ...DEFAULT_SETTINGS, penPressure: false } });
		hooks.armTool("pen");
		wavyStroke(pointer);
		expect(preview()).toHaveLength(5);
		vi.advanceTimersByTime(300);
		// A pen held still trembles; a move within 4 px keeps the wait going.
		pointer("pointermove", 8, "pen", { x: 262, y: 302 });
		vi.advanceTimersByTime(150);
		expect(preview()).toHaveLength(6);
		vi.advanceTimersByTime(60);
		// From the first point to where the pen stopped, made level: it was nearly so.
		const [first, last] = preview().map((point) => point.split(",").map(Number));
		expect(preview()).toHaveLength(2);
		expect(first).toEqual([100, 300]);
		expect(last![1]).toBe(300);
		expect(last![0]).toBeCloseTo(100 + Math.hypot(162, 2), 3);
		pointer("pointerup", 8, "pen", { x: 262, y: 302 });
		// One drawing, straight, in one history step, as wide as any stroke drawn this hard.
		expect(history).toHaveLength(1);
		const { nodes, strokes } = drawing(canvas);
		expect(nodes).toBe(1);
		expect(strokes[0].points).toHaveLength(4);
		expect(strokes[0].width).toBe(5);
	});

	it("moves the line's far end with the pen once straight, and never goes back to freehand", () => {
		vi.useFakeTimers();
		const { canvas, hooks, pointer, preview } = fixture({ nodes: [], settings: { ...DEFAULT_SETTINGS, penPressure: false } });
		hooks.armTool("highlighter");
		wavyStroke(pointer);
		vi.advanceTimersByTime(520);
		expect(preview()).toHaveLength(2);
		pointer("pointermove", 8, "pen", { x: 300, y: 410 });
		expect(preview()).toEqual(["100,300", "300,410"]);
		pointer("pointermove", 8, "pen", { x: 330, y: 380 });
		expect(preview()).toEqual(["100,300", "330,380"]);
		pointer("pointerup", 8, "pen", { x: 330, y: 380 });
		expect(drawing(canvas).strokes[0].points).toHaveLength(4);
	});

	it("does nothing for a hold closer than 24 px to the start, and still straightens a later one", () => {
		vi.useFakeTimers();
		const { hooks, pointer, preview } = fixture({ nodes: [], settings: { ...DEFAULT_SETTINGS, penPressure: false } });
		hooks.armTool("pen");
		pointer("pointerdown", 8, "pen", { x: 100, y: 300 });
		pointer("pointermove", 8, "pen", { x: 108, y: 308 });
		pointer("pointermove", 8, "pen", { x: 114, y: 300 });
		vi.advanceTimersByTime(800);
		expect(preview()).toHaveLength(3);
		pointer("pointermove", 8, "pen", { x: 160, y: 330 });
		pointer("pointermove", 8, "pen", { x: 220, y: 310 });
		vi.advanceTimersByTime(520);
		expect(preview()).toEqual(["100,300", "220,310"]);
		pointer("pointerup", 8, "pen", { x: 220, y: 310 });
	});

	it("keeps drawing freehand while the pen keeps moving, however slowly", () => {
		vi.useFakeTimers();
		const { hooks, pointer, preview } = fixture({ nodes: [], settings: { ...DEFAULT_SETTINGS, penPressure: false } });
		hooks.armTool("pen");
		wavyStroke(pointer);
		for (let step = 1; step <= 10; step += 1) {
			vi.advanceTimersByTime(100);
			pointer("pointermove", 8, "pen", { x: 260 + step * 5, y: 300 + (step % 2) * 3 });
		}
		expect(preview().length).toBeGreaterThan(10);
		pointer("pointerup", 8, "pen", { x: 310, y: 300 });
	});

	it("leaves the stroke as drawn when the setting is off", () => {
		vi.useFakeTimers();
		const { canvas, hooks, pointer, preview } = fixture({ nodes: [], settings: { ...DEFAULT_SETTINGS, holdStraightLine: false, penPressure: false } });
		hooks.armTool("pen");
		wavyStroke(pointer);
		vi.advanceTimersByTime(1_000);
		expect(preview()).toHaveLength(5);
		pointer("pointerup", 8, "pen", { x: 260, y: 300 });
		expect(drawing(canvas).strokes[0].points.length).toBeGreaterThan(4);
	});

	it("leaves the smart pen, the erasers and the lasso alone", () => {
		vi.useFakeTimers();
		for (const tool of ["smart", "eraser", "erase-part", "lasso"]) {
			const { hooks, pointer, preview } = fixture({ nodes: [], settings: { ...DEFAULT_SETTINGS, penPressure: false } });
			hooks.armTool(tool);
			wavyStroke(pointer);
			vi.advanceTimersByTime(1_000);
			expect(preview()).toHaveLength(5);
			pointer("pointercancel", 8, "pen");
		}
	});

	it("leaves no wait running after the stroke, or after the board closes mid-stroke", () => {
		vi.useFakeTimers();
		const { window, hooks, pointer, session } = fixture({ nodes: [], toolBar: true });
		const wait = vi.spyOn(window, "setTimeout");
		const stop = vi.spyOn(window, "clearTimeout");
		/** The waits for a hold started so far: every wait of half a second. */
		const holds = () => wait.mock.calls.flatMap((call, index) => (call[1] === 500 ? [wait.mock.results[index]!.value] : []));
		hooks.armTool("pen");
		// Each move away from where the pen stopped starts the wait again.
		wavyStroke(pointer);
		const stroke = holds();
		expect(stroke.length).toBeGreaterThan(0);
		pointer("pointerup", 8, "pen", { x: 260, y: 300 });
		for (const handle of stroke) expect(stop).toHaveBeenCalledWith(handle);
		wavyStroke(pointer);
		const unfinished = holds().slice(stroke.length);
		expect(unfinished.length).toBeGreaterThan(0);
		session.dispose();
		for (const handle of unfinished) expect(stop).toHaveBeenCalledWith(handle);
		expect(hooks.toolGesture).toBeUndefined();
	});
});

describe("a finger or a pen on a selected card", () => {
	// Native Canvas on a touch screen drags a card only after a long press; a
	// move that starts at once pans the board with a finger and does nothing
	// with a pen.  Measured on the Galaxy Tab, in native Obsidian, in the main
	// build and in this one alike: the first tap selects the card, and the
	// next press that moves is called back by the browser (pointercancel)
	// three moves in, so the card is picked but never dragged.  The styles keep
	// the move on the page; the session carries it out.
	const CARD = { x: 500, y: 360 };

	/** A board whose first card is picked, as native Canvas marks a picked card. */
	const pickedCard = (options: FixtureOptions = {}) => {
		const board = fixture(options);
		const card = board.nodes.values().next().value!;
		card.nodeEl.classes.add("is-focused");
		const released: number[] = [];
		board.window.addEventListener("pointercancel", (event) => {
			released.push((event as unknown as { pointerId: number }).pointerId);
		});
		/** One pointer event on the card. */
		const onCard = (type: string, pointerId: number, pointerType: string, at: { x: number; y: number }, extra: Data = {}) =>
			board.pointer(type, pointerId, pointerType, at, { target: card.nodeEl, isPrimary: pointerType === "touch", ...extra });
		return { ...board, card, released, onCard };
	};

	it("drags the card a finger presses and moves, in one history step, without a pan from native Canvas", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { canvas, card, history, onCard, released, selected } = pickedCard();
		onCard("pointerdown", 21, "touch", CARD);
		// Native Canvas pans with a finger from its first move, before the card is taken up.
		onCard("pointermove", 21, "touch", { x: 500, y: 362 });
		canvas.setViewport(0, -2, 0);
		expect(released).toEqual([]);
		onCard("pointermove", 21, "touch", { x: 500, y: 368 });
		// Native Canvas is told the finger is no longer its own, and the board goes back to where the press found it.
		expect(released).toEqual([21]);
		expect([canvas.tx, canvas.ty]).toEqual([0, 0]);
		onCard("pointermove", 21, "touch", { x: 560, y: 400 });
		onCard("pointerup", 21, "touch", { x: 560, y: 400 });
		expect([card.data.x, card.data.y]).toEqual([60, 40]);
		expect(history).toHaveLength(1);
		expect(selected()).toEqual(["plan"]);
	});

	it("drags it for a pen as well, which reports itself as no primary pointer on the Galaxy Tab", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { card, history, onCard, released } = pickedCard();
		onCard("pointerdown", 22, "pen", CARD, { isPrimary: false });
		onCard("pointermove", 22, "pen", { x: 520, y: 380 }, { isPrimary: false });
		onCard("pointerup", 22, "pen", { x: 520, y: 380 }, { isPrimary: false });
		// Native Canvas keeps no hold on a pen: nothing to hand over.
		expect(released).toEqual([]);
		expect([card.data.x, card.data.y]).toEqual([20, 20]);
		expect(history).toHaveLength(1);
	});

	it("writes nothing for a tap, and nothing when the system takes the pointer back mid-drag", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { canvas, card, history, onCard, runFrames } = pickedCard();
		const before = canvas.getData();
		onCard("pointerdown", 23, "touch", CARD);
		onCard("pointermove", 23, "touch", { x: 502, y: 361 });
		onCard("pointerup", 23, "touch", { x: 502, y: 361 });
		expect(history).toEqual([]);
		onCard("pointerdown", 24, "touch", CARD);
		onCard("pointermove", 24, "touch", { x: 540, y: 400 });
		onCard("pointercancel", 24, "touch", { x: 540, y: 400 });
		runFrames();
		expect([card.data.x, card.data.y]).toEqual([0, 0]);
		expect(history).toEqual([]);
		expect(canvas.getData()).toEqual(before);
	});

	it("leaves a card that is not picked to native Canvas", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { card, history, onCard, released } = pickedCard();
		card.nodeEl.classes.delete("is-focused");
		onCard("pointerdown", 25, "touch", CARD);
		onCard("pointermove", 25, "touch", { x: 560, y: 400 });
		onCard("pointerup", 25, "touch", { x: 560, y: 400 });
		expect(released).toEqual([]);
		expect(card.data.x).toBe(0);
		expect(history).toEqual([]);
	});

	it("leaves a card being written in to its editor", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { card, history, onCard, released } = pickedCard();
		card.nodeEl.classes.add("is-editing");
		onCard("pointerdown", 26, "touch", CARD);
		onCard("pointermove", 26, "touch", { x: 560, y: 400 });
		onCard("pointerup", 26, "touch", { x: 560, y: 400 });
		expect(released).toEqual([]);
		expect(history).toEqual([]);
	});

	it("leaves a finger held as long as native Canvas's long press waits to native Canvas, which drags by itself", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { card, history, onCard, released } = pickedCard();
		onCard("pointerdown", 27, "touch", CARD);
		now.mockReturnValue(5_650);
		onCard("pointermove", 27, "touch", { x: 560, y: 400 });
		onCard("pointerup", 27, "touch", { x: 560, y: 400 });
		expect(released).toEqual([]);
		expect(card.data.x).toBe(0);
		expect(history).toEqual([]);
	});

	it("does not let go of native Canvas's hold on a finger for a press it does not carry out", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { canvas, card, history, nodes, onCard, released } = pickedCard();
		// The page still marks the card as picked, but native Canvas has another one selected.
		canvas.selectOnly(nodes.get("note")!);
		onCard("pointerdown", 35, "touch", CARD);
		onCard("pointermove", 35, "touch", { x: 560, y: 400 });
		onCard("pointerup", 35, "touch", { x: 560, y: 400 });
		expect(released).toEqual([]);
		expect(card.data.x).toBe(0);
		expect(history).toEqual([]);
	});

	it("leaves a second finger to native Canvas, which pinches with it", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { card, history, onCard, released } = pickedCard();
		onCard("pointerdown", 28, "touch", CARD, { isPrimary: true });
		onCard("pointerdown", 29, "touch", { x: 560, y: 360 }, { isPrimary: false });
		onCard("pointermove", 28, "touch", { x: 480, y: 360 });
		onCard("pointermove", 29, "touch", { x: 600, y: 360 }, { isPrimary: false });
		onCard("pointerup", 28, "touch", { x: 480, y: 360 });
		expect(released).toEqual([]);
		expect(card.data.x).toBe(0);
		expect(history).toEqual([]);
	});

	it("takes a touch for the hand that holds a pen near the board, which drags nothing", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { card, history, onCard, released } = pickedCard();
		onCard("pointermove", 7, "pen", { x: 560, y: 380 }, { buttons: 0, pressure: 0 });
		now.mockReturnValue(5_300);
		onCard("pointerdown", 30, "touch", CARD);
		onCard("pointermove", 30, "touch", { x: 560, y: 400 });
		onCard("pointerup", 30, "touch", { x: 560, y: 400 });
		expect(released).toEqual([]);
		expect(card.data.x).toBe(0);
		expect(history).toEqual([]);
	});

	it("moves nothing on a locked card, so that a finger pans there as it always did", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { card, canvas, history, onCard, released } = pickedCard({ overrides: { plan: { locked: true } } });
		onCard("pointerdown", 31, "touch", CARD);
		canvas.setViewport(0, -6, 0);
		onCard("pointermove", 31, "touch", { x: 560, y: 400 });
		onCard("pointerup", 31, "touch", { x: 560, y: 400 });
		expect(released).toEqual([]);
		expect(card.data.x).toBe(0);
		expect(canvas.ty).toBe(-6);
		expect(history).toEqual([]);
	});

	it("leaves a picked frame to native Canvas, which takes the cards it holds along", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { card, history, onCard, released } = pickedCard({ nodes: [{ id: "plan", type: "group", label: "Frame", x: 0, y: 0, width: 200, height: 120 }] });
		onCard("pointerdown", 32, "touch", CARD);
		onCard("pointermove", 32, "touch", { x: 560, y: 400 });
		onCard("pointerup", 32, "touch", { x: 560, y: 400 });
		expect(released).toEqual([]);
		expect(card.data.x).toBe(0);
		expect(history).toEqual([]);
	});

	it("does not take up a press on the board's own bars over a card, nor one with a drawing tool armed", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const { card, hooks, history, onCard, released, pointer } = pickedCard();
		const bar = new HostElement("miro-canvas-dock");
		card.nodeEl.appendChild(bar);
		pointer("pointerdown", 33, "touch", CARD, { target: bar });
		pointer("pointermove", 33, "touch", { x: 560, y: 400 }, { target: bar });
		pointer("pointerup", 33, "touch", { x: 560, y: 400 }, { target: bar });
		hooks.armTool("pen");
		onCard("pointerdown", 34, "pen", CARD);
		onCard("pointermove", 34, "pen", { x: 560, y: 400 });
		onCard("pointerup", 34, "pen", { x: 560, y: 400 });
		expect(released).toEqual([]);
		expect(card.data.x).toBe(0);
		expect(history).toHaveLength(1);
	});
});

describe("the lasso tool, armed", () => {
	// The lasso used to hand the board back to the select tool after every
	// catch, so a selection jumped off the lasso after the first thing done to
	// it.  Armed from the bar it stays armed - after the catch, after Delete -
	// until another tool is picked or Escape is pressed.  Beside it a press on
	// the selection works as with the select tool, and a press anywhere else is
	// a new lasso.
	const NOTE = { x: 900, y: 360 };
	const EMPTY = { x: 700, y: 560 };

	/** A board with the lasso armed; the first card, "plan", is selected, and "note" is to the right of it. */
	const lassoBoard = (options: FixtureOptions = {}) => {
		const board = fixture(options);
		board.hooks.armTool("lasso");
		return board;
	};

	/** A lasso drawn round a screen point with a mouse: down at one corner, round the other three, back to the first. */
	const lassoAround = (pointer: ReturnType<typeof fixture>["pointer"], centre: { x: number; y: number }, extra: Data = {}, pointerId = 61): void => {
		const corners = [[-70, -70], [70, -70], [70, 70], [-70, 70], [-70, -70]] as const;
		const at = ([dx, dy]: readonly [number, number]) => ({ x: centre.x + dx, y: centre.y + dy });
		pointer("pointerdown", pointerId, "mouse", at(corners[0]), extra);
		for (const corner of corners.slice(1)) pointer("pointermove", pointerId, "mouse", at(corner));
		pointer("pointerup", pointerId, "mouse", at(corners[0]));
	};

	/** The card "note", marked as native Canvas marks one that is selected. */
	const pickNote = (board: ReturnType<typeof fixture>) => {
		const note = board.nodes.get("note")!;
		note.nodeEl.classes.add("is-focused");
		return note;
	};

	it("stays armed after a catch, which selects what the ring went round", () => {
		const { hooks, pointer, selected, root } = lassoBoard();
		expect(selected()).toEqual(["plan"]);
		lassoAround(pointer, NOTE);
		expect(selected()).toEqual(["note"]);
		expect(hooks.armedTool).toBe("lasso");
		expect(root.getAttribute("data-miro-canvas-tool")).toBe("lasso");
	});

	it("gives the board the focus after a catch, so that Delete and the other keys reach it", () => {
		const { pointer, root } = lassoBoard();
		const focus = vi.fn();
		(root as unknown as { focus: unknown }).focus = focus;
		lassoAround(pointer, NOTE);
		expect(focus).toHaveBeenCalledWith({ preventScroll: true });
	});

	it("stays armed after what was caught is deleted, and goes round the next catch", () => {
		const { canvas, hooks, pointer, selected, session } = lassoBoard();
		lassoAround(pointer, NOTE);
		expect(selected()).toEqual(["note"]);
		// Native Canvas takes the catch away, as Delete does; nothing of the plugin's puts the tool away.
		const data = canvas.getData();
		canvas.importData({ ...data, nodes: data.nodes.filter((node: Data) => node.id !== "note") });
		canvas.deselectAll();
		session.refresh();
		expect(hooks.armedTool).toBe("lasso");
		lassoAround(pointer, { x: 500, y: 360 }, {}, 62);
		expect(selected()).toEqual(["plan"]);
		expect(hooks.armedTool).toBe("lasso");
	});

	it("goes back to select on Escape, as every other tool does", () => {
		const { hooks, pointer, session } = lassoBoard();
		lassoAround(pointer, NOTE);
		session.resetTools();
		expect(hooks.armedTool).toBe("select");
	});

	it("leaves a press on the selected card alone: no new lasso, nothing taken from native Canvas", () => {
		const board = lassoBoard();
		const note = pickNote(board);
		board.canvas.selectOnly(note);
		const press = board.pointer("pointerdown", 63, "mouse", NOTE, { target: note.nodeEl });
		expect(board.hooks.toolGesture).toBeUndefined();
		expect(press.defaultPrevented).toBe(false);
		expect(press.cancelBubble).toBe(false);
		expect(board.hooks.armedTool).toBe("lasso");
		expect(board.selected()).toEqual(["note"]);
	});

	it("starts a new lasso with a press anywhere else, selected card or no", () => {
		const board = lassoBoard();
		pickNote(board);
		const press = board.pointer("pointerdown", 64, "mouse", EMPTY);
		expect(board.hooks.toolGesture).toBeDefined();
		expect(press.defaultPrevented).toBe(true);
		board.pointer("pointercancel", 64, "mouse", EMPTY);
		// A card that is not selected is not the selection's: a press on it is a lasso too.
		const plan = board.nodes.get("plan")!;
		const onPlan = board.pointer("pointerdown", 65, "mouse", { x: 500, y: 360 }, { target: plan.nodeEl });
		expect(board.hooks.toolGesture).toBeDefined();
		expect(onPlan.defaultPrevented).toBe(true);
		board.pointer("pointercancel", 65, "mouse", { x: 500, y: 360 });
	});

	it("leaves a press on the shared frame, or on native Canvas's selection box, to the selection", () => {
		const board = lassoBoard();
		for (const [index, name] of ["miro-canvas-mixed-selection-frame", "canvas-selection"].entries()) {
			const frame = new HostElement(name);
			board.root.appendChild(frame);
			const press = board.pointer("pointerdown", 66 + index, "mouse", NOTE, { target: frame });
			expect(board.hooks.toolGesture).toBeUndefined();
			expect(press.defaultPrevented).toBe(false);
		}
	});

	/** The catch, picked: a lasso round "note", then one press on it as a pen or a finger makes, moved by (dx, dy). */
	const dragCatch = (pointerType: "pen" | "touch", pointerId: number, dx: number, dy: number) => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const board = lassoBoard();
		lassoAround(board.pointer, NOTE);
		const note = pickNote(board);
		const onNote = (type: string, at: { x: number; y: number }) =>
			board.pointer(type, pointerId, pointerType, at, { target: note.nodeEl, isPrimary: pointerType === "touch" });
		onNote("pointerdown", NOTE);
		onNote("pointermove", { x: NOTE.x + dx / 2, y: NOTE.y + dy / 2 });
		onNote("pointermove", { x: NOTE.x + dx, y: NOTE.y + dy });
		onNote("pointerup", { x: NOTE.x + dx, y: NOTE.y + dy });
		return { ...board, note };
	};

	it("moves the catch with a pen, in one history step, as with the select tool", () => {
		const { note, history, hooks } = dragCatch("pen", 68, 40, 20);
		expect([note.data.x, note.data.y]).toEqual([440, 20]);
		expect(history).toHaveLength(1);
		expect(hooks.armedTool).toBe("lasso");
		expect(hooks.toolGesture).toBeUndefined();
	});

	it("moves the catch with a finger, in one history step, as with the select tool", () => {
		const { note, history, hooks } = dragCatch("touch", 69, 60, 40);
		expect([note.data.x, note.data.y]).toEqual([460, 40]);
		expect(history).toHaveLength(1);
		expect(hooks.armedTool).toBe("lasso");
	});

	it("takes the catch for the selection, and a lasso made with Shift held adds to it", () => {
		const { hooks, pointer, selected } = lassoBoard();
		expect(selected()).toEqual(["plan"]);
		lassoAround(pointer, NOTE, { shiftKey: true });
		expect(selected().sort()).toEqual(["note", "plan"]);
		expect(hooks.armedTool).toBe("lasso");
		// Without it the ring replaces what was selected.
		lassoAround(pointer, NOTE, {}, 62);
		expect(selected()).toEqual(["note"]);
	});

	it("still hands the board back to select after a lasso the select tool's own binding began", () => {
		const { hooks, pointer, selected } = fixture();
		expect(hooks.armedTool).toBe("select");
		lassoAround(pointer, NOTE, { altKey: true });
		expect(selected()).toEqual(["note"]);
		expect(hooks.armedTool).toBe("select");
	});

	it("is not dropped by picking the lasso again, and gives way to the tool picked after it", () => {
		const { hooks } = lassoBoard();
		hooks.armTool("lasso");
		expect(hooks.armedTool).toBe("lasso");
		hooks.armTool("pen");
		expect(hooks.armedTool).toBe("pen");
	});
});
