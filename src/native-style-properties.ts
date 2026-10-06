interface Declaration {
  readonly value: string;
  readonly priority: string;
}
interface OwnedDeclaration {
  before: Declaration;
  applied: Declaration;
  desired: string;
  variable?: string;
}
const read = (element: HTMLElement, property: string): Declaration => ({
  value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property),
});
const same = (left: Declaration, right: Declaration): boolean => left.value === right.value && left.priority === right.priority;

/** Fixed property ownership: no timers, observers, DOM queries or measurement. */
export class NativeStyleProperties {
  private readonly bindings = new Map<HTMLElement, Map<string, OwnedDeclaration>>();

  public get elements(): Iterable<HTMLElement> { return this.bindings.keys(); }

  public write(element: HTMLElement, property: string, desired: string, variable?: string): void {
    let properties = this.bindings.get(element);
    if (properties === undefined) {
      properties = new Map();
      this.bindings.set(element, properties);
    }
    const current = read(element, property);
    let binding = properties.get(property);
    if (binding === undefined) {
      binding = { before: current, applied: current, desired, variable };
      properties.set(property, binding);
    } else {
      if (same(current, binding.applied) && binding.desired === desired && binding.variable === variable) return;
      if (!same(current, binding.applied)) binding.before = current;
    }
    binding.desired = desired;
    binding.variable = variable;
    this.apply(element, property, binding);
  }

  public refresh(element: HTMLElement): void {
    for (const [property, binding] of this.bindings.get(element) ?? []) {
      const current = read(element, property);
      if (same(current, binding.applied)) continue;
      binding.before = current;
      this.apply(element, property, binding);
    }
  }

  public restore(): void {
    for (const [element, properties] of this.bindings) {
      for (const [property, binding] of properties) {
        if (!same(read(element, property), binding.applied)) continue;
        if (binding.before.value === "") element.style.removeProperty(property);
        else element.style.setProperty(property, binding.before.value, binding.before.priority);
      }
    }
    this.bindings.clear();
  }

  public retain(keep: (element: HTMLElement) => boolean): number {
    let removed = 0;
    for (const [element, properties] of this.bindings) {
      if (keep(element)) continue;
      for (const [property, binding] of properties) {
        if (!same(read(element, property), binding.applied)) continue;
        if (binding.before.value === "") element.style.removeProperty(property);
        else element.style.setProperty(property, binding.before.value, binding.before.priority);
      }
      this.bindings.delete(element);
      removed += 1;
    }
    return removed;
  }

  private apply(element: HTMLElement, property: string, binding: OwnedDeclaration): void {
    const desired = binding.variable === undefined ? binding.desired
      : binding.before.value === "" ? "" : `var(${binding.variable}, ${binding.before.value})`;
    const current = read(element, property);
    if (current.value !== desired || current.priority !== "") {
      if (desired === "") element.style.removeProperty(property);
      else element.style.setProperty(property, desired);
    }
    binding.applied = read(element, property);
  }
}
