import { defineConfig } from "vitest/config";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
	plugins: [viteReact(), tailwindcss()],
	resolve: {
		alias: {
			"#": resolve(__dirname, "src"),
			"@": resolve(__dirname, "src"),
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
	},
});
