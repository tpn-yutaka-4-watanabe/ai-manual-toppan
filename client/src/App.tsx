import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { fetchAdminHandbookIndex, fetchHandbookConfig, streamChat } from "./api";
import type { AdminHandbookIndex, ChatMessage, PublicHandbookConfig } from "./types";

function getSlug() {
  const match = window.location.pathname.match(/^\/(?:chats|apps)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  return match?.[1] ?? "";
}

function isAdminPath() {
  return /^\/(?:admin)?\/?$/.test(window.location.pathname);
}

function messageId(role: ChatMessage["role"]) {
  return `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sessionUid(slug: string) {
  const randomPart = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${slug}-${randomPart}`;
}

function mergeText(current: string, incoming: string) {
  if (!incoming) return current;
  if (!current || incoming.startsWith(current)) return incoming;
  return `${current}${incoming}`;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    if (match[1] && match[2]) {
      nodes.push(<a href={match[2]} target="_blank" rel="noreferrer" key={`link-${match.index}`}>{match[1]}</a>);
    } else if (match[3]) {
      nodes.push(<code key={`code-${match.index}`}>{match[3]}</code>);
    } else {
      nodes.push(<strong key={`strong-${match.index}`}>{match[4] ?? match[5]}</strong>);
    }
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function MarkdownText({ text }: { text: string }) {
  const lines = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*json\s*$/gim, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n");
  const blocks: Array<{ type: "p" | "list" | "rule"; lines: string[] }> = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", lines: paragraph.splice(0) });
    if (list.length) blocks.push({ type: "list", lines: list.splice(0) });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
    } else if (/^[-*_]{3,}$/.test(line)) {
      flush();
      blocks.push({ type: "rule", lines: [] });
    } else {
      const listMatch = line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
      if (listMatch) {
        if (paragraph.length) blocks.push({ type: "p", lines: paragraph.splice(0) });
        list.push(listMatch[1]);
      } else {
        if (list.length) blocks.push({ type: "list", lines: list.splice(0) });
        paragraph.push(line);
      }
    }
  }
  flush();

  return (
    <div className="assistant-bubble">
      {blocks.map((block, index) => {
        if (block.type === "rule") return <hr key={`rule-${index}`} />;
        if (block.type === "list") {
          return <ul key={`list-${index}`}>{block.lines.map((line, lineIndex) => <li key={lineIndex}>{renderInline(line)}</li>)}</ul>;
        }
        return (
          <p key={`p-${index}`}>
            {block.lines.map((line, lineIndex) => (
              <span key={lineIndex}>{renderInline(line)}{lineIndex < block.lines.length - 1 ? <br /> : null}</span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function MessageItem({ message, label }: { message: ChatMessage; label: string }) {
  if (message.role === "user") {
    return <div className="message-row user-row"><div className="user-bubble">{message.text}</div></div>;
  }
  return (
    <div className="message-row assistant-row">
      <div className="assistant-label">{label}</div>
      <div className="assistant-speech-row">
        <div className="assistant-avatar" aria-hidden="true">AI</div>
        {message.isLoading ? <div className="loading-bubble"><span /><span /><span /></div> : <MarkdownText text={message.text} />}
      </div>
    </div>
  );
}

function HandbookPage({ slug }: { slug: string }) {
  const [config, setConfig] = useState<PublicHandbookConfig | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [connectionName, setConnectionName] = useState("");
  const [state, setState] = useState<unknown>();
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const stateRef = useRef<unknown>();
  const uidRef = useRef(sessionUid(slug));
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    fetchHandbookConfig(slug)
      .then((value) => {
        if (!active) return;
        document.title = value.title;
        setConfig(value);
        setMessages([{ id: "initial", role: "assistant", text: value.initialMessage }]);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "設定を読み込めませんでした。");
      });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages, quickReplies, sending]);

  async function send(utterance: string) {
    const trimmed = utterance.trim();
    if (!trimmed || sending || !config) return;

    const assistantId = messageId("assistant");
    setSending(true);
    setError("");
    setQuickReplies([]);
    setMessages((current) => [
      ...current,
      { id: messageId("user"), role: "user", text: trimmed },
      { id: assistantId, role: "assistant", text: "", isLoading: true },
    ]);

    try {
      let streamed = "";
      await streamChat(
        slug,
        { utterance: trimmed, uid: uidRef.current, state: stateRef.current },
        {
          onConnection: (name) => setConnectionName(name),
          onMessage: (message, nextState) => {
            streamed = mergeText(streamed, message);
            if (nextState !== undefined) setState(nextState);
            setMessages((current) => current.map((item) => item.id === assistantId
              ? { ...item, text: streamed, isLoading: !streamed.trim() }
              : item));
          },
          onDone: (payload) => {
            streamed = payload.message || streamed;
            if (payload.state !== undefined) setState(payload.state);
            setQuickReplies(payload.quickReplies ?? []);
            setConnectionName(payload.connection?.name || config.connectionName);
            setMessages((current) => current.map((item) => item.id === assistantId
              ? { id: item.id, role: "assistant", text: streamed || "応答がありませんでした。" }
              : item));
          },
        },
      );
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : `${config.title}への送信に失敗しました。`;
      setError(message);
      setMessages((current) => current.map((item) => item.id === assistantId
        ? { ...item, text: message, isLoading: false }
        : item));
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setInput("");
    void send(value);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function restart() {
    if (!config || sending) return;
    uidRef.current = sessionUid(slug);
    stateRef.current = undefined;
    setState(undefined);
    setMessages([{ id: "initial", role: "assistant", text: config.initialMessage }]);
    setInput("");
    setQuickReplies([]);
    setConnectionName("");
    setError("");
  }

  if (!config) {
    return <main className="status-page"><div className="status-card">{error || "読み込み中…"}</div></main>;
  }

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <div className="title-block"><a href="/admin">管理</a><h1>{config.title}</h1></div>
        <div className="header-actions">
          <span className="connection-pill">{connectionName || "接続準備中"}</span>
          <button className="secondary-button" type="button" onClick={restart} disabled={sending}>最初から</button>
        </div>
      </header>
      <div className="chat-history" aria-live="polite">
        {messages.map((message) => <MessageItem message={message} label={config.assistantLabel} key={message.id} />)}
        <div ref={bottomRef} />
      </div>
      <footer className="composer">
        {error ? <p className="error-message">{error}</p> : null}
        {quickReplies.length ? (
          <div className="quick-replies" aria-label="次の質問候補">
            {quickReplies.map((reply) => <button type="button" key={reply} onClick={() => void send(reply)} disabled={sending}>{reply}</button>)}
          </div>
        ) : null}
        <form className="input-row" onSubmit={submit}>
          <textarea rows={1} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} placeholder={config.inputPlaceholder} disabled={sending} />
          <button type="submit" disabled={sending || !input.trim()}>送信</button>
        </form>
      </footer>
    </main>
  );
}

function AdminPage() {
  const [index, setIndex] = useState<AdminHandbookIndex | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    document.title = "販売基本ルールAI 管理";
    fetchAdminHandbookIndex().then((value) => {
      document.title = value.title;
      setIndex(value);
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "一覧を読み込めませんでした。");
    });
  }, []);

  return (
    <main className="admin-page">
      <section className="admin-panel">
        <div className="admin-heading">
          <p className="eyebrow">ADMIN</p>
          <h1>{index?.title ?? "販売基本ルールAI 管理"}</h1>
        </div>
        {error ? <p className="error-message">{error}</p> : null}
        {index?.apps.length ? (
          <nav className="chat-list" aria-label="チャット一覧">
            {index.apps.map((app) => (
              <a href={`/chats/${app.slug}`} key={app.slug}>
                <span className="chat-list-title">{app.title}</span>
                <span className="chat-list-url">/chats/{app.slug}</span>
                <span className="chat-list-action">開く</span>
              </a>
            ))}
          </nav>
        ) : !error ? (
          <p className="empty-message">チャットが登録されていません。</p>
        ) : null}
      </section>
    </main>
  );
}

export default function App() {
  const slug = getSlug();
  if (slug) return <HandbookPage slug={slug} />;
  if (isAdminPath()) return <AdminPage />;
  return <main className="status-page"><div className="status-card">ページが見つかりません。</div></main>;
}
