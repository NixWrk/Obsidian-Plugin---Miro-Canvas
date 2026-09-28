/**
 * Where a selection sits on screen, without measuring every selected card on
 * every frame.
 *
 * The toolbar and the shared selection frame sit around the selected cards
 * and lines as the page lays them out, which only the DOM knows: rotated
 * cards, any zoom, other plugins' transforms.  Measuring each of thousands of
 * selected cards on every frame of a drag cost more than the drag itself.  A
 * small selection is still measured card by card every time.  A large one is
 * measured once for each selection and saved board, and then followed by two
 * of its cards: while both have only moved and scaled together - a drag, a
 * pan, a zoom - the whole selection has too, and its measured bounds move and
 * scale with them.  When the two disagree the selection is measured again.
 *
 * Native Canvas keeps on the page only the cards and lines in or near the
 * view, and adds and takes them off as the board moves; one taken off
 * measures as an empty box in the page's corner.  The union is of those on
 * the page, and it is measured again whenever one of them comes or goes.
 */

export interface ScreenRect {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

/** One selected card or line as the page draws it. */
export interface SelectedElement {
	readonly element: unknown;
	/** A card follows a drag exactly; a line with one end left behind bends instead. */
	readonly card: boolean;
}

/** Up to this many selected cards and lines are measured one by one on every call. */
export const MEASURED_SELECTION_LIMIT = 32;

/** How far, in screen pixels, a followed card may drift from the prediction. */
const FOLLOW_TOLERANCE = 0.5;

interface Reference {
	readonly element: unknown;
	readonly rect: ScreenRect;
}

interface Measurement {
	readonly ids: ReadonlySet<string>;
	readonly board: unknown;
	readonly union: ScreenRect | undefined;
	readonly references: readonly Reference[];
	/** Every selected element, and whether each was on the page when measured. */
	readonly elements: readonly unknown[];
	readonly onPage: readonly boolean[];
}

export interface SelectionBoundsRequest {
	/** Everything selected, by id: a different set is a different selection. */
	readonly ids: ReadonlySet<string>;
	/** The saved board: once it changes, what is selected may have changed size. */
	readonly board: unknown;
	/** The selected cards and lines; read only when the selection is measured. */
	readonly elements: () => readonly SelectedElement[];
	/** The element's box on screen, or undefined when the page cannot say. */
	readonly measure: (element: unknown) => ScreenRect | undefined;
	/** Whether the element is on the page now; reading it costs no layout. */
	readonly onPage: (element: unknown) => boolean;
}

export class SelectionBounds {
	private measured: Measurement | undefined;

	/** The union of the selection's boxes on screen, or undefined when none could be measured. */
	public bounds(request: SelectionBoundsRequest): ScreenRect | undefined {
		const known = this.measured;
		if (known !== undefined && known.board === request.board && sameMembers(known.ids, request.ids)
			&& samePageState(known, request.onPage)) {
			const followed = followUnion(known, request.measure);
			if (followed !== undefined) return followed.union;
		}
		const elements = request.elements();
		const onPage = elements.map((element) => request.onPage(element.element));
		const rects: { readonly element: SelectedElement; readonly rect: ScreenRect }[] = [];
		elements.forEach((element, index) => {
			// One off the page would pull the toolbar to the page's corner.
			if (!onPage[index]) return;
			const rect = request.measure(element.element);
			if (rect !== undefined && !isEmpty(rect)) rects.push({ element, rect });
		});
		const union = unionOf(rects.map((item) => item.rect));
		// A small selection costs little to measure again, and needs no guessing.
		if (rects.length <= MEASURED_SELECTION_LIMIT) {
			this.measured = undefined;
			return union;
		}
		const references = pickReferences(rects);
		this.measured = references === undefined
			? undefined
			: {
				ids: request.ids,
				board: request.board,
				union,
				references,
				elements: elements.map((element) => element.element),
				onPage,
			};
		return union;
	}

