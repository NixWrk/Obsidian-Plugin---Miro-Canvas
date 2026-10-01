import { afterEach, describe, expect, it, vi } from "vitest";
import { M1CanvasSession } from "../src/m1-session";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";
import type { M1ControlsActions } from "../src/m1-controls";

// A board of hundreds of cards, to see what a refresh and a drag do to each of them.
vi.mock("../src/m1-controls", () => ({
	M1Controls: class {
		element = new HostElement("miro-canvas-panel");
		minimapElement = new HostElement();
		constructor(public actions: M1ControlsActions) {}
		update() {}
		dispose() { this.element.remove(); this.minimapElement.remove(); }
	},
}));

type Data = Record<string, any>;

class HostElement extends EventTarget {
	nodeType = 1;
	parentElement?: HostElement;
	children: HostElement[] = [];
	attributes = new Map<string, string>();
	classes = new Set<string>();
	style = {};
	clientWidth = 800;
	clientHeight = 600;
	/** What was written to the element, to tell a write from a look. */
	writes = { add: 0, remove: 0, setAttribute: 0, removeAttribute: 0 };
	classList = {
		add: (name: string) => { this.writes.add += 1; this.classes.add(name); },
		remove: (name: string) => { this.writes.remove += 1; this.classes.delete(name); },
		contains: (name: string) => this.classes.has(name),
	};
	constructor(public className = "", public tagName = "DIV") { super(); }
	appendChild(child: HostElement) { child.parentElement = this; this.children.push(child); return child; }
	removeChild(child: HostElement) { this.children = this.children.filter((item) => item !== child); }
	remove() { this.parentElement?.removeChild(this); }
	setAttribute(key: string, value: string) { this.writes.setAttribute += 1; this.attributes.set(key, value); }
	getAttribute(key: string) { return this.attributes.get(key) ?? null; }
	hasAttribute(key: string) { return this.attributes.has(key); }
	removeAttribute(key: string) { this.writes.removeAttribute += 1; this.attributes.delete(key); }
	contains(target: unknown): boolean { return target === this || this.children.some((child) => child.contains(target)); }
	closest(): HostElement | null { return null; }
	emit(type: string, target: unknown = this, props: Record<string, unknown> = {}) {
		const event = new Event(type, { cancelable: true, bubbles: true });
		for (const [key, value] of Object.entries({ target, ...props })) Object.defineProperty(event, key, { value });
		this.dispatchEvent(event);
		return event;
	}
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const sessions: M1CanvasSession[] = [];
afterEach(() => { sessions.splice(0).forEach((session) => session.dispose()); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture(cards = 300, lockedIds: readonly string[] = ["card-7"]) {
	// The session marks only what is an HTMLElement, which a test without a page has none of.
	vi.stubGlobal("HTMLElement", HostElement);
	const root = new HostElement("canvas-wrapper");
	const nodeData = (index: number): Data => ({ id: `card-${index}`, type: "text", text: `${index}`, x: index * 120, y: 0, width: 100, height: 80 });
	const overrides = (ids: readonly string[]): Data => Object.fromEntries(ids.map((id) => [id, { locked: true }]));
	const initial: Data = {
		nodes: Array.from({ length: cards }, (_, index) => nodeData(index)), edges: [],
		miroCanvas: { schemaVersion: 1, settings: {}, localOverrides: overrides(lockedIds) },
	};
	class NativeNode {
		nodeEl = root.appendChild(new HostElement("canvas-node"));
		constructor(public data: Data) {}
		get id() { return this.data.id as string; }
		get x() { return this.data.x as number; }
		get y() { return this.data.y as number; }
		get width() { return this.data.width as number; }
		get height() { return this.data.height as number; }
		getData() { return clone(this.data); }
		moveTo(point: Data) { Object.assign(this.data, point); }
		setData(data: Data) { this.data = clone(data); }
	}
	const nodes = new Map(initial.nodes.map((data: Data) => [data.id as string, new NativeNode(clone(data))])) as Map<string, NativeNode>;
	const selection = new Set<NativeNode>();
	const canvas = {
		wrapperEl: root, nodes, edges: new Map(), selection, data: clone(initial), readonly: false,
		getData() { return { ...this.data, nodes: [...nodes.values()].map((node) => node.getData()) }; },
		setViewport() {}, requestRender() {}, requestSave() {},
		setReadonly(value: boolean) { this.readonly = value; },
		selectOnly(node: NativeNode) { selection.clear(); selection.add(node); },
		select(node: NativeNode) { selection.add(node); },
		deselectAll() { selection.clear(); },
		importData() {},
	};
	const view = { canvas };
	const store = createObsidianMetadataStore(view).store;
	expect(store).toBeDefined();
	const session = new M1CanvasSession(view, new MetadataWriter(store!));
	sessions.push(session);
	expect(session.mount()).toBe(true);
	const element = (id: string) => nodes.get(id)!.nodeEl;
	/** The board as native Canvas saves it with these cards locked: a new object, as every save makes. */
	const lock = (ids: readonly string[]) => {
		canvas.data = { ...canvas.data, miroCanvas: { ...canvas.data.miroCanvas, localOverrides: overrides(ids) } };
		session.refresh();
	};
	return { root, canvas, session, nodes, selection, element, lock, internals: session as unknown as Record<string, any> };
}

describe("a refresh of a large board", () => {
	it("marks the locked card and writes to no other card", () => {
		const f = fixture();
		expect(f.element("card-7").classes.has("miro-canvas-locked")).toBe(true);
		expect(f.element("card-7").getAttribute("data-miro-canvas-locked")).toBe("true");
		for (const [id, node] of f.nodes) {
			if (id === "card-7") continue;
			expect(node.nodeEl.writes, id).toEqual({ add: 0, remove: 0, setAttribute: 0, removeAttribute: 0 });
		}
	});

	it("writes only to the cards whose lock changed, as it changes", () => {
		const f = fixture();
		const before = new Map([...f.nodes].map(([id, node]) => [id, { ...node.nodeEl.writes }]));
		const written = (id: string) => {
			const now = f.element(id).writes, was = before.get(id)!;
			return now.add + now.remove + now.setAttribute + now.removeAttribute - (was.add + was.remove + was.setAttribute + was.removeAttribute);
		};
		// Locking another card: that card, and only it.
		f.lock(["card-7", "card-200"]);
		expect(f.element("card-200").classes.has("miro-canvas-locked")).toBe(true);
		expect(f.element("card-200").getAttribute("data-miro-canvas-locked")).toBe("true");
		expect(written("card-200")).toBeGreaterThan(0);
		for (const id of f.nodes.keys()) if (id !== "card-200") expect(written(id), id).toBe(0);
		// The first lock goes: that card is taken off, and the other is left as it was.
		const afterLock = written("card-200");
		f.lock(["card-200"]);
		expect(f.element("card-7").classes.has("miro-canvas-locked")).toBe(false);
		expect(f.element("card-7").hasAttribute("data-miro-canvas-locked")).toBe(false);
		expect(written("card-200")).toBe(afterLock);
		for (const id of f.nodes.keys()) if (id !== "card-200" && id !== "card-7") expect(written(id), id).toBe(0);
	});

	it("puts a card back as the host had it once the board no longer shows it, and on dispose", () => {
		const f = fixture(20);
		const gone = f.nodes.get("card-7")!;
		f.canvas.nodes.delete("card-7");
		f.internals.refresh();
		f.lock(["card-3"]);
		expect(gone.nodeEl.classes.has("miro-canvas-locked")).toBe(false);
		expect(gone.nodeEl.hasAttribute("data-miro-canvas-locked")).toBe(false);
		expect(f.element("card-3").classes.has("miro-canvas-locked")).toBe(true);
		f.session.dispose();
		expect(f.element("card-3").classes.has("miro-canvas-locked")).toBe(false);
		expect(f.element("card-3").hasAttribute("data-miro-canvas-locked")).toBe(false);
	});

	it("looks at a locked card again, and puts its mark back if the host dropped it", () => {
		const f = fixture(20);
		f.element("card-7").classes.delete("miro-canvas-locked");
		f.element("card-7").attributes.delete("data-miro-canvas-locked");
		f.lock(["card-7", "card-8"]);
		expect(f.element("card-7").classes.has("miro-canvas-locked")).toBe(true);
		expect(f.element("card-7").getAttribute("data-miro-canvas-locked")).toBe("true");
	});
});

describe("what a drag does not repeat", () => {
	it("reads the selection's ids once for as long as it holds the same items", () => {
		const f = fixture(50);
		for (const node of f.nodes.values()) f.canvas.select(node);
		f.internals.readInteractionState();
		const ids = f.internals.selectedIds as readonly string[];
		const set = f.internals.selectedIdSet as ReadonlySet<string>;
		expect(ids).toHaveLength(50);
		const read = vi.spyOn(f.nodes.get("card-0")!, "getData");
		for (let press = 0; press < 5; press += 1) f.internals.readInteractionState();
		// The same lists, not worked out again: what is worked out from them stays known.
		expect(f.internals.selectedIds).toBe(ids);
		expect(f.internals.selectedIdSet).toBe(set);
		expect(read).not.toHaveBeenCalled();
		// Another selection is read again.
		f.canvas.selection.delete(f.nodes.get("card-3")!);
		f.internals.readInteractionState();
		expect(f.internals.selectedIds).not.toBe(ids);
		expect(f.internals.selectedIds).toHaveLength(49);
		expect(f.internals.selectedIdSet.has("card-3")).toBe(false);
	});

	it("keeps the lists of selected ids while the same ids are set again", () => {
		const f = fixture(3);
		f.internals.setSelectedIds(["card-0", "card-1"]);
		const ids = f.internals.selectedIds;
		f.internals.setSelectedIds(["card-0", "card-1"]);
		expect(f.internals.selectedIds).toBe(ids);
		f.internals.setSelectedIds(["card-1", "card-0"]);
		expect(f.internals.selectedIds).not.toBe(ids);
		expect([...f.internals.selectedIdSet].sort()).toEqual(["card-0", "card-1"]);
	});

	it("does not poll while a drag is being followed, and polls again when it stalls or ends", () => {
		vi.useFakeTimers();
		const f = fixture(10);
		const refresh = vi.spyOn(f.session, "refresh");
		f.internals.pointerHeld = true;
		f.internals.lastLiveReadAt = Date.now();
		vi.advanceTimersByTime(600);
		expect(refresh).not.toHaveBeenCalled();
		// Followed a moment ago: the frames are keeping up already.
		f.internals.lastLiveReadAt = Date.now();
		vi.advanceTimersByTime(700);
		expect(refresh).not.toHaveBeenCalled();
		// A drag that stopped moving, held still: the poll resumes.
		vi.advanceTimersByTime(2000);
		expect(refresh).toHaveBeenCalled();
		refresh.mockClear();
		// Let go: the poll is as it always was.
		f.internals.pointerHeld = false;
		vi.advanceTimersByTime(800);
		expect(refresh).toHaveBeenCalled();
	});

	it("does not measure the board for the export pages when nothing is being exported", () => {
		const f = fixture(10);
		const measured = vi.spyOn(f.internals, "exportOrigin");
		f.internals.updateExportOverlay();
		f.internals.followViewport();
		expect(measured).not.toHaveBeenCalled();
	});

	it("does not look for the card under the pointer on every move of a selection drag", () => {
		const f = fixture(10);
		const search = vi.spyOn(f.internals, "eventElementId");
		f.internals.selectionMoveEnd = () => {};
		f.root.emit("pointermove", f.root, { buttons: 1 });
		expect(search).not.toHaveBeenCalled();
		f.internals.selectionMoveEnd = undefined;
		f.root.emit("pointermove", f.root, { buttons: 1 });
		expect(search).toHaveBeenCalled();
	});
});
