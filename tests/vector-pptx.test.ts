import { describe, expect, it } from "vitest";
import { crc32, makePptx, makeVectorPptx, type VectorPptxPage } from "../src/export-files";

const decoder = new TextDecoder();
const svgNamespace = "http://www.w3.org/2000/svg";
const officeSvgNamespace = "http://schemas.microsoft.com/office/drawing/2016/SVG/main";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVV4AAAAASUVORK5CYII=";
const document = (content: string): string => `<svg xmlns="${svgNamespace}" width="640" height="480" viewBox="0 0 640 480">${content}</svg>`;

function jpeg(width = 640, height = 480): Uint8Array {
  return Uint8Array.of(0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 0x11, 0, 0xff, 0xd9);
}

function page(overrides: Partial<VectorPptxPage> = {}): VectorPptxPage {
  return {
    width: 640, height: 480, pixelWidth: 640, pixelHeight: 480, image: jpeg(),
    svg: document('<rect x="10" y="20" width="200" height="100" rx="16" ry="16" fill="#fff"/><text x="30" y="50">Привет</text>'),
    ...overrides,
  };
}

/** Read both directory and local headers, including CRCs, without trusting packer internals. */
function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  expect(offset + centralSize).toBe(end);
  const result = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    expect(view.getUint16(offset + 10, true)).toBe(0);
    expect(view.getUint16(offset + 8, true) & 0x800).toBe(0x800);
    const length = view.getUint32(offset + 24, true);
    expect(view.getUint32(offset + 20, true)).toBe(length);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const path = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const local = view.getUint32(offset + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(view.getUint32(local + 22, true)).toBe(length);
    const localNameLength = view.getUint16(local + 26, true);
    expect(decoder.decode(bytes.slice(local + 30, local + 30 + localNameLength))).toBe(path);
    const start = local + 30 + localNameLength + view.getUint16(local + 28, true);
    const content = bytes.slice(start, start + length);
    expect(view.getUint32(offset + 16, true)).toBe(crc32(content));
    expect(view.getUint32(local + 14, true)).toBe(crc32(content));
    expect(result.has(path)).toBe(false);
    result.set(path, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  expect(offset).toBe(end);
  return result;
}

function xml(files: Map<string, Uint8Array>, path: string): string {
  expect(files.has(path), path).toBe(true);
  return decoder.decode(files.get(path)!);
}

function resolveRelationship(path: string, target: string): string {
  const directory = path === "_rels/.rels" ? "" : path.replace(/\/_rels\/[^/]+$/u, "");
  const parts: string[] = [];
  for (const part of `${directory}/${target}`.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "" && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

function picture(files: Map<string, Uint8Array>, number: number): number[] {
  const match = /<p:spPr><a:xfrm><a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/u.exec(xml(files, `ppt/slides/slide${number}.xml`));
  expect(match).not.toBeNull();
  return match!.slice(1).map(Number);
}

describe("vector PowerPoint packing", () => {
  it("stores ordered SVG and exact JPEG fallbacks with the Microsoft extension and resolvable relationships", () => {
    const pages = [page({ title: "Первый & <test> \" '" }), page({ title: "Second", svg: document('<path d="M0 0L640 480" stroke="#a64"/>') })];
    const files = unzip(makeVectorPptx(pages, { title: "Board & <name>", author: "Павел" }));
    const types = xml(files, "[Content_Types].xml");
    expect(types).toContain('<Default Extension="svg" ContentType="image/svg+xml"/>');
    expect(types).toContain('<Default Extension="jpeg" ContentType="image/jpeg"/>');
    for (let index = 0; index < pages.length; index += 1) {
      const number = index + 1;
      expect(xml(files, `ppt/media/image${number}.svg`)).toBe(pages[index].svg);
      expect(files.get(`ppt/media/image${number}.jpeg`)).toEqual(pages[index].image);
      const slide = xml(files, `ppt/slides/slide${number}.xml`);
      expect(slide).toContain('<a:blip r:embed="rId1"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">');
      expect(slide).toContain(`<asvg:svgBlip xmlns:asvg="${officeSvgNamespace}" r:embed="rId3"/>`);
      expect(slide).not.toContain("r:link=");
      const relationships = xml(files, `ppt/slides/_rels/slide${number}.xml.rels`);
      expect(relationships).toContain(`Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${number}.jpeg"`);
      expect(relationships).toContain(`Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${number}.svg"`);
    }
    for (const [path, bytes] of files) {
      if (!path.endsWith(".rels")) continue;
      const relationships = decoder.decode(bytes);
      const ids = [...relationships.matchAll(/<Relationship Id="([^"]+)"/gu)].map(match => match[1]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(relationships).not.toContain("TargetMode=");
      for (const match of relationships.matchAll(/Target="([^"]+)"/gu)) {
        expect(files.has(resolveRelationship(path, match[1])), `${path}: ${match[1]}`).toBe(true);
      }
    }
    for (const match of types.matchAll(/PartName="([^"]+)"/gu)) expect(files.has(match[1].slice(1))).toBe(true);
    expect(xml(files, "ppt/presentation.xml")).toContain('<p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/>');
    expect(xml(files, "ppt/slides/slide1.xml")).toContain('descr="Первый &amp; &lt;test&gt; &quot; &apos;"');
    expect(xml(files, "docProps/app.xml")).toContain('<Slides>2</Slides>');
    expect(xml(files, "docProps/core.xml")).toContain('<dc:title>Board &amp; &lt;name&gt;</dc:title><dc:creator>Павел</dc:creator>');
  });

  it("keeps raster parts byte-identical except the explicit vector extension, relationships and content type", () => {
    const pages = [page(), page({ width: 400, height: 100, title: "Wide" })];
    const raster = unzip(makePptx(pages, { title: "Same" }));
    const vector = unzip(makeVectorPptx(pages, { title: "Same" }));
    for (const [path, data] of raster) {
      if (path === "[Content_Types].xml" || path.startsWith("ppt/slides/")) continue;
      expect(vector.get(path), path).toEqual(data);
    }
    expect(xml(raster, "[Content_Types].xml")).not.toContain("image/svg+xml");
    expect([...raster.keys()].some(path => path.endsWith(".svg"))).toBe(false);
    expect(xml(raster, "ppt/slides/slide1.xml")).not.toContain("svgBlip");
    expect(xml(raster, "ppt/slides/_rels/slide1.xml.rels")).not.toContain("rId3");
    expect(picture(vector, 1)).toEqual(picture(raster, 1));
    expect(picture(vector, 2)).toEqual(picture(raster, 2));
  });

  it("fits mixed page ratios and explicit placements uniformly inside the first page's slide size", () => {
    const files = unzip(makeVectorPptx([
      page({ width: 800, height: 600, placement: { x: 100, y: 50, width: 200, height: 150 } }),
      page({ width: 400, height: 100, placement: { x: 20, y: 10, width: 200, height: 50 } }),
      page({ width: 100, height: 400 }),
    ]));
    expect(xml(files, "ppt/presentation.xml")).toContain('<p:sldSz cx="10160000" cy="7620000"/>');
    expect(picture(files, 1)).toEqual([100, 50, 200, 150].map(n => n * 12700));
    expect(picture(files, 2)).toEqual([40, 220, 400, 100].map(n => n * 12700));
    expect(picture(files, 3)).toEqual([325, 0, 150, 600].map(n => n * 12700));
  });

  it("is deterministic and does not mutate caller pages, SVG text or fallback bytes", () => {
    const first = page();
    const image = first.image.slice();
    const pages = Object.freeze([Object.freeze(first)]);
    const result = makeVectorPptx(pages);
    expect(makeVectorPptx(pages)).toEqual(result);
    expect(first.image).toEqual(image);
    expect(first.svg).toBe(page().svg);
  });

  it("retains static native geometry, local definitions, Cyrillic entities, whitespace, nested clipping and raster attachments", () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${document(`
      <defs><linearGradient id="gradient"><stop offset="0" stop-color="#ff0"/></linearGradient>
      <radialGradient id="radial"><stop offset="1" stop-opacity="0.5"/></radialGradient>
      <clipPath id="clip"><rect width="640" height="480" rx="16" ry="16"/></clipPath>
      <marker id="arrow" markerWidth="10" markerHeight="10" orient="auto"><polygon points="0,0 10,5 0,10"/></marker>
      <path id="shape" d="M0 0L1 1"/></defs>
      <svg x="0" y="0" width="640" height="480" overflow="hidden" data-miro-page="1">
      <g transform="matrix(1 0 0 1 20 30)" clip-path="url(#clip)">
      <path d="M0 0L600 200" fill="url(&quot;#gradient&quot;)" marker-end="url('#arrow')"/>
      <use href="#shape"/><circle cx="20" cy="20" r="10"/><ellipse cx="40" cy="40" rx="20" ry="10"/>
      <line x1="0" y1="0" x2="20" y2="20"/><polyline points="0,0 20,20"/>
      <text xml:space="preserve" font-family="&quot;Times New Roman&quot;, serif" dominant-baseline="text-before-edge">&#x41f;&#1088;ивет &amp; &lt; &gt; &apos;<tspan dx="2">A</tspan></text>
      <image width="1" height="1" data-miro-raster-attachment="true" href="data:image/png;base64,${png}"/>
      <title>Caption</title><desc>Description</desc></g></svg>`)} `;
    expect(xml(unzip(makeVectorPptx([page({ svg })])), "ppt/media/image1.svg")).toBe(svg);
  });
});

describe("vector PowerPoint refuses unsafe or malformed SVG", () => {
  it.each([
    ['script', '<script>alert(1)</script>'],
    ['foreignObject', '<foreignObject><div>bad</div></foreignObject>'],
    ['event', '<rect onload="alert(1)"/>'],
    ['animation', '<animate attributeName="href"/>'],
    ['style element', '<style>@import "https://example.test";</style>'],
    ['inline CSS', '<rect style="fill:url(https://example.test)"/>'],
    ['external use', '<use href="https://example.test/shape.svg#a"/>'],
    ['file use', '<use href="file:///secret.svg#a"/>'],
    ['javascript use', '<use href="javascript:alert(1)"/>'],
    ['encoded external use', '<use href="&#104;ttps://example.test/a.svg#a"/>'],
    ['external image', '<image href="https://example.test/a.png"/>'],
    ['SVG data image', '<image href="data:image/svg+xml;base64,PHN2Zy8+"/>'],
    ['pretend PNG', '<image href="data:image/png;base64,PHN2Zy8+"/>'],
    ['malformed PNG base64', '<image href="data:image/png;base64,iVBORw0KGgo!"/>'],
    ['external paint', '<path fill="url(https://example.test/a.svg#a)"/>'],
    ['external marker', '<path marker-end="url(//example.test/a.svg#a)"/>'],
    ['encoded external paint', '<path fill="url(&quot;https://example.test/a&quot;)"/>'],
    ['CSS escaped URL', '<path fill="u\\72l(https://example.test/a)"/>'],
    ['paint declaration', '<path fill="red;stroke:blue"/>'],
    ['XML base', '<g xml:base="https://example.test/"><use href="#shape"/></g>'],
    ['namespace switch', '<g xmlns="http://www.w3.org/1999/xhtml"/>'],
    ['namespace alias', '<s:rect xmlns:s="http://www.w3.org/2000/svg"/>'],
    ['duplicate attributes', '<rect x="1" x="2"/>'],
    ['unquoted attribute', '<rect x=1/>'],
    ['truncated attribute', '<rect x="1>'],
    ['mismatched tags', '<g><rect/></text>'],
    ['incomplete tree', '<g>'],
    ['unescaped ampersand', '<text>A & B</text>'],
    ['unknown entity', '<text>&external;</text>'],
    ['control character entity', '<text>&#0;</text>'],
    ['invalid unicode entity', '<text>&#xD800;</text>'],
    ['text outside text element', '<g>Visible?</g>'],
    ['CDATA', '<text><![CDATA[bad]]></text>'],
    ['missing local definition', '<use href="#missing"/>'],
    ['missing local paint', '<path fill="url(#missing)"/>'],
    ['duplicate IDs', '<rect id="same"/><path id="same"/>'],
    ['self-referencing use', '<use id="self" href="#self"/>'],
    ['mutually referencing use', '<use id="first" href="#second"/><use id="second" href="#first"/>'],
    ['recursive group use', '<g id="loop"><use href="#loop"/></g>'],
    ['recursive gradient', '<linearGradient id="loop" href="#loop"/>'],
    ['processing instruction', '<?xml-stylesheet href="https://example.test/a"?>'],
  ])("rejects %s", (_name, content) => {
    expect(() => makeVectorPptx([page({ svg: document(content) })])).toThrow(/Vector PowerPoint page 1:/u);
  });

  it.each([
    '', '<svg/>', '<svg xmlns="http://wrong.test"/>',
    `${document('')}${document('')}`,
    `&#32;${document('')}`,
    `${document('')}\u00a0`,
    `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]>${document('<text>&x;</text>')}`,
    `<svg xmlns="${svgNamespace}"><text>\u0000</text></svg>`,
    `<svg xmlns="${svgNamespace}"><text>\ud800</text></svg>`,
  ])("refuses an invalid root or XML document", svg => {
    expect(() => makeVectorPptx([page({ svg })])).toThrow(/Vector PowerPoint page 1:/u);
  });

  it("bounds matching of a large raster data URI without recursive regex work", () => {
    const attachment = `data:image/png;base64,${png.slice(0, 12)}${'A'.repeat(1024 * 1024)}`;
    const svg = document(`<image width="1" height="1" href="${attachment}"/>`);
    const deck = makeVectorPptx([page({ svg })]);
    expect(decoder.decode(unzip(deck).get("ppt/media/image1.svg"))).toBe(svg);
  });

  it("reports the bad page and never returns a partial deck", () => {
    expect(() => makeVectorPptx([page(), page({ svg: document('<script/>') })])).toThrow(/page 2:/u);
  });
});

describe("vector PowerPoint input and work budgets", () => {
  it("requires pages, nonempty fallback bytes, valid point/pixel sizes and a matching JPEG header", () => {
    expect(() => makeVectorPptx([])).toThrow(/no pages/u);
    expect(() => makeVectorPptx([page({ image: new Uint8Array() })])).toThrow(/no image/u);
    expect(() => makeVectorPptx([page({ width: Number.NaN })])).toThrow(/page size/u);
    expect(() => makeVectorPptx([page({ pixelHeight: 0 })])).toThrow(/pixel size/u);
    expect(() => makeVectorPptx([page({ image: Uint8Array.of(1, 2, 3) })])).toThrow(/JPEG fallback/u);
    expect(() => makeVectorPptx([page({ pixelWidth: 641 })])).toThrow(/JPEG fallback/u);
    expect(() => makeVectorPptx([page({ svg: undefined as unknown as string })])).toThrow(/missing SVG/u);
  });

  it.each([
    { x: Number.NaN, y: 0, width: 10, height: 10 },
    { x: 0, y: 0, width: -1, height: 10 },
    { x: 0, y: 0, width: 10, height: Number.POSITIVE_INFINITY },
    { x: Number.MAX_VALUE, y: 0, width: 10, height: 10 },
  ])("rejects an invalid or overflowing placement", placement => {
    expect(() => makeVectorPptx([page({ placement })])).toThrow(/slide placement/u);
  });

  it("rejects fitted geometry smaller than an EMU or overflowing a later page", () => {
    expect(() => makeVectorPptx([page({ width: 1e-9 })])).toThrow(/fitted slide geometry/u);
    expect(() => makeVectorPptx([page(), page({ width: 1e-300 })])).toThrow(/fitted slide geometry/u);
  });

  it("limits slide count before serialization", () => {
    expect(() => makeVectorPptx(Array.from({ length: 201 }, () => page()))).toThrow(/page budget/u);
    const files = unzip(makeVectorPptx(Array.from({ length: 200 }, () => page())));
    expect(files.has("ppt/media/image200.svg")).toBe(true);
    expect(xml(files, "docProps/app.xml")).toContain('<Slides>200</Slides>');
  });

  it("limits raw and encoded UTF-8 SVG bytes before XML parsing", () => {
    expect(() => makeVectorPptx([page({ svg: ' '.repeat(32 * 1024 * 1024 + 1) })])).toThrow(/byte budget/u);
    expect(() => makeVectorPptx([page({ svg: document('<text>' + 'Я'.repeat(16 * 1024 * 1024) + '</text>') })])).toThrow(/byte budget/u);
  });

  it("limits aggregate SVG and total fallback media bytes", () => {
    const large = document('<text>' + 'A'.repeat(17 * 1024 * 1024) + '</text>');
    expect(() => makeVectorPptx([page({ svg: large }), page({ svg: large })])).toThrow(/byte budget/u);
    expect(() => makeVectorPptx([page({ image: new Uint8Array(64 * 1024 * 1024) })])).toThrow(/byte budget/u);
  });

  it("limits depth and element work separately from byte size", () => {
    expect(() => makeVectorPptx([page({ svg: document('<g>'.repeat(128) + '</g>'.repeat(128)) })])).toThrow(/structure budget/u);
    expect(() => makeVectorPptx([page({ svg: document('<rect/>'.repeat(200_000)) })])).toThrow(/structure budget/u);
  });

  it("bounds the expanded work of an acyclic local use graph", () => {
    let definitions = '<path id="item-0" d="M0 0L1 1"/>';
    for (let index = 1; index <= 24; index += 1) {
      definitions += `<g id="item-${index}"><use href="#item-${index - 1}"/><use href="#item-${index - 1}"/></g>`;
    }
    expect(() => makeVectorPptx([page({ svg: document(`<defs>${definitions}</defs><use href="#item-24"/>`) })])).toThrow(/expansion budget/u);
  });

  it("refuses oversized or invalid XML metadata", () => {
    expect(() => makeVectorPptx([page({ title: 'x'.repeat(65_537) })])).toThrow(/metadata budget/u);
    expect(() => makeVectorPptx([page()], { author: '\u0000' })).toThrow(/metadata.*XML/u);
  });
});
