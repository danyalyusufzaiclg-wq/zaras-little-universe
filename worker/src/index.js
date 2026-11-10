// Book picks for Zara's Little Universe.
// The app sends her shelf; this Worker builds the prompt, asks Claude Haiku, and returns 8 picks.
// It only answers the app's own website, and stops after DAILY_LIMIT rounds a day.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const APP_ORIGIN = "https://danyalyusufzaiclg-wq.github.io";
const MODEL = "claude-haiku-5-5";
const DAILY_LIMIT = 30;

const Pick = z.object({
  title: z.string(),
  author: z.string(),
  year: z.number().int(),
  because: z.string(),
  why: z.string(),
  fact: z.string(),
  publicDomain: z.boolean(),
});
const Picks = z.object({ picks: z.array(Pick) });

const cors = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};
const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const clip = (s, n = 150) => String(s ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, n);

function cleanShelf(body) {
  const shelf = (Array.isArray(body?.shelf) ? body.shelf : []).slice(0, 300).map((b) => ({
    title: clip(b?.title),
    author: clip(b?.author),
    status: ["read", "reading", "want", "have"].includes(b?.status) ? b.status : "read",
    rating: Math.max(0, Math.min(5, Math.round(Number(b?.rating) || 0))),
    fav: b?.fav === true,
  })).filter((b) => b.title);
  const dismissed = (Array.isArray(body?.dismissed) ? body.dismissed : []).slice(0, 300).map((t) => clip(t)).filter(Boolean);
  return { shelf, dismissed };
}

function prompt({ shelf, dismissed }) {
  const read = shelf.filter((b) => b.status === "read");
  const line = (b) => `- ${b.title}${b.author ? " by " + b.author : ""}`;
  const readLines = read.map((b) =>
    line(b) + (b.rating ? ` (rated ${b.rating}/5)` : " (not rated)") + (b.fav ? " [all-time favourite]" : "")).join("\n");
  const other = shelf.filter((b) => b.status !== "read").map(line).join("\n") || "(none)";
  const no = dismissed.map((t) => "- " + t).join("\n") || "(none)";
  return `You recommend books the way the Fable reading app does: from what a reader has already read and how she rated it.

The reader is Zara. She loves fiction and buys most of her books secondhand on ThriftBooks.

Books she has read:
${readLines || "(none yet)"}

Already on her shelf, so do not recommend these:
${other}

She said "not for me" to these, so do not recommend them:
${no}

Recommend 8 novels or story collections she has not read. Weight the books she rated 4 or 5 most heavily, and steer away from anything like the books she rated 1 or 2. Mix close matches with two or three bolder picks from other countries or eras. Prefer books that are easy to find used. Only recommend real, published books by their real authors, and keep every fact accurate; if you are not sure of a fact, give a plainer one you are sure of.

For each pick: "year" is the year of first publication; "because" is the exact title of the book from her read list it most relates to; "why" is one sentence of at most 25 words, speaking to her as "you"; "fact" is one or two sentences with a true, surprising fact about the book or how it was written; "publicDomain" is true only if the book was first published before 1929.`;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname !== "/picks" || request.method !== "POST") return reply(404, { error: "not_found" });
    if (request.headers.get("Origin") !== APP_ORIGIN) return reply(403, { error: "forbidden" });

    let body;
    try {
      body = await request.json();
    } catch {
      return reply(400, { error: "bad_request" });
    }
    const input = cleanShelf(body);

    const day = new Date().toISOString().slice(0, 10);
    const key = "count:" + day;
    const used = Number(await env.LIMITS.get(key)) || 0;
    if (used >= DAILY_LIMIT) return reply(429, { error: "daily_limit" });
    await env.LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        output_config: { effort: "low", format: zodOutputFormat(Picks) },
        messages: [{ role: "user", content: prompt(input) }],
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) return reply(502, { error: "no_picks" });
      console.log("usage", JSON.stringify(response.usage));
      return reply(200, { picks: response.parsed_output.picks.slice(0, 8), usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return reply(429, { error: "busy" });
      if (err instanceof Anthropic.APIError) {
        console.log("anthropic error", err.status, err.message);
        return reply(502, { error: "upstream" });
      }
      console.log("worker error", String(err));
      return reply(500, { error: "worker" });
    }
  },
};
