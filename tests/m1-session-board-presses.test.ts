import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { M1CanvasSession } from "../src/m1-session";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";
import { replayNativeDrag } from "../src/native-drag";
import { StylusWatch } from "../src/stylus";
import type { M1ControlsActions } from "../src/m1-controls";

// Only the presentation and the replay of native Canvas's drag are replaced;
// the adapter, the viewport, the policy and the writer are the real ones.
vi.mock("../src/m1-controls", () => ({
	M1Controls: class {
		element = new HostElement("miro-canvas-dock");
		minimapElement = new HostElement();
		constructor(public actions: M1ControlsActions) {}
		update() {}
		dispose() { this.element.remove(); this.minimapElement.remove(); }
	},
}));
vi.mock("../src/native-drag", () => ({ replayNativeDrag: vi.fn(() => true) }));

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
	focus() {
		const document = this.ownerDocument as { activeElement?: unknown } | undefined;
		if (document !== undefined) document.activeElement = this;
	}
	blur() {
		const document = this.ownerDocument as { activeElement?: unknown; body?: unknown } | undefined;
		if (document?.activeElement === this) document.activeElement = document.body;
	}
	/** One simple selector: a tag (`button`), classes (`.a.b`) or an attribute (`[contenteditable=true]`). */
	private matches(part: string): boolean {
		if (part.startsWith(".")) {
			const own = this.className.split(" ");
			return part.slice(1).split(".").every((name) => own.includes(name));
		}
		const attribute = /^\[([\w-]+)=([^\]]*)\]$/u.exec(part);
		if (attribute !== null) return this.attributes.get(attribute[1]!) === attribute[2];
		return part.toUpperCase() === this.tagName;
	}
	closest(selector: string): HostElement | null {
		for (const part of selector.split(",").map((value) => value.trim())) {
			if (this.matches(part)) return this;
		}
		return this.parentElement?.closest(selector) ?? null;
	}
}

type Data = Record<string, any>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const sessions: M1CanvasSession[] = [];

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(100_000);
	vi.mocked(replayNativeDrag).mockClear();
});
afterEach(() => {
	sessions.splice(0).forEach((session) => session.dispose());
	vi.restoreAllMocks();
	vi.useRealTimers();
});

/** The parts of the session these gestures reach, which the tests drive directly. */
interface Hooks {
	armTool(tool: string): void;
	armNative(button: unknown): void;
	resetTools(): void;
	startToolGesture(event: Event): void;
	handleToolKey(event: Event): void;
	armedTool: string;
	armedNative: unknown;
	toolGesture: unknown;
	linePlacing: unknown;
	lineFinishedAt: number;
	swallowClickUntil: number;
	stylus: StylusWatch;
}

