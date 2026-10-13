import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, connectSse, SseParser } from "./sse";
import { chunkStream, flush } from "./test-utils";

describe("SseParser", () => {
	it("emits one event per blank line", () => {
		expect(new SseParser().push('data: {"a":1}\n\ndata: two\n\n')).toEqual([{ data: '{"a":1}' }, { data: "two" }]);
	});

	it("joins multi-line data with newlines", () => {
		expect(new SseParser().push("data: a\ndata: b\ndata\n\n")).toEqual([{ data: "a\nb\n" }]);
	});

	it("ignores comments, unknown fields and empty events", () => {
		expect(new SseParser().push(": keep-alive\n\nevent: x\nid: 4\n\ndata: ok\n\n")).toEqual([{ data: "ok" }]);
	});

	it("handles events split across chunks, even mid-line", () => {
		const parser = new SseParser();
		expect(parser.push("da")).toEqual([]);
		expect(parser.push("ta: hel")).toEqual([]);
		expect(parser.push("lo\n")).toEqual([]);
		expect(parser.push("\n")).toEqual([{ data: "hello" }]);
	});

	it("accepts CRLF and CR line endings, including a CRLF split across chunks", () => {
		const parser = new SseParser();
		expect(parser.push("data: a\r\n\r\ndata: b\r\r")).toEqual([{ data: "a" }, { data: "b" }]);
		expect(parser.push("data: c\r")).toEqual([]);
		expect(parser.push("\n\r\n")).toEqual([{ data: "c" }]);
	});

	it("strips a BOM and only one leading space", () => {
		expect(new SseParser().push("﻿data:  x\n\n")).toEqual([{ data: " x" }]);
	});

	it("records retry and ignores a non-numeric one", () => {
		const parser = new SseParser();
		parser.push("retry: 2500\n\n");
		expect(parser.retry).toBe(2500);
		parser.push("retry: soon\n\n");
		expect(parser.retry).toBe(2500);
	});
});

describe("backoffDelay", () => {
	it("doubles from 1 s and caps at 30 s", () => {
		const mid = () => 0.5;
		expect([0, 1, 2, 3, 4, 5, 6, 20].map((n) => backoffDelay(n, mid))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
	});

	it("adds +-20% jitter inside the 1-30 s window", () => {
		expect(backoffDelay(2, () => 0)).toBe(3200);
		expect(backoffDelay(2, () => 1)).toBe(4800);
		expect(backoffDelay(0, () => 0)).toBe(1000);
		expect(backoffDelay(9, () => 1)).toBe(30000);
	});

	it("uses a server retry as the floor", () => {
		expect(backoffDelay(0, () => 0.5, 5000)).toBe(5000);
	});
});

describe("connectSse", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("delivers messages and calls onOpen", async () => {
		const body = chunkStream(['data: {"n":1}\n\n']);
		const fetchFn = vi.fn(async () => new Response(body.stream, { status: 200 }));
		const onMessage = vi.fn();
		const onOpen = vi.fn();
		const conn = connectSse({ url: "http://x/events", fetch: fetchFn as unknown as typeof fetch, onMessage, onOpen });
		await vi.advanceTimersByTimeAsync(0);
		expect(onOpen).toHaveBeenCalledTimes(1);
		expect(onMessage).toHaveBeenCalledWith('{"n":1}');
		body.push("data: 2\n\n");
		await vi.advanceTimersByTimeAsync(0);
		expect(onMessage).toHaveBeenLastCalledWith("2");
		conn.close();
	});

	it("reconnects with backoff, reporting close and reopening", async () => {
		const first = chunkStream();
		let calls = 0;
		const fetchFn = vi.fn(async () => {
			calls++;
			if (calls === 1) return new Response(first.stream, { status: 200 });
			if (calls === 2) return new Response("nope", { status: 503 });
			return new Response(chunkStream().stream, { status: 200 });
		});
		const onOpen = vi.fn();
		const onClose = vi.fn();
		const conn = connectSse({ url: "http://x/e", fetch: fetchFn as unknown as typeof fetch, onMessage: vi.fn(), onOpen, onClose, random: () => 0.5 });
		await vi.advanceTimersByTimeAsync(0);
		expect(onOpen).toHaveBeenCalledTimes(1);

		first.end(); // stream ends -> wait 1 s
		await vi.advanceTimersByTimeAsync(0);
		expect(onClose).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(999);
		expect(calls).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(calls).toBe(2); // 503 -> attempt resets after the successful open, so this waits 2 s next
		expect(onClose).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1999);
		expect(calls).toBe(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(calls).toBe(3);
		expect(onOpen).toHaveBeenCalledTimes(2); // refetch hook fires again on reconnect
		conn.close();
	});

	it("honours a server retry value", async () => {
		const body = chunkStream(["retry: 7000\n\n"]);
		let calls = 0;
		const fetchFn = vi.fn(async () => {
			calls++;
			return calls === 1 ? new Response(body.stream, { status: 200 }) : new Response("x", { status: 500 });
		});
		const conn = connectSse({ url: "http://x/e", fetch: fetchFn as unknown as typeof fetch, onMessage: vi.fn(), random: () => 0.5 });
		await vi.advanceTimersByTimeAsync(0);
		body.end();
		await vi.advanceTimersByTimeAsync(6999);
		expect(calls).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(calls).toBe(2);
		conn.close();
	});

	it("stops for good after close", async () => {
		const fetchFn = vi.fn(async () => new Response("x", { status: 500 }));
		const conn = connectSse({ url: "http://x/e", fetch: fetchFn as unknown as typeof fetch, onMessage: vi.fn() });
		await vi.advanceTimersByTimeAsync(0);
		conn.close();
		await vi.advanceTimersByTimeAsync(120_000);
		await flush();
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});
});
