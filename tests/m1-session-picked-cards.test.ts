import { afterEach, describe, expect, it, vi } from "vitest";
import { M1CanvasSession } from "../src/m1-session";
import { PICKED_ATTRIBUTE } from "../src/picked-cards";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";

// Only the presentation is replaced; the adapter, the authoring transaction
// and the metadata store are the real ones, matching the other m1-session
// fixtures. The session gets a document with a MutationObserver that tests
// feed by hand, so the watch on the board's cards (picked-cards.ts) can be
// driven the way native Canvas's own class changes would drive it.
vi.mock("../src/m1-controls", () => ({
	M1Controls: class {
		element = new HostElement("miro-canvas-panel");
		minimapElement = new HostElement();
		constructor(public actions: unknown) {}
		update() {}
		dispose() {}
	},
}));
// Each module also exports plain helper functions m1-session.ts calls
// directly (resizeRect, buildCommentMarkers, isDrawingTool, ...), so the real
// module is kept and only its UI class is replaced.
vi.mock("../src/selection-toolbar", async (importOriginal) => ({
	...(await importOriginal<object>()),
	SelectionToolbar: class {
		element = new HostElement("miro-canvas-toolbar");
		nativeSlot = new HostElement("miro-canvas-toolbar-native-slot");
		constructor(public actions: unknown, public options: unknown) {}
		update() {}
		dispose() {}
	},
}));
vi.mock("../src/selection-handles", async (importOriginal) => ({
	...(await importOriginal<object>()),
	SelectionHandles: class {
		element = new HostElement("miro-canvas-handles");
		constructor(public actions: unknown, public options: unknown) {}
		update() {}
		dispose() {}
		handlePointerMove() {}
		handlePointerUp() {}
		cancelGesture() {}
		grabRoute() {}
	},
}));
vi.mock("../src/comment-markers", async (importOriginal) => ({
	...(await importOriginal<object>()),
	CommentMarkers: class {
		element = new HostElement("miro-canvas-comment-markers");
		constructor(public actions: unknown, public options: unknown) {}
		update() {}
		destroy() {}
		previewColor() { return undefined; }
	},
}));
vi.mock("../src/quick-tools", async (importOriginal) => ({
	...(await importOriginal<object>()),
	QuickTools: class {
		element = new HostElement("miro-canvas-quick-tools");
		constructor(public actions: unknown, public options: unknown) {}
		update() {}
		dispose() {}
		closePanels() {}
		placeSideRows() {}
	},
}));

// canvas-elements.ts's readCanvasElementDom only trusts a real HTMLElement
// (it guards against a host object merely shaped like one), and vitest's
// plain "node" environment has no such global. This file's fixture needs
// that check to pass the way it would against a real Canvas node, so it
// gives Node the same minimal stand-in the other DOM globals here already
// are: still exactly EventTarget underneath.
if (typeof (globalThis as { HTMLElement?: unknown }).HTMLElement === "undefined") {
	(globalThis as { HTMLElement?: unknown }).HTMLElement = class HTMLElementStub extends EventTarget {};
}
const HTMLElementStub = (globalThis as unknown as { HTMLElement: typeof EventTarget }).HTMLElement;

