import streamDeck from "@elgato/streamdeck";

import { AutoRotate } from "./actions/auto-rotate";
import { GoToPage } from "./actions/go-to-page";
import { PageCycler } from "./actions/page-cycler";
import { SensorValue } from "./actions/sensor-value";
import { NextPage, PrevPage } from "./actions/step-page";
import { SwitchProfile } from "./actions/switch-profile";
import { applyConnection, type ConnectionSettings } from "./runtime";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new GoToPage());
streamDeck.actions.registerAction(new NextPage());
streamDeck.actions.registerAction(new PrevPage());
streamDeck.actions.registerAction(new SwitchProfile());
streamDeck.actions.registerAction(new AutoRotate());
streamDeck.actions.registerAction(new PageCycler());
streamDeck.actions.registerAction(new SensorValue());

// Server addresses live in the global settings, edited in every action's property inspector.
streamDeck.settings.onDidReceiveGlobalSettings<ConnectionSettings>((ev) => applyConnection(ev.settings));

await streamDeck.connect();
applyConnection(await streamDeck.settings.getGlobalSettings<ConnectionSettings>());
