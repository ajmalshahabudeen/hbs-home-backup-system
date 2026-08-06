import { authClient } from "@workspace/auth/client";

export { authClient };
export const { signIn, signUp, signOut, useSession } = authClient;
