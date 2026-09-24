import { afterEach, describe, expect, it, vi } from "vitest";
import { M1CanvasSession } from "../src/m1-session";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";

// Only the presentation is replaced; the adapter, the authoring transaction
// and the metadata store are the real ones, matching the other m1-session
// fixtures. Unlike those fixtures this one gives the session a real (if
// minimal) document, so the observer under test can find a MutationObserver
// on it - real UI panels the other fixtures never build with a document at
// all are therefore mocked too, the same way M1Controls always is.
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
	},
}));

const APPEARANCE_ATTRIBUTE = "data-miro-canvas-appearance";

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
		setProperty(name: string, value: string) { this.values.set(name, value); },
		removeProperty(name: string) { this.values.delete(name); },
		getPropertyValue(name: string) { return this.values.get(name) ?? ""; },
		getPropertyPriority() { return ""; },
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
}

// The board's node layer, watched by the plugin's own MutationObserver; kept
// distinct from the panel root the way real Canvas keeps canvasEl distinct
// from wrapperEl.
class FakeObserver {
	public connected = true;
	public target: unknown;
	public options: { readonly childList?: boolean; readonly subtree?: boolean } | undefined;
	public constructor(public readonly callback: (records: readonly unknown[]) => void) { instances.push(this); }
	public observe(target: unknown, options?: { readonly childList?: boolean; readonly subtree?: boolean }): void {
		this.target = target;
		this.options = options;
		this.connected = true;
	}
	public disconnect(): void { this.connected = false; }
}
let instances: FakeObserver[] = [];

/** The session also runs a follow observer (retargetFollow) through the same fake constructor; find the one this test's decoration logic actually built. */
function appearanceObserverInstance(): FakeObserver {
	const found = [...instances].reverse().find((observer) => observer.options?.childList === true);
	if (found === undefined) {
		throw new Error("no appearance-decoration MutationObserver was constructed");
	}
	return found;
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

/** A board with one styled card and one plain card, wired the way real Canvas exposes canvasEl and a MutationObserver-capable document. */
function fixture() {
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
		constructor(public data: Data) {}
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

/** Swap a node's DOM the way Obsidian does when it re-creates a card without touching the board: same runtime node, a fresh element. */
function replaceNodeDom(nodeLayer: HostElement, node: { nodeEl: HostElement }): HostElement {
	const next = nodeLayer.appendChild(new HostElement("canvas-node"));
	node.nodeEl.remove();
	node.nodeEl = next;
	return next;
}

async function flushMutationPass(): Promise<void> {
	// The pass is coalesced onto a microtask when no requestAnimationFrame is
	// available (this fixture's fake document offers none), so one await is
	// enough to let it run.
	await Promise.resolve();
	await Promise.resolve();
}

describe("appearance decoration follows Obsidian's own DOM replacement", () => {
	it("decorates a styled card's new DOM once the observer fires and the frame runs, without a full refresh", async () => {
		const { nodeLayer, session, nodes } = fixture();
		const observer = appearanceObserverInstance();
		expect(observer).toBeDefined();

		const refreshSpy = vi.spyOn(session, "refresh");
		const styled = nodes.get("styled")!;
		const freshDom = replaceNodeDom(nodeLayer, styled);
		expect(freshDom.hasAttribute(APPEARANCE_ATTRIBUTE)).toBe(false);

		observer.callback([{ addedNodes: [freshDom] } as unknown as MutationRecord]);
		await flushMutationPass();

		expect(freshDom.hasAttribute(APPEARANCE_ATTRIBUTE)).toBe(true);
		expect(freshDom.style.values.get("font-size")).toBe("40px");
		// The cheap per-shell pass did the work; no full-board refresh ran.
		expect(refreshSpy).not.toHaveBeenCalled();
	});

	it("never touches a plain card's replaced DOM", async () => {
		const { nodeLayer, nodes } = fixture();
		const observer = appearanceObserverInstance();
		const plain = nodes.get("plain")!;
		const freshDom = replaceNodeDom(nodeLayer, plain);

		observer.callback([{ addedNodes: [freshDom] } as unknown as MutationRecord]);
		await flushMutationPass();

		expect(freshDom.hasAttribute(APPEARANCE_ATTRIBUTE)).toBe(false);
		expect(freshDom.style.values.size).toBe(0);
	});

	it("disconnects the observer on dispose", () => {
		const { session } = fixture();
		const observer = appearanceObserverInstance();
		expect(observer.connected).toBe(true);
		session.dispose();
		expect(observer.connected).toBe(false);
	});
});
