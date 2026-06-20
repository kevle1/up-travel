import { UP_TOKEN_KEY } from "../auth/keys";

export async function getUpToken(kv: KVNamespace): Promise<string | null> {
  return kv.get(UP_TOKEN_KEY);
}
