import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.ts";

// biome-ignore lint/style/noNonNullAssertion: DATABASE_URL is required at runtime
export const db = drizzle(process.env.DATABASE_URL!, { schema });
