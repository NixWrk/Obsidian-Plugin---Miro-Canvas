import { afterEach, describe, expect, it, vi } from "vitest";

import { M1CanvasSession } from "../src/m1-session";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { PanelLayout } from "../src/panel-layout";

// Only the dock's icon row and the minimap go through this mock - real
// widgets that build a full DOM tree the moment a document is supplied.
// `M1CanvasSession` never gets a document here (no vault window in this
// test), so it never tries to build those trees, and this stub carries just
// the two properties `updatePanelPositions` reads off it.
vi.mock("../src/m1-controls", () => ({
	M1Controls: class {
		element: FakePanelElement;
		minimapElement: FakePanelElement;
		constructor(public actions: unknown) {
			this.element = new FakePanelElement(140, 40);
			this.minimapElement = new FakePanelElement(220, 146);
		}
		update() {}
		dispose() {}
	},
}));

/**
 * Stands in for the tool bar, the dock row, and the minimap: enough of an
 * `HTMLElement` for `isElement` to accept it, a settable rect for
 * `boundingRect` to measure, and a real style map so the inline-clearing
 * pass in `updatePanelPositions` has something to write to.
 */
class FakePanelElement {
	nodeType = 1;
	readonly style = {
		map: new Map<string, string>(),
		setProperty(name: string, value: string) { this.map.set(name, value); },
		removeProperty(name: string) { this.map.delete(name); },
	};
	private readonly attributes = new Map<string, string>();
	rect: { left: number; top: number; right: number; bottom: number };
	constructor(width: number, height: number) {
		this.rect = { left: 0, top: 0, right: width, bottom: height };
	}
	appendChild<T>(child: T): T { return child; }
	removeChild<T>(child: T): T { return child; }
	remove() {}
	setAttribute(name: string, value: string) { this.attributes.set(name, value); }
	getAttribute(name: string) { return this.attributes.get(name) ?? null; }
	hasAttribute(name: string) { return this.attributes.has(name); }
	removeAttribute(name: string) { this.attributes.delete(name); }
	getBoundingClientRect() { return this.rect; }
	contains() { return false; }
	closest() { return null; }
}

/** The board root: wide enough of a fake for `mount()` and `updatePanelPositions` to run against. */
class RootElement extends EventTarget {
	nodeType = 1;
	clientWidth = 800;
	clientHeight = 600;
	readonly style = {
		map: new Map<string, string>(),
		setProperty(name: string, value: string) { this.map.set(name, value); },
		removeProperty(name: string) { this.map.delete(name); },
	};
	private readonly attributes = new Map<string, string>();
	children: RootElement[] = [];
	classList = { add() {}, remove() {}, contains: () => false };
	appendChild<T extends RootElement>(child: T) { this.children.push(child); return child; }
	removeChild<T extends RootElement>(child: T) { this.children = this.children.filter((item) => item !== child); return child; }
	setAttribute(name: string, value: string) { this.attributes.set(name, value); }
	getAttribute(name: string) { return this.attributes.get(name) ?? null; }
	hasAttribute(name: string) { return this.attributes.has(name); }
	removeAttribute(name: string) { this.attributes.delete(name); }
	contains(target: unknown): boolean { return target === this; }
	closest() { return null; }
	getBoundingClientRect() { return { left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight }; }
}

type Data = Record<string, unknown>;
const sessions: M1CanvasSession[] = [];
afterEach(() => { sessions.splice(0).forEach((session) => session.dispose()); vi.restoreAllMocks(); });

/** Builds a mounted session with no stored panel layout unless `panelLayout` says otherwise. */
function fixture(panelLayout: PanelLayout = {}) {
	const root = new RootElement();
	const data: Data = { nodes: [], edges: [] };
	const canvas = {
		wrapperEl: root,
		nodes: new Map(), edges: new Map(), selection: new Set<unknown>(),
		data,
		readonly: false,
		getData(): Data { return { nodes: [], edges: [] }; },
		setViewport() {}, requestRender() {},
		setReadonly(value: boolean) { this.readonly = value; },
		requestSave() {},
	};
	const view = { canvas };
	const session = new M1CanvasSession(view, null, { settings: { ...DEFAULT_SETTINGS, panelLayout } });
	sessions.push(session);
	expect(session.mount()).toBe(true);
	// The real tool bar only builds once a document is available, which this
	// synthetic host never supplies; a fake with the same two properties
	// `arrangePanels` reads stands in for it instead, exactly as the mocked
	// dock row above stands in for `M1Controls`.
	const toolbar = new FakePanelElement(300, 32);
	// Where styles.css puts it by default: 16px above the board's foot.
	toolbar.rect = { left: 0, top: 552, right: 300, bottom: 584 };
	(session as unknown as { quickTools: { element: FakePanelElement } }).quickTools = { element: toolbar };
	return { root, session, toolbar };
}

/** Re-runs the same pass `mount()` and a board resize both trigger. */
function resize(session: M1CanvasSession, root: RootElement, width: number): void {
	root.clientWidth = width;
	(session as unknown as { updatePanelPositions: () => void }).updatePanelPositions();
}

