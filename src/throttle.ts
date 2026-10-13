// A trailing-edge throttle: the first call runs at once, later ones within `gap` ms collapse into one
// run (the latest function) when the gap has passed.

export interface Throttle {
	call(fn: () => void): void;
	cancel(): void;
}

export function throttle(gap: number, now: () => number = Date.now): Throttle {
	let last = Number.NEGATIVE_INFINITY;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: (() => void) | undefined;

	const run = () => {
		timer = undefined;
		const fn = pending;
		pending = undefined;
		last = now();
		fn?.();
	};

	return {
		call(fn) {
			pending = fn;
			if (timer !== undefined) return;
			const wait = last + gap - now();
			if (wait <= 0) run();
			else timer = setTimeout(run, wait);
		},
		cancel() {
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
			pending = undefined;
		},
	};
}
