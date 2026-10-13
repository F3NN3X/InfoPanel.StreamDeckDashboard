// Text helpers for the SVG renderers: escaping, truncation and fitting into a width.

export const FONT = "Segoe UI, Helvetica, Arial, sans-serif";

/** Average glyph width relative to the font size for FONT in bold. */
const GLYPH_WIDTH = 0.58;

export function escapeXml(text: string): string {
	return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Cut to `max` characters with an ellipsis. */
export function truncate(text: string, max: number): string {
	const chars = [...text.trim()];
	if (chars.length <= max) return chars.join("");
	return `${chars.slice(0, Math.max(1, max - 1)).join("").trimEnd()}…`;
}

/** The largest size from `size` down to `minSize` that fits `width`, truncating when even `minSize` is too wide. */
export function fit(text: string, width: number, size: number, minSize: number): { text: string; size: number } {
	const clean = text.trim();
	const length = [...clean].length;
	let fontSize = size;
	while (fontSize > minSize && length * fontSize * GLYPH_WIDTH > width) fontSize -= 1;
	const max = Math.max(1, Math.floor(width / (fontSize * GLYPH_WIDTH)));
	return { text: truncate(clean, max), size: fontSize };
}

/** Word-wrap into at most `maxLines` lines of `maxChars`; the last line is truncated. */
export function wrap(text: string, maxChars: number, maxLines: number): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if ([...next].length <= maxChars) {
			current = next;
			continue;
		}
		if (current) lines.push(current);
		current = word;
	}
	if (current) lines.push(current);
	const kept = lines.slice(0, maxLines);
	if (lines.length > maxLines) kept[maxLines - 1] = truncate(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, maxChars);
	return kept.map((line) => truncate(line, maxChars));
}

export interface TextOptions {
	x: number;
	y: number;
	size: number;
	fill: string;
	weight?: number;
	anchor?: "start" | "middle" | "end";
	opacity?: number;
}

/** One `<text>` element; the content is escaped here. */
export function textEl(content: string, o: TextOptions): string {
	const opacity = o.opacity === undefined ? "" : ` fill-opacity="${o.opacity}"`;
	return `<text x="${o.x}" y="${o.y}" font-family="${FONT}" font-size="${o.size}" font-weight="${o.weight ?? 600}" text-anchor="${o.anchor ?? "middle"}" fill="${o.fill}"${opacity}>${escapeXml(content)}</text>`;
}
