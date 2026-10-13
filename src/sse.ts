// Server-sent events over fetch (Node has no global EventSource): a stateful line parser and a
// reconnecting reader with exponential backoff.

export interface SseEvent {
	data: string;
}

/** Incremental SSE parser: feed text chunks, get the events completed so far. */
export class SseParser {
	private buffer = "";
	private data: string[] = [];
	private skipLf = false;
	private first = true;
	/** The last `retry:` value the server sent, in ms. */
	retry: number | undefined;

	push(chunk: string): SseEvent[] {
		let text = chunk;
		if (this.first && text.length > 0) {
			this.first = false;
			if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
		}
		if (this.skipLf && text.startsWith("\n")) text = text.slice(1);
		if (text.length > 0) this.skipLf = false;
		this.buffer += text;

		const events: SseEvent[] = [];
		let start = 0;
		for (let i = 0; i < this.buffer.length; i++) {
			const c = this.buffer[i];
			if (c !== "\n" && c !== "\r") continue;
			const line = this.buffer.slice(start, i);
			if (c === "\r") {
				if (this.buffer[i + 1] === "\n") i++;
				else if (i + 1 >= this.buffer.length) this.skipLf = true;
			}
			start = i + 1;
			const event = this.line(line);
			if (event) events.push(event);
		}
		this.buffer = this.buffer.slice(start);
		return events;
	}

	private line(line: string): SseEvent | undefined {
		if (line === "") {
			if (this.data.length === 0) return undefined;
			const event = { data: this.data.join("\n") };
			this.data = [];
			return event;
		}
		if (line.startsWith(":")) return undefined;
		const colon = line.indexOf(":");
		const field = colon < 0 ? line : line.slice(0, colon);
		let value = colon < 0 ? "" : line.slice(colon + 1);
		if (value.startsWith(" ")) value = value.slice(1);
		if (field === "data") this.data.push(value);
		else if (field === "retry" && /^\d+$/.test(value)) this.retry = Number(value);
		return undefined;
	}
}

export const BACKOFF_MIN_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;

/** Delay before reconnect attempt `attempt` (0-based): doubles from `min` up to `max`, with +-20% jitter. */
export function backoffDelay(attempt: number, random: () => number = Math.random, min = BACKOFF_MIN_MS, max = BACKOFF_MAX_MS): number {
	const base = Math.min(max, min * 2 ** Math.min(attempt, 30));
	return Math.round(Math.min(max, Math.max(min, base * (0.8 + 0.4 * random()))));
}

export interface SseOptions {
	url: string;
	onMessage: (data: string) => void;
	/** The stream opened (also after each reconnect): refetch a snapshot here. */
	onOpen?: () => void;
	/** The stream ended or failed to open. */
	onClose?: () => void;
	fetch?: typeof fetch;
	random?: () => number;
}

export interface SseConnection {
	close(): void;
}

export type SseConnector = (options: SseOptions) => SseConnection;

/** Reads `url` as an event stream until `close()`, reconnecting with backoff. */
export const connectSse: SseConnector = (options) => {
	const doFetch = options.fetch ?? fetch;
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let wake: (() => void) | undefined;

	const sleep = (ms: number) =>
		new Promise<void>((resolve) => {
			wake = resolve;
			timer = setTimeout(resolve, ms);
		});

	const run = async () => {
		let attempt = 0;
		let retry: number | undefined;
		while (!controller.signal.aborted) {
			try {
				const res = await doFetch(options.url, { headers: { Accept: "text/event-stream" }, signal: controller.signal });
				if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
				attempt = 0;
				options.onOpen?.();
				const parser = new SseParser();
				const decoder = new TextDecoder();
				const reader = res.body.getReader();
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					for (const event of parser.push(decoder.decode(value, { stream: true }))) options.onMessage(event.data);
					retry = parser.retry ?? retry;
				}
			} catch {
				// fall through to the reconnect below
			}
			if (controller.signal.aborted) break;
			options.onClose?.();
			await sleep(backoffDelay(attempt, options.random, retry ?? BACKOFF_MIN_MS));
			attempt++;
		}
	};
	void run();

	return {
		close() {
			controller.abort();
			if (timer !== undefined) clearTimeout(timer);
			wake?.();
		},
	};
};