/** A board with two cards, the first one picked, in a window whose timers the test runs. */
function fixture() {
	const window = Object.assign(new EventTarget(), {
		setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
		clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
		setInterval: () => 0,
		clearInterval: () => undefined,
		requestAnimationFrame: () => 0,
		cancelAnimationFrame: () => undefined,
	});
	const element = (tagName: string): HostElement => {
		const created = new HostElement("", tagName.toUpperCase());
		created.ownerDocument = document;
		return created;
	};
	const document = Object.assign(new EventTarget(), {
		body: new HostElement("", "BODY"),
		activeElement: null as unknown,
		defaultView: window,
		createElement: (tagName: string) => element(tagName),
		createElementNS: (_namespace: string, tagName: string) => element(tagName),
	});
	const root = new HostElement("canvas-wrapper");
	const initial: Data = {
		nodes: [
			{ id: "plan", type: "text", text: "Plan", x: 0, y: 0, width: 200, height: 120 },
			{ id: "note", type: "text", text: "Note", x: 400, y: 0, width: 200, height: 120 },
		],
		edges: [],
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
	const canvas = {
		wrapperEl: root, nodes, edges: new Map(), selection,
		data: clone(initial), readonly: false,
		tx: 0, ty: 0, tZoom: 0,
		getData() { return { ...clone(this.data), nodes: [...nodes.values()].map((node) => node.getData()) }; },
		setViewport() {},
		requestRender() {},
		setReadonly(value: boolean) { this.readonly = value; },
		selectOnly(node: NativeNode) { selection.clear(); selection.add(node); },
		select(node: NativeNode) { selection.add(node); },
		deselectAll() { selection.clear(); },
		requestSave() {},
		importData(data: Data) {
			this.data = clone({ ...data, nodes: [] });
			for (const item of data.nodes) {
				const existing = nodes.get(item.id);
				if (existing !== undefined) existing.setData(item);
				else nodes.set(item.id, new NativeNode(clone(item)));
			}
		},
	};
	canvas.importData(clone(initial));
	const view = { canvas };
	const store = createObsidianMetadataStore(view).store;
	const session = new M1CanvasSession(view, new MetadataWriter(store!), {});
	sessions.push(session);
	root.ownerDocument = document;
	expect(session.mount()).toBe(true);
	canvas.selectOnly(nodes.values().next().value!);
	const hooks = session as unknown as Hooks;
	// Each test starts on a device that has not shown a pen yet.
	hooks.stylus = new StylusWatch({ seen: false });
	const cardEl = nodes.get("plan")!.nodeEl;
	const selected = () => [...selection].map((node) => node.id);
	/** An event the page sends, with the target and the fields a browser gives it. */
	const make = (type: string, target: unknown, fields: Data = {}): Event => {
		const event = new Event(type, { cancelable: true, bubbles: true });
		for (const [key, value] of Object.entries({ target, ...fields })) Object.defineProperty(event, key, { value });
		return event;
	};
	/** A pointer event on the window, as the page's own first listener sees it. */
	const pointer = (type: string, id: number, kind: string, target: unknown, at = { x: 500, y: 400 }, fields: Data = {}): Event => {
		const event = make(type, target, {
			pointerId: id, pointerType: kind, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: at.x, clientY: at.y, shiftKey: false, ...fields,
		});
		window.dispatchEvent(event);
		return event;
	};
	/** One tap: down, `held` ms, up. */
	const tap = (id: number, kind: string, target: unknown, at = { x: 500, y: 400 }, held = 40): void => {
		pointer("pointerdown", id, kind, target, at);
		vi.advanceTimersByTime(held);
		pointer("pointerup", id, kind, target, at);
	};
	/** A control of the plugin's in its bar on the board: a button, by default, or a slider or a field. */
	const barControl = (tagName = "BUTTON", type?: string): HostElement => {
		let bar = root.children.find((child) => child.className === "miro-canvas-toolbar");
		if (bar === undefined) {
			bar = root.appendChild(new HostElement("miro-canvas-toolbar"));
			bar.ownerDocument = document;
		}
		const control = bar.appendChild(new HostElement("", tagName));
		control.ownerDocument = document;
		if (type !== undefined) control.setAttribute("type", type);
		return control;
	};
	/** The pen hovers over the board, as a tablet reports it every few milliseconds. */
	const hoverPen = (): Event => pointer("pointermove", 9, "pen", root, { x: 700, y: 300 }, { buttons: 0 });
	return { window, document, root, canvas, nodes, session, hooks, cardEl, selected, make, pointer, tap, barControl, hoverPen };
}

describe("a double click on the board", () => {
	it("is Escape on the empty board: it puts the tool and the selection away, and native Canvas makes no card", () => {
		const { root, hooks, selected, make } = fixture();
		const native = vi.fn();
		root.addEventListener("dblclick", native);
		hooks.armTool("lasso");
		expect(selected()).toEqual(["plan"]);
		const event = make("dblclick", root);
		root.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(native).not.toHaveBeenCalled();
		expect(hooks.armedTool).toBe("select");
		expect(selected()).toEqual([]);
	});

	it("is Escape in review mode too, which refuses to make anything but never to put its tool away", () => {
		const { root, session, hooks, make } = fixture();
		session.toggleReviewMode();
		const native = vi.fn();
		root.addEventListener("dblclick", native);
		const event = make("dblclick", root);
		root.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(native).not.toHaveBeenCalled();
		expect(hooks.armedTool).toBe("select");
	});

	it("is Escape with a drawing tool armed wherever it lands: a pen's first dot lies under its second click", () => {
		const { root, hooks, cardEl, make } = fixture();
		const native = vi.fn();
		root.addEventListener("dblclick", native);
		hooks.armTool("pen");
		const event = make("dblclick", cardEl);
		root.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(native).not.toHaveBeenCalled();
		expect(hooks.armedTool).toBe("select");
	});

	it("still opens a card for writing: native Canvas gets the double click on a card, and the pick stays", () => {
		const { root, hooks, cardEl, selected, make } = fixture();
		const native = vi.fn();
		root.addEventListener("dblclick", native);
		const event = make("dblclick", cardEl);
		root.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(native).toHaveBeenCalledOnce();
		expect(hooks.armedTool).toBe("select");
		expect(selected()).toEqual(["plan"]);
	});

	it("leaves the double click that finishes a polyline or a spline to that line, and is Escape again half a second later", () => {
		const { root, hooks, make } = fixture();
		hooks.armTool("connector");
		hooks.lineFinishedAt = Date.now();
		const finishing = make("dblclick", root);
		root.dispatchEvent(finishing);
		expect(hooks.armedTool).toBe("connector");
		vi.advanceTimersByTime(600);
		const later = make("dblclick", root);
		root.dispatchEvent(later);
		expect(later.defaultPrevented).toBe(true);
		expect(hooks.armedTool).toBe("select");
	});
});

describe("a double tap of a finger or a pen", () => {
	it("is Escape on the empty board once the second tap is over, though the browser sends no double click for it", () => {
		const { root, hooks, selected, tap } = fixture();
		hooks.armTool("lasso");
		tap(1, "touch", root);
		vi.advanceTimersByTime(100);
		tap(2, "touch", root);
		// Not before the board has finished with the second tap.
		expect(hooks.armedTool).toBe("lasso");
		vi.advanceTimersByTime(1);
		expect(hooks.armedTool).toBe("select");
		expect(selected()).toEqual([]);
	});

	it("is the same for a pen", () => {
		const { root, hooks, tap } = fixture();
		hooks.armTool("lasso");
		tap(7, "pen", root);
		vi.advanceTimersByTime(100);
		tap(7, "pen", root);
		vi.advanceTimersByTime(1);
		expect(hooks.armedTool).toBe("select");
	});

	it("is Escape with a drawing tool armed, though its first dot lies under the second tap", () => {
		const { hooks, cardEl, tap } = fixture();
		hooks.armTool("pen");
		tap(7, "pen", cardEl);
		vi.advanceTimersByTime(100);
		tap(7, "pen", cardEl);
		vi.advanceTimersByTime(1);
		expect(hooks.armedTool).toBe("select");
	});

	it("is no Escape on a card, where a double tap opens it", () => {
		const { hooks, cardEl, selected, tap } = fixture();
		hooks.armTool("lasso");
		tap(1, "touch", cardEl);
		vi.advanceTimersByTime(100);
		tap(2, "touch", cardEl);
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("lasso");
		expect(selected()).toEqual(["plan"]);
	});

	it("is no Escape for two taps far apart, or slow, or for a mouse, whose double click is its own", () => {
		const { root, hooks, tap } = fixture();
		hooks.armTool("lasso");
		tap(1, "touch", root, { x: 100, y: 100 });
		vi.advanceTimersByTime(100);
		tap(2, "touch", root, { x: 400, y: 100 });
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("lasso");
		tap(3, "touch", root);
		vi.advanceTimersByTime(600);
		tap(4, "touch", root);
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("lasso");
		tap(1, "mouse", root);
		vi.advanceTimersByTime(100);
		tap(1, "mouse", root);
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("lasso");
	});

	it("does not take the double tap that finishes a polyline for an Escape", () => {
		const { root, hooks, tap } = fixture();
		hooks.armTool("connector");
		tap(1, "touch", root);
		// The line is being placed: its next tap, close to the last, finishes it.
		hooks.linePlacing = { finish() {}, place() {}, points: [], spec: {} };
		vi.advanceTimersByTime(100);
		tap(2, "touch", root);
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("connector");
	});

	it("takes a second finger down with the first for a pinch, not a pair of taps", () => {
		const { root, hooks, pointer } = fixture();
		hooks.armTool("lasso");
		pointer("pointerdown", 1, "touch", root, { x: 500, y: 400 });
		pointer("pointerdown", 2, "touch", root, { x: 520, y: 400 });
		vi.advanceTimersByTime(50);
		pointer("pointerup", 1, "touch", root, { x: 500, y: 400 });
		pointer("pointerup", 2, "touch", root, { x: 520, y: 400 });
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("lasso");
	});

	it("does nothing for a tap on a panel of the board", () => {
		const { root, hooks, tap } = fixture();
		const dock = root.appendChild(new HostElement("miro-canvas-dock"));
		hooks.armTool("lasso");
		tap(1, "touch", dock);
		vi.advanceTimersByTime(100);
		tap(2, "touch", dock);
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("lasso");
	});
});

describe("a native Canvas button armed on the bar", () => {
	const button = { dataset: "the card button" };
	const BOARD = { x: 500, y: 400 };

	it("arms as a tool of its own, and the tool bar's armed state follows", () => {
		const { hooks } = fixture();
		hooks.armNative(button);
		expect(hooks.armedTool).toBe("native");
		expect(hooks.armedNative).toBe(button);
		// Another tool takes over, and the button is let go.
		hooks.armTool("text");
		expect(hooks.armedTool).toBe("text");
		expect(hooks.armedNative).toBeUndefined();
	});

	it("places its item where the board was pressed, once the click that ends the press has come", () => {
		const { window, root, hooks, pointer, make } = fixture();
		hooks.armNative(button);
		const down = make("pointerdown", root, { pointerId: 1, pointerType: "mouse", button: 0, clientX: BOARD.x, clientY: BOARD.y, shiftKey: false });
		hooks.startToolGesture(down);
		// The press is the tool's alone: native Canvas never starts a selection under it.
		expect(down.defaultPrevented).toBe(true);
		expect(hooks.toolGesture).toBeDefined();
		pointer("pointerup", 1, "mouse", root, BOARD);
		expect(replayNativeDrag).not.toHaveBeenCalled();
		window.dispatchEvent(make("click", root, { clientX: BOARD.x, clientY: BOARD.y }));
		expect(replayNativeDrag).toHaveBeenCalledOnce();
		expect(vi.mocked(replayNativeDrag).mock.calls[0]!.slice(0, 2)).toEqual([button, BOARD]);
		// Used once: Select is armed again, and the click that ended the press is kept from the board.
		expect(hooks.armedTool).toBe("select");
		expect(hooks.armedNative).toBeUndefined();
		expect(hooks.toolGesture).toBeUndefined();
		expect(hooks.swallowClickUntil).toBeGreaterThan(Date.now());
		// The next press is a press on the board as any.
		const next = make("pointerdown", root, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 100, clientY: 100, shiftKey: false });
		hooks.startToolGesture(next);
		expect(hooks.toolGesture).toBeUndefined();
		window.dispatchEvent(make("click", root));
		expect(replayNativeDrag).toHaveBeenCalledOnce();
	});

	it("tells its own pointer events from a person's, which its other listeners must not take for a finger", () => {
		const { window, root, hooks, pointer, make } = fixture();
		hooks.armNative(button);
		hooks.startToolGesture(make("pointerdown", root, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 1, clientY: 2, shiftKey: false }));
		pointer("pointerup", 1, "mouse", root, BOARD);
		window.dispatchEvent(make("click", root));
		const mark = vi.mocked(replayNativeDrag).mock.calls[0]![2]!;
		expect(typeof mark).toBe("function");
		expect(() => mark(new Event("pointerdown"))).not.toThrow();
	});

	it("places it without the click when none comes, a moment after the press ended", () => {
		const { root, hooks, pointer, make } = fixture();
		hooks.armNative(button);
		hooks.startToolGesture(make("pointerdown", root, { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: BOARD.x, clientY: BOARD.y, shiftKey: false }));
		pointer("pointerup", 1, "touch", root, BOARD);
		vi.advanceTimersByTime(349);
		expect(replayNativeDrag).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(replayNativeDrag).toHaveBeenCalledOnce();
		expect(hooks.armedTool).toBe("select");
	});

	it("keeps the button armed when the press is taken back, as Android takes back a palm", () => {
		const { root, hooks, pointer, make } = fixture();
		hooks.armNative(button);
		hooks.startToolGesture(make("pointerdown", root, { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: BOARD.x, clientY: BOARD.y, shiftKey: false }));
		pointer("pointercancel", 1, "touch", root, BOARD);
		vi.advanceTimersByTime(1_000);
		expect(replayNativeDrag).not.toHaveBeenCalled();
		expect(hooks.armedTool).toBe("native");
		expect(hooks.toolGesture).toBeUndefined();
	});

	it("is put away by Escape, and nothing is placed by the press that follows", () => {
		const { window, root, hooks, pointer, make } = fixture();
		hooks.armNative(button);
		hooks.startToolGesture(make("pointerdown", root, { pointerId: 1, pointerType: "mouse", button: 0, clientX: BOARD.x, clientY: BOARD.y, shiftKey: false }));
		pointer("pointerup", 1, "mouse", root, BOARD);
		// Escape comes between the release and its click.
		hooks.resetTools();
		window.dispatchEvent(make("click", root));
		vi.advanceTimersByTime(1_000);
		expect(replayNativeDrag).not.toHaveBeenCalled();
		const later = make("pointerdown", root, { pointerId: 2, pointerType: "mouse", button: 0, clientX: BOARD.x, clientY: BOARD.y, shiftKey: false });
		hooks.startToolGesture(later);
		expect(later.defaultPrevented).toBe(false);
	});

	it("takes only a press of the main button on the board, never one on a panel or from a hand beside a pen", () => {
		const { root, hooks, make } = fixture();
		hooks.armNative(button);
		const right = make("pointerdown", root, { pointerId: 1, pointerType: "mouse", button: 2, clientX: BOARD.x, clientY: BOARD.y, shiftKey: false });
		hooks.startToolGesture(right);
		expect(right.defaultPrevented).toBe(false);
		const dock = root.appendChild(new HostElement("miro-canvas-dock"));
		const onPanel = make("pointerdown", dock, { pointerId: 1, pointerType: "mouse", button: 0, clientX: BOARD.x, clientY: BOARD.y, shiftKey: false });
		hooks.startToolGesture(onPanel);
		expect(onPanel.defaultPrevented).toBe(false);
		// A pen was near a moment ago: the touch is the hand that holds it.
		hooks.stylus.notePen(Date.now());
		const palm = make("pointerdown", root, { pointerId: 3, pointerType: "touch", isPrimary: true, button: 0, clientX: BOARD.x, clientY: BOARD.y, shiftKey: false });
		hooks.startToolGesture(palm);
		expect(palm.defaultPrevented).toBe(false);
		expect(hooks.toolGesture).toBeUndefined();
		expect(hooks.armedTool).toBe("native");
	});

	it("refuses in review mode, and on a board locked in Canvas's own quick settings", () => {
		const { canvas, session, hooks } = fixture();
		session.toggleReviewMode();
		hooks.armNative(button);
		expect(hooks.armedTool).toBe("select");
		expect(hooks.armedNative).toBeUndefined();
		session.toggleReviewMode();
		canvas.readonly = true;
		hooks.armNative(button);
		expect(hooks.armedTool).toBe("select");
	});

	it("places nothing when review mode came on after it was armed", () => {
		const { window, root, session, hooks, pointer, make } = fixture();
		hooks.armNative(button);
		hooks.startToolGesture(make("pointerdown", root, { pointerId: 1, pointerType: "mouse", button: 0, clientX: BOARD.x, clientY: BOARD.y, shiftKey: false }));
		pointer("pointerup", 1, "mouse", root, BOARD);
		// A review of the board begins between the release and the click.
		session.toggleReviewMode();
		window.dispatchEvent(make("click", root));
		vi.advanceTimersByTime(1_000);
		expect(replayNativeDrag).not.toHaveBeenCalled();
		expect(hooks.armedTool).toBe("select");
	});
});

