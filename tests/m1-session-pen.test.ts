import { afterEach, describe, expect, it, vi } from "vitest";

import { M1CanvasSession } from "../src/m1-session";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";
import { DEFAULT_SETTINGS, type MiroCanvasSettings } from "../src/settings";
import { StylusWatch } from "../src/stylus";
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
		getData() { return { ...clone(this.data), nodes: [...nodes.values()].map((node) => node.getData()) }; },
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
		const toolBar = { element: new HostElement("miro-canvas-toolbar miro-canvas-tools"), update() {}, dispose() {}, placeNativeButton() {} };
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
	return { window, canvas, root, board, nodes, history, session, hooks, pointer, runFrames, nativeTakesTouch, selected, screen };
}

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
		const { canvas, history, hooks, pointer, runFrames } = fixture();
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
		const { canvas, history, hooks, pointer, runFrames, screen } = fixture({ nodes: [INK], overrides: { ink: INK_STROKE } });
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
		const { canvas, history, hooks, pointer } = fixture({ nodes: [] });
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
