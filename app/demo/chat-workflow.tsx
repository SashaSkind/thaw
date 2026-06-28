"use client";

/**
 * Chat-first coffee-chat workflow for the demo route.
 * It wraps the experience in assistant-ui's runtime provider while the local
 * workflow state renders the ColdReach-specific cards and approval gates.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import type {
  Channel,
  HookCandidate,
  NarrowResponse,
  ProspectPerson,
} from "@/lib/types";

type ChatRole = "assistant" | "user";
type ChatMessageKind =
  | "text"
  | "progress"
  | "prospects"
  | "person"
  | "hooks"
  | "draft";
type Tone = "casual" | "professional" | "efficient";
type ThreadStatus = "draft" | "sent";

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
  threadId?: string;
}

interface DraftParts {
  subject: string;
  body: string;
}

interface SentEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  channel: Channel;
  sentAt: string;
}

interface ProspectThread {
  id: string;
  title: string;
  subtitle: string;
  status: ThreadStatus;
  person: ProspectPerson;
  confirmedHook: string;
  recentContext: string[];
  angles: string[];
  tone: Tone;
  channel: Channel;
  subject: string;
  body: string;
  sentEmails: SentEmail[];
}

const INITIAL_SUGGESTIONS = [
  "Founders at Series B fintechs in New York",
  "YC founders hiring their first GTM lead",
  "Heads of growth at Series A payments startups",
  "Technical founders talking about fraud or risk",
];

const TONES: Tone[] = ["casual", "professional", "efficient"];

function makeId(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${id}`;
}

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

function channelLabel(channel: Channel): string {
  if (channel === "email") return "Email";
  if (channel === "linkedin") return "LinkedIn DM";
  return "X DM";
}

function availableChannels(person: ProspectPerson): Channel[] {
  const channels: Channel[] = [];
  if (person.channels.email) channels.push("email");
  if (person.channels.linkedin) channels.push("linkedin");
  if (person.channels.x) channels.push("x");
  return channels.length ? channels : ["email"];
}

function splitEmailDraft(draft: string, fallbackSubject: string): DraftParts {
  const lines = draft.split("\n");
  const firstLine = lines[0] ?? "";
  if (!firstLine.toLowerCase().startsWith("subject:")) {
    return { subject: fallbackSubject, body: draft };
  }

  return {
    subject: firstLine.replace(/^subject:\s*/i, "").trim() || fallbackSubject,
    body: lines.slice(2).join("\n").trim(),
  };
}

