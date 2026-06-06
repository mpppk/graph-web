import { getRequest } from "@tanstack/react-start/server";
import { auth } from "#/lib/auth";

export async function requireUserId(): Promise<string> {
	const request = getRequest();
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) throw new Error("Unauthorized");
	return session.user.id;
}
