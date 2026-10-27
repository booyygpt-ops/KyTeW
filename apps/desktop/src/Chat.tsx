import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { io } from "socket.io-client";
import { Virtuoso } from "react-virtuoso";
import Markdown from "react-markdown";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Hash,
  LoaderCircle,
  Pencil,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { api } from "./api";
import { Avatar, ErrorBox } from "./ui";
import type { Message, User } from "./types";

export default function Chat({
  roomId,
  title,
  topic,
  me,
}: {
  roomId: string;
  title: string;
  topic: string;
  me: User;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [content, setContent] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [sending, setSending] = useState(false),
    [connected, setConnected] = useState(false),
    [typing, setTyping] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [editText, setEditText] = useState("");
  const socket = useRef<ReturnType<typeof io> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fetchSequence = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const load = useCallback(async () => {
    const sequence = ++fetchSequence.current;
    const result = await api<{ items: Message[]; hasMore: boolean }>(
      `/rooms/${roomId}/messages${query ? `?search=${encodeURIComponent(query)}` : ""}`,
    );
    if (sequence === fetchSequence.current) {
      setMessages(result.items);
      setMore(result.hasMore);
    }
  }, [roomId, query]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    load()
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);
  useEffect(() => {
    const s = io({
      withCredentials: true,
      autoConnect: false,
      transports: ["websocket"],
    });
    socket.current = s;
    s.on("connect", () => {
      s.emit("room:join", { roomId }, (ack: { ok: boolean }) => {
        setConnected(ack.ok);
        if (ack.ok && !queryRef.current)
          load().catch((e) => setError(e.message));
      });
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", () => setConnected(false));
    s.on("message:created", (event: { roomId: string; message: Message }) => {
      if (event.roomId === roomId && !queryRef.current)
        setMessages((items) =>
          items.some((m) => m.id === event.message.id)
            ? items
            : [...items, event.message],
        );
    });
    s.on("message:updated", (event: { roomId: string; message: Message }) => {
      if (event.roomId === roomId)
        setMessages((items) =>
          items.map((m) => (m.id === event.message.id ? event.message : m)),
        );
    });
    s.on("message:deleted", (event: { roomId: string; id: string }) => {
      if (event.roomId === roomId)
        setMessages((items) => items.filter((m) => m.id !== event.id));
    });
    s.on("typing", (event: { displayName: string }) => {
      setTyping(event.displayName);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setTyping(""), 3000);
    });
    s.connect();
    return () => {
      s.disconnect();
      socket.current = null;
      clearTimeout(timer.current);
    };
    // Room connection is independent from the search view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!content.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const message = await api<Message>(`/rooms/${roomId}/messages`, "POST", {
        content,
      });
      if (!query)
        setMessages((items) =>
          items.some((m) => m.id === message.id) ? items : [...items, message],
        );
      setContent("");
    } catch (e) {
      setError(
        `${(e as Error).message} Mesajın korunuyor; yeniden gönderebilirsin.`,
      );
    } finally {
      setSending(false);
    }
  }
  async function older() {
    try {
      const result = await api<{ items: Message[]; hasMore: boolean }>(
        `/rooms/${roomId}/messages?before=${messages[0].id}${query ? `&search=${encodeURIComponent(query)}` : ""}`,
      );
      setMessages((items) => [
        ...result.items.filter((m) => !items.some((i) => i.id === m.id)),
        ...items,
      ]);
      setMore(result.hasMore);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove(id: string) {
    if (!confirm("Bu mesaj kalıcı olarak silinsin mi?")) return;
    try {
      await api(`/rooms/${roomId}/messages/${id}`, "DELETE");
      setMessages((items) => items.filter((m) => m.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function edit(e: FormEvent, id: string) {
    e.preventDefault();
    try {
      const result = await api<Message>(
        `/rooms/${roomId}/messages/${id}`,
        "PATCH",
        { content: editText },
      );
      setMessages((items) => items.map((m) => (m.id === id ? result : m)));
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="chat">
      <div className="chat-tools">
        <span className={`connection ${connected ? "" : "reconnecting"}`}>
          <i />
          {connected ? "Canlı bağlantı" : "Yeniden bağlanıyor…"}
        </span>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
          }}
        >
          <Search size={15} />
          <input
            aria-label="Mesajlarda ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Bu sohbette ara"
            maxLength={100}
          />
          {query ? (
            <button
              type="button"
              aria-label="Aramayı temizle"
              onClick={() => {
                setQuery("");
                setSearch("");
              }}
            >
              <X size={15} />
            </button>
          ) : (
            <button aria-label="Ara">
              <ArrowUp size={15} />
            </button>
          )}
        </form>
      </div>
      {loading ? (
        <div className="center-state">
          <LoaderCircle className="spin" /> Sohbet yükleniyor…
        </div>
      ) : (
        <>
          <div className="channel-welcome">
            <div className="channel-mark">
              <Hash size={31} />
            </div>
            <span className="eyebrow">
              {query ? "ARAMA SONUÇLARI" : "SOHBETİN BAŞLANGICI"}
            </span>
            <h2>
              {query
                ? `“${query}” için sonuçlar`
                : `${title} kanalına hoş geldin`}
            </h2>
            <p>
              {topic ||
                "Burası sizin ortak alanınız. İlk mesajla sohbete katıl."}
            </p>
          </div>
          <Virtuoso
            className="message-list"
            data={messages}
            initialTopMostItemIndex={Math.max(0, messages.length - 1)}
            followOutput="smooth"
            computeItemKey={(_index, item) => item.id}
            components={{
              Header: () =>
                more ? (
                  <button className="load-more" onClick={older}>
                    <ArrowUp size={14} /> Önceki mesajları yükle
                  </button>
                ) : null,
              EmptyPlaceholder: () => (
                <div className="empty-messages">
                  <ArrowDown size={17} />{" "}
                  {query
                    ? "Eşleşen mesaj yok."
                    : "Henüz mesaj yok. İlk merhaba senden olsun."}
                </div>
              ),
            }}
            itemContent={(_i, message) => (
              <article className="message">
                <Avatar user={message.author} />
                <div className="message-main">
                  <div className="message-meta">
                    <b>{message.author.displayName}</b>
                    <span>@{message.author.username}</span>
                    <time dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleString("tr-TR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    {message.editedAt && <small>düzenlendi</small>}
                  </div>
                  {editing === message.id ? (
                    <form
                      className="edit-form"
                      onSubmit={(e) => edit(e, message.id)}
                    >
                      <input
                        aria-label="Mesajı düzenle"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        maxLength={4000}
                        required
                        autoFocus
                      />
                      <button
                        className="icon-button"
                        aria-label="Düzenlemeyi kaydet"
                      >
                        <Check size={17} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Vazgeç"
                        onClick={() => setEditing(null)}
                      >
                        <X size={17} />
                      </button>
                    </form>
                  ) : (
                    <div className="markdown">
                      <Markdown
                        components={{
                          a: (props) => (
                            <a
                              {...props}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          ),
                          img: (props) => (
                            <a
                              href={props.src}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Görsel bağlantısı (harici)
                            </a>
                          ),
                        }}
                      >
                        {message.content}
                      </Markdown>
                    </div>
                  )}
                </div>
                {message.authorId === me.id && (
                  <div className="message-actions">
                    <button
                      aria-label="Mesajı düzenle"
                      onClick={() => {
                        setEditing(message.id);
                        setEditText(message.content);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      aria-label="Mesajı sil"
                      onClick={() => remove(message.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </article>
            )}
          />
        </>
      )}
      <div className="composer-area">
        <ErrorBox error={error} />
        <div className="typing" aria-live="polite">
          {typing && `${typing} yazıyor…`}
        </div>
        <form className="composer" onSubmit={send}>
          <textarea
            aria-label="Mesaj"
            placeholder={`${title} sohbetine bir mesaj yaz…`}
            value={content}
            maxLength={4000}
            rows={1}
            onChange={(e) => {
              setContent(e.target.value);
              socket.current?.emit("typing", { roomId });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(e);
              }
            }}
          />
          <button
            className="send"
            aria-label="Mesaj gönder"
            disabled={!content.trim() || sending}
          >
            {sending ? (
              <LoaderCircle size={19} className="spin" />
            ) : (
              <Send size={19} />
            )}
          </button>
        </form>
        <div className="composer-hint">
          <span>
            <b>Enter</b> ile gönder · <b>Shift + Enter</b> ile yeni satır
          </span>
          <span>
            Markdown desteklenir <span className="mint">✦</span>
          </span>
        </div>
      </div>
    </div>
  );
}
