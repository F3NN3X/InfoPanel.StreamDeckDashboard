// Base for keys whose face is an SVG drawn by the plugin: tracks the visible keys with their settings
// and only calls setImage when what the face depends on has changed.

import type { JsonObject } from "@elgato/utils";
import { SingletonAction, type DidReceiveSettingsEvent, type KeyAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { svgDataUrl } from "../render/icons";

export interface Entry<S extends JsonObject> {
	action: KeyAction<S>;
	settings: S;
}

/** A face: `key` identifies its inputs, `svg` draws it (only called when the key changed). */
export interface View {
	key: string;
	svg: () => string;
}

export abstract class PaintedKey<S extends JsonObject> extends SingletonAction<S> {
	protected readonly entries = new Map<string, Entry<S>>();
	private readonly painted = new Map<string, string>();

	protected abstract view(settings: S): View;

	/** A key appeared (called after it is tracked, before its first paint). */
	protected appeared(_entry: Entry<S>): void {}
	/** A key went away (called after it is untracked). */
	protected disappeared(_entry: Entry<S>): void {}

	protected paint(entry: Entry<S>): void {
		const view = this.view(entry.settings);
		if (this.painted.get(entry.action.id) === view.key) return;
		this.painted.set(entry.action.id, view.key);
		void entry.action.setImage(svgDataUrl(view.svg()));
	}

	protected paintAll(): void {
		for (const entry of this.entries.values()) this.paint(entry);
	}

	override onWillAppear(ev: WillAppearEvent<S>): void {
		if (!ev.action.isKey()) return;
		const entry = { action: ev.action, settings: ev.payload.settings };
		this.entries.set(ev.action.id, entry);
		this.painted.delete(ev.action.id);
		this.appeared(entry);
		this.paint(entry);
	}

	override onWillDisappear(ev: WillDisappearEvent<S>): void {
		const entry = this.entries.get(ev.action.id);
		if (!entry) return;
		this.entries.delete(ev.action.id);
		this.painted.delete(ev.action.id);
		this.disappeared(entry);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): void {
		const entry = this.entries.get(ev.action.id);
		if (!entry) return;
		const next = { ...entry, settings: ev.payload.settings };
		this.entries.set(ev.action.id, next);
		this.settingsChanged(next);
		this.paint(next);
	}

	/** A key's settings changed (called before the repaint). */
	protected settingsChanged(_entry: Entry<S>): void {}
}
