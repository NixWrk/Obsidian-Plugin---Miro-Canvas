import { describe, expect, it } from "vitest";

import { MEASURED_SELECTION_LIMIT, SelectionBounds, sameIds, sameMembers, type ScreenRect, type SelectedElement } from "../src/selection-bounds";

/** A card on the page: its box is worked out from where it is and how the board is shown. */
interface FakeCard {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	/** A turned card's page box is the box around its turned outline. */
	rotation?: number;
	/** Taken off the page: it measures as an empty box. */
	detached?: boolean;
}

interface View {
	zoom: number;
	panX: number;
	panY: number;
}

function pageBox(card: FakeCard, view: View): ScreenRect {
	if (card.detached === true) return { left: 0, top: 0, right: 0, bottom: 0 };
	const angle = ((card.rotation ?? 0) * Math.PI) / 180;
	const halfWidth = (Math.abs(Math.cos(angle)) * card.width + Math.abs(Math.sin(angle)) * card.height) / 2;
	const halfHeight = (Math.abs(Math.sin(angle)) * card.width + Math.abs(Math.cos(angle)) * card.height) / 2;
	const centreX = card.x + card.width / 2;
	const centreY = card.y + card.height / 2;
	const screen = (value: number, pan: number): number => (value - pan) * view.zoom;
	return {
		left: screen(centreX - halfWidth, view.panX) + 100,
		top: screen(centreY - halfHeight, view.panY) + 50,
		right: screen(centreX + halfWidth, view.panX) + 100,
		bottom: screen(centreY + halfHeight, view.panY) + 50,
	};
}

function board(count: number): FakeCard[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `card-${index}`,
		x: (index % 8) * 300,
		y: Math.floor(index / 8) * 200,
		width: 240,
		height: 120,
		...(index === 5 ? { rotation: 30 } : {}),
	}));
}

function trueUnion(cards: readonly FakeCard[], view: View): ScreenRect {
	const boxes = cards.map((card) => pageBox(card, view));
	return {
		left: Math.min(...boxes.map((box) => box.left)),
		top: Math.min(...boxes.map((box) => box.top)),
		right: Math.max(...boxes.map((box) => box.right)),
		bottom: Math.max(...boxes.map((box) => box.bottom)),
	};
}

/** A selection and a counter of how many boxes were measured. */
function harness(cards: FakeCard[], view: View) {
	let measured = 0;
	const bounds = new SelectionBounds();
	const ids = new Set(cards.map((card) => card.id));
	const request = (boardIdentity: unknown = "saved") => ({
		ids,
		board: boardIdentity,
		elements: (): readonly SelectedElement[] => cards.map((card) => ({ element: card, card: true })),
		measure: (element: unknown): ScreenRect => {
			measured += 1;
			return pageBox(element as FakeCard, view);
		},
		onPage: (element: unknown): boolean => (element as FakeCard).detached !== true,
	});
	return {
		bounds,
		request,
		measured: () => measured,
		resetCount: () => { measured = 0; },
	};
}

function expectClose(actual: ScreenRect | undefined, expected: ScreenRect): void {
	expect(actual).toBeDefined();
	expect(actual!.left).toBeCloseTo(expected.left, 6);
	expect(actual!.top).toBeCloseTo(expected.top, 6);
	expect(actual!.right).toBeCloseTo(expected.right, 6);
	expect(actual!.bottom).toBeCloseTo(expected.bottom, 6);
}

