/** Join the line and corner pieces an open source view uses for one branch. */
export interface SourcePathPoint { readonly x: number; readonly y: number }
export interface SourcePathSegment {
	readonly points: readonly SourcePathPoint[];
	readonly color: string;
	readonly width: number;
	readonly straight: boolean;
}
interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface IndexedPaths {
	readonly vertices: ReadonlyMap<string, SourcePathPoint>;
	readonly graph: ReadonlyMap<string, readonly { id: string; piece: SourcePathSegment }[]>;
}
const indexes = new WeakMap<readonly SourcePathSegment[], Map<string, IndexedPaths>>();

export function joinSourcePath(segments: readonly SourcePathSegment[], from: Rect, to: Rect, endpointMargin = 0.25): SourcePathSegment | undefined {
	if (!Number.isFinite(endpointMargin) || endpointMargin < 0 || endpointMargin > 4) return undefined;
	let index = indexes.get(segments);
	if (index === undefined) { index = new Map(); indexes.set(segments, index); }
	const colors = new Set(segments.map(segment => segment.color));
	const key = (point: SourcePathPoint): string => `${Math.round(point.x * 100)}:${Math.round(point.y * 100)}`;
	const inside = (point: SourcePathPoint, rect: Rect): boolean => point.x >= rect.x - endpointMargin && point.x <= rect.x + rect.width + endpointMargin && point.y >= rect.y - endpointMargin && point.y <= rect.y + rect.height + endpointMargin;
	for (const color of colors) {
		const existing = index.get(color);
		const pieces = segments.filter(segment => segment.color === color);
		const vertices = existing === undefined ? new Map<string, SourcePathPoint>() : new Map(existing.vertices);
		for (const piece of existing === undefined ? pieces : []) {
			vertices.set(key(piece.points[0]), piece.points[0]);
			vertices.set(key(piece.points[piece.points.length - 1]), piece.points[piece.points.length - 1]);
		}
		const targets = new Set([...vertices].filter(([, point]) => inside(point, to)).map(([id]) => id));
		const starts = [...vertices].filter(([, point]) => inside(point, from)).map(([id]) => id);
		if (starts.length === 0 || targets.size === 0) continue;
		const graph = existing === undefined ? new Map<string, readonly { id: string; piece: SourcePathSegment }[]>() : new Map(existing.graph);
		const add = (piece: SourcePathSegment): void => {
			const first = key(piece.points[0]);
			const last = key(piece.points[piece.points.length - 1]);
			if (first === last) return;
			const firstEdges = [...(graph.get(first) ?? [])];
			firstEdges.push({ id: last, piece });
			graph.set(first, firstEdges);
			const lastEdges = [...(graph.get(last) ?? [])];
			lastEdges.push({ id: first, piece: { ...piece, points: [...piece.points].reverse() } });
			graph.set(last, lastEdges);
		};
		for (const piece of existing === undefined ? pieces : []) {
			if (!piece.straight) { add(piece); continue; }
			const first = piece.points[0];
			const last = piece.points[piece.points.length - 1];
			const dx = last.x - first.x;
			const dy = last.y - first.y;
			const length = Math.hypot(dx, dy);
			if (length === 0) continue;
			const junctions = [...vertices.values()].map(point => ({ point, t: ((point.x - first.x) * dx + (point.y - first.y) * dy) / (length * length) }))
				.filter(({ point, t }) => t >= 0 && t <= 1 && Math.abs((point.x - first.x) * dy - (point.y - first.y) * dx) / length < 0.1)
				.sort((a, b) => a.t - b.t);
			for (let index = 1; index < junctions.length; index += 1) add({ ...piece, points: [junctions[index - 1].point, junctions[index].point] });
		}
		if (existing === undefined) index.set(color, { vertices, graph });
		const pending = [...starts];
		const seen = new Set(starts);
		const previous = new Map<string, { id: string; piece: SourcePathSegment }>();
		let found: string | undefined;
		for (let index = 0; index < pending.length; index += 1) {
			const id = pending[index];
			if (targets.has(id)) { found = id; break; }
			for (const edge of graph.get(id) ?? []) {
				if (seen.has(edge.id)) continue;
				seen.add(edge.id);
				previous.set(edge.id, { id, piece: edge.piece });
				pending.push(edge.id);
			}
		}
		if (found === undefined) continue;
		const chain: SourcePathSegment[] = [];
		let cursor: string = found;
		while (previous.has(cursor)) {
			const step: { id: string; piece: SourcePathSegment } = previous.get(cursor)!;
			chain.unshift(step.piece);
			cursor = step.id;
		}
		if (chain.length === 0) continue;
		const points = chain.flatMap((piece, index) => index === 0 ? [...piece.points] : piece.points.slice(1));
		if (points.length > 66) continue;
		return { points, color, width: chain[0].width, straight: false };
	}
	return undefined;
}
