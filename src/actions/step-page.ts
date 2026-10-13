import { action, type KeyDownEvent } from "@elgato/streamdeck";
import type { ThemeTokens } from "../dashboard";
import { navKey } from "../render/keys";
import { DashboardKey, type ProfileSettings } from "./dashboard-key";

interface Input {
	theme: ThemeTokens;
	pageName: string;
}

/** Next / previous page of a profile (wrapping); the face shows the page the profile is on. */
abstract class StepPage extends DashboardKey<ProfileSettings, Input> {
	protected abstract readonly direction: "next" | "prev";

	protected input(_settings: ProfileSettings, profile: string | null): Input {
		const { dashboard } = this.deps;
		return { theme: dashboard.effectiveTheme(profile), pageName: dashboard.pageOf(profile)?.name ?? "" };
	}

	protected render(input: Input): string {
		return navKey({ ...input, direction: this.direction });
	}

	override async onKeyDown(ev: KeyDownEvent<ProfileSettings>): Promise<void> {
		if (!this.deps.dashboard.online) return ev.action.showAlert();
		if (!(await this.deps.dashboard.postPage(ev.payload.settings.profile || undefined, this.direction))) await ev.action.showAlert();
	}
}

@action({ UUID: "com.f3nn3x.infopanel-dashboard.next-page" })
export class NextPage extends StepPage {
	protected readonly direction = "next";
}

@action({ UUID: "com.f3nn3x.infopanel-dashboard.prev-page" })
export class PrevPage extends StepPage {
	protected readonly direction = "prev";
}
