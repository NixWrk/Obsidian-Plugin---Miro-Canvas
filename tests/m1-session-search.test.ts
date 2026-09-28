import { afterEach, describe, expect, it, vi } from "vitest";
import * as boardSearch from "../src/board-search";
import { M1CanvasSession } from "../src/m1-session";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { M1ControlsActions } from "../src/m1-controls";

// Only the presentation is replaced; the adapter, the metadata store and the
// search itself are the real ones.
vi.mock("../src/m1-controls", () => ({
	M1Controls: class {
		element = new HostElement("miro-canvas-dock");
		minimapElement = new HostElement();
		constructor(public actions: M1ControlsActions) {}
		update() {}
		dispose() { this.element.remove(); this.minimapElement.remove(); }
	},
}));

// Counted, so a test can tell a reused index from a rebuilt one.
vi.mock("../src/board-search", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/board-search")>();
	return { ...actual, buildSearchIndex: vi.fn(actual.buildSearchIndex) };
});

class HostElement extends EventTarget {
	nodeType = 1;
	parentElement?: HostElement;
	children: HostElement[] = [];
	attributes = new Map<string, string>();
	classes = new Set<string>();
	style: Record<string, string> & { setProperty: (name: string, value: string) => void; removeProperty: (name: string) => void };
	clientWidth = 800;
	clientHeight = 600;
	offsetWidth = 0;
	hidden = false;
	value = "";
	type = "";
	placeholder = "";
	textContent = "";
	disabled = false;
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
	focus() { (this.ownerDocument as FakeDocument | undefined)?.focus(this); }
	select() {}
	closest(selector: string): HostElement | null {
		for (const part of selector.split(",").map((value) => value.trim())) {
			if (part.startsWith(".") && this.className.split(" ").includes(part.slice(1))) return this;
			if (part.toUpperCase() === this.tagName) return this;
		}
		return this.parentElement?.closest(selector) ?? null;
	}
}

