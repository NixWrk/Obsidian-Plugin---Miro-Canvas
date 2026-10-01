import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { M1CanvasSession } from "../src/m1-session";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";
import { StylusWatch } from "../src/stylus";
import type { M1ControlsActions } from "../src/m1-controls";

// Only the presentation is replaced; the adapter, the viewport, the policy
// and the writer are the real ones.
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

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(100_000);
});
afterEach(() => {
	sessions.splice(0).forEach((session) => session.dispose());
	vi.restoreAllMocks();
	vi.useRealTimers();
});

/** The parts of the session these gestures reach, which the tests drive directly. */
interface Hooks {
	armTool(tool: string): void;
	armedTool: string;
	linePlacing: unknown;
	lineFinishedAt: number;
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
	return { window, root, canvas, nodes, session, hooks, cardEl, selected, make, pointer, tap };
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
