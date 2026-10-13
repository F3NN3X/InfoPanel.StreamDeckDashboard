import { describe, expect, it, vi } from "vitest";
import { DataApi, HISTORY_LENGTH, prefixOf } from "./data-api";
import { fakeConnector, fakeFetch, json } from "./test-utils";

const sensors = {
	timestamp: 1,
	sensors: {
		"system.cpu.load": { value: 40, unit: "%", name: "CPU Load", source: "system" },
		"spotify.track": { text: "Engel", unit: "", source: "spotify" },
		"system.cpu.temp": { value: 60, unit: "C", source: "system" },
	},
};

function setup() {
	const f = fakeFetch({ "/api/sensors": () => json(sensors) });
	const c = fakeConnector();
	const api = new DataApi({ getBaseUrl: () => "http://data:3921/", fetch: f.fetch, connect: c.connect });
	return { api, f, c };
}

const emit = (c: ReturnType<typeof fakeConnector>, key: string, value: number | undefined, text?: string) =>
	c.open()[0]!.options.onMessage(JSON.stringify({ timestamp: 1, sensors: { [key]: { value, text, unit: "" } }, removed: [] }));

describe("prefixOf", () => {
	it("drops the last segment and keeps the dot", () => {
		expect(prefixOf("system.cpu.load")).toBe("system.cpu.");
		expect(prefixOf("lonely")).toBe("lonely");
	});
});

describe("catalogue", () => {
	it("sorts by source then key and caches", async () => {
		const { api, f } = setup();
		const list = await api.catalogue();
		expect(list.map((s) => s.key)).toEqual(["spotify.track", "system.cpu.load", "system.cpu.temp"]);
		await api.catalogue();
		expect(f.calls).toHaveLength(1);
		await api.catalogue(true);
		expect(f.calls).toHaveLength(2);
	});

	it("is empty, and retried next time, when the API is down", async () => {
		let up = false;
		const f = fakeFetch({ "/api/sensors": () => (up ? json(sensors) : new Response("", { status: 500 })) });
		const api = new DataApi({ getBaseUrl: () => "http://x", fetch: f.fetch, connect: fakeConnector().connect });
		expect(await api.catalogue()).toEqual([]);
		up = true;
		expect(await api.catalogue()).toHaveLength(3);
	});
});

describe("streams", () => {
	it("shares one stream per prefix and closes it with the last subscriber", () => {
		const { api, c } = setup();
		const a = api.subscribe("system.cpu.load", vi.fn());
		const b = api.subscribe("system.cpu.temp", vi.fn());
		api.subscribe("spotify.track", vi.fn());
		expect(c.connections.map((x) => x.options.url)).toEqual([
			"http://data:3921/events?prefix=system.cpu.&interval=1000",
			"http://data:3921/events?prefix=spotify.&interval=1000",
		]);
		a();
		expect(c.connections[0]!.closed).toBe(false);
		b();
		expect(c.connections[0]!.closed).toBe(true);
		b(); // idempotent
	});

	it("routes readings to the key's listeners and keeps a bounded history", () => {
		const { api, c } = setup();
		const seen = vi.fn();
		api.subscribe("system.cpu.load", seen);
		for (let i = 0; i < HISTORY_LENGTH + 5; i++) emit(c, "system.cpu.load", i);
		emit(c, "system.cpu.other", 1); // nobody listens
		expect(seen).toHaveBeenCalledTimes(HISTORY_LENGTH + 5);
		const history = api.history("system.cpu.load");
		expect(history).toHaveLength(HISTORY_LENGTH);
		expect(history.at(-1)).toBe(HISTORY_LENGTH + 4);
		expect(api.get("system.cpu.load")?.value).toBe(HISTORY_LENGTH + 4);
	});

	it("keeps text readings out of the history", () => {
		const { api, c } = setup();
		api.subscribe("spotify.track", vi.fn());
		emit(c, "spotify.track", undefined, "Engel");
		expect(api.get("spotify.track")?.text).toBe("Engel");
		expect(api.history("spotify.track")).toEqual([]);
	});

	it("ignores malformed messages and reopens streams on reconnect", () => {
		const { api, c } = setup();
		api.subscribe("system.cpu.load", vi.fn());
		c.open()[0]!.options.onMessage("nope");
		api.reconnect();
		expect(c.connections[0]!.closed).toBe(true);
		expect(c.open()).toHaveLength(1);
	});
});
