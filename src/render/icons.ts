// Lucide icons (bundled from lucide-static by scripts/gen-icons.mjs) as SVG fragments.

import { LUCIDE } from "./lucide-data";

/** Shown for an icon name the bundle does not know. */
export const FALLBACK_ICON = "circle-help";

export const hasIcon = (name: string | undefined): boolean => !!name && name.trim().toLowerCase() in LUCIDE;

export function iconBody(name: string | undefined): string {
	return LUCIDE[(name ?? "").trim().toLowerCase()] ?? LUCIDE[FALLBACK_ICON] ?? "";
}

const STROKE = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';

/** An icon positioned inside a larger SVG: top-left at (x, y), `size` px square. */
export function glyph(name: string | undefined, x: number, y: number, size: number, color: string, strokeWidth = 2): string {
	const scale = Number((size / 24).toFixed(4));
	return `<g transform="translate(${x} ${y}) scale(${scale})" ${STROKE} stroke="${color}" stroke-width="${strokeWidth}">${iconBody(name)}</g>`;
}

/** A standalone icon SVG (touch-strip pixmaps). */
export function iconSvg(name: string | undefined, size: number, color: string, strokeWidth = 2): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${STROKE} stroke="${color}" stroke-width="${strokeWidth}">${iconBody(name)}</svg>`;
}

export const svgDataUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;
