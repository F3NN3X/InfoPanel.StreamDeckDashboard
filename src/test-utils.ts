// Test doubles shared by the specs: a fake SSE connector, JSON responses and a recording fetch.

import type { SseConnection, SseOptions } from "./sse";

export interface FakeConnection extends SseConnection {
	options: SseOptions;
	closed: boolean;
}

/** A connector that records connections instead of opening them. */
export function fakeConnector() {
	const connections: FakeConnection[] = [];
	const connect = (options: SseOptions): FakeConnection => {
		const connection: FakeConnection = {
			options,
			closed: false,
			close() {
				connection.closed = true;
			},
		};
		connections.push(connection);
		return connection;
	};
	const open = () => connections.filter((c) => !c.closed);
	return { connect, connections, open, find: (part: string) => open().find((c) => c.options.url.includes(part)) };
}

export const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export interface Call {
	url: string;
	init?: RequestInit;
}

/** A fetch answering from `routes` (path suffix -> Response factory), recording every call. */
export function fakeFetch(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
	const calls: Call[] = [];
	const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, init });
		const key = Object.keys(routes).find((k) => url.endsWith(k));
		if (!key) throw new Error(`no route for ${url}`);
		return routes[key]!(init);
	}) as typeof fetch;
	return { fetch: fetchFn, calls };
}

/** A ReadableStream over text chunks that stays open until `end()`. */
export function chunkStream(initial: string[] = []) {
	const encoder = new TextEncoder();
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const stream = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
			for (const chunk of initial) c.enqueue(encoder.encode(chunk));
		},
	});
	return {
		stream,
		push: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
		end: () => controller.close(),
	};
}

export const flush = async (times = 5) => {
	for (let i = 0; i < times; i++) await Promise.resolve();
};
