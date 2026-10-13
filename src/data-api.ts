// InfoPanel's Data API: the sensor catalogue and shared live streams (one per key prefix).

import { connectSse, type SseConnection, type SseConnector } from "./sse";

export interface Reading {
	value?: number;
	text?: string;
	unit: string;
	min?: number;
	max?: number;
	name?: string;
	source?: string;
}

export interface SensorInfo extends Reading {
	key: string;
}

export const HISTORY_LENGTH = 30;
const STREAM_INTERVAL_MS = 1000;

export interface DataApiOptions {
	getBaseUrl: () => string;
	fetch?: typeof fetch;
	connect?: SseConnector;
}

/** Keys sharing everything up to their last dot share one stream. */
export const prefixOf = (key: string): string => {
	const dot = key.lastIndexOf(".");
	return dot < 0 ? key : key.slice(0, dot + 1);
};

interface Stream {
	connection: SseConnection;
	keys: Map<string, number>;
}

export type ReadingListener = (reading: Reading, history: readonly number[]) => void;

export class DataApi {
	private readonly getBaseUrl: () => string;
	private readonly doFetch: typeof fetch;
	private readonly connect: SseConnector;
	private catalogueCache: Promise<SensorInfo[]> | undefined;
	private readonly streams = new Map<string, Stream>();
	private readonly listeners = new Map<string, Set<ReadingListener>>();
	private readonly readings = new Map<string, Reading>();
	private readonly histories = new Map<string, number[]>();

	constructor(options: DataApiOptions) {
		this.getBaseUrl = options.getBaseUrl;
		this.doFetch = options.fetch ?? fetch;
		this.connect = options.connect ?? connectSse;
	}

	private base(): string {
		return this.getBaseUrl().replace(/\/+$/, "");
	}

	/** All sensors, sorted by source then key. Cached; `refresh` refetches. Empty when the API is down. */
	catalogue(refresh = false): Promise<SensorInfo[]> {
		if (!refresh && this.catalogueCache) return this.catalogueCache;
		let request!: Promise<SensorInfo[]>;
		request = (async () => {
			try {
				const res = await this.doFetch(`${this.base()}/api/sensors`, { signal: AbortSignal.timeout(8000) });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const body = (await res.json()) as { sensors?: Record<string, Reading> };
				return Object.entries(body.sensors ?? {})
					.map(([key, reading]) => ({ ...reading, key }))
					.sort((a, b) => (a.source ?? "").localeCompare(b.source ?? "") || a.key.localeCompare(b.key));
			} catch {
				if (this.catalogueCache === request) this.catalogueCache = undefined;
				return [];
			}
		})();
		this.catalogueCache = request;
		return request;
	}

	get(key: string): Reading | undefined {
		return this.readings.get(key);
	}

	history(key: string): readonly number[] {
		return this.histories.get(key) ?? [];
	}

	/** Receive readings for a key; the stream for its prefix opens with the first subscriber. */
	subscribe(key: string, listener: ReadingListener): () => void {
		const set = this.listeners.get(key) ?? new Set<ReadingListener>();
		set.add(listener);
		this.listeners.set(key, set);
		this.retain(key);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			set.delete(listener);
			if (set.size === 0) this.listeners.delete(key);
			this.release(key);
		};
	}

	/** The base URL setting changed: reopen every stream. */
	reconnect(): void {
		this.catalogueCache = undefined;
		const open = [...this.streams.entries()].map(([prefix, stream]) => [prefix, new Map(stream.keys)] as const);
		for (const stream of this.streams.values()) stream.connection.close();
		this.streams.clear();
		for (const [prefix, keys] of open) this.openStream(prefix, keys);
	}

	private retain(key: string): void {
		const prefix = prefixOf(key);
		const stream = this.streams.get(prefix);
		if (stream) stream.keys.set(key, (stream.keys.get(key) ?? 0) + 1);
		else this.openStream(prefix, new Map([[key, 1]]));
	}

	private release(key: string): void {
		const prefix = prefixOf(key);
		const stream = this.streams.get(prefix);
		if (!stream) return;
		const left = (stream.keys.get(key) ?? 1) - 1;
		if (left > 0) stream.keys.set(key, left);
		else stream.keys.delete(key);
		if (stream.keys.size === 0) {
			stream.connection.close();
			this.streams.delete(prefix);
		}
	}

	private openStream(prefix: string, keys: Map<string, number>): void {
		const url = `${this.base()}/events?prefix=${encodeURIComponent(prefix)}&interval=${STREAM_INTERVAL_MS}`;
		const connection = this.connect({ url, fetch: this.doFetch, onMessage: (data) => this.onMessage(data) });
		this.streams.set(prefix, { connection, keys });
	}

	private onMessage(data: string): void {
		let body: { sensors?: Record<string, Reading> };
		try {
			body = JSON.parse(data);
		} catch {
			return;
		}
		for (const [key, reading] of Object.entries(body.sensors ?? {})) {
			const set = this.listeners.get(key);
			if (!set) continue;
			this.readings.set(key, reading);
			if (typeof reading.value === "number") {
				this.histories.set(key, [...(this.histories.get(key) ?? []), reading.value].slice(-HISTORY_LENGTH));
			}
			for (const listener of [...set]) listener(reading, this.history(key));
		}
	}
}
