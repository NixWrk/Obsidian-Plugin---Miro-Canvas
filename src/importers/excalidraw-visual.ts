/** Temporary visual fallback candidates; ordinary editable cards keep their native representation. */
export function needsExcalidrawVisual(data: Readonly<Record<string, unknown>>): boolean {
	if (data.type === "freedraw") return true;
	if (data.type === "image") {
		const scale = data.scale;
		return Array.isArray(scale) && scale.length === 2 && scale.every(value => value === 1 || value === -1) && scale.includes(-1)
			|| typeof data.opacity === "number" && data.opacity < 100;
	}
	if (!["rectangle", "ellipse", "diamond"].includes(String(data.type))) return false;
	return typeof data.roughness === "number" && data.roughness > 0
		|| typeof data.opacity === "number" && data.opacity < 100
		|| typeof data.backgroundColor === "string" && !["transparent", "none"].includes(data.backgroundColor)
			&& typeof data.fillStyle === "string" && data.fillStyle !== "solid";
}
