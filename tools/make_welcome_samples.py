"""Builds the three sample attachments the welcome board shows, and writes
their bytes as base64 constants into src/welcome-samples.ts.

Run from anywhere with ``python tools/make_welcome_samples.py``; it only needs
Pillow (already a dev dependency, see requirements-dev.txt) plus the
standard library.  Re-run it whenever a sample's look should change - the
constants it writes are the only copy of these bytes, nothing else derives
them at build time.

What each sample is and how it is made:

- Picture.png - a 480x320 RGBA bitmap drawn with Pillow: a Miro-yellow sticky
  note and a blue card joined by a line, the plugin's own look, no text.
- Document.pdf - a single Letter-sized page built by hand, object by object,
  with the text "Miro Canvas" in the standard Helvetica font.  Nothing here
  is guessed: every object's byte offset for the cross-reference table is
  the real offset in the buffer being written, tracked as each object is
  appended - never typed in by hand.
- Document.docx - a minimal Word package assembled with the standard
  ``zipfile`` module: ``[Content_Types].xml``, ``_rels/.rels`` and
  ``word/document.xml`` (no ``word/_rels/document.xml.rels`` - the one
  paragraph holds no hyperlink or image, so nothing needs relating).

The script verifies every file it built before writing the TypeScript module:
the PNG is reopened with Pillow, the PDF's object/xref structure is checked
with ``pypdf`` (falling back to a plain byte check if it is not installed),
and the DOCX is unzipped and its XML parsed back out.
"""

from __future__ import annotations

import base64
import io
import pathlib
import zipfile
import xml.etree.ElementTree as ElementTree

from PIL import Image, ImageDraw

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "src" / "welcome-samples.ts"

# Miro's own colours (miro-palette.ts / welcome-board.ts MIRO) so the picture
# reads as this plugin's work, not generic clip art.
MIRO_YELLOW = (255, 208, 47, 255)
MIRO_BLUE = (66, 98, 255, 255)
INK = (40, 40, 40, 255)


def make_png() -> bytes:
	"""A sticky note and a card, joined by a line - the board's own vocabulary."""
	image = Image.new("RGBA", (480, 320), (0, 0, 0, 0))
	draw = ImageDraw.Draw(image)
	# The line first, so both shapes paint over its ends.
	draw.line([(150, 200), (330, 120)], fill=INK, width=4)
	draw.rounded_rectangle([40, 140, 200, 280], radius=10, fill=MIRO_YELLOW, outline=INK, width=2)
	draw.rounded_rectangle([280, 40, 440, 160], radius=14, fill=MIRO_BLUE, outline=INK, width=2)
	buffer = io.BytesIO()
	image.save(buffer, format="PNG", optimize=True)
	return buffer.getvalue()


def make_pdf() -> bytes:
	"""One Letter page of Helvetica text, its xref built from real offsets."""
	objects = [
		b"<< /Type /Catalog /Pages 2 0 R >>",
		b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
		b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	]
	stream = b"BT /F1 32 Tf 72 700 Td (Miro Canvas) Tj ET"
	objects.append(
		b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
	)

	buffer = bytearray(b"%PDF-1.4\n")
	offsets = [0]  # object 0 is the free-list head; never written as "n obj".
	for index, body in enumerate(objects, start=1):
		offsets.append(len(buffer))
		buffer += f"{index} 0 obj\n".encode("ascii") + body + b"\nendobj\n"

	xref_offset = len(buffer)
	buffer += f"xref\n0 {len(objects) + 1}\n".encode("ascii")
	buffer += b"0000000000 65535 f \n"
	for offset in offsets[1:]:
		buffer += f"{offset:010d} 00000 n \n".encode("ascii")
	buffer += (
		f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
		f"startxref\n{xref_offset}\n%%EOF\n"
	).encode("ascii")
	return bytes(buffer)