class HostElement extends HTMLElementStub {
	nodeType = 1;
	parentElement?: HostElement;
	ownerDocument?: unknown;
	children: HostElement[] = [];
	attributes = new Map<string, string>();
	classes = new Set<string>();
	style = {
		values: new Map<string, string>(),
		priorities: new Map<string, string>(),
		setProperty(name: string, value: string, priority = "") { this.values.set(name, value); this.priorities.set(name, priority); },
		removeProperty(name: string) { this.values.delete(name); this.priorities.delete(name); },
		getPropertyValue(name: string) { return this.values.get(name) ?? ""; },
		getPropertyPriority(name: string) { return this.priorities.get(name) ?? ""; },
	};
	clientWidth = 800;
	clientHeight = 600;
	classList = {
		add: (name: string) => { this.classes.add(name); },
		remove: (name: string) => { this.classes.delete(name); },
		contains: (name: string) => this.classes.has(name),
	};
	constructor(public className = "", public tagName = "DIV") {
		super();
		for (const name of className.split(" ").filter(Boolean)) this.classes.add(name);
	}
	appendChild(child: HostElement) { child.parentElement = this; this.children.push(child); return child; }
	removeChild(child: HostElement) { this.children = this.children.filter((item) => item !== child); }
	remove() { this.parentElement?.removeChild(this); }
	setAttribute(key: string, value: string) { this.attributes.set(key, value); }
	getAttribute(key: string) { return this.attributes.get(key) ?? null; }
	hasAttribute(key: string) { return this.attributes.has(key); }
	removeAttribute(key: string) { this.attributes.delete(key); }
	contains(target: unknown): boolean { return target === this || this.children.some((child) => child.contains(target)); }
	// A shell matches itself first, exactly as native Element.closest() does.
	closest(selector: string): HostElement | null {
		for (const part of selector.split(",").map((value) => value.trim())) {
			if (part.startsWith(".") && this.classes.has(part.slice(1))) return this;
		}
		return this.parentElement?.closest(selector) ?? null;
	}
	querySelectorAll(): HostElement[] { return []; }
	// A card holds a frame when an element of one of the named tags lies below it.
	querySelector(selectors: string): HostElement | null {
		const tags = selectors.split(",").map((value) => value.trim().toUpperCase());
		for (const child of this.children) {
			if (tags.includes(child.tagName)) return child;
			const deeper = child.querySelector(selectors);
			if (deeper !== null) return deeper;
		}
		return null;
	}
}

// Stands for every MutationObserver the session makes on the board's node
// layer, which is kept distinct from the panel root the way real Canvas keeps
// canvasEl distinct from wrapperEl.
class FakeObserver {
	public connected = true;
	public target: unknown;
	public options: { readonly childList?: boolean; readonly subtree?: boolean; readonly attributes?: boolean; readonly attributeFilter?: string[] } | undefined;
	public constructor(public readonly callback: (records: readonly unknown[]) => void) { instances.push(this); }
	public observe(target: unknown, options?: { readonly childList?: boolean; readonly subtree?: boolean; readonly attributes?: boolean; readonly attributeFilter?: string[] }): void {
		this.target = target;
		this.options = options;
		this.connected = true;
	}
	public disconnect(): void { this.connected = false; }
}
let instances: FakeObserver[] = [];

/** The observers the picked-card marks made on the board's card layer: one for the classes of cards, one for cards put on the layer. */
function pickedObservers(nodeLayer: HostElement): { readonly classes: FakeObserver; readonly children: FakeObserver } {
	const onLayer = instances.filter((observer) => observer.target === nodeLayer);
	const classes = onLayer.find((observer) => observer.options?.attributeFilter?.includes("class") === true);
	const children = onLayer.find((observer) => observer.options?.childList === true && observer.options.subtree !== true);
	if (classes === undefined || children === undefined) {
		throw new Error("the picked-card marks made no observers on the card layer");
	}
	return { classes, children };
}

