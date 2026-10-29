import { createHash, randomBytes, randomUUID } from "crypto";
import { readStore, updateStore, type StoredAgentKey } from "@/lib/local-store";
import type { AgentKeySummary } from "@/lib/scheduling-types";

const ALLOWED_SCOPES = new Set(["book", "manage"]);

function hashKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function mapKey(row: StoredAgentKey): AgentKeySummary {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes ?? [],
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

export function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export async function authenticateAgent(
  authorization: string | null
): Promise<{ id: string; scopes: string[] } | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  const data = await readStore();
  const key = data.agentKeys.find((item) => item.keyHash === hashKey(token));
  if (!key || key.revokedAt) return null;
  return { id: key.id, scopes: key.scopes ?? [] };
}

export function hasScope(scopes: string[], scope: "book" | "manage"): boolean {
  return scopes.includes(scope);
}

export async function listAgentKeys(): Promise<AgentKeySummary[]> {
  const data = await readStore();
  return data.agentKeys
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(mapKey);
}

export async function createAgentKey(
  name: string,
  scopes: string[]
): Promise<{ token: string; key: AgentKeySummary }> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new Error("Enter a name for this key.");
  }
  const unique = [...new Set(scopes)];
  if (unique.length === 0 || unique.some((scope) => !ALLOWED_SCOPES.has(scope))) {
    throw new Error("Choose the book scope, the manage scope, or both.");
  }
  const token = `osk_${randomBytes(24).toString("base64url")}`;
  const row: StoredAgentKey = {
    id: randomUUID(),
    name: trimmed,
    keyHash: hashKey(token),
    keyPrefix: token.slice(0, 12),
    scopes: unique,
    createdAt: new Date().toISOString(),
    revokedAt: null,
  };
  await updateStore((data) => {
    data.agentKeys.push(row);
  });
  return { token, key: mapKey(row) };
}

export async function revokeAgentKey(id: string): Promise<void> {
  await updateStore((data) => {
    const key = data.agentKeys.find((item) => item.id === id && !item.revokedAt);
    if (key) key.revokedAt = new Date().toISOString();
  });
}
