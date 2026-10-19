// One-shot Claude calls for background jobs, on the homelab's shared Claude
// accounts: the claude-accounts service (CLAUDE_ACCOUNTS_URL/TOKEN) picks an
// account and hands out its setup token, Claude runs through the Agent SDK
// (the route that service documents), and every rate-limit event and the
// run's usage go back to the service. Without the two variables nothing here
// runs and the features that use it stay hidden.

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClaudeAccounts, type ClaudeAccounts } from "claude-accounts-client";

/** A small, cheap model: picking among a few names doesn't need more. */
export const DEFAULT_MODEL = "claude-haiku-5-5";

export function claudeConfigured(): boolean {
  return Boolean(process.env.CLAUDE_ACCOUNTS_URL?.trim() && process.env.CLAUDE_ACCOUNTS_TOKEN?.trim());
}

export function claudeModel(): string {
  return process.env.MATKA_AI_MODEL?.trim() || DEFAULT_MODEL;
}

const g = globalThis as unknown as { _matkaClaudeAccounts?: ClaudeAccounts };

function accounts(): ClaudeAccounts {
  g._matkaClaudeAccounts ??= createClaudeAccounts({
    url: process.env.CLAUDE_ACCOUNTS_URL?.trim(),
    token: process.env.CLAUDE_ACCOUNTS_TOKEN?.trim(),
    app: "matka",
  });
  return g._matkaClaudeAccounts;
}

export type ClaudeResult =
  | { ok: true; text: string; structured: unknown; account: string }
  /**
   * `retryAt`: don't call again before this (epoch ms); null = no reason to wait.
   * `called`: whether Claude was actually asked (false when no account was free).
   */
  | { ok: false; reason: string; retryAt: number | null; called: boolean };

/**
 * Asks Claude once, with no tools, no settings files and no session saved.
 * Never throws; gives up after `timeoutMs`. A rejection by the account's
 * rate limit comes back with the time it resets.
 */
export async function askClaude(opts: { system: string; prompt: string; timeoutMs: number }): Promise<ClaudeResult> {
  if (!claudeConfigured()) return { ok: false, reason: "not configured", retryAt: null, called: false };
  const model = claudeModel();
  const acc = accounts();
  const claude = await acc.claudeEnv({ model });
  if (!claude.email) return { ok: false, reason: claude.reason, retryAt: claude.retryAt ?? Date.now() + 15 * 60_000, called: false };

  // Claude Code wants a writable config dir; keep it out of the app's home.
  const configDir = path.join(tmpdir(), "matka-claude");
  mkdirSync(configDir, { recursive: true, mode: 0o700 });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs);
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const run = query({
      prompt: opts.prompt,
      options: {
        model,
        systemPrompt: opts.system,
        tools: [],
        maxTurns: 1,
        effort: "low",
        settingSources: [],
        persistSession: false,
        permissionMode: "dontAsk",
        cwd: configDir,
        abortController: abort,
        // Only what Claude Code needs: never the app's own secrets (DATABASE_URL,
        // MATKA_SECRET…), and never an API key, which would win over the token.
        env: {
          PATH: process.env.PATH,
          HOME: configDir,
          CLAUDE_CONFIG_DIR: configDir,
          CLAUDE_AGENT_SDK_CLIENT_APP: "matka",
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
          DISABLE_AUTOUPDATER: "1",
          // Only for tests against a fake endpoint.
          ...(process.env.MATKA_AI_BASE_URL ? { ANTHROPIC_BASE_URL: process.env.MATKA_AI_BASE_URL } : {}),
          ...claude.env,
        },
        stderr: () => {},
      },
    });
    let text = "";
    let structured: unknown = undefined;
    for await (const message of run) {
      const rejected = acc.observe(claude.email, message);
      if (rejected) {
        abort.abort();
        const reset = rejected.resetsAt ? (rejected.resetsAt < 1e12 ? rejected.resetsAt * 1000 : rejected.resetsAt) : null;
        return { ok: false, reason: `rate limited (${rejected.rateLimitType ?? "limit"})`, retryAt: reset ?? Date.now() + 15 * 60_000, called: true };
      }
      const m = message as { type?: string; subtype?: string; is_error?: boolean; result?: string; structured_output?: unknown };
      if (m.type === "result") {
        if (m.is_error || m.subtype !== "success") {
          return { ok: false, reason: `run ended: ${m.subtype ?? "error"}${m.result ? ` (${m.result.slice(0, 200)})` : ""}`, retryAt: Date.now() + 10 * 60_000, called: true };
        }
        text = m.result ?? "";
        structured = m.structured_output;
      }
    }
    return { ok: true, text, structured, account: claude.email };
  } catch (err) {
    const why = abort.signal.aborted ? `timed out after ${opts.timeoutMs} ms` : err instanceof Error ? err.message : String(err);
    return { ok: false, reason: why.slice(0, 300), retryAt: Date.now() + 10 * 60_000, called: true };
  } finally {
    clearTimeout(timer);
  }
}
