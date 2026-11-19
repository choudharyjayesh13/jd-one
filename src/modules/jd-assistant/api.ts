/**
 * JD's conversation loop. The Supabase function `jd-assistant` holds the AI
 * key and talks to Claude; tool calls come back here and run in this browser
 * (tools.ts), with this person's permissions, then the results go back to JD.
 */
import { getSupabaseClient } from "@/core/data";
import { calendarTodayISO, TIMEZONE, todayISO } from "@/core/format";
import type { AuthUser } from "@/core/auth/AuthProvider";
import { catalogue, runTool, type ToolEnv } from "./tools";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface ApiMessage {
  role: "user" | "assistant";
  content: string | Block[];
}

/** What the chat shows while JD works. */
export interface Step {
  id: string;
  label: string;
  state: "running" | "done" | "failed";
}

const MAX_ROUNDS = 12;

export async function askJD(
  history: ApiMessage[],
  env: ToolEnv & { property: string; path: string },
  onStep: (s: Step) => void,
): Promise<{ history: ApiMessage[]; reply: string }> {
  const client = getSupabaseClient();
  if (!client) throw new Error("JD works when JD One is connected to the shared database (not in local mode).");
  const user: AuthUser = env.user;
  const now = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: TIMEZONE }).format(new Date());
  const context = {
    name: user.name,
    post: user.post,
    role: user.role,
    designation: (user.staff?.designation as string | undefined) ?? null,
    property: env.property,
    today: todayISO() !== calendarTodayISO() ? `${todayISO()} (night audit not closed; calendar date ${calendarTodayISO()})` : todayISO(),
    now,
    path: env.path,
    catalogue: catalogue(user),
  };

  const msgs = [...history];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await client.functions.invoke("jd-assistant", { body: { messages: msgs, context } });
    if (error) {
      let msg = "JD could not be reached. Check the internet and try again.";
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) msg = body.error;
      } catch {
        /* keep the default message */
      }
      throw new Error(msg);
    }
    const content = (data?.content ?? []) as Block[];
    msgs.push({ role: "assistant", content });
    const uses = content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (data?.stop_reason !== "tool_use" || !uses.length) {
      const reply = content
        .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { history: msgs, reply };
    }
    const results: Block[] = [];
    for (const u of uses) {
      onStep({ id: u.id, label: stepLabel(u.name, u.input), state: "running" });
      const r = await runTool(u.name, u.input ?? {}, env);
      onStep({ id: u.id, label: r.summary, state: r.ok ? "done" : "failed" });
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r.result).slice(0, 60000), ...(r.ok ? {} : { is_error: true }) });
    }
    msgs.push({ role: "user", content: results });
  }
  return { history: msgs, reply: "This needed more steps than I can take at once. Please tell me what to do next." };
}

function stepLabel(name: string, input: Record<string, unknown>): string {
  const e = String(input.entity ?? "").replace(/-/g, " ");
  switch (name) {
    case "describe_module":
      return `Reading ${e}…`;
    case "list_records":
      return `Searching ${e}…`;
    case "get_record":
      return `Opening ${e} entry…`;
    case "create_record":
      return `Adding to ${e}…`;
    case "update_record":
      return `Updating ${e}…`;
    case "delete_record":
      return `Waiting for your OK to delete…`;
    case "open_page":
      return "Opening page…";
    default:
      return "Working…";
  }
}
