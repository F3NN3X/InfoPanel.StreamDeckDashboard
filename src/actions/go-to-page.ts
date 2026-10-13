import { action, type DidReceiveSettingsEvent, type KeyDownEvent } from "@elgato/streamdeck";
import type { ThemeTokens } from "../dashboard";
import { pageKey } from "../render/keys";
import { DashboardKey, type ProfileSettings } from "./dashboard-key";

export type GoToPageSettings = { page?: string } & ProfileSettings;

interface Input {
	theme: ThemeTokens;
	icon?: string;
	name: string;
	active: boolean;
}

@action({ UUID: "com.f3nn3x.infopanel-dashboard.go-to-page" })
export class GoToPage extends DashboardKey<GoToPageSettings, Input> {
	protected input(settings: GoToPageSettings, profile: string | null): Input {
		const { dashboard } = this.deps;
		const page = dashboard.pagesOf(profile).find((p) => p.id === settings.page);
		return {
			theme: dashboard.effectiveTheme(profile),
			icon: page?.icon,
			name: page?.name ?? (settings.page ? settings.page : "Pick a page"),
			active: !!settings.page && !!profile && dashboard.control?.profiles[profile]?.page === settings.page,
		};
	}

	protected render(input: Input): string {
		return pageKey(input);
	}

	override async onKeyDown(ev: KeyDownEvent<GoToPageSettings>): Promise<void> {
		const { page, profile } = ev.payload.settings;
		if (!page || !this.deps.dashboard.online) return ev.action.showAlert();
		if (!(await this.deps.dashboard.postPage(profile || undefined, page))) await ev.action.showAlert();
	}

	// The page select follows the chosen profile.
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<GoToPageSettings>): void {
		super.onDidReceiveSettings(ev);
		void this.sendPages(ev.payload.settings.profile);
	}
}