function composeDraft(
  person: ProspectPerson,
  confirmedHook: string,
  tone: Tone,
  channel: Channel,
): DraftParts {
  const firstName = person.name.split(" ")[0] ?? person.name;
  const hook = confirmedHook.replace(/\.$/, "");
  const hookLower = hook.charAt(0).toLowerCase() + hook.slice(1);

  const opener: Record<Tone, string> = {
    casual: `Hey ${firstName} - noticed ${hookLower}, so I figured I'd reach out.`,
    professional: `Hi ${firstName}, I came across your work at ${person.company} - and ${hookLower}.`,
    efficient: `${firstName} - ${hook}.`,
  };
  const body: Record<Tone, string> = {
    casual:
      "I'm working on something that may be relevant to what you're building. Open to swapping notes over coffee or a quick virtual chat?",
    professional: `I'd love to share something relevant to what you are focused on at ${person.company}. Would you be open to a short coffee chat?`,
    efficient: `Built something relevant to ${person.company}. Worth a 10-minute coffee chat?`,
  };
  const signoff: Record<Tone, string> = {
    casual: "Cheers!",
    professional: "Best regards,",
    efficient: "Thanks,",
  };

  if (channel !== "email") {
    return {
      subject: "",
      body: `${opener[tone]} ${body[tone]}`,
    };
  }

  const subject: Record<Tone, string> = {
    casual: `quick coffee chat re: ${person.company}`,
    professional: `Coffee chat with ${firstName}?`,
    efficient: `${person.company} - 10 min?`,
  };
  return splitEmailDraft(
    `Subject: ${subject[tone]}\n\n${opener[tone]}\n\n${body[tone]}\n\n${signoff[tone]}\nColdReach`,
    subject[tone],
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      kind: "text",
      text:
        "Tell me who you want a coffee chat with. I will find real contact options, help you choose a warm hook from LinkedIn/X-style context, then open a draft thread only when you are ready to edit and send.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<ProspectPerson | null>(
    null,
  );
  const [threads, setThreads] = useState<ProspectThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, threads, activeThreadId]);

  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ?? null;

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
      await appendProgressStep(progressId, "Parsing the target account/person profile.");
      await appendProgressStep(
        progressId,
        "Searching Fiber, Apollo, and the curated fallback set.",
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
        `Ranked ${data.people.length} contacts by role, stage, geography, and channel availability.`,
      );

      appendMessage({
        role: "assistant",
        kind: "prospects",
        text:
          data.people.length > 0
            ? "Here are the strongest coffee-chat options. Pick one and I will look for a warm lead."
            : "I could not find strong matches. Try narrowing by stage, role, geography, or industry.",
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
        "Good pick. I can now look for warm-lead context from recent posts, bio, and fallback signals.",
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

  const confirmHook = async (person: ProspectPerson, hook: string) => {
    const confirmedHook = hook.trim();
    if (!confirmedHook || isWorking) return;

    appendMessage({
      role: "user",
      kind: "text",
      text: `Use this hook: ${confirmedHook}`,
    });
    const progressId = appendMessage({
      role: "assistant",
      kind: "progress",
      text: "Preparing draft ingredients",
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
      const channels = availableChannels(person);
      const channel = channels[0] ?? "email";
      const draft = composeDraft(person, confirmedHook, "professional", channel);
      const threadId = makeId("thread");

      const thread: ProspectThread = {
        id: threadId,
        title: person.name,
        subtitle: `${person.title} at ${person.company}`,
        status: "draft",
        person,
        confirmedHook,
        recentContext: data.recentContext,
        angles: data.suggestedAngles,
        tone: "professional",
        channel,
        subject: draft.subject,
        body: draft.body,
        sentEmails: [],
      };

      setThreads((current) => [thread, ...current]);
      setActiveThreadId(threadId);
      await appendProgressStep(
        progressId,
        "Opened a draft thread in the sidebar so the main chat stays clean.",
      );

      appendMessage({
        role: "assistant",
        kind: "draft",
        text:
          "You are ready to draft. This is the only point where I create a new sidebar chat for editing and sending.",
        person,
        threadId,
      });
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

  const updateThread = (
    threadId: string,
    updater: (thread: ProspectThread) => ProspectThread,
  ) => {
    setThreads((current) =>
      current.map((thread) => (thread.id === threadId ? updater(thread) : thread)),
    );
  };

  const updateThreadDraft = (
    threadId: string,
    tone: Tone,
    channel: Channel,
  ) => {
    updateThread(threadId, (thread) => {
      const draft = composeDraft(thread.person, thread.confirmedHook, tone, channel);
      return { ...thread, tone, channel, subject: draft.subject, body: draft.body };
    });
  };

  const sendDraft = (thread: ProspectThread) => {
    const sentEmail: SentEmail = {
      id: makeId("sent"),
      to: thread.person.email ?? thread.person.linkedinUrl ?? thread.person.xUrl ?? thread.person.name,
      subject: thread.subject || `${thread.person.company} coffee chat`,
      body: thread.body,
      channel: thread.channel,
      sentAt: new Date().toLocaleString(),
    };

    updateThread(thread.id, (current) => ({
      ...current,
      status: "sent",
      sentEmails: [sentEmail, ...current.sentEmails],
    }));
    appendMessage({
      role: "assistant",
      kind: "text",
      text: `Sent is recorded for ${thread.person.name}. You can reopen it from the sidebar under this chat's sent emails.`,
    });
  };

  const resetConversation = () => {
    setMessages([
      {
        id: makeId("msg"),
        role: "assistant",
        kind: "text",
        text: "New coffee-chat workflow started. Who should we look for?",
      },
    ]);
    setInput("");
    setSelectedPerson(null);
  };

  return (
    <main className="chat-app-shell">
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
            <div className="sidebar-section">
              <div className="sidebar-kicker">Chats</div>
              <button className="new-chat-btn" onClick={resetConversation} type="button">
                + New search chat
              </button>
              <div className="thread-list">
                {threads.length === 0 && (
                  <p className="faint">
                    Draft chats appear here only after you confirm a hook.
                  </p>
                )}
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    className={`thread-item ${
                      activeThreadId === thread.id ? "active" : ""
                    }`}
                    onClick={() => setActiveThreadId(thread.id)}
                    type="button"
                  >
                    <span>{thread.title}</span>
                    <small>{thread.status === "sent" ? "sent" : "draft"}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section sidebar-sent">
              <div className="sidebar-kicker">Sent emails</div>
              {threads.every((thread) => thread.sentEmails.length === 0) && (
                <p className="faint">Sent messages will stay attached to their chat.</p>
              )}
              {threads.flatMap((thread) =>
                thread.sentEmails.map((email) => (
                  <button
                    key={email.id}
                    className="sent-item"
                    onClick={() => setActiveThreadId(thread.id)}
                    type="button"
                  >
                    <span>{thread.title}</span>
                    <small>{email.subject}</small>
                  </button>
                )),
              )}
            </div>
          </>
        )}
      </aside>

      <section className="chat-main">
        <div className="topbar chat-topbar">
          <div className="brand">
            <span className="brand-dot" />
            <div>
              ColdReach Coffee Chat
              <small>target - contact - warm lead - draft</small>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <div className="chat-thread" aria-live="polite">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              activeThread={activeThread}
              isWorking={isWorking}
              selectedPerson={selectedPerson}
              onChoosePerson={choosePerson}
              onFindHooks={findHooks}
              onConfirmHook={confirmHook}
              onSetActiveThread={setActiveThreadId}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="chat-composer-wrap">
          {messages.length <= 1 && (
            <div className="chat-hero">
              <h1>Who should we set up a coffee chat with?</h1>
              <p className="muted">
                Start broad, like &quot;founders at Series B.&quot; I will return
                specific contacts, then guide you to a warm hook and editable
                draft.
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
              placeholder='Try "founders at Series B fintechs in New York"'
              rows={2}
              disabled={isWorking}
            />
            <button className="btn" disabled={isWorking || !input.trim()} type="submit">
              {isWorking ? "Working..." : "Send"}
            </button>
          </form>
        </div>
      </section>

      {activeThread && (
        <aside className="draft-panel">
          <DraftThreadPanel
            thread={activeThread}
            onUpdateThread={updateThread}
            onUpdateDraft={updateThreadDraft}
            onSend={sendDraft}
          />
        </aside>
      )}
    </main>
  );
}

function MessageBubble({
  message,
  activeThread,
  isWorking,
  selectedPerson,
  onChoosePerson,
  onFindHooks,
  onConfirmHook,
  onSetActiveThread,
}: {
  message: ChatMessage;
  activeThread: ProspectThread | null;
  isWorking: boolean;
  selectedPerson: ProspectPerson | null;
  onChoosePerson: (person: ProspectPerson) => void;
  onFindHooks: (person: ProspectPerson) => void;
  onConfirmHook: (person: ProspectPerson, hook: string) => void;
  onSetActiveThread: (threadId: string) => void;
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
                onClick={() => onConfirmHook(person, hook.text)}
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
                onClick={() => onConfirmHook(person, customHook)}
                disabled={isWorking || !customHook.trim()}
                type="button"
              >
                Use hook
              </button>
            </div>
          </div>
        )}

        {message.kind === "draft" && message.threadId && (
          <div className="draft-handoff-card">
            <b>Draft chat created</b>
            <p className="faint">
              Open the right panel to edit the draft. Sent emails stay attached
              to this sidebar chat.
            </p>
            <button
              className="btn small"
              onClick={() => onSetActiveThread(message.threadId as string)}
              type="button"
            >
              {activeThread?.id === message.threadId ? "Draft open" : "Open draft"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DraftThreadPanel({
  thread,
  onUpdateThread,
  onUpdateDraft,
  onSend,
}: {
  thread: ProspectThread;
  onUpdateThread: (
    threadId: string,
    updater: (thread: ProspectThread) => ProspectThread,
  ) => void;
  onUpdateDraft: (threadId: string, tone: Tone, channel: Channel) => void;
  onSend: (thread: ProspectThread) => void;
}) {
  const channels = availableChannels(thread.person);

  return (
    <div className="draft-thread">
      <div className="sidebar-kicker">Draft chat</div>
      <h2>{thread.title}</h2>
      <p className="muted">{thread.subtitle}</p>
      <div className="banner">
        <span className="dot" />
        {thread.status === "sent"
          ? "Sent email recorded in this chat."
          : "Review and edit before sending."}
      </div>

      <div className="section">
        <b>Confirmed warm lead</b>
        <p className="muted">{thread.confirmedHook}</p>
      </div>

      {thread.angles.length > 0 && (
        <div className="section">
          <b>Agent angles</b>
          <ul className="list">
            {thread.angles.map((angle) => (
              <li key={angle}>{angle}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="section">
        <b>Channel</b>
        <div className="channel-tabs">
          {channels.map((channel) => (
            <button
              key={channel}
              className={`tone ${thread.channel === channel ? "active" : ""}`}
              onClick={() => onUpdateDraft(thread.id, thread.tone, channel)}
              type="button"
            >
              {channelLabel(channel)}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <b>Tone</b>
        <div className="tones">
          {TONES.map((tone) => (
            <button
              key={tone}
              className={`tone ${thread.tone === tone ? "active" : ""}`}
              onClick={() => onUpdateDraft(thread.id, tone, thread.channel)}
              type="button"
            >
              {tone}
            </button>
          ))}
        </div>
      </div>

      {thread.channel === "email" && (
        <label className="draft-field">
          Subject
          <input
            type="text"
            value={thread.subject}
            onChange={(event) =>
              onUpdateThread(thread.id, (current) => ({
                ...current,
                subject: event.target.value,
              }))
            }
          />
        </label>
      )}

      <label className="draft-field">
        Message
        <textarea
          rows={9}
          value={thread.body}
          onChange={(event) =>
            onUpdateThread(thread.id, (current) => ({
              ...current,
              body: event.target.value,
            }))
          }
        />
      </label>

      {thread.recentContext.length > 0 && (
        <div className="section">
          <b>Context used</b>
          <ul className="list">
            {thread.recentContext.map((context) => (
              <li key={context}>{context}</li>
            ))}
          </ul>
        </div>
      )}

      <button className="btn" onClick={() => onSend(thread)} type="button">
        Send
      </button>

      {thread.sentEmails.length > 0 && (
        <div className="section">
          <b>Sent emails in this chat</b>
          {thread.sentEmails.map((email) => (
            <div className="sent-preview" key={email.id}>
              <span>{email.sentAt}</span>
              <b>{email.subject}</b>
              <p>{email.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatWorkflow() {
  return <ChatWorkflowShell />;
}
