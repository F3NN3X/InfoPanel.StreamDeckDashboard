import { defineConfig } from "vitest/config";

export default defineConfig({
	// The SDK's `action` decorator is mocked in the specs, so the legacy decorator transform is enough here;
	// the plugin build (rollup + TypeScript) compiles the real standard decorators.
	oxc: { decorator: { legacy: true } },
	test: { include: ["src/**/*.test.ts"] },
});
