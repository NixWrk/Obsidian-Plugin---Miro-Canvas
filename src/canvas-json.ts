/** Detached plain JSON without losing unknown fields through serialization. */
export function cloneCanvasJson<T>(value: T): T {
  const visiting = new Set<object>();
  const copy = (item: unknown, depth: number): unknown => {
    if (depth > 128) throw new Error("Canvas JSON nesting exceeds the supported limit.");
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || item === null || visiting.has(item)) throw new Error("Canvas data must contain acyclic plain JSON.");
    const prototype: unknown = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw new Error("Canvas data must contain plain objects.");
    visiting.add(item);
    if (Array.isArray(item)) for (let index = 0; index < item.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(item, index)) throw new Error("Canvas arrays cannot contain missing entries.");
    }
    const result: unknown[] | Record<string, unknown> = Array.isArray(item) ? [] : {};
    for (const key of Reflect.ownKeys(item)) {
      if (Array.isArray(item) && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (descriptor?.enumerable !== true) continue;
      if (typeof key !== "string" || !("value" in descriptor)) throw new Error("Canvas JSON cannot contain accessors or symbol fields.");
      Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1), enumerable: true, configurable: true, writable: true });
    }
    if (Array.isArray(item) && (result as unknown[]).length !== item.length) throw new Error("Canvas arrays cannot contain missing entries.");
    visiting.delete(item);
    return result;
  };
  return copy(value, 0) as T;
}