describe("a hand beside the pen", () => {
	it("makes no double tap: two touches that land while the pen is near are no pair, though they lift as a finger does", () => {
		const { root, hooks, tap, hoverPen } = fixture();
		hooks.armTool("lasso");
		hoverPen();
		tap(1, "touch", root);
		vi.advanceTimersByTime(100);
		tap(2, "touch", root);
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("lasso");
	});

	it("makes no Escape of the double click the browser sends for them, and no card either", () => {
		const { root, hooks, selected, tap, make, hoverPen } = fixture();
		const native = vi.fn();
		root.addEventListener("dblclick", native);
		hooks.armTool("lasso");
		hoverPen();
		tap(1, "touch", root);
		vi.advanceTimersByTime(100);
		tap(2, "touch", root);
		const event = make("dblclick", root);
		root.dispatchEvent(event);
		vi.advanceTimersByTime(10);
		// Nothing is put away, and native Canvas, which would make a card there, never hears of it.
		expect(hooks.armedTool).toBe("lasso");
		expect(selected()).toEqual(["plan"]);
		expect(event.defaultPrevented).toBe(true);
		expect(native).not.toHaveBeenCalled();
	});

	it("is no pair when only the second touch came down beside the pen, and breaks the pair a finger began", () => {
		const { root, hooks, tap, make, hoverPen } = fixture();
		hooks.armTool("lasso");
		tap(1, "touch", root);
		vi.advanceTimersByTime(100);
		hoverPen();
		tap(2, "touch", root);
		root.dispatchEvent(make("dblclick", root));
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("lasso");
		// The next tap is the first of a pair of its own; the pen is still near.
		tap(3, "touch", root);
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("lasso");
	});

	it("spoils nothing once the pen has been away: the next double tap, and double click, are Escape again", () => {
		const { root, hooks, tap, make, hoverPen } = fixture();
		hooks.armTool("lasso");
		hoverPen();
		tap(1, "touch", root);
		// The pen is out of reach for more than a second and a half.
		vi.advanceTimersByTime(2_000);
		tap(2, "touch", root);
		vi.advanceTimersByTime(100);
		tap(3, "touch", root);
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("select");
		hooks.armTool("lasso");
		hoverPen();
		tap(4, "touch", root);
		// A double click a second after a hand's press is not that hand's.
		vi.advanceTimersByTime(1_100);
		root.dispatchEvent(make("dblclick", root));
		expect(hooks.armedTool).toBe("select");
	});

	it("leaves a pen's own double tap and double click, and a mouse's while the pen hovers, as Escape", () => {
		const { root, hooks, tap, make, hoverPen } = fixture();
		hooks.armTool("lasso");
		tap(7, "pen", root);
		vi.advanceTimersByTime(100);
		tap(7, "pen", root);
		root.dispatchEvent(make("dblclick", root));
		expect(hooks.armedTool).toBe("select");
		vi.advanceTimersByTime(1_000);
		// A mouse beside a hovering pen is no hand.
		hooks.armTool("lasso");
		hoverPen();
		tap(1, "mouse", root);
		vi.advanceTimersByTime(100);
		tap(1, "mouse", root);
		root.dispatchEvent(make("dblclick", root));
		expect(hooks.armedTool).toBe("select");
	});

	it("leaves a finger's double tap alone on a device that has a pen, while the pen is away, with a drawing tool armed too", () => {
		const { root, hooks, tap } = fixture();
		hooks.stylus = new StylusWatch({ seen: true });
		hooks.armTool("lasso");
		tap(1, "touch", root);
		vi.advanceTimersByTime(100);
		tap(2, "touch", root);
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("select");
		hooks.armTool("pen");
		tap(3, "touch", root);
		vi.advanceTimersByTime(100);
		tap(4, "touch", root);
		vi.advanceTimersByTime(10);
		expect(hooks.armedTool).toBe("select");
	});
});

