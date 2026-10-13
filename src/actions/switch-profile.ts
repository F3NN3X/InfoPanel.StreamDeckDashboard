import { action, type KeyDownEvent } from "@elgato/streamdeck";
import type { ThemeTokens } from "../dashboard";
import { profileKey } from "../render/keys";
import { DashboardKey, type ProfileSettings } from "./dashboard-key";

interface Input {
	theme: ThemeTokens;
	name: string;
	active: boolean;
}

/** Settings: `profile` is a profile id, or "" for Auto (clears the override). */
@action({ UUID: "com.f3nn3x.infopanel-dashboard.switch-profile" })
export class SwitchProfile extends DashboardKey<ProfileSettings, Input> {
	protected override profileLead = "auto" as const;

	protected input(settings: ProfileSettings): Input {
		const { dashboard } = this.deps;
		const id = settings.profile || null;
		return {
			// The face wears the theme of the profile it switches to; Auto uses whichever is resolved.
			theme: dashboard.effectiveTheme(dashboard.resolveProfile(id ?? undefined)),
			name: id ? (dashboard.profileById(id)?.name ?? id) : "Auto",
			active: (dashboard.control?.profile ?? null) === id,
		};
	}

	protected render(input: Input): string {
		return profileKey(input);
	}

	override async onKeyDown(ev: KeyDownEvent<ProfileSettings>): Promise<void> {
		if (!this.deps.dashboard.online) return ev.action.showAlert();
		const state = await this.deps.dashboard.postProfile(ev.payload.settings.profile || null);
		await (state ? ev.action.showOk() : ev.action.showAlert());
	}
}