describe("where a selection sits on screen", () => {
	it("measures a small selection card by card on every call", () => {
		const cards = board(MEASURED_SELECTION_LIMIT);
		const view = { zoom: 1, panX: 0, panY: 0 };
		const probe = harness(cards, view);
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(cards, view));
		probe.resetCount();
		for (const card of cards) card.x += 40;
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(cards, view));
		expect(probe.measured()).toBe(cards.length);
	});

	it("follows a large selection being dragged by measuring two cards, and lands where measuring all of them would", () => {
		const cards = board(200);
		const view = { zoom: 0.5, panX: -80, panY: 30 };
		const probe = harness(cards, view);
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(cards, view));
		expect(probe.measured()).toBe(cards.length);
		for (let frame = 1; frame <= 10; frame += 1) {
			for (const card of cards) {
				card.x += 7;
				card.y -= 3;
			}
			probe.resetCount();
			expectClose(probe.bounds.bounds(probe.request()), trueUnion(cards, view));
			expect(probe.measured()).toBe(2);
		}
	});

	it("keeps following while the board pans and zooms during the drag", () => {
		const cards = board(120);
		const view = { zoom: 1, panX: 0, panY: 0 };
		const probe = harness(cards, view);
		probe.bounds.bounds(probe.request());
		for (const card of cards) card.x += 25;
		view.panX += 140;
		view.panY -= 60;
		probe.resetCount();
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(cards, view));
		view.zoom = 0.5;
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(cards, view));
		view.zoom = 1.75;
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(cards, view));
		expect(probe.measured()).toBe(6);
	});

	it("measures every card again when the followed cards stop moving together", () => {
		const cards = board(100);
		const view = { zoom: 1, panX: 0, panY: 0 };
		const probe = harness(cards, view);
		probe.bounds.bounds(probe.request());
		// The last card - one of the two followed - is moved on its own.
		cards[cards.length - 1]!.x += 500;
		probe.resetCount();
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(cards, view));
		expect(probe.measured()).toBe(2 + cards.length);
	});

	it("measures again for another selection or another saved board", () => {
		const cards = board(60);
		const view = { zoom: 1, panX: 0, panY: 0 };
		const probe = harness(cards, view);
		probe.bounds.bounds(probe.request("first save"));
		probe.resetCount();
		probe.bounds.bounds(probe.request("first save"));
		expect(probe.measured()).toBe(2);
		probe.resetCount();
		// A card grew and the board was saved: the union is measured afresh.
		cards[10]!.height += 400;
		expectClose(probe.bounds.bounds(probe.request("second save")), trueUnion(cards, view));
		expect(probe.measured()).toBe(cards.length);
		probe.resetCount();
		const fewer = cards.slice(0, 50);
		const other = new SelectionBounds();
		other.bounds({ ...probe.request("second save"), ids: new Set(fewer.map((card) => card.id)), elements: () => fewer.map((card) => ({ element: card, card: true })) });
		expect(probe.measured()).toBe(fewer.length);
	});

	it("leaves out cards native Canvas has taken off the page, which measure as an empty box in its corner", () => {
		const cards = board(80);
		cards[0]!.detached = true;
		cards[79]!.detached = true;
		const view = { zoom: 1, panX: 0, panY: 0 };
		const probe = harness(cards, view);
		const onPage = cards.slice(1, 79);
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(onPage, view));
		for (const card of cards) card.y += 90;
		probe.resetCount();
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(onPage, view));
		expect(probe.measured()).toBe(2);
	});

	it("measures again once a card is taken off the page mid-drag", () => {
		const cards = board(80);
		const view = { zoom: 1, panX: 0, panY: 0 };
		const probe = harness(cards, view);
		probe.bounds.bounds(probe.request());
		for (const card of cards) card.x += 30;
		cards[0]!.detached = true;
		probe.resetCount();
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(cards.slice(1), view));
		expect(probe.measured()).toBe(cards.length - 1);
	});

	it("measures again once a card comes onto the page, as native Canvas adds cards coming into view", () => {
		const cards = board(80);
		cards[40]!.detached = true;
		const view = { zoom: 1, panX: 0, panY: 0 };
		const probe = harness(cards, view);
		probe.bounds.bounds(probe.request());
		// The card comes into view far below the rest: the union has to reach it.
		cards[40]!.detached = false;
		cards[40]!.y += 5000;
		probe.resetCount();
		expectClose(probe.bounds.bounds(probe.request()), trueUnion(cards, view));
		expect(probe.measured()).toBe(cards.length);
	});

	it("follows cards rather than lines, whose boxes bend when one end stays behind", () => {
		const cards = board(60);
		const view = { zoom: 1, panX: 0, panY: 0 };
		const line: FakeCard = { id: "line", x: -50, y: -50, width: 10, height: 10 };
		let lineMeasured = 0;
		const bounds = new SelectionBounds();
		const request = {
			ids: new Set([...cards.map((card) => card.id), "line"]),
			board: "saved",
			elements: (): readonly SelectedElement[] => [{ element: line, card: false }, ...cards.map((card) => ({ element: card, card: true }))],
			measure: (element: unknown): ScreenRect => {
				if (element === line) lineMeasured += 1;
				return pageBox(element as FakeCard, view);
			},
			onPage: (): boolean => true,
		};
		bounds.bounds(request);
		lineMeasured = 0;
		for (const card of cards) card.x += 10;
		bounds.bounds(request);
		expect(lineMeasured).toBe(0);
	});
});

describe("comparing selections", () => {
	it("tells the same ids apart from different ones", () => {
		expect(sameMembers(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
		expect(sameMembers(new Set(["a", "b"]), new Set(["a", "c"]))).toBe(false);
		expect(sameMembers(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
		expect(sameIds(["a", "b"], ["a", "b"])).toBe(true);
		expect(sameIds(["a", "b"], ["b", "a"])).toBe(false);
		expect(sameIds(["a"], ["a", "b"])).toBe(false);
	});
});
