import streamDeck, {
	action,
	SingletonAction,
	type DialAction,
	type DialDownEvent,
	type DialRotateEvent,
	type DidReceiveSettingsEvent,
	type SendToPluginEvent,
	type TouchTapEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { cyclerFeedback, stepTarget } from "../render/strip";
import { runtime, type Deps } from "../runtime";
import { throttle, type Throttle } from "../throttle";
import { eventOf, profileItems } from "./datasource";
import type { ProfileSettings } from "./dashboard-key";

/** Rotation ticks arriving within this window are summed into one page change. */
export const ROTATE_THROTTLE_MS = 120;

interface Entry {
	action: DialAction<ProfileSettings>;
	settings: ProfileSettings;
	ticks: number;
	gate: Throttle;
	painted?: string;
}

/** Stream Deck + dial: rotate = next/previous page, press = first page, touch = toggle auto-rotate. */
@action({ UUID: "com.f3nn3x.infopanel-dashboard.page-cycler" })
export class PageCycler extends SingletonAction<ProfileSettings> {
	private readonly entries = new Map<string, Entry>();
	private unsubscribe: (() => void) | undefined;

	constructor(private readonly deps: Deps = runtime) {
		super();
	}

	private profileOf(entry: Entry): string | null {
		return this.deps.dashboard.resolveProfile(entry.settings.profile || undefined);
	}

	private paint(entry: Entry): void {
		const { dashboard } = this.deps;
		const profile = this.profileOf(entry);
		const pages = dashboard.pagesOf(profile);
		const page = dashboard.pageOf(profile);
		const feedback = cyclerFeedback({
			theme: dashboard.effectiveTheme(profile),
			offline: !dashboard.online,
			pageName: page?.name,
			icon: page?.icon,
			index: page ? pages.indexOf(page) + 1 : 1,
			total: pages.length,
			rotating: !!profile && dashboard.control?.profiles[profile]?.rotating === true,
		});
		const key = JSON.stringify(feedback);
		if (entry.painted === key) return;
		entry.painted = key;
		void entry.action.setFeedback(feedback);
	}

	private paintAll(): void {
		for (const entry of this.entries.values()) this.paint(entry);
	}

	override onWillAppear(ev: WillAppearEvent<ProfileSettings>): void {
		if (!ev.action.isDial()) return;
		const entry: Entry = { action: ev.action, settings: ev.payload.settings, ticks: 0, gate: throttle(ROTATE_THROTTLE_MS) };
		this.entries.set(ev.action.id, entry);
		this.deps.dashboard.start();
		this.unsubscribe ??= this.deps.dashboard.subscribe(() => this.paintAll());
		this.paint(entry);
	}

	override onWillDisappear(ev: WillDisappearEvent<ProfileSettings>): void {
		const entry = this.entries.get(ev.action.id);
		if (!entry) return;
		entry.gate.cancel();
		this.entries.delete(ev.action.id);
		this.deps.dashboard.stop();
		if (this.entries.size === 0) {
			this.unsubscribe?.();
			this.unsubscribe = undefined;
		}
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<ProfileSettings>): void {
		const entry = this.entries.get(ev.action.id);
		if (!entry) return;
		entry.settings = ev.payload.settings;
		this.paint(entry);
	}

	override onDialRotate(ev: DialRotateEvent<ProfileSettings>): void {
		const entry = this.entries.get(ev.action.id);
		if (!entry) return;
		entry.ticks += ev.payload.ticks;
		entry.gate.call(() => void this.flush(entry));
	}

	private async flush(entry: Entry): Promise<void> {
		const ticks = entry.ticks;
		entry.ticks = 0;
		if (ticks === 0) return;
		const { dashboard } = this.deps;
		const profile = this.profileOf(entry);
		const target = stepTarget(
			dashboard.pagesOf(profile).map((p) => p.id),
			dashboard.pageOf(profile)?.id,
			ticks,
		);
		if (!dashboard.online || !target || !(await dashboard.postPage(entry.settings.profile || undefined, target))) await entry.action.showAlert();
	}

	override async onDialDown(ev: DialDownEvent<ProfileSettings>): Promise<void> {
		const { dashboard } = this.deps;
		const first = dashboard.pagesOf(dashboard.resolveProfile(ev.payload.settings.profile || undefined))[0];
		if (!dashboard.online || !first || !(await dashboard.postPage(ev.payload.settings.profile || undefined, first.id))) await ev.action.showAlert();
	}

	override async onTouchTap(ev: TouchTapEvent<ProfileSettings>): Promise<void> {
		const { dashboard } = this.deps;
		if (!dashboard.online || !(await dashboard.postRotate(ev.payload.settings.profile || undefined, "toggle"))) await ev.action.showAlert();
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ProfileSettings>): Promise<void> {
		if (eventOf(ev.payload) === "getProfiles") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getProfiles", items: profileItems(this.deps.dashboard, "shown") });
		}
	}
}
