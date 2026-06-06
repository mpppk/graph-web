import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "#/db/auth-schema";

export const auth = betterAuth({
	database: drizzleAdapter(drizzle(env.DB), {
		provider: "sqlite",
		schema: authSchema,
	}),
	trustedOrigins: [
		"http://localhost:3000",
		"https://graph-web.niboshi.workers.dev",
		"https://graph-web-preview.niboshi.workers.dev",
	],
	emailAndPassword: {
		enabled: true,
	},
	plugins: [tanstackStartCookies()],
});