// The window and document the session finds through root.ownerDocument: real
// EventTarget behaviour (every attach* helper adds a real listener to one of
// these) plus the one constructor the observer under test needs.
class FakeWindow extends EventTarget {
	MutationObserver = FakeObserver;
}
class FakeDocument extends EventTarget {
	defaultView = new FakeWindow();
	createElement(): HostElement { return new HostElement(); }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Data = Record<string, any>;
const sessions: M1CanvasSession[] = [];
afterEach(() => {
	sessions.splice(0).forEach((session) => session.dispose());
	instances = [];
	vi.restoreAllMocks();
});

/** A board with two cards, wired the way real Canvas exposes canvasEl and a MutationObserver-capable document. */
function fixture(sizer?: HostElement) {
	const root = new HostElement("canvas-wrapper");
	const nodeLayer = new HostElement("canvas-node-layer");
	root.appendChild(nodeLayer);
	root.ownerDocument = new FakeDocument();
	const initial: Data = {
		nodes: [
			{ id: "styled", type: "text", text: "styled", x: 0, y: 0, width: 100, height: 80 },
			{ id: "plain", type: "text", text: "plain", x: 200, y: 0, width: 100, height: 80 },
		],
		edges: [],
		miroCanvas: {
			schemaVersion: 1,
			settings: {},
			localOverrides: { styled: { typography: { fontSize: 40, alignment: "center", verticalAlign: "center" } } },
		},
	};
	class NativeNode {
		nodeEl = nodeLayer.appendChild(new HostElement("canvas-node"));
		constructor(public data: Data) {
			if (data.id === "styled" && sizer !== undefined) {
				const preview = this.nodeEl.appendChild(new HostElement("markdown-preview-view"));
				preview.appendChild(sizer);
				this.nodeEl.querySelectorAll = (selector?: string) => selector === ".markdown-preview-view > .markdown-preview-sizer" ? [sizer] : [preview];
			}
		}
		get id() { return this.data.id; }
		getData() { return clone(this.data); }
	}
	const nodes = new Map(initial.nodes.map((data: Data) => [data.id as string, new NativeNode(clone(data))])) as Map<string, NativeNode>;
	const canvas = {
		wrapperEl: root,
		canvasEl: nodeLayer,
		nodes, edges: new Map(), selection: new Set<unknown>(),
		data: clone(initial), readonly: false,
		getData() { return { ...clone(this.data), nodes: [...nodes.values()].map((node) => node.getData()) }; },
		setViewport() {}, requestRender() {},
		requestSave() {},
	};
	const view = { canvas };
	const store = createObsidianMetadataStore(view).store;
	expect(store).toBeDefined();
	const session = new M1CanvasSession(view, new MetadataWriter(store!));
	sessions.push(session);
	expect(session.mount()).toBe(true);
	session.refresh();
	return { root, nodeLayer, canvas, session, nodes };
}

/** Native Canvas puts `is-focused` on a card picked alone and `is-selected` on one of several, and `is-editing` while its editor is open. */
function setClass(card: HostElement, name: string, on: boolean): void {
	if (on) card.classList.add(name);
	else card.classList.remove(name);
}

function classChanged(observers: { readonly classes: FakeObserver }, card: HostElement): void {
	observers.classes.callback([{ type: "attributes", target: card } as unknown as MutationRecord]);
}

describe("the session marks the cards a finger may drag by their text", () => {
	it("reconciles late native Markdown layout without refreshing the board", () => {
		const sizer = new HostElement("markdown-preview-sizer");
		const { session } = fixture(sizer);
		const observer = instances.find(item => item.target === sizer && item.options?.attributeFilter?.includes("style"));
		expect(observer).toBeDefined();
		const refresh = vi.spyOn(session, "refresh");
		const write = vi.spyOn(sizer.style, "setProperty");
		sizer.style.setProperty("padding-bottom", "18px");
		observer!.callback([{ type: "attributes", target: sizer }]);
		expect(sizer.style.getPropertyValue("padding-bottom")).toBe("0");
		write.mockClear();
		for (let index = 0; index < 1000; index += 1) observer!.callback([{ type: "attributes", target: sizer }]);
		expect(write).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
		session.dispose();
		expect(sizer.style.getPropertyValue("padding-bottom")).toBe("18px");
	});
	it("restores native sizer values and priorities when local alignment is reset", () => {
		const sizer = new HostElement("markdown-preview-sizer");
		sizer.style.setProperty("flex", "1 0 auto", "important");
		sizer.style.setProperty("min-height", "100%");
		sizer.style.setProperty("padding-bottom", "12px");
		const { canvas, session } = fixture(sizer);
		expect(sizer.style.getPropertyValue("flex")).toBe("0 0 auto");
		expect(sizer.style.getPropertyPriority("flex")).toBe("");
		canvas.data.miroCanvas.localOverrides = {};
		canvas.data = clone(canvas.data);
		session.refresh();
		expect(sizer.style.getPropertyValue("flex")).toBe("1 0 auto");
		expect(sizer.style.getPropertyPriority("flex")).toBe("important");
		expect(sizer.style.getPropertyValue("min-height")).toBe("100%");
		expect(sizer.style.getPropertyValue("padding-bottom")).toBe("12px");
	});

	it("leaves a later foreign priority on the sizer intact on unload", () => {
		const sizer = new HostElement("markdown-preview-sizer");
		const { session } = fixture(sizer);
		sizer.style.setProperty("flex", "0 0 auto", "important");
		session.dispose();
		expect(sizer.style.getPropertyValue("flex")).toBe("0 0 auto");
		expect(sizer.style.getPropertyPriority("flex")).toBe("important");
		expect(sizer.style.getPropertyValue("min-height")).toBe("");
	});

	it("watches the board's card layer for class changes and for cards put on it", () => {
		const { nodeLayer } = fixture();
		const { classes, children } = pickedObservers(nodeLayer);
		expect(classes.options).toEqual({ attributes: true, attributeFilter: ["class"], subtree: true });
		expect(children.options).toEqual({ childList: true });
	});

	it("marks a card when it is picked, without a refresh, and takes the mark back when it is let go", () => {
		const { nodeLayer, session, nodes } = fixture();
		const observers = pickedObservers(nodeLayer);
		const refreshSpy = vi.spyOn(session, "refresh");
		const card = nodes.get("styled")!.nodeEl;
		setClass(card, "is-focused", true);
		classChanged(observers, card);
		expect(card.hasAttribute(PICKED_ATTRIBUTE)).toBe(true);
		setClass(card, "is-focused", false);
		classChanged(observers, card);
		expect(card.hasAttribute(PICKED_ATTRIBUTE)).toBe(false);
		expect(refreshSpy).not.toHaveBeenCalled();
	});

	it("marks every card of a selection of several", () => {
		const { nodeLayer, nodes } = fixture();
		const observers = pickedObservers(nodeLayer);
		const cards = [...nodes.values()].map((node) => node.nodeEl);
		for (const card of cards) setClass(card, "is-selected", true);
		observers.classes.callback(cards.map((card) => ({ type: "attributes", target: card }) as unknown as MutationRecord));
		expect(cards.map((card) => card.hasAttribute(PICKED_ATTRIBUTE))).toEqual([true, true]);
	});

	it("takes the mark off a card whose editor opens", () => {
		const { nodeLayer, nodes } = fixture();
		const observers = pickedObservers(nodeLayer);
		const card = nodes.get("plain")!.nodeEl;
		setClass(card, "is-focused", true);
		classChanged(observers, card);
		expect(card.hasAttribute(PICKED_ATTRIBUTE)).toBe(true);
		setClass(card, "is-editing", true);
		card.appendChild(new HostElement("", "IFRAME"));
		classChanged(observers, card);
		expect(card.hasAttribute(PICKED_ATTRIBUTE)).toBe(false);
	});

	it("does not mark a card that holds a web page", () => {
		const { nodeLayer, nodes } = fixture();
		const observers = pickedObservers(nodeLayer);
		const card = nodes.get("plain")!.nodeEl;
		const content = card.appendChild(new HostElement("canvas-node-content"));
		content.appendChild(new HostElement("", "IFRAME"));
		setClass(card, "is-focused", true);
		classChanged(observers, card);
		expect(card.hasAttribute(PICKED_ATTRIBUTE)).toBe(false);
	});

	it("takes every mark back and disconnects its observers when the session ends", () => {
		const { nodeLayer, session, nodes } = fixture();
		const observers = pickedObservers(nodeLayer);
		const card = nodes.get("styled")!.nodeEl;
		setClass(card, "is-focused", true);
		classChanged(observers, card);
		expect(card.hasAttribute(PICKED_ATTRIBUTE)).toBe(true);
		session.dispose();
		expect(card.hasAttribute(PICKED_ATTRIBUTE)).toBe(false);
		expect(observers.classes.connected).toBe(false);
		expect(observers.children.connected).toBe(false);
	});
});
