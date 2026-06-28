/**
 * assistant-ui transport endpoint for the chat demo shell.
 * The ColdReach workflow uses structured /api/v1 tools; this route gives the
 * assistant-ui runtime a real AI SDK UI stream target for generic chat turns.
 */

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";

const FALLBACK_RESPONSE =
  "I can help run the coffee-chat workflow. Use the main composer to describe " +
  "the people you want to reach, then choose a contact, confirm a warm hook, " +
  "and edit the generated draft.";

function fallbackStream(messages: UIMessage[]): Response {
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      const textId = "fallback-text";
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: FALLBACK_RESPONSE });
      writer.write({ type: "text-end", id: textId });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function POST(request: Request): Promise<Response> {
  let body: { messages?: UIMessage[] };
  try {
    body = (await request.json()) as { messages?: UIMessage[] };
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const messages = body.messages ?? [];
  if (!process.env.OPENAI_API_KEY) {
    return fallbackStream(messages);
  }

  const modelMessages = await convertToModelMessages(messages);
  const result = streamText({
    model: openai(process.env.OPENAI_MODEL || "gpt-4o-mini"),
    system:
      "You are the ColdReach coffee-chat assistant. Keep replies concise and " +
      "guide the user through target, contact, warm lead, and editable draft.",
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse({ originalMessages: messages });
}
