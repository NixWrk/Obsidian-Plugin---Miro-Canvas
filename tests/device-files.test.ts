import { describe, expect, it, vi } from "vitest";
import { storeDeviceFiles } from "../src/device-files";

describe("device attachments", () => {
  it("copies exact bytes to Obsidian's chosen attachment path, in selection order", async () => {
    const paths = ["Attachments/photo.png", "Attachments/photo 1.png"];
    const availablePath = vi.fn(async () => paths.shift()!);
    const createBinary = vi.fn(async (path: string, bytes: ArrayBuffer) => ({path, bytes}));
    const image = new Uint8Array([137, 80, 78, 71]).buffer;
    const files = await storeDeviceFiles([
      {name: "photo.png", arrayBuffer: async () => image},
      {name: "photo.png", arrayBuffer: async () => image},
    ], {availablePath, createBinary});
    expect(files.map(file => file.path)).toEqual(["Attachments/photo.png", "Attachments/photo 1.png"]);
    expect(createBinary.mock.calls[0]![1]).toBe(image);
  });

  it("keeps names inside the attachment folder on every operating system", async () => {
    const availablePath = vi.fn(async (name: string) => "Attachments/" + name);
    const result = await storeDeviceFiles([{name: "../photo:1.png", arrayBuffer: async () => new ArrayBuffer(0)}], {
      availablePath, createBinary: async path => path,
    });
    expect(result).toEqual(["Attachments/__photo_1.png"]);
  });

  it("does not create a file when reading the device selection fails", async () => {
    const createBinary = vi.fn();
    await expect(storeDeviceFiles([{name: "file.pdf", arrayBuffer: async () => {throw new Error("unreadable");}}], {
      availablePath: async name => name, createBinary,
    })).rejects.toThrow("unreadable");
    expect(createBinary).not.toHaveBeenCalled();
  });
});
