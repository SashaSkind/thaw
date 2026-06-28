/**
 * POST /api/demo/stream — narrated streaming for the demo (Brandon, Task 3).
 *
 * The "streaming fix": instead of a blank assistant bubble while the agent
 * works, we stream narrated step events as the work happens, then a final
 * result event. The client renders a step only once it arrives (no empty
 * bubbles) and shows tokens/steps as they stream in.
 *
 * PATTERN FROM coldreach/* streaming chat — dedupe post-hackathon. We use a raw
 * NDJSON ReadableStream (works with zero keys and is trivially reliable on
 * stage) rather than an LLM token stream, which is overkill for fixed narration.
 */

import { guard } from "@/lib/http";
import { narrowPeople } from "@/lib/narrow";
import type { NarrowResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

interface StepEvent {
  type: "step";
  text: string;
}
interface ResultEvent {
  type: "result";
  data: NarrowResponse;
}
type StreamEvent = StepEvent | ResultEvent;

const NARRATION_STEPS = [
  "Understanding your targeting goal…",
  "Finding matching companies…",
  "Ranking people by fit…",
  "Checking contact channels (email / LinkedIn / X)…",
  "Preparing prospect cards…",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;

  let goal = "";
  try {
    const body = (await request.json()) as { goal?: unknown };
    goal = typeof body.goal === "string" ? body.goal : "";
  } catch {
    // tolerate empty body; goal stays ""
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      // Kick off the real Fiber-backed narrow while we narrate, so the live API
      // call overlaps the loading animation.
      const narrowing = narrowPeople(goal || "fintech founders");

      for (const text of NARRATION_STEPS) {
        send({ type: "step", text });
        await sleep(850);
      }

      const { people } = await narrowing;
      const result: NarrowResponse = {
        intent: {
          goal,
          understood: goal
            ? `Targeting people related to: ${goal}`
            : "Targeting top fintech prospects",
        },
        companies: Array.from(
          new Set(people.map((p) => p.company).filter(Boolean)),
        ).map((name) => ({ name })),
        people,
      };
      send({ type: "result", data: result });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
