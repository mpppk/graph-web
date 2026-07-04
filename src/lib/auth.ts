import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { mcp, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "#/db/auth-schema";

export const auth = betterAuth({
	database: drizzleAdapter(drizzle(env.DB), {
		provider: "sqlite",
		schema: authSchema,
	}),
	trustedOrigins: ["http://localhost:3000", "https://*.niboshi.workers.dev"],
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		tanstackStartCookies(),
		organization({
			teams: {
				enabled: true,
				defaultTeam: {
					enabled: false,
				},
			},
			sendInvitationEmail: async (_data) => {
				// invite-link-only pattern; no email sending
			},
		}),
		// OAuth 2.1 provider for MCP clients (Claude Code / Desktop etc.).
		mcp({
			loginPage: "/login",
			oidcConfig: {
				loginPage: "/login",
				consentPage: "/oauth/consent",
				// MCP clients register themselves via RFC 7591 dynamic registration.
				allowDynamicClientRegistration: true,
			},
		}),
	],
});