describe("one Escape for each double tap", () => {
	it("is done once when the WebView sends the double click as well: the double click first, then the pair of taps", () => {
		const { root, session, hooks, tap, make } = fixture();
		const reset = vi.spyOn(session, "resetTools");
		hooks.armTool("lasso");
		tap(1, "touch", root);
		vi.advanceTimersByTime(100);
		tap(2, "touch", root);
		const event = make("dblclick", root);
		root.dispatchEvent(event);
		expect(reset).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
		// The pair's own Escape, a moment later, finds it done.
		vi.advanceTimersByTime(10);
		expect(reset).toHaveBeenCalledTimes(1);
		expect(hooks.armedTool).toBe("select");
	});

	it("is done once the other way round too, and the double click that follows still opens nothing", () => {
		const { root, session, hooks, cardEl, tap, make } = fixture();
		const reset = vi.spyOn(session, "resetTools");
		const native = vi.fn();
		root.addEventListener("dblclick", native);
		// A drawing tool takes the card under the taps for board: the pair puts the tool away first.
		hooks.armTool("pen");
		tap(1, "touch", cardEl);
		vi.advanceTimersByTime(100);
		tap(2, "touch", cardEl);
		vi.advanceTimersByTime(1);
		expect(reset).toHaveBeenCalledTimes(1);
		expect(hooks.armedTool).toBe("select");
		const event = make("dblclick", cardEl);
		root.dispatchEvent(event);
		expect(reset).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
		expect(native).not.toHaveBeenCalled();
	});

	it("is done once for a mouse, whose double click is alone, and again for the next double click, however soon", () => {
		const { root, session, hooks, make } = fixture();
		const reset = vi.spyOn(session, "resetTools");
		root.dispatchEvent(make("dblclick", root));
		expect(reset).toHaveBeenCalledTimes(1);
		hooks.armTool("lasso");
		root.dispatchEvent(make("dblclick", root));
		expect(reset).toHaveBeenCalledTimes(2);
		expect(hooks.armedTool).toBe("select");
	});

	it("is done again for the next double tap, once the first one is over", () => {
		const { root, session, hooks, tap, make } = fixture();
		const reset = vi.spyOn(session, "resetTools");
		for (const first of [1, 3]) {
			hooks.armTool("lasso");
			tap(first, "touch", root);
			vi.advanceTimersByTime(100);
			tap(first + 1, "touch", root);
			root.dispatchEvent(make("dblclick", root));
			vi.advanceTimersByTime(10);
			// Past the moment in which the same double tap is seen a second time.
			vi.advanceTimersByTime(300);
		}
		expect(reset).toHaveBeenCalledTimes(2);
	});

	it("does not hold back a card's double click because an Escape came a while ago", () => {
		const { root, cardEl, make } = fixture();
		root.dispatchEvent(make("dblclick", root));
		vi.advanceTimersByTime(400);
		const native = vi.fn();
		root.addEventListener("dblclick", native);
		const event = make("dblclick", cardEl);
		root.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(native).toHaveBeenCalledOnce();
	});
});

