export interface DeviceFile {
  readonly name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface DeviceFileHost<T> {
  availablePath(name: string): Promise<string>;
  createBinary(path: string, bytes: ArrayBuffer): Promise<T>;
}

/** A device file becomes a vault attachment; a board never points outside the vault. */
export async function storeDeviceFiles<T>(files: readonly DeviceFile[], host: DeviceFileHost<T>): Promise<T[]> {
  const stored: T[] = [];
  for (const file of files) {
    const name = file.name.replace(/[/\\:*?"<>|\u0000-\u001f]/gu, "_").replace(/^\.+/u, "_").trim();
    if (name === "") throw new Error("The selected file has no usable name.");
    const bytes = await file.arrayBuffer();
    const path = await host.availablePath(name);
    stored.push(await host.createBinary(path, bytes));
  }
  return stored;
}
