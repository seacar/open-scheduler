import { authenticateAgent, hasScope } from "@/lib/agent-keys";
import { problem } from "@/lib/problems";
import { cancelAsAdmin, cancelWithSignature } from "@/lib/scheduling-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sig = new URL(request.url).searchParams.get("sig") ?? "";
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (agent && hasScope(agent.scopes, "manage")) {
    const result = await cancelAsAdmin(id);
    if (!result.ok) return problem(result.code, result.error);
    return Response.json({ ok: true });
  }
  const result = await cancelWithSignature(id, sig);
  if (!result.ok) return problem("unauthorized", result.error);
  return Response.json({ ok: true });
}