describe("a press on the board while a control of the plugin has the focus", () => {
	it("takes the focus off the control and gives it to the board, so native Canvas sees no focused button", () => {
		const { document, root, pointer, barControl } = fixture();
		const button = barControl();
		button.focus();
		expect(document.activeElement).toBe(button);
		pointer("pointerdown", 1, "touch", root);
		expect(document.activeElement).toBe(root);
	});

	it("does so for a press on a card, and for a mouse and a pen as for a finger", () => {
		const { document, root, cardEl, pointer, barControl } = fixture();
		const button = barControl();
		for (const kind of ["touch", "mouse", "pen"]) {
			button.focus();
			pointer("pointerdown", 1, kind, cardEl);
			expect(document.activeElement, kind).toBe(root);
		}
	});

	it("lets go of a slider or a swatch as of a button, and of a role that is a button", () => {
		const { document, root, pointer, barControl } = fixture();
		for (const control of [barControl("INPUT", "range"), barControl("INPUT", "color"), barControl("DIV")]) {
			if (control.tagName === "DIV") control.setAttribute("role", "button");
			control.focus();
			pointer("pointerdown", 1, "touch", root);
			expect(document.activeElement).toBe(root);
		}
	});

	it("leaves a field somebody is writing in, in the bar or out of it", () => {
		const { document, root, pointer, barControl } = fixture();
		const fields = [barControl("INPUT", "text"), barControl("INPUT", "number"), barControl("INPUT"), barControl("TEXTAREA")];
		// The search field, a comment's reply box and a card's editor are not in the bar, but are plugin panels or the board's own.
		const reply = new HostElement("miro-canvas-thread");
		reply.ownerDocument = document;
		root.appendChild(reply);
		const replyBox = reply.appendChild(new HostElement("", "TEXTAREA"));
		replyBox.ownerDocument = document;
		for (const field of [...fields, replyBox]) {
			field.focus();
			pointer("pointerdown", 1, "touch", root);
			expect(document.activeElement).toBe(field);
		}
	});

	it("leaves a focus that is not on a control of the plugin's: a card's editor, or a button elsewhere", () => {
		const { document, root, pointer } = fixture();
		const editor = root.appendChild(new HostElement("canvas-node-content", "DIV"));
		editor.ownerDocument = document;
		const outside = new HostElement("workspace-button", "BUTTON");
		outside.ownerDocument = document;
		for (const element of [editor, outside]) {
			element.focus();
			pointer("pointerdown", 1, "touch", root);
			expect(document.activeElement).toBe(element);
		}
	});

	it("leaves the focus where a press on a control of the plugin's put it, and a press outside the board", () => {
		const { document, root, pointer, barControl } = fixture();
		const first = barControl();
		const second = barControl();
		first.focus();
		pointer("pointerdown", 1, "touch", second);
		expect(document.activeElement).toBe(first);
		const outside = new HostElement("workspace-tab");
		pointer("pointerdown", 1, "touch", outside);
		expect(document.activeElement).toBe(first);
		expect(root.contains(outside)).toBe(false);
	});

	it("does not touch the focus on the board, or on nothing at all", () => {
		const { document, root, pointer } = fixture();
		pointer("pointerdown", 1, "touch", root);
		expect(document.activeElement).toBeNull();
		root.focus();
		pointer("pointerdown", 1, "touch", root);
		expect(document.activeElement).toBe(root);
	});

	it("leaves the board's keys working: a tool's letter, Escape, and the guard on Delete reach the board", () => {
		const { window, document, root, canvas, nodes, hooks, session, pointer, make, barControl } = fixture();
		const leaf = new HostElement("workspace-leaf mod-active");
		leaf.appendChild(root);
		const key = (type: string, name: string, code: string, target: unknown): Event => make(type, target, {
			key: name, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
		});
		const button = barControl();
		button.focus();
		pointer("pointerdown", 1, "touch", root);
		const focused = document.activeElement;
		expect(focused).toBe(root);
		// A tool's letter, which the document hears and the session reads off the key's own target.
		hooks.handleToolKey(key("keydown", "p", "KeyP", focused));
		expect(hooks.armedTool).toBe("pen");
		// Escape, heard by the window.
		window.dispatchEvent(key("keydown", "Escape", "Escape", focused));
		expect(hooks.armedTool).toBe("select");
		// Delete is the board's own to guard: with a button focused it was a press in the bar and was let through.
		// (Escape put the pick away; a card is picked again for it to act on.)
		canvas.selectOnly(nodes.get("plan")!);
		session.toggleReviewMode();
		const refused = key("keydown", "Delete", "Delete", focused);
		root.dispatchEvent(refused);
		expect(refused.defaultPrevented).toBe(true);
	});
});
