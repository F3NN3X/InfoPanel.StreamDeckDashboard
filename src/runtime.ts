// The plugin-wide clients and the connection settings (global settings) that point them at the servers.

import { DashboardClient } from "./dashboard";
import { DataApi } from "./data-api";

export const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:3922";
export const DEFAULT_DATA_API_URL = "http://127.0.0.1:3921";

export type ConnectionSettings = {
	dashboardUrl?: string;
	dataApiUrl?: string;
};

export interface Deps {
	dashboard: DashboardClient;
	dataApi: DataApi;
}

let connection: ConnectionSettings = {};

const urlOf = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export const dashboard = new DashboardClient({ getBaseUrl: () => urlOf(connection.dashboardUrl, DEFAULT_DASHBOARD_URL) });
export const dataApi = new DataApi({ getBaseUrl: () => urlOf(connection.dataApiUrl, DEFAULT_DATA_API_URL) });
export const runtime: Deps = { dashboard, dataApi };

/** Apply the global settings; clients reconnect only when their URL actually changed. */
export function applyConnection(settings: ConnectionSettings | undefined): void {
	const next = settings ?? {};
	const dashboardChanged = urlOf(next.dashboardUrl, DEFAULT_DASHBOARD_URL) !== urlOf(connection.dashboardUrl, DEFAULT_DASHBOARD_URL);
	const dataApiChanged = urlOf(next.dataApiUrl, DEFAULT_DATA_API_URL) !== urlOf(connection.dataApiUrl, DEFAULT_DATA_API_URL);
	connection = next;
	if (dashboardChanged) dashboard.reconnect();
	if (dataApiChanged) dataApi.reconnect();
}
