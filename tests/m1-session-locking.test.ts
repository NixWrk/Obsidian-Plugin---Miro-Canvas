import { afterEach, describe, expect, it, vi } from "vitest";
import { M1CanvasSession, type M1SessionOptions } from "../src/m1-session";
import { MetadataWriter } from "../src/metadata-writer";
import { createObsidianMetadataStore } from "../src/obsidian-metadata-store";
import type { M1ControlsActions } from "../src/m1-controls";
import { APPEARANCE_ACTIONS } from "../src/appearance";

// Only the presentation is replaced. Use the real adapter, policy, writer and
// native metadata store. EventTarget supplies cancellation/listener ordering;
// native callbacks below deliberately mutate without consulting the policy.
vi.mock("../src/m1-controls", () => ({
	M1Controls: class {
		element = new HostElement("miro-canvas-panel");
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
	style = {};
	clientWidth = 800;
	clientHeight = 600;
	classList = { add() {}, remove() {}, contains: () => false };
	constructor(public className = "", public tagName = "DIV") { super(); }
	appendChild(child: HostElement) { child.parentElement = this; this.children.push(child); return child; }
	removeChild(child: HostElement) { this.children = this.children.filter((item) => item !== child); }
	remove() { this.parentElement?.removeChild(this); }
	setAttribute(key: string, value: string) { this.attributes.set(key, value); }
	getAttribute(key: string) { return this.attributes.get(key) ?? null; }
	hasAttribute(key: string) { return this.attributes.has(key); }
	removeAttribute(key: string) { this.attributes.delete(key); }
	contains(target: unknown): boolean { return target === this || this.children.some((child) => child.contains(target)); }
	closest(selector: string): HostElement | null {
		for (const part of selector.split(",").map((value) => value.trim())) {
			if (part.startsWith(".") && this.className.split(" ").includes(part.slice(1))) return this;
			if (part.startsWith("[") && this.hasAttribute(part.slice(1, -1))) return this;
			if (part.toUpperCase() === this.tagName) return this;
		}
		return this.parentElement?.closest(selector) ?? null;
	}
	emit(type: string, target: unknown = this, props: Record<string, unknown> = {}, cancelable = true) {
		const event = new Event(type, { cancelable, bubbles: true });
		for (const [key, value] of Object.entries({ target, ...props })) Object.defineProperty(event, key, { value });
		this.dispatchEvent(event);
		return event;
	}
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Data = Record<string, any>;
const sessions: M1CanvasSession[] = [];
afterEach(() => { sessions.splice(0).forEach((session) => session.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** A board with a locked card, a free one and, for a large selection, as many more free cards as asked. */
function fixture(moreCards = 0, options: M1SessionOptions = {}) {
	const root = new HostElement("canvas-wrapper");
	const nodeData = (id: string) => ({ id, type: "text", text: id, x: 0, y: 0, width: 100, height: 80, futureNode: { keep: id } });
	const more = Array.from({ length: moreCards }, (_, index) => nodeData(`card-${index}`));
	const initial: Data = {
		nodes: [nodeData("locked"), nodeData("free"), ...more], edges: [],
		miroCanvas: { schemaVersion: 1, settings: {}, localOverrides: { locked: { locked: true, futureOverride: [1, 2] } }, futureMetadata: { keep: true } },
		miroSource: { items: [{ id: "locked", future: ["immutable"] }] }, futureRoot: { keep: true },
	};
	class NativeNode {
		nodeEl = root.appendChild(new HostElement("canvas-node"));
		editing = false;
		constructor(public data: Data) {}
		getData() { return clone(this.data); }
		moveTo(point: Data) { Object.assign(this.data, point); return "moved"; }
		moveAndResize(rect: Data) { Object.assign(this.data, rect); }
		resize(rect: Data) { Object.assign(this.data, rect); }
		setText(text: string) { this.data.text = text; }
		setColor(color: string) { this.data.color = color; }
		setData(data: Data) { this.data = clone(data); }
		startEditing() { this.editing = true; }
	}
	const nodes = new Map(initial.nodes.map((data: Data) => [data.id as string, new NativeNode(clone(data))])) as Map<string, NativeNode>;
	const selection = new Set<NativeNode>();
	const history: Data[] = [clone(initial)];
	let index = 0;
	const canvas = {
		wrapperEl: root, nodes, edges: new Map(), selection,
		data: clone(initial), readonly: false,
		getData() { return { ...clone(this.data), nodes: [...nodes.values()].map((node) => node.getData()) }; },
		setViewport() {}, requestRender() {},
		setReadonly(value: boolean) { this.readonly = value; },
		selectOnly(node: NativeNode) { selection.clear(); selection.add(node); },
		select(node: NativeNode) { selection.add(node); },
		removeNode(node: NativeNode) { nodes.delete(node.data.id); },
		removeSelection() { for (const node of selection) this.removeNode(node); },
		requestSave(addHistory: boolean) {
			if (addHistory) { history.splice(index + 1); history.push(this.getData()); index++; }
		},
		importData(data: Data) {
			this.data = clone(data);
			for (const item of data.nodes) {
				const existing = nodes.get(item.id);
				if (existing) existing.setData(item);
				else nodes.set(item.id, new NativeNode(clone(item)));
			}
			for (const node of nodes.values()) if (!data.nodes.some((item: Data) => item.id === node.data.id)) this.removeNode(node);
		},
		undo() { if (index > 0) this.importData(history[--index]); },
		redo() { if (index + 1 < history.length) this.importData(history[++index]); },
	};
	const view = { canvas };
	const store = createObsidianMetadataStore(view).store;
	expect(store).toBeDefined();
	const session = new M1CanvasSession(view, new MetadataWriter(store!), options);
	sessions.push(session);
	expect(session.mount()).toBe(true);
	const locked = nodes.get("locked")!;
	const free = nodes.get("free")!;
	const actions = (session.controls as unknown as { actions: M1ControlsActions }).actions;
	return { root, canvas, session, locked, free, selection, initial, history, actions };
}

describe("committed knowledge publication", () => {
	it("coalesces action saves and never publishes from render refreshes", async () => {
		const publish = vi.fn();
		const { canvas, session, free } = fixture(0, { onCommittedBoardDocument: publish });
		free.setText("[[New link]]");canvas.data = canvas.getData();canvas.requestSave(true);canvas.requestSave(false);
		session.notifyCommittedBoardDocument();session.notifyCommittedBoardDocument();
		session.refresh();session.refresh();expect(publish).not.toHaveBeenCalled();await Promise.resolve();
		expect(publish).toHaveBeenCalledTimes(1);
		expect((publish.mock.calls[0]![0] as Data).nodes.find((node: Data) => node.id === "free").text).toBe("[[New link]]");
		expect(publish.mock.calls[0]![0]).toBe(publish.mock.calls[0]![1]);
		session.refresh();await Promise.resolve();expect(publish).toHaveBeenCalledTimes(1);
	});
	it("publishes native Undo and Redo only at the outer history boundary", async () => {
		const publish = vi.fn();
		const { canvas, free, session } = fixture(0, { onCommittedBoardDocument: publish });
		free.setText("Changed link");canvas.data = canvas.getData();canvas.requestSave(true);session.notifyCommittedBoardDocument();await Promise.resolve();publish.mockClear();
		canvas.undo();await Promise.resolve();
		expect((publish.mock.calls[0]![0] as Data).nodes.find((node: Data) => node.id === "free").text).toBe("free");
		canvas.redo();await Promise.resolve();expect(publish).toHaveBeenCalledTimes(2);
		expect((publish.mock.calls[1]![0] as Data).nodes.find((node: Data) => node.id === "free").text).toBe("Changed link");
	});
	it("suppresses a held preview until a subsequent settled commit", async () => {
		const publish = vi.fn();
		const { canvas, session } = fixture(0, { onCommittedBoardDocument: publish });
		const internal = session as unknown as { pointerHeld: boolean };
		internal.pointerHeld = true;canvas.requestSave(false);session.notifyCommittedBoardDocument();await Promise.resolve();expect(publish).not.toHaveBeenCalled();
		internal.pointerHeld = false;session.refresh();await Promise.resolve();expect(publish).not.toHaveBeenCalled();
		canvas.requestSave(true);session.notifyCommittedBoardDocument();await Promise.resolve();expect(publish).toHaveBeenCalledTimes(1);
	});
	it("drops queued publication and releases its owner once on unload", async () => {
		const publish = vi.fn(), release = vi.fn();
		const { canvas, session } = fixture(0, { onCommittedBoardDocument: publish, onReleaseBoardDocument: release });
		canvas.requestSave(true);session.notifyCommittedBoardDocument();session.dispose();session.dispose();await Promise.resolve();
		expect(publish).not.toHaveBeenCalled();expect(release).toHaveBeenCalledTimes(1);
	});
});

describe("selection frame follows the displayed card", () => {
	it("uses live size and displayed zoom while native resize and camera animation have not committed", () => {
		vi.stubGlobal("HTMLElement", HostElement);
		const { root, free, session } = fixture();
		Object.assign(root, { getBoundingClientRect: () => ({ left: 10, top: 20, right: 810, bottom: 620 }) });
		Object.assign(free, { id: "free", width: 240, height: 120 });
		Object.assign(free.nodeEl, { getBoundingClientRect: () => ({ left: 110, top: 120, right: 290, bottom: 210 }) });
		const internal = session as any;
		internal.handles.element = Object.assign(new HostElement(), { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0 }) });
		vi.spyOn(internal, "displayViewport").mockReturnValue({ x: 0, y: 0, zoom: 0.75 });
		expect(internal.handleRect("free")).toEqual({ left: 100, top: 100, width: 180, height: 90 });
	});
});

describe("radius marker follows the displayed camera", () => {
	it("passes the global percentage as a scale only to the selected shape", () => {
		vi.stubGlobal("HTMLElement", HostElement);
		const { session, free } = fixture();
		const internal = session as any;
		internal.settings = { ...internal.settings, shapeRadiusControlMinZoomPercent: 125 };
		internal.selectedIds = ["free"];
		internal.shapeRadiusHandle = { update: vi.fn(), updateZoom: vi.fn(), dispose: vi.fn() };
		vi.spyOn(internal, "landingGeometry").mockReturnValue({ scene: { items: new Map([
			["free", { shape: "round_rectangle", cornerRadius: 16 }],
		]) } });
		vi.spyOn(internal, "nodeRect").mockReturnValue({ x: 0, y: 0, width: 250, height: 60 });
		vi.spyOn(internal, "displayViewport").mockReturnValue({ x: 0, y: 0, zoom: 1.5 });
		internal.updateShapeRadiusHandle(true);
		expect(internal.shapeRadiusHandle.update).toHaveBeenLastCalledWith(expect.objectContaining({
			id: "free", nodeEl: free.nodeEl, zoom: 1.5, minimumZoom: 1.25,
		}));
	});
	it("updates zoom between session refreshes without walking the board nodes", () => {
		const { session } = fixture();
		const internal = session as any;
		const updateZoom = vi.fn();
		internal.shapeRadiusHandle = { updateZoom, update: vi.fn(), dispose: vi.fn() };
		const displayed = vi.spyOn(internal, "displayViewport");
		for (const zoom of [0.5, 1, 1.99, 2]) {
			displayed.mockReturnValue({ x: 0, y: 0, zoom });
			internal.followViewport();
			expect(updateZoom).toHaveBeenLastCalledWith(zoom);
		}
	});
});

describe("resize history", () => {
  it("repaints metadata after native Undo and Redo without another board input", () => {
    const { canvas, session, initial } = fixture();
    canvas.data.miroCanvas = { ...canvas.data.miroCanvas, settings: { reviewMode: true } };
    canvas.requestSave(true);
    session.refresh();
    expect(session.snapshot.reviewMode).toBe(true);
    canvas.undo();
    expect(session.snapshot.reviewMode).toBe(false);
    expect((canvas.getData() as Data).miroSource).toEqual(initial.miroSource);
    canvas.redo();
    expect(session.snapshot.reviewMode).toBe(true);
    expect((canvas.getData() as Data).miroSource).toEqual(initial.miroSource);
  });
	it("restores a cancelled preview without saving, then commits a later resize once", () => {
		const { canvas, free, session } = fixture();
		canvas.selectOnly(free);
		const internal = session as any;
		internal.refresh();
		for (const key of ["x", "y", "width", "height"]) {
			Object.defineProperty(free, key, { get: () => free.data[key] });
		}
		const original = clone(free.data);
		const target = { x: 0, y: -20, width: 140, height: 100 };
		vi.spyOn(internal, "boardBox").mockReturnValue(target);
		const save = vi.spyOn(canvas, "requestSave");
		const rect = { left: 0, top: 0, width: 140, height: 100 };
		internal.applyHandleResize(rect, false);
		expect(free.data.width).toBe(140);
		expect(save).not.toHaveBeenCalled();
		const cancel = vi.spyOn(internal.handles, "cancelGesture").mockImplementation(() => internal.cancelHandleResize());
		internal.resetTools();
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(free.data).toEqual(original);
		expect(save).not.toHaveBeenCalled();
		canvas.selectOnly(free);
		internal.refresh();
		internal.applyHandleResize(rect, false);
		internal.applyHandleResize(rect, true);
		expect(save).toHaveBeenCalledTimes(1);
		expect(free.data).toEqual({ ...original, ...target });
	});
});


describe("formatting a fragment through the native editor", () => {
	function editing(locked = false) {
		const rig = fixture();
		const node = (locked ? rig.locked : rig.free) as any;
		rig.canvas.selectOnly(node);
		node.text = "Начало середина конец";
		node.isEditing = true;
		let value = node.text;
		let from = { line: 0, ch: 7 };
		let to = { line: 0, ch: 15 };
		const editor = {
			getSelection: () => value.slice(from.ch, to.ch),
			getCursor: (end: string) => end === "from" ? from : to,
			getRange: (start: typeof from, end: typeof to) => value.slice(start.ch, end.ch),
			replaceRange: vi.fn((text: string, start: typeof from, end: typeof to) => { value = value.slice(0, start.ch) + text + value.slice(end.ch); }),
			setSelection: (start: typeof from, end: typeof to) => { from = start; to = end; },
		};
		node.child = { editor };
		const session = rig.session as any;
		session.refresh();
		return { ...rig, node, editor, internal: session, value: () => value };
	}
	it("preserves surrounding text and uses native editor undo instead of card metadata", () => {
		const rig = editing();
		rig.internal.applyAppearance({ type: APPEARANCE_ACTIONS.setFormat, format: { bold: true } });
		expect(rig.value()).toBe("Начало **середина** конец");
		expect(rig.editor.replaceRange).toHaveBeenCalledTimes(1);
		expect(rig.canvas.data.miroCanvas.localOverrides.free).toBeUndefined();
	});
	it("retains a captured range while the toolbar's size input has focus", () => {
		const rig = editing();
		rig.internal.captureTextFragment();
		rig.node.isEditing = false;
		rig.internal.applyAppearance({ type: APPEARANCE_ACTIONS.setFontSize, fontSize: 24 });
		expect(rig.value()).toBe('Начало <span style="font-size: 24px">середина</span> конец');
	});
	it("refuses a stale range instead of formatting the whole card", () => {
		const rig = editing();
		rig.internal.captureTextFragment();
		rig.node.isEditing = false;
		rig.editor.getRange = () => "changed";
		rig.internal.applyAppearance({ type: APPEARANCE_ACTIONS.setFormat, format: { italic: true } });
		expect(rig.editor.replaceRange).not.toHaveBeenCalled();
		expect(rig.canvas.data.miroCanvas.localOverrides.free).toBeUndefined();
	});
	it("keeps the locked-card policy for a selected fragment", () => {
		const rig = editing(true);
		rig.internal.applyAppearance({ type: APPEARANCE_ACTIONS.setFormat, format: { bold: true } });
		expect(rig.editor.replaceRange).not.toHaveBeenCalled();
	});

	it("does not stringify an unknown node value while capturing a plain text fragment", () => {
		const rig = editing();
		const stringify = vi.fn(() => { throw Error("unexpected conversion"); });
		rig.node.text = { toString: stringify };
		expect(() => rig.internal.captureTextFragment()).not.toThrow();
		expect(rig.internal.textFragment.html).toBe(false);
		expect(stringify).not.toHaveBeenCalled();
	});

	it("recognizes actual HTML strings while preserving the native selected fragment", () => {
		const rig = editing();
		rig.node.text = "<p>HTML body</p>";
		rig.internal.captureTextFragment();
		expect(rig.internal.textFragment.html).toBe(true);
		expect(rig.internal.textFragment.text).toBe("середина");
	});
});

describe("native clipboard command capabilities", () => {

	it.each([false, "throw", "missing"])("does not change the board when legacy clipboard capability fails: %s", (failure) => {
		const rig = fixture();
		const original = clone(rig.canvas.data);
		Object.assign(rig.root, { focus: vi.fn() });
		const document = {
			createElement: () => undefined,
			...(failure === "missing" ? {} : { execCommand: vi.fn(function (this: unknown, action: string) {
				expect(this).toBe(document);
				expect(action).toBe("cut");
				if (failure === "throw") throw Error("clipboard unavailable");
				return false;
			}) }),
		};
		Object.assign(rig.root, { ownerDocument: document });
		const internal = rig.session as unknown as { clipboardCommand(action: "cut"): void };
		expect(() => internal.clipboardCommand("cut")).not.toThrow();
		expect(rig.canvas.data).toEqual(original);
	});

	it("prefers the owner window's native editing command over browser fallback", () => {
		const rig = fixture();
		Object.assign(rig.root, { focus: vi.fn() });
		const contents = { copy: vi.fn(function (this: unknown) { expect(this).toBe(contents); }) };
		const fallback = vi.fn(() => true);
		Object.assign(rig.root, { ownerDocument: { createElement: () => undefined, execCommand: fallback, defaultView: { electron: { remote: { getCurrentWebContents: () => contents } } } } });
		const internal = rig.session as unknown as { clipboardCommand(action: "copy"): void };
		internal.clipboardCommand("copy");
		expect(contents.copy).toHaveBeenCalledOnce();
		expect(fallback).not.toHaveBeenCalled();
	});
});

describe("M1 session lock enforcement", () => {
	it.each(["pointerdown", "mousedown"])("blocks %s before native drag/resize initialization and permits selection for unlock", (type) => {
		const { root, canvas, locked, session } = fixture();
		const resizeHandle = locked.nodeEl.appendChild(new HostElement("canvas-node-resizer"));
		const native = vi.fn(() => { locked.data.x = 400; locked.data.width = 900; });
		root.addEventListener(type, native);
		expect(root.emit(type, resizeHandle, { button: 0, buttons: 1 }).defaultPrevented).toBe(true);
		expect(native).not.toHaveBeenCalled();
		expect(canvas.selection.has(locked)).toBe(true);
		session.unlockSelection();
		expect(root.emit(type, resizeHandle, { button: 0, buttons: 1 }).defaultPrevented).toBe(false);
		expect(native).toHaveBeenCalledTimes(1);
	});

	it("keeps the blocked drag origin when pointermove leaves the node and selection changes", () => {
		const { root, locked, selection } = fixture();
		root.emit("pointerdown", locked.nodeEl, { button: 0, buttons: 1 });
		selection.clear();
		const native = vi.fn(() => { locked.data.x = 99; });
		root.addEventListener("pointermove", native);
		expect(root.emit("pointermove", root, { buttons: 1 }).defaultPrevented).toBe(true);
		expect(native).not.toHaveBeenCalled();
		root.emit("pointercancel");
		expect(root.emit("pointermove", root, { buttons: 1 }).defaultPrevented).toBe(false);
	});

	it("blocks double click in native content without relying on data-id decoration", () => {
		const { root, locked } = fixture();
		const content = locked.nodeEl.appendChild(new HostElement());
		const native = vi.fn(() => { locked.editing = true; });
		root.addEventListener("dblclick", native);
		expect(root.emit("dblclick", content).defaultPrevented).toBe(true);
		expect(native).not.toHaveBeenCalled();
		expect(locked.editing).toBe(false);
	});

	it.each(["insertFromPaste", "insertCompositionText", "insertReplacementText", "deleteByCut", "formatFontColor", "futureInput", undefined])("blocks beforeinput %s and noncancelable input from an already focused editor", (inputType) => {
		const { root, locked, selection } = fixture();
		const editor = locked.nodeEl.appendChild(new HostElement("", "TEXTAREA"));
		selection.clear();
		const native = vi.fn(() => { locked.data.text = "bypassed"; });
		root.addEventListener("beforeinput", native);
		root.addEventListener("input", native);
		expect(root.emit("beforeinput", editor, { inputType }).defaultPrevented).toBe(true);
		root.emit("input", editor, { inputType }, false);
		expect(native).not.toHaveBeenCalled();
		expect(locked.data.text).toBe("locked");
	});

	it.each(["Delete", "Backspace", "ArrowRight", "Enter"])("checks live mixed selection on %s even when the target is unlocked", (key) => {
		const { root, free, locked, selection } = fixture();
		selection.add(free); selection.add(locked); // No polling/refresh.
		const native = vi.fn();
		root.addEventListener("keydown", native);
		expect(root.emit("keydown", free.nodeEl, { key }).defaultPrevented).toBe(true);
		expect(native).not.toHaveBeenCalled();
	});

	it("blocks a selection resize and group drag initiated on its free member", () => {
		const { root, free, locked, selection } = fixture();
		selection.add(free); selection.add(locked);
		const handle = root.appendChild(new HostElement("canvas-selection"));
		expect(root.emit("pointerdown", handle, { button: 0 }).defaultPrevented).toBe(true);
		expect(root.emit("pointerdown", free.nodeEl, { button: 0 }).defaultPrevented).toBe(true);
	});

	it("guards native mutations invoked outside the Canvas DOM", () => {
		const { locked, free, canvas, initial, selection } = fixture();
		locked.moveTo({ x: 100 }); locked.moveAndResize({ width: 999 }); locked.resize({ height: 999 });
		locked.setText("changed"); locked.setColor("red"); locked.startEditing();
		locked.setData({ ...locked.getData(), futureNode: "lost" });
		canvas.removeNode(locked);
		selection.add(locked); canvas.removeSelection();
		expect(locked.getData()).toEqual(initial.nodes[0]);
		expect(locked.editing).toBe(false);
		expect(canvas.nodes.has("locked")).toBe(true);
		expect(free.moveTo({ x: 5 })).toBe("moved");
		expect(free.data.x).toBe(5);
	});

	it("checks each card of a large native move against one reading, still refusing the locked one", () => {
		const { canvas, locked, selection, session } = fixture(400);
		const cards = [...canvas.nodes.values()];
		for (const card of cards) selection.add(card);
		const reads = vi.spyOn(session as unknown as { readInteractionState(): void }, "readInteractionState");
		// Native Canvas moves a dragged selection card by card, all in one go.
		const results = cards.map((card) => card.moveTo({ x: 10 }));
		expect(reads.mock.calls.length).toBeLessThanOrEqual(1);
		expect(results.filter((result) => result !== "moved")).toHaveLength(1);
		expect(locked.data.x).toBe(0);
		expect(cards.filter((card) => card !== locked).every((card) => card.data.x === 10)).toBe(true);
	});

	it("reads the board again for the next card once a lock or review mode is written in the same turn", async () => {
		const { canvas, locked, selection, session } = fixture(3);
		const cards = [...canvas.nodes.values()].filter((card) => card !== locked);
		for (const card of cards) selection.add(card);
		expect(cards[0]!.moveTo({ x: 1 })).toBe("moved");
		// The same selection, locked between two cards of one move.
		session.lockSelection();
		expect(cards[1]!.moveTo({ x: 1 })).toBeUndefined();
		expect(cards[1]!.data.x).toBe(0);
		session.unlockSelection();
		expect(cards[1]!.moveTo({ x: 2 })).toBe("moved");
		session.toggleReviewMode();
		expect(cards[2]!.moveTo({ x: 3 })).toBeUndefined();
		expect(cards[2]!.data.x).toBe(0);
		// A later turn reads the board again as well.
		await Promise.resolve();
		expect(cards[3]!.moveTo({ x: 4 })).toBeUndefined();
		session.toggleReviewMode();
		await Promise.resolve();
		expect(cards[3]!.moveTo({ x: 4 })).toBe("moved");
		// A locked card added to the selection in the same turn is refused.
		selection.add(locked);
		expect(locked.moveTo({ x: 5 })).toBeUndefined();
		expect(locked.data.x).toBe(0);
	});

	it("uses current policy and selection for property controls and allows explicit unlock", () => {
		const { locked, free, selection, actions, canvas, session, root } = fixture();
		selection.add(free); session.refresh();
		selection.add(locked);
		actions.onAppearance({ type: "set-font-size", fontSize: 30 });
		expect(canvas.data.miroCanvas.localOverrides.free).toBeUndefined();
		const input = new HostElement("", "INPUT");
		root.appendChild(input);
		expect(root.emit("change", input).defaultPrevented).toBe(true);
		session.unlockSelection();
		expect(canvas.data.miroCanvas.localOverrides.locked.locked).toBe(false);
		locked.setText("unlocked");
		expect(locked.data.text).toBe("unlocked");
	});

	it("preserves source/unknown fields and lets native undo/redo restore locked nodes", () => {
		const { root, canvas, session, locked, selection, initial, history } = fixture();
		selection.add(locked);
		session.unlockSelection();
		locked.moveTo({ x: 50 }); locked.setText("after"); canvas.requestSave(true);
		session.lockSelection();
		expect(history).toHaveLength(4);
		canvas.undo(); // Undo lock, without a session refresh.
		canvas.undo(); // Undo the edit.
		expect(locked.data).toEqual(initial.nodes[0]);
		canvas.undo(); // Undo unlock.
		locked.setText("blocked again");
		expect(locked.data.text).toBe("locked");
		canvas.redo(); canvas.redo(); canvas.redo();
		expect(locked.data).toMatchObject({ text: "after", x: 50 });
		locked.moveTo({ x: 600 });
		expect(locked.data.x).toBe(50);
		for (const snapshot of history) {
			expect(snapshot.miroSource).toEqual(initial.miroSource);
			expect(snapshot.futureRoot).toEqual(initial.futureRoot);
			expect(snapshot.miroCanvas.futureMetadata).toEqual(initial.miroCanvas.futureMetadata);
			expect(snapshot.miroCanvas.localOverrides.locked.futureOverride).toEqual([1, 2]);
		}
		for (const [key, shiftKey] of [["z", false], ["z", true], ["y", false]] as const) {
			expect(root.emit("keydown", root, { key, ctrlKey: true, shiftKey }).defaultPrevented).toBe(false);
		}
		for (const inputType of ["historyUndo", "historyRedo"]) expect(root.emit("beforeinput", root, { inputType }).defaultPrevented).toBe(false);
	});

	it.each([null, { schemaVersion: 999 }, { schemaVersion: 1, localOverrides: { locked: { locked: "yes" } } }])("fails closed for malformed or unsupported metadata %j", (metadata) => {
		const { canvas, root, free } = fixture();
		canvas.data.miroCanvas = metadata;
		expect(root.emit("pointerdown", free.nodeEl, { button: 0 }).defaultPrevented).toBe(true);
		free.setText("changed");
		expect(free.data.text).toBe("free");
	});

	it("fails closed for an unreadable or unidentifiable selection", () => {
		const { canvas, root, free } = fixture();
		(canvas.selection as Set<unknown>).add({});
		expect(root.emit("dblclick", free.nodeEl).defaultPrevented).toBe(true);
		Object.defineProperty(canvas, "selection", { get: () => { throw new Error("unavailable"); } });
		free.moveTo({ x: 4 });
		expect(free.data.x).toBe(0);
	});

	it.each(["review", "native", "presentation"])("leaves %s touch pan/pinch to native Canvas while guarding edits", (mode) => {
		const { root, free, locked, selection, session, canvas, history } = fixture();
		if (mode === "review") session.toggleReviewMode();
		if (mode === "native") Reflect.set(session, "readonlyOriginal", true);
		if (mode === "presentation") Reflect.set(session, "slideShow", { active: true, stop() {}, dispose() {} });
		session.refresh();
		selection.add(free);
		selection.add(locked);
		const initial = canvas.getData();
		const initialHistory = history.length;
		const frame = root.appendChild(new HostElement("canvas-selection"));
		const pan = vi.fn();
		root.addEventListener("pointerdown", pan);
		root.addEventListener("pointermove", pan);
		for (const target of [free.nodeEl, locked.nodeEl, frame, root]) {
			for (const isPrimary of [true, false]) {
				expect(root.emit("pointerdown", target, { button: 0, buttons: 1, pointerType: "touch", isPrimary }).defaultPrevented).toBe(false);
				expect(root.emit("pointermove", target, { button: -1, buttons: 1, pointerType: "touch", isPrimary }).defaultPrevented).toBe(false);
			}
		}
		expect(pan).toHaveBeenCalledTimes(16);
		free.moveTo({ x: 30 });
		free.resize({ width: 800 });
		free.setText("changed");
		expect(root.emit("pointerdown", free.nodeEl, { button: 0, pointerType: "mouse" }).defaultPrevented).toBe(true);
		expect(root.emit("pointerdown", free.nodeEl, { button: 0, pointerType: "pen" }).defaultPrevented).toBe(true);
		expect(canvas.getData()).toEqual(initial);
		expect(history).toHaveLength(initialHistory);
	});

	it("admits right/middle/Space mouse pan moves without admitting a stylus side-button edit", () => {
		const { root, free, session } = fixture();
		session.toggleReviewMode();
		expect(root.emit("pointermove", free.nodeEl, { buttons: 2, pointerType: "mouse" }).defaultPrevented).toBe(false);
		expect(root.emit("pointermove", free.nodeEl, { buttons: 4, pointerType: "mouse" }).defaultPrevented).toBe(false);
		expect(root.emit("pointermove", free.nodeEl, { buttons: 2, pointerType: "pen" }).defaultPrevented).toBe(true);
		expect(root.emit("pointermove", free.nodeEl, { buttons: 1, pointerType: "mouse" }).defaultPrevented).toBe(true);
		root.emit("keydown", root, { key: " " });
		expect(root.emit("pointermove", free.nodeEl, { buttons: 1, pointerType: "mouse" }).defaultPrevented).toBe(false);
	});

	it("declines a viewing mixed-selection move before claiming the touch, then restores editing", () => {
		const { root, free, locked, selection, session } = fixture();
		selection.add(free);
		selection.add(locked);
		session.toggleReviewMode();
		const event = new Event("pointerdown", { cancelable: true });
		Object.defineProperty(event, "target", { value: free.nodeEl });
		Object.defineProperty(event, "button", { value: 0 });
		const internal = session as unknown as { startSelectionMove(event: PointerEvent): boolean };
		expect(internal.startSelectionMove(event as PointerEvent)).toBe(false);
		expect(event.defaultPrevented).toBe(false);
		session.toggleReviewMode();
		expect(root.emit("pointerdown", locked.nodeEl, { button: 0, pointerType: "touch" }).defaultPrevented).toBe(true);
		selection.clear();
		expect(root.emit("pointerdown", free.nodeEl, { button: 0, pointerType: "touch" }).defaultPrevented).toBe(false);
		expect(free.moveTo({ x: 20 })).toBe("moved");
	});

	it("allows blank pan, middle/space pan, copy and plugin controls while locked", () => {
		const { root, locked, selection, session } = fixture();
		selection.add(locked);
		expect(root.emit("pointerdown", root, { button: 0 }).defaultPrevented).toBe(false);
		expect(root.emit("pointerdown", locked.nodeEl, { button: 1 }).defaultPrevented).toBe(false);
		root.emit("keydown", root, { key: " " });
		expect(root.emit("pointerdown", locked.nodeEl, { button: 0 }).defaultPrevented).toBe(false);
		root.emit("keyup", root, { key: " " });
		expect(root.emit("keydown", locked.nodeEl, { key: "c", ctrlKey: true }).defaultPrevented).toBe(false);
		expect(root.emit("pointerdown", session.controls.element, { button: 0 }).defaultPrevented).toBe(false);
	});

	it("restores instance hooks/listeners on dispose without overwriting a later plugin hook", () => {
		const { root, locked, free, session } = fixture();
		const laterHook = vi.fn();
		free.setText = laterHook;
		session.dispose();
		expect(Object.prototype.hasOwnProperty.call(locked, "setText")).toBe(false);
		expect(free.setText).toBe(laterHook);
		locked.setText("released");
		expect(locked.data.text).toBe("released");
		expect(root.emit("pointerdown", locked.nodeEl, { button: 0 }).defaultPrevented).toBe(false);
	});
});
