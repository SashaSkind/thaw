"use client";

/**
 * Chat-first coffee-chat workflow for the demo route.
 * Contact discovery stays in chat; draft creation persists state and opens a
 * dedicated draft page for editing/sending.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import type { HookCandidate, NarrowResponse, ProspectPerson } from "@/lib/types";
import {
  availableChannels,
  composeDraft,
  makeId,
  readOutreachSettings,
  saveDraftThread,
  type ProspectThread,
} from "./draft-state";

type ChatRole = "assistant" | "user";
type ChatMessageKind = "text" | "progress" | "prospects" | "person" | "hooks" | "draft";

interface ChatMessage {
  id: string;
  role: ChatRole;
  kind: ChatMessageKind;
  text?: string;
  progress?: string[];
  people?: ProspectPerson[];
  person?: ProspectPerson;
  hooks?: HookCandidate[];
  primarySource?: string;
  draftPath?: string;
}

interface ConfirmedHookInput {
  text: string;
  source: string;
}

const INITIAL_SUGGESTIONS = [
  "Hahnbee Lee Mintlify",
  "Michael Truell Cursor",
  "Founders building AI developer tools",
  "Founders at Series B fintechs in New York",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // next-themes resolves the active theme only after client mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <span style={{ width: 96 }} />;
  const isDark = resolvedTheme === "dark";

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      type="button"
    >
      {isDark ? "Light" : "Dark"}
    </button>
  );
}

function isResponseOk(response: Response): boolean {
  return response.status >= 200 && response.status < 300;
}

function PersonChannels({ person }: { person: ProspectPerson }) {
  return (
    <div className="channels">
      <span className={`channel ${person.channels.email ? "on" : ""}`}>
        email
      </span>
      <span className={`channel ${person.channels.linkedin ? "on" : ""}`}>
        in
      </span>
      <span className={`channel ${person.channels.x ? "on" : ""}`}>x</span>
    </div>
  );
}

function ChatWorkflowShell() {
  const transport = useMemo(
    () => new AssistantChatTransport({ api: "/api/demo/chat" }),
    [],
  );
  const runtime = useChatRuntime({ transport });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatWorkspace />
    </AssistantRuntimeProvider>
  );
}

function ChatWorkspace() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<ProspectPerson | null>(
    null,
  );
  const [draftLinks, setDraftLinks] = useState<
    { id: string; title: string; path: string }[]
  >([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const hasStarted = messages.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const appendMessage = (message: Omit<ChatMessage, "id">): string => {
    const id = makeId("msg");
    setMessages((current) => [...current, { ...message, id }]);
    return id;
  };

  const updateMessage = (
    id: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? updater(message) : message)),
    );
  };

  const appendProgressStep = async (id: string, text: string) => {
    updateMessage(id, (message) => ({
      ...message,
      progress: [...(message.progress ?? []), text],
    }));
    await delay(350);
  };

  const runNarrow = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || isWorking) return;

    setInput("");
    setSelectedPerson(null);
    appendMessage({ role: "user", kind: "text", text: trimmed });
    const progressId = appendMessage({
      role: "assistant",
      kind: "progress",
      text: "Finding people",
      progress: [],
    });
    setIsWorking(true);

    try {
      await appendProgressStep(progressId, "Parsing the target profile.");
      await appendProgressStep(
        progressId,
        "Searching Fiber, Apollo, and curated fallback contacts.",
      );

      const response = await fetch("/api/v1/narrow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: trimmed, limit: 10 }),
      });

      if (!isResponseOk(response)) {
        throw new Error(`Narrowing failed with status ${response.status}.`);
      }

      const data = (await response.json()) as NarrowResponse;
      await appendProgressStep(
        progressId,
        `Ranked ${data.people.length} contacts by fit and channel availability.`,
      );

      appendMessage({
        role: "assistant",
        kind: "prospects",
        text:
          data.people.length > 0
            ? "Here are the strongest coffee-chat options. Pick one and I will look for a warm lead."
            : "I could not find strong matches. Try a person, company, role, or market.",
        people: data.people,
      });
    } catch (error) {
      appendMessage({
        role: "assistant",
        kind: "text",
        text: `I hit an error while finding contacts: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setIsWorking(false);
    }
  };

  const choosePerson = (person: ProspectPerson) => {
    setSelectedPerson(person);
    appendMessage({
      role: "user",
      kind: "text",
      text: `Let's explore ${person.name} at ${person.company}.`,
    });
    appendMessage({
      role: "assistant",
      kind: "person",
      text:
        "Good pick. I can now look for warm-lead context from recent posts, public profiles, and fallback signals.",
      person,
    });
  };

  const findHooks = async (person: ProspectPerson) => {
    if (isWorking) return;

    const progressId = appendMessage({
      role: "assistant",
      kind: "progress",
      text: `Finding warm leads for ${person.name}`,
      progress: [],
    });
    setIsWorking(true);

    try {
      await appendProgressStep(
        progressId,
        "Checking Fiber recent LinkedIn/X context first.",
      );
      const response = await fetch("/api/v1/hooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personId: person.id }),
      });

      if (!isResponseOk(response)) {
        throw new Error(`Hook discovery failed with status ${response.status}.`);
      }

      const data = (await response.json()) as {
        hooks: HookCandidate[];
        primarySource: string;
      };
      await appendProgressStep(
        progressId,
        `Found ${data.hooks.length} grounded hook candidates from ${data.primarySource}.`,
      );

      appendMessage({
        role: "assistant",
        kind: "hooks",
        text:
          data.hooks.length > 0
            ? "Confirm the hook you actually want to use. I will not put anything into a draft until you choose it."
            : "Context was thin. Add your own hook and I will use that for the draft.",
        hooks: data.hooks,
        primarySource: data.primarySource,
        person,
      });
    } catch (error) {
      appendMessage({
        role: "assistant",
        kind: "text",
        text: `I could not find hooks for ${person.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setIsWorking(false);
    }
  };

  const confirmHook = async (person: ProspectPerson, hook: ConfirmedHookInput) => {
    const confirmedHook = hook.text.trim();
    if (!confirmedHook || isWorking) return;

    appendMessage({
      role: "user",
      kind: "text",
      text: `Use this hook: ${confirmedHook}`,
    });
    const progressId = appendMessage({
      role: "assistant",
      kind: "progress",
      text: "Preparing draft page",
      progress: [],
    });
    setIsWorking(true);

    try {
      await appendProgressStep(
        progressId,
        "Enriching the selected contact with recent context and angles.",
      );
      const response = await fetch("/api/v1/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personId: person.id, confirmedHook }),
      });

      if (!isResponseOk(response)) {
        throw new Error(`Enrichment failed with status ${response.status}.`);
      }

      const data = (await response.json()) as {
        recentContext: string[];
        suggestedAngles: string[];
      };
      const channel = availableChannels(person)[0] ?? "email";
      const settings = readOutreachSettings();
      const draft = composeDraft(
        person,
        confirmedHook,
        "professional",
        channel,
        settings,
        hook.source,
        data.recentContext,
      );
      const draftId = makeId("draft");
      const thread: ProspectThread = {
        id: draftId,
        title: person.name,
        subtitle: `${person.title} at ${person.company}`,
        status: "draft",
        person,
        confirmedHook,
        confirmedHookSource: hook.source,
        recentContext: data.recentContext,
        angles: data.suggestedAngles,
        settings,
        tone: "professional",
        channel,
        subject: draft.subject,
        body: draft.body,
        sentEmails: [],
      };
      const draftPath = `/email/${draftId}`;

      saveDraftThread(thread);
      setDraftLinks((current) => [
        { id: draftId, title: person.name, path: draftPath },
        ...current,
      ]);
      await appendProgressStep(
        progressId,
        "Draft created. Opening the dedicated email editing page.",
      );

      appendMessage({
        role: "assistant",
        kind: "draft",
        text:
          "Draft created. I am sending this to the email page so you can review and send it.",
        person,
        draftPath,
      });
      await delay(500);
      router.push(draftPath);
    } catch (error) {
      appendMessage({
        role: "assistant",
        kind: "text",
        text: `I could not prepare the draft: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setIsWorking(false);
    }
  };

  const resetConversation = () => {
    setMessages([
      {
        id: makeId("msg"),
        role: "assistant",
        kind: "text",
        text: "New chat started. Who should we find for your coffee chat?",
      },
    ]);
    setInput("");
    setSelectedPerson(null);
  };

  return (
    <main className={`chat-app-shell ${hasStarted ? "started" : "empty"}`}>
      <aside className={`chat-sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <button
          className="sidebar-toggle"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          type="button"
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isSidebarCollapsed ? ">" : "<"}
        </button>

        {!isSidebarCollapsed && (
          <>
            <div className="chat-sidebar-brand">
              <span className="paper-plane-mark">▱</span>
              <span>ColdReach</span>
              <small>BETA</small>
            </div>
            <div className="sidebar-section">
              <button className="new-chat-btn" onClick={resetConversation} type="button">
                + New search chat
              </button>
              <div className="sidebar-kicker">Drafts</div>
              <div className="thread-list">
                {draftLinks.length === 0 && (
                  <p className="faint">
                    Draft requests appear after you confirm a hook.
                  </p>
                )}
                {draftLinks.map((draft) => (
                  <button
                    key={draft.id}
                    className="thread-item"
                    onClick={() => router.push(draft.path)}
                    type="button"
                  >
                    <span>{draft.title}</span>
                    <small>draft page</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section sidebar-sent">
              <div className="sidebar-kicker">Emails</div>
              <p className="faint">
                Sent messages are reviewed and sent from the email page.
              </p>
            </div>

            <div className="sidebar-section sidebar-sent">
              <div className="sidebar-kicker">Context</div>
              <Link className="sidebar-settings-link" href="/settings">
                Settings
              </Link>
            </div>

            <div className="sidebar-user">
              <span className="avatar-pill">B</span>
              <span>Brandon</span>
            </div>
          </>
        )}
      </aside>

      <section className="chat-main">
        {!hasStarted && (
          <div className="chat-open-state">
            <div className="chat-open-brand">
              <span className="paper-plane-mark large">▱</span>
              <span>ColdReach</span>
              <small>BETA</small>
            </div>
            <h1>Who do you want to reach?</h1>
            <p className="muted">
              Ask for a person, company, or segment. I will find the contact,
              surface a warm hook, and move the draft to email.
            </p>
            <div className="suggestions">
              {INITIAL_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  className="chip"
                  onClick={() => runNarrow(suggestion)}
                  disabled={isWorking}
                  type="button"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasStarted && <ThemeToggle />}

        <div className="chat-thread" aria-live="polite">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isWorking={isWorking}
              selectedPerson={selectedPerson}
              onChoosePerson={choosePerson}
              onFindHooks={findHooks}
              onConfirmHook={confirmHook}
              onOpenDraft={(draftPath) => router.push(draftPath)}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        <div className={`chat-composer-wrap ${hasStarted ? "docked" : "centered"}`}>
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              runNarrow(input);
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                hasStarted
                  ? "Press Enter to send · Shift+Enter for new line"
                  : 'Try "Michael Truell Cursor"'
              }
              rows={2}
              disabled={isWorking}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                runNarrow(input);
              }}
            />
            <button
              className="composer-send"
              disabled={isWorking || !input.trim()}
              type="submit"
              aria-label="Send"
            >
              ↑
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function MessageBubble({
  message,
  isWorking,
  selectedPerson,
  onChoosePerson,
  onFindHooks,
  onConfirmHook,
  onOpenDraft,
}: {
  message: ChatMessage;
  isWorking: boolean;
  selectedPerson: ProspectPerson | null;
  onChoosePerson: (person: ProspectPerson) => void;
  onFindHooks: (person: ProspectPerson) => void;
  onConfirmHook: (person: ProspectPerson, hook: ConfirmedHookInput) => void;
  onOpenDraft: (draftPath: string) => void;
}) {
  const [customHook, setCustomHook] = useState("");
  const isAssistant = message.role === "assistant";
  const person = message.person ?? selectedPerson;

  return (
    <div className={`chat-message ${isAssistant ? "assistant" : "user"}`}>
      <div className="chat-avatar">{isAssistant ? "AI" : "You"}</div>
      <div className="chat-bubble">
        {message.text && <p>{message.text}</p>}

        {message.kind === "progress" && (
          <div className="narration">
            {(message.progress ?? []).map((step, index) => {
              const isLast = index === (message.progress?.length ?? 0) - 1;
              return (
                <div key={`${message.id}-${step}`} className="narration-line">
                  {isLast && isWorking ? (
                    <span className="spinner" />
                  ) : (
                    <span className="tick">OK</span>
                  )}
                  {step}
                </div>
              );
            })}
          </div>
        )}

        {message.kind === "prospects" && message.people && (
          <div className="chat-card-list">
            {message.people.slice(0, 10).map((candidate) => (
              <button
                key={candidate.id}
                className="prospect chat-prospect"
                onClick={() => onChoosePerson(candidate)}
                type="button"
              >
                <div>
                  <div className="name">{candidate.name}</div>
                  <div className="role">
                    {candidate.title} - {candidate.company}
                    {candidate.location ? ` - ${candidate.location}` : ""}
                  </div>
                  <div className="evidence">{candidate.evidence}</div>
                  <PersonChannels person={candidate} />
                </div>
                <div className="score">
                  <div className="num">{candidate.matchScore}</div>
                  <div className="lbl">match</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {message.kind === "person" && message.person && (
          <div className="inline-profile">
            <h2>{message.person.name}</h2>
            <p className="muted">
              {message.person.title} at {message.person.company}
            </p>
            <p className="faint">{message.person.evidence}</p>
            <div className="detail-links">
              {message.person.linkedinUrl && (
                <a href={message.person.linkedinUrl} target="_blank" rel="noreferrer">
                  LinkedIn
                </a>
              )}
              {message.person.xUrl && (
                <a href={message.person.xUrl} target="_blank" rel="noreferrer">
                  X
                </a>
              )}
              {message.person.email && <span>{message.person.email}</span>}
            </div>
            <button
              className="btn small"
              onClick={() => onFindHooks(message.person as ProspectPerson)}
              disabled={isWorking}
              type="button"
            >
              Find warm lead
            </button>
          </div>
        )}

        {message.kind === "hooks" && person && (
          <div className="hook-picker">
            <div className="source-tag">
              context source: {message.primarySource ?? "fallback"}
            </div>
            {(message.hooks ?? []).map((hook) => (
              <button
                key={hook.id}
                className="hook"
                onClick={() => onConfirmHook(person, { text: hook.text, source: hook.source })}
                disabled={isWorking}
                type="button"
              >
                <span className="radio" />
                <span>
                  <span className="htext">{hook.text}</span>
                  <span className="hsource">source: {hook.source}</span>
                </span>
              </button>
            ))}
            <div className="custom-hook-row">
              <input
                type="text"
                value={customHook}
                onChange={(event) => setCustomHook(event.target.value)}
                placeholder="Or type your own warm hook"
                disabled={isWorking}
              />
              <button
                className="btn small"
                onClick={() =>
                  onConfirmHook(person, { text: customHook, source: "user note" })
                }
                disabled={isWorking || !customHook.trim()}
                type="button"
              >
                Use hook
              </button>
            </div>
          </div>
        )}

        {message.kind === "draft" && message.draftPath && (
          <div className="draft-handoff-card">
            <b>Draft page created</b>
            <p className="faint">Open email to review the draft and send.</p>
            <button
              className="btn small"
              onClick={() => onOpenDraft(message.draftPath as string)}
              type="button"
            >
              Open email →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatWorkflow() {
  return <ChatWorkflowShell />;
}