	/** Forget the measurement, so the next call measures every card again. */
	public reset(): void {
		this.measured = undefined;
	}
}

/** True while the same selected elements are on the page as when measured. */
function samePageState(known: Measurement, onPage: (element: unknown) => boolean): boolean {
	for (let index = 0; index < known.elements.length; index += 1) {
		if (onPage(known.elements[index]) !== known.onPage[index]) return false;
	}
	return true;
}

/**
 * The measured union moved and scaled as the two followed cards were, or
 * undefined when they did not move together (or cannot be measured).
 */
function followUnion(
	known: Measurement,
	measure: (element: unknown) => ScreenRect | undefined,
): { readonly union: ScreenRect | undefined } | undefined {
	const first = known.references[0];
	if (first === undefined) return undefined;
	const firstNow = measure(first.element);
	if (firstNow === undefined) return undefined;
	const width = first.rect.right - first.rect.left;
	const height = first.rect.bottom - first.rect.top;
	const scale = width >= 1
		? (firstNow.right - firstNow.left) / width
		: height >= 1
			? (firstNow.bottom - firstNow.top) / height
			: 1;
	if (!Number.isFinite(scale) || !(scale > 0)) return undefined;
	const shiftX = firstNow.left - first.rect.left * scale;
	const shiftY = firstNow.top - first.rect.top * scale;
	const place = (rect: ScreenRect): ScreenRect => ({
		left: rect.left * scale + shiftX,
		top: rect.top * scale + shiftY,
		right: rect.right * scale + shiftX,
		bottom: rect.bottom * scale + shiftY,
	});
	for (const reference of known.references) {
		const now = reference === first ? firstNow : measure(reference.element);
		if (now === undefined || !closeTo(place(reference.rect), now)) return undefined;
	}
	return { union: known.union === undefined ? undefined : place(known.union) };
}

/** The first and the last card; lines only when fewer than two cards are on the page. */
function pickReferences(rects: readonly { readonly element: SelectedElement; readonly rect: ScreenRect }[]): readonly Reference[] | undefined {
	const cards = rects.filter((item) => item.element.card);
	const pool = cards.length >= 2 ? cards : rects;
	if (pool.length < 2) return undefined;
	const first = pool[0]!;
	const last = pool[pool.length - 1]!;
	return [
		{ element: first.element.element, rect: first.rect },
		{ element: last.element.element, rect: last.rect },
	];
}

function unionOf(rects: readonly ScreenRect[]): ScreenRect | undefined {
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const rect of rects) {
		left = Math.min(left, rect.left);
		top = Math.min(top, rect.top);
		right = Math.max(right, rect.right);
		bottom = Math.max(bottom, rect.bottom);
	}
	return Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom)
		? { left, top, right, bottom }
		: undefined;
}

function isEmpty(rect: ScreenRect): boolean {
	return rect.left === 0 && rect.top === 0 && rect.right === 0 && rect.bottom === 0;
}

function closeTo(predicted: ScreenRect, actual: ScreenRect): boolean {
	return Math.abs(predicted.left - actual.left) <= FOLLOW_TOLERANCE
		&& Math.abs(predicted.top - actual.top) <= FOLLOW_TOLERANCE
		&& Math.abs(predicted.right - actual.right) <= FOLLOW_TOLERANCE
		&& Math.abs(predicted.bottom - actual.bottom) <= FOLLOW_TOLERANCE;
}

/** True when both lists hold the same ids in the same order. */
export function sameIds(first: readonly string[], second: readonly string[]): boolean {
	if (first === second) return true;
	if (first.length !== second.length) return false;
	for (let index = 0; index < first.length; index += 1) {
		if (first[index] !== second[index]) return false;
	}
	return true;
}

/** True when both sets hold the same ids; the same set object costs nothing to compare. */
export function sameMembers(first: ReadonlySet<string>, second: ReadonlySet<string>): boolean {
	if (first === second) return true;
	if (first.size !== second.size) return false;
	for (const id of first) {
		if (!second.has(id)) return false;
	}
	return true;
}