class FakeDocument extends EventTarget {
	activeElement: HostElement | null = null;
	body = new HostElement("", "BODY");
	defaultView = Object.assign(new EventTarget(), {
		setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
		clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
		setInterval: () => 0,
		clearInterval: () => undefined,
		requestAnimationFrame: () => 0,
		cancelAnimationFrame: () => undefined,
	});
	createElement(tagName: string) {
		const element = new HostElement("", tagName.toUpperCase());
		element.ownerDocument = this;
		return element;
	}
	focus(element: HostElement) { this.activeElement = element; }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Data = Record<string, any>;
const sessions: M1CanvasSession[] = [];
afterEach(() => {
	sessions.splice(0).forEach((session) => session.dispose());
	vi.mocked(boardSearch.buildSearchIndex).mockClear();
});

const card = (id: string, x: number, y: number, text: string) => ({ id, type: "text", text, x, y, width: 200, height: 120 });

/** A board of three cards, two of which mention the launch, and a frame. */
function fixture(options: { reviewMode?: boolean; boardFindKey?: boolean } = {}) {
	const document = new FakeDocument();
	const root = new HostElement("canvas-wrapper");
	const initial: Data = {
		nodes: [
			{ id: "frame", type: "group", x: -100, y: -100, width: 2000, height: 1200, label: "Sprint" },
			card("plan", 0, 0, "Plan the **launch**"),
			card("party", 800, 600, "Launch party"),
			card("other", 400, 0, "Something else"),
		],
		edges: [],
		miroCanvas: {
			schemaVersion: 1, settings: options.reviewMode === true ? { reviewMode: true } : {}, localOverrides: {},
			// A thread with no pin: the search opens it in the comments panel.
			localComments: [{ id: "loose", text: "Party budget?", origin: "local", createdAt: "2026-01-01T00:00:00.000Z", resolved: false, replies: [] }],
		},
	};
	class NativeNode {
		nodeEl = root.appendChild(new HostElement("canvas-node"));
		isEditing = false;
		constructor(public data: Data) {}
		get id() { return this.data.id; }
		getData() { return clone(this.data); }
		setData(data: Data) { this.data = clone(data); }
	}
	const nodes = new Map<string, NativeNode>();
	const selection = new Set<NativeNode>();
	const cameraMoves: Array<[number, number, number]> = [];
	const canvas = {
		wrapperEl: root, nodes, edges: new Map(), selection,
		data: clone(initial), readonly: false,
		tx: 0, ty: 0, tZoom: 0,
		getData() { return { ...clone(this.data), nodes: [...nodes.values()].map((node) => node.getData()) }; },
		setViewport(x: number, y: number, zoom: number) {
			cameraMoves.push([x, y, zoom]);
			this.tx = x;
			this.ty = y;
			this.tZoom = zoom;
		},
		requestRender() {},
		selectOnly(node: NativeNode) { selection.clear(); selection.add(node); },
		select(node: NativeNode) { selection.add(node); },
		requestSave() { this.data = this.getData(); },
		importData(data: Data) {
			for (const item of data.nodes) {
				const node = nodes.get(item.id);
				if (node === undefined) nodes.set(item.id, new NativeNode(clone(item)));
				else node.setData(item);
			}
		},
	};
	canvas.importData(clone(initial));
	const view = { canvas };
	const store = createObsidianMetadataStore(view).store;
	expect(store).toBeDefined();
	const opened: string[] = [];
	const session = new M1CanvasSession(view, new MetadataWriter(store!), {
		settings: { ...DEFAULT_SETTINGS, boardFindKey: options.boardFindKey ?? true },
		onOpenCommentThread: (id) => opened.push(id),
	});
	sessions.push(session);
	// The board's own panels are left out of this host: it gets its document
	// only now, for the keys and the search bar, which are what is tested.
	root.ownerDocument = document;
	expect(session.mount()).toBe(true);
	/** Press Ctrl+F on the window, as a real keyboard would reach it. */
	const pressFind = (): Event => {
		const event = new Event("keydown", { cancelable: true });
		for (const [key, value] of Object.entries({ key: "f", code: "KeyF", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: document.activeElement ?? document.body })) {
			Object.defineProperty(event, key, { value });
		}
		document.defaultView.dispatchEvent(event);
		return event;
	};
	const searchBar = () => root.children.find((child) => child.className.includes("miro-canvas-search") && !child.className.includes("search-hit"));
	const input = () => searchBar()?.children.find((child) => child.className === "miro-canvas-search__input");
	const typeQuery = (text: string): void => {
		const field = input()!;
		field.value = text;
		field.dispatchEvent(new Event("input"));
	};
	const hit = () => root.children.find((child) => child.className === "miro-canvas-search-hit");
	return { canvas, session, nodes, selection, document, root, pressFind, searchBar, input, typeQuery, hit, cameraMoves, opened };
}

describe("search on the board", () => {
	it("finds every card holding the words and moves the board to each in turn", () => {
		const { session, typeQuery, canvas, hit } = fixture();
		session.openSearch();
		typeQuery("LAUNCH");
		expect(session.searchState()).toMatchObject({ open: true, total: 2, current: 0, key: "node:plan", kind: "text" });
		const first = { tx: canvas.tx, ty: canvas.ty };
		// A 200 x 120 card at zoom 1 is centred without being blown up.
		expect(first).toEqual({ tx: 100, ty: 60 });
		expect(canvas.tZoom).toBeCloseTo(0);
		expect(hit()?.hidden).toBe(false);
		session["stepSearch"](1);
		expect(session.searchState()).toMatchObject({ current: 1, key: "node:party" });
		expect({ tx: canvas.tx, ty: canvas.ty }).toEqual({ tx: 900, ty: 660 });
		session["stepSearch"](1);
		expect(session.searchState()).toMatchObject({ current: 0, key: "node:plan" });
	});

	it("leaves the selection as it was", () => {
		const { session, typeQuery, selection, nodes } = fixture();
		selection.add(nodes.get("other")!);
		session.refresh();
		session.openSearch();
		typeQuery("launch");
		session["stepSearch"](1);
		expect([...selection].map((node) => node.id)).toEqual(["other"]);
	});

	it("builds the index once while the board is unchanged, and again after a save", () => {
		const { session, typeQuery, canvas } = fixture();
		const built = vi.mocked(boardSearch.buildSearchIndex);
		session.openSearch();
		typeQuery("launch");
		const builds = built.mock.calls.length;
		expect(builds).toBe(1);
		session.refresh();
		session.refresh();
		session["stepSearch"](1);
		expect(built.mock.calls.length).toBe(builds);
		// A card is added; native Canvas replaces its saved document on every save.
		canvas.importData({ nodes: [card("new", 0, 900, "Launch retro")] });
		canvas.requestSave();
		session.refresh();
		expect(built.mock.calls.length).toBe(builds + 1);
		expect(session.searchState()).toMatchObject({ total: 3, key: "node:party" });
	});

	it("does nothing at all while closed", () => {
		const { session } = fixture();
		session.refresh();
		expect(vi.mocked(boardSearch.buildSearchIndex)).not.toHaveBeenCalled();
		expect(session.searchState()).toMatchObject({ open: false, total: 0 });
	});

	it("works in review mode, where nothing on the board can be changed", () => {
		const { session, typeQuery } = fixture({ reviewMode: true });
		session.openSearch();
		typeQuery("party");
		expect(session.searchState()).toMatchObject({ total: 2, key: "node:party" });
	});

	it("opens a comment thread with no pin in the comments panel, without moving the board", () => {
		const { session, typeQuery, opened, cameraMoves } = fixture();
		session.openSearch();
		typeQuery("budget");
		expect(session.searchState()).toMatchObject({ total: 1, key: "comment:local:loose", kind: "comment" });
		expect(opened).toEqual(["loose"]);
		expect(cameraMoves).toEqual([]);
	});

	it("opens on Ctrl+F while the board has focus, and closes back to the board", () => {
		const { session, root, document, pressFind, input, hit } = fixture();
		document.activeElement = root;
		const event = pressFind();
		expect(event.defaultPrevented).toBe(true);
		expect(session.searchState().open).toBe(true);
		expect(document.activeElement).toBe(input());
		session.closeSearch();
		expect(session.searchState().open).toBe(false);
		expect(hit()?.hidden).toBe(true);
		expect(document.activeElement).toBe(root);
	});

	it("leaves Ctrl+F to a card being written, and to Obsidian when the setting is off", () => {
		const editing = fixture();
		const editor = editing.root.appendChild(new HostElement("cm-editor"));
		const content = editor.appendChild(new HostElement("cm-content"));
		editing.document.activeElement = content;
		expect(editing.pressFind().defaultPrevented).toBe(false);
		expect(editing.session.searchState().open).toBe(false);
		// A card's editor sits in a frame of its own.
		const frame = editing.root.appendChild(new HostElement("embed-iframe", "IFRAME"));
		editing.document.activeElement = frame;
		expect(editing.pressFind().defaultPrevented).toBe(false);
		expect(editing.session.searchState().open).toBe(false);

		const off = fixture({ boardFindKey: false });
		off.document.activeElement = off.root;
		expect(off.pressFind().defaultPrevented).toBe(false);
		expect(off.session.searchState().open).toBe(false);
	});

	it("leaves Ctrl+F alone while a selected card is open for writing", () => {
		const { session, root, document, pressFind, nodes, selection } = fixture();
		const node = nodes.get("plan")!;
		selection.add(node);
		node.isEditing = true;
		session.refresh();
		document.activeElement = root;
		expect(pressFind().defaultPrevented).toBe(false);
		expect(session.searchState().open).toBe(false);
	});
});
