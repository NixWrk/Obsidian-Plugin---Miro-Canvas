/** Only the inspected Canvas history shapes; no guessed private field aliases. */
export interface NativeHistoryFence {
  flush(): boolean;
  restore(requireOwnedState?: boolean): boolean;
}
type Data = Record<string, unknown>;
interface HistoryState {
  owner: Data;
  rows: unknown[];
  values: unknown[];
  indexKey: string;
  position: number;
  maximum?: number;
}
const ownValue = (value: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor)) throw new Error("Unverified Canvas history accessor");
  return descriptor.value as unknown;
};
function inspect(runtime: Data): HistoryState | undefined {
  const history = ownValue(runtime, "history");
  const array = Array.isArray(history);
  const owner = array ? runtime : history as Data | undefined;
  const dataKey = array ? "history" : "data";
  const indexKey = array ? "historyIndex" : "current";
  if (owner === undefined || owner === null || typeof owner !== "object") return undefined;
  const rows = ownValue(owner, dataKey);
  const cursor = Object.getOwnPropertyDescriptor(owner, indexKey);
  if (!Array.isArray(rows) || !Object.isExtensible(rows) || Object.isFrozen(rows) || rows.length > 1000
    || Object.getOwnPropertyDescriptor(rows, "length")?.writable !== true || cursor === undefined || !("value" in cursor)
    || cursor.writable !== true || !Number.isInteger(cursor.value) || cursor.value < -1 || cursor.value >= rows.length) return undefined;
  const maximum = array ? undefined : ownValue(owner, "max");
  if (!array && (typeof maximum !== "number" || !Number.isInteger(maximum) || maximum < 1 || maximum > 1000 || rows.length > maximum)) return undefined;
  const values: unknown[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const item = Object.getOwnPropertyDescriptor(rows, String(index));
    if (item === undefined || !("value" in item) || item.writable !== true || item.configurable !== true) return undefined;
    values.push(item.value as unknown);
  }
  return { owner, rows: rows as unknown[], values, indexKey, position: Number(cursor.value), maximum: maximum as number | undefined };
}
function sameOwner(left: HistoryState, right: HistoryState | undefined): right is HistoryState {
  return right !== undefined && left.owner === right.owner && left.rows === right.rows && left.maximum === right.maximum;
}
function sameState(left: HistoryState, right: HistoryState | undefined): boolean {
  return sameOwner(left, right) && left.position === right.position && left.values.length === right.values.length
    && left.values.every((value, index) => value === right.values[index]);
}
export function captureNativeHistory(runtime: object): NativeHistoryFence | undefined {
  try {
    const value = runtime as Data;
    const preliminary = inspect(value);
    if (preliminary === undefined) return undefined;
    const queue = ownValue(value, "requestPushHistory");
    const run = queue === undefined ? undefined : typeof queue === "function" ? ownValue(queue, "run") : undefined;
    const cancel = queue === undefined ? undefined : typeof queue === "function" ? ownValue(queue, "cancel") : undefined;
    if (queue !== undefined && (typeof run !== "function" || typeof cancel !== "function")) return undefined;
    if (typeof run === "function") Reflect.apply(run, queue, []);
    const before = inspect(value);
    if (!sameOwner(preliminary, before)) return undefined;
    const sameQueue = (): boolean => ownValue(value, "requestPushHistory") === queue
      && (queue === undefined || typeof queue === "function" && ownValue(queue, "run") === run && ownValue(queue, "cancel") === cancel);
    let applied: HistoryState | undefined;
    return {
      flush: () => {
        try {
          if (!sameQueue() || !sameOwner(before, inspect(value))) return false;
          if (applied !== undefined) return sameState(applied, inspect(value));
          if (typeof run === "function") Reflect.apply(run, queue, []);
          const current = inspect(value);
          if (!sameQueue() || !sameOwner(before, current)) return false;
          applied = current;
          return true;
        } catch { return false; }
      },
      restore: (requireOwnedState = false) => {
        try {
          const current = inspect(value);
          if (!sameQueue() || !sameOwner(before, current) || requireOwnedState && (applied === undefined || !sameState(applied, current))) return false;
          if (typeof cancel === "function") Reflect.apply(cancel, queue, []);
          if (!sameQueue() || !sameState(current, inspect(value))) return false;
          before.rows.length = before.values.length;
          for (let index = 0; index < before.values.length; index += 1) before.rows[index] = before.values[index];
          before.owner[before.indexKey] = before.position;
          return sameState(before, inspect(value));
        } catch { return false; }
      },
    };
  } catch { return undefined; }
}