def make_docx() -> bytes:
	"""A one-paragraph Word package: the three parts a docx cannot open without."""
	content_types = (
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
		'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
		'<Default Extension="xml" ContentType="application/xml"/>'
		'<Override PartName="/word/document.xml" '
		'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
		"</Types>"
	)
	root_rels = (
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
		'<Relationship Id="rId1" '
		'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
		'Target="word/document.xml"/>'
		"</Relationships>"
	)
	paragraph_text = "Miro Canvas – Word document / документ Word"
	document_xml = (
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
		'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
		"<w:body><w:p><w:r><w:t>" + paragraph_text + "</w:t></w:r></w:p></w:body>"
		"</w:document>"
	)

	buffer = io.BytesIO()
	with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
		archive.writestr("[Content_Types].xml", content_types)
		archive.writestr("_rels/.rels", root_rels)
		archive.writestr("word/document.xml", document_xml)
	return buffer.getvalue()


def verify_png(data: bytes) -> None:
	image = Image.open(io.BytesIO(data))
	image.load()
	assert image.size == (480, 320), image.size


def verify_pdf(data: bytes) -> None:
	assert data.startswith(b"%PDF-"), "missing PDF header"
	assert data.rstrip().endswith(b"%%EOF"), "missing PDF trailer"
	try:
		from pypdf import PdfReader
	except ImportError:
		return
	reader = PdfReader(io.BytesIO(data))
	assert len(reader.pages) == 1
	assert "Miro Canvas" in reader.pages[0].extract_text()


def verify_docx(data: bytes) -> None:
	with zipfile.ZipFile(io.BytesIO(data)) as archive:
		names = set(archive.namelist())
		assert {"[Content_Types].xml", "_rels/.rels", "word/document.xml"} <= names
		document = ElementTree.fromstring(archive.read("word/document.xml"))
		texts = "".join(
			node.text or ""
			for node in document.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")
		)
		assert "Miro Canvas" in texts and "Word" in texts


def to_base64_lines(data: bytes, width: int = 116) -> str:
	"""One long base64 string, wrapped so the generated file stays readable."""
	encoded = base64.b64encode(data).decode("ascii")
	lines = [encoded[index : index + width] for index in range(0, len(encoded), width)]
	return '"' + '" +\n\t"'.join(lines) + '"'


def main() -> None:
	png = make_png()
	pdf = make_pdf()
	docx = make_docx()
	verify_png(png)
	verify_pdf(pdf)
	verify_docx(docx)

	module = f'''/**
 * The three sample attachments the welcome board's "Files and notes" frame
 * shows, so a fresh board has real files to point at, not a broken link.
 * Built once by tools/make_welcome_samples.py - see that script's header for
 * how each one is made and checked - and never derived at build or run
 * time; re-run it and replace this file when a sample's look should change.
 */

/** A 480x320 picture: a Miro-yellow sticky note and a blue card, joined by a line. */
export const WELCOME_SAMPLE_PNG_BASE64 =
\t{to_base64_lines(png)};

/** One Letter page reading "Miro Canvas" in Helvetica. */
export const WELCOME_SAMPLE_PDF_BASE64 =
\t{to_base64_lines(pdf)};

/** A one-paragraph Word document. */
export const WELCOME_SAMPLE_DOCX_BASE64 =
\t{to_base64_lines(docx)};

/** Turns a base64 constant above into bytes `createBinary` can write, without Node's `Buffer` - the plugin also runs on mobile. */
export function decodeWelcomeSample(base64: string): Uint8Array {{
\tconst binary = atob(base64);
\tconst bytes = new Uint8Array(binary.length);
\tfor (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
\treturn bytes;
}}
'''
	# The repository's TypeScript keeps CRLF line endings; match it here too.
	OUTPUT_PATH.write_text(module.replace("\n", "\r\n"), encoding="utf-8", newline="")
	print(f"wrote {OUTPUT_PATH} ({len(png)} + {len(pdf)} + {len(docx)} bytes source)")


if __name__ == "__main__":
	main()