describe("crowding the default tool bar and dock apart on a narrow board", () => {
	it("leaves the board root untouched on a board wide enough for both defaults", () => {
		const { root, session } = fixture();
		resize(session, root, 620);
		expect(root.getAttribute("data-miro-canvas-crowded")).toBeNull();
		expect(root.style.map.has("--miro-canvas-crowded-toolbar-reach")).toBe(false);
	});

	it("moves the bar to the left edge once the board is too narrow to centre it, but wide enough for that alone", () => {
		const { root, session } = fixture();
		resize(session, root, 500);
		expect(root.getAttribute("data-miro-canvas-crowded")).toBe("toolbar-left");
		expect(root.style.map.has("--miro-canvas-crowded-toolbar-reach")).toBe(false);
	});

	it("stacks the dock above the bar, clearing the bar's measured top, once even the left edge is too tight", () => {
		const { root, session } = fixture();
		resize(session, root, 300);
		expect(root.getAttribute("data-miro-canvas-crowded")).toBe("stacked");
		expect(root.style.map.get("--miro-canvas-crowded-toolbar-reach")).toBe("48px");
	});

	it("clears the bar where a narrow window has already lifted it, not where it usually sits", () => {
		const { root, session, toolbar } = fixture();
		// A window under 900px puts the bar 34px above the board's foot.
		toolbar.rect = { left: 0, top: 534, right: 300, bottom: 566 };
		resize(session, root, 300);
		expect(root.style.map.get("--miro-canvas-crowded-toolbar-reach")).toBe("66px");
	});

	it("clears a previous crowded mark once the board widens back out", () => {
		const { root, session } = fixture();
		resize(session, root, 300);
		expect(root.getAttribute("data-miro-canvas-crowded")).toBe("stacked");
		resize(session, root, 620);
		expect(root.getAttribute("data-miro-canvas-crowded")).toBeNull();
		expect(root.style.map.has("--miro-canvas-crowded-toolbar-reach")).toBe(false);
	});

	it("leaves a person's own layout alone: a stored tool bar position turns this off even on a crowded board", () => {
		const { root, session } = fixture({ toolbar: { anchor: "bottom-center", dx: 0, dy: 16 } });
		resize(session, root, 300);
		expect(root.getAttribute("data-miro-canvas-crowded")).toBeNull();
	});

	it("leaves a person's own layout alone: a stored dock position turns this off too", () => {
		const { root, session } = fixture({ dockBar: { anchor: "bottom-right", dx: 12, dy: 36 } });
		resize(session, root, 300);
		expect(root.getAttribute("data-miro-canvas-crowded")).toBeNull();
	});
});

/**
 * A phone's page, handed to the board only once it is mounted (the tool bar
 * and the dock are still the fakes above): Obsidian's floating navigation
 * bar, the system's navigation area and the keyboard, as Obsidian 1.12 on
 * Android reports them.
 */
function phonePage(options: { navbarTop?: number; keyboard?: number } = {}) {
	const navbar = {
		nodeType: 1,
		appendChild: () => undefined,
		removeChild: () => undefined,
		getBoundingClientRect: () => ({ left: 34, top: options.navbarTop ?? 0, right: 350, bottom: (options.navbarTop ?? 0) + 52 }),
	};
	const bodyStyle = { getPropertyValue: (name: string) => (name === "--safe-area-inset-bottom" ? "48px" : "") };
	const rootStyle = { getPropertyValue: (name: string) => (name === "--keyboard-height" ? `${options.keyboard ?? 0}px` : "") };
	const barStyle = { display: "flex", visibility: "visible", transform: "none", getPropertyValue: () => "" };
	const body = { classList: { contains: (name: string) => name === "is-mobile" } };
	const documentElement = {};
	const view = {
		innerHeight: 600,
		getComputedStyle: (element: unknown) => (element === body ? bodyStyle : element === documentElement ? rootStyle : barStyle),
	};
	return {
		body,
		documentElement,
		defaultView: view,
		createElement: () => ({}),
		querySelector: (selector: string) => (selector === ".mobile-navbar" && options.navbarTop !== undefined ? navbar : null),
	};
}

describe("keeping the panels clear of a phone's own bars", () => {
	it("lifts the tool bar and the dock by how far Obsidian's navigation bar reaches up the board", () => {
		const { root, session } = fixture();
		(root as unknown as { ownerDocument: unknown }).ownerDocument = phonePage({ navbarTop: 500 });
		resize(session, root, 800);
		expect(root.style.map.get("--miro-canvas-host-foot")).toBe("100px");
		expect(root.getAttribute("data-miro-canvas-keyboard")).toBeNull();
	});

	it("marks the keyboard being up, so the stylesheet puts the bars away", () => {
		const { root, session } = fixture();
		(root as unknown as { ownerDocument: unknown }).ownerDocument = phonePage({ keyboard: 300 });
		resize(session, root, 800);
		expect(root.getAttribute("data-miro-canvas-keyboard")).toBe("open");
		expect(root.style.map.get("--miro-canvas-host-foot")).toBe("300px");
	});

	it("places a panel a person moved within the part of the board the bars leave uncovered", () => {
		const layout = { toolbar: { anchor: "bottom-center", dx: 0, dy: 16 } } as const;
		// Measured with its size, as a real element is, so the stored place resolves.
		const sized = { left: 0, top: 552, right: 300, bottom: 584, width: 300, height: 32 };
		const desk = fixture(layout);
		desk.toolbar.rect = sized;
		resize(desk.session, desk.root, 800);
		const phone = fixture(layout);
		phone.toolbar.rect = sized;
		(phone.root as unknown as { ownerDocument: unknown }).ownerDocument = phonePage({ navbarTop: 500 });
		resize(phone.session, phone.root, 800);
		const top = (element: { style: { map: Map<string, string> } }) => Number.parseFloat(element.style.map.get("top") ?? "NaN");
		expect(top(desk.toolbar) - top(phone.toolbar)).toBe(100);
	});

	it("writes nothing on a computer", () => {
		const { root, session } = fixture();
		resize(session, root, 800);
		expect(root.style.map.has("--miro-canvas-host-foot")).toBe(false);
		expect(root.getAttribute("data-miro-canvas-keyboard")).toBeNull();
	});
});
