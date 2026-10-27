import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Crown,
  Hash,
  Headphones,
  LogOut,
  MessageCircle,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { api } from "./api";
import type { Community, Conversation, Friend, Member, User } from "./types";
import Auth from "./Auth";
import Chat from "./Chat";
import { Avatar, ErrorBox, Logo } from "./ui";
import { ActionForm, Settings } from "./Forms";

export default function App() {
  const [me, setMe] = useState<User | null>(null),
    [checking, setChecking] = useState(true),
    [bootError, setBootError] = useState("");
  useEffect(() => {
    document.documentElement.dataset.theme =
      localStorage.getItem("kytew-theme") || "dark";
    api<User>("/auth/me")
      .then(setMe)
      .catch((e) => {
        if (!e.message.includes("Oturum")) setBootError(e.message);
      })
      .finally(() => setChecking(false));
  }, []);
  if (checking)
    return (
      <div className="boot">
        <Logo />
        <p>KYTEW hazırlanıyor…</p>
      </div>
    );
  if (!me)
    return (
      <>
        {bootError && (
          <div className="boot-error">
            <ErrorBox error={bootError} />
          </div>
        )}
        <Auth
          onLogin={(u) => {
            setMe(u);
            setBootError("");
          }}
        />
      </>
    );
  return (
    <Workspace
      key={me.id}
      me={me}
      updateMe={setMe}
      logout={async () => {
        await api("/auth/logout", "POST");
        setMe(null);
      }}
    />
  );
}
function Workspace({
  me,
  updateMe,
  logout,
}: {
  me: User;
  updateMe: (u: User) => void;
  logout: () => Promise<void>;
}) {
  const [servers, setServers] = useState<Community[]>([]),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [friends, setFriends] = useState<Friend[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [serverId, setServerId] = useState<string | null>(null),
    [roomId, setRoomId] = useState<string | null>(null),
    [memberPanel, setMemberPanel] = useState(true),
    [tab, setTab] = useState("all"),
    [error, setError] = useState(""),
    [modal, setModal] = useState<
      null | "create" | "join" | "channel" | "friend" | "invite" | "settings"
    >(null),
    [loading, setLoading] = useState(true),
    [widths, setWidths] = useState({ rail: 76, channels: 248, members: 236 });
  const server = servers.find((s) => s.id === serverId),
    channel = server?.channels.find((c) => c.id === roomId),
    conversation = conversations.find((c) => c.id === roomId),
    peer = conversation?.participants.find((p) => p.user.id !== me.id)?.user;
  const refresh = useCallback(async () => {
    const [s, c, f] = await Promise.all([
      api<Community[]>("/servers"),
      api<Conversation[]>("/conversations"),
      api<Friend[]>("/friends"),
    ]);
    setServers(s);
    setConversations(c);
    setFriends(f);
  }, []);
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const t = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!serverId) {
      setMembers([]);
      return;
    }
    let alive = true;
    const get = () =>
      api<Member[]>(`/servers/${serverId}/members`)
        .then((m) => {
          if (alive) setMembers(m);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    void get();
    const t = setInterval(get, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [serverId]);
  function pickServer(s: Community) {
    setServerId(s.id);
    setRoomId(s.channels.find((c) => c.kind === "text")?.id ?? null);
    setError("");
  }
  async function done(id?: string) {
    await refresh();
    if (id) {
      const s = await api<Community[]>("/servers");
      const selected = s.find((v) => v.id === id);
      if (selected) pickServer(selected);
    }
  }
  async function action(work: () => Promise<unknown>) {
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function dm(userId: string) {
    await action(async () => {
      const c = await api<Conversation>("/conversations", "POST", { userId });
      setConversations((items) =>
        items.some((i) => i.id === c.id) ? items : [c, ...items],
      );
      setServerId(null);
      setRoomId(c.id);
    });
  }
  function resize(
    panel: keyof typeof widths,
    event: PointerEvent<HTMLDivElement>,
  ) {
    const start = event.clientX,
      initial = widths[panel];
    event.currentTarget.setPointerCapture(event.pointerId);
    const el = event.currentTarget;
    const move = (e: globalThis.PointerEvent) =>
      setWidths((w) => ({
        ...w,
        [panel]: Math.max(
          panel === "rail" ? 64 : 190,
          Math.min(
            panel === "rail" ? 110 : 360,
            initial + (panel === "members" ? -1 : 1) * (e.clientX - start),
          ),
        ),
      }));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up, { once: true });
  }
  const accepted = friends.filter((f) => f.status === "accepted"),
    pending = friends.filter((f) => f.status === "pending");
  const title =
    channel?.name || peer?.displayName || (server ? server.name : "Arkadaşlar");
  return (
    <div className="desktop-shell">
      <div className="titlebar">
        <Logo />
        <span>Birlikte daha yakın.</span>
        <span className="version">
          ERKEN ERİŞİM <i /> v0.1.0
        </span>
      </div>
      <div
        className="workspace"
        style={
          {
            "--rail": `${widths.rail}px`,
            "--channels": `${widths.channels}px`,
            "--members": `${widths.members}px`,
          } as CSSProperties
        }
      >
        <nav className="server-rail" aria-label="Sunucular">
          <button
            className={`server-icon home ${!server ? "active" : ""}`}
            aria-label="Arkadaşlar ve özel mesajlar"
            title="Ana sayfa"
            onClick={() => {
              setServerId(null);
              setRoomId(null);
            }}
          >
            <img src="/logo.svg" alt="KYTEW" />
          </button>
          <div className="rail-divider" />
          {servers.map((s) => (
            <button
              key={s.id}
              title={s.name}
              aria-label={s.name}
              className={`server-icon ${serverId === s.id ? "active" : ""}`}
              onClick={() => pickServer(s)}
            >
              {s.name.slice(0, 2).toLocaleUpperCase("tr")}
            </button>
          ))}
          <button
            className="server-icon add"
            title="Sunucu oluştur"
            aria-label="Sunucu oluştur"
            onClick={() => setModal("create")}
          >
            <Plus size={24} />
          </button>
          <button
            className="server-icon explore"
            title="Davetle katıl"
            aria-label="Davetle katıl"
            onClick={() => setModal("join")}
          >
            <Compass size={22} />
          </button>
          <div className="rail-bottom">
            <ShieldCheck size={20} />
          </div>
          <div
            className="resize-handle"
            role="separator"
            aria-label="Sunucu alanı genişliği"
            onPointerDown={(e) => resize("rail", e)}
          />
        </nav>
        <aside className="channel-panel">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">
                {server ? "SENİN TOPLULUĞUN" : "KİŞİSEL ALANIN"}
              </span>
              <strong>{server?.name || "Sohbet merkezi"}</strong>
            </div>
            {server ? (
              <button
                className="icon-button"
                title="Sunucu işlemleri"
                aria-label="Sunucu işlemleri"
                onClick={() =>
                  setModal(server.ownerId === me.id ? "invite" : "join")
                }
              >
                <ChevronDown size={18} />
              </button>
            ) : (
              <Sparkles size={18} className="muted" />
            )}
          </header>
          <div className="channel-scroll">
            {server ? (
              <>
                <div className="server-banner">
                  <span className="banner-symbol">
                    K<span>↗</span>
                  </span>
                  <small>{server._count.members} üye · Birlikte daha iyi</small>
                </div>
                <p className="server-description">
                  {server.description || "Senin topluluğun, senin hikâyen."}
                </p>
                <div className="section-label">
                  METİN KANALLARI
                  {server.ownerId === me.id && (
                    <button
                      aria-label="Kanal oluştur"
                      onClick={() => setModal("channel")}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>
                {server.channels
                  .filter((c) => c.kind === "text")
                  .map((c) => (
                    <button
                      key={c.id}
                      className={`channel-link ${roomId === c.id ? "selected" : ""}`}
                      onClick={() => setRoomId(c.id)}
                    >
                      <Hash size={19} />
                      <span>{c.name}</span>
                      {roomId === c.id && <i />}
                    </button>
                  ))}
                <div className="section-label voice-label">
                  SES KANALLARI <span className="soon">YAKINDA</span>
                </div>
                {server.channels
                  .filter((c) => c.kind === "voice")
                  .map((c) => (
                    <div
                      className="channel-link unavailable"
                      title="Sesli görüşme henüz geliştirilmedi"
                      key={c.id}
                    >
                      <Volume2 size={18} />
                      {c.name}
                    </div>
                  ))}
                {server.ownerId === me.id ? (
                  <button
                    className="invite-link"
                    onClick={() => setModal("invite")}
                  >
                    <Users size={16} /> Arkadaşlarını davet et
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    className="invite-link"
                    onClick={() => {
                      if (confirm("Sunucudan ayrılmak istiyor musun?"))
                        void action(async () => {
                          await api(
                            `/servers/${server.id}/membership`,
                            "DELETE",
                          );
                          setServerId(null);
                          setRoomId(null);
                        });
                    }}
                  >
                    <LogOut size={16} /> Sunucudan ayrıl
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className={`channel-link friends-link ${!roomId ? "selected" : ""}`}
                  onClick={() => setRoomId(null)}
                >
                  <Users size={19} /> Arkadaşlar
                  <span className="count">{accepted.length}</span>
                </button>
                <div className="section-label">
                  ÖZEL MESAJLAR
                  <button
                    aria-label="Arkadaş ekle"
                    onClick={() => setModal("friend")}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                {conversations.map((c) => {
                  const u = c.participants.find(
                    (p) => p.user.id !== me.id,
                  )?.user;
                  return (
                    u && (
                      <button
                        key={c.id}
                        className={`dm-link ${roomId === c.id ? "selected" : ""}`}
                        onClick={() => setRoomId(c.id)}
                      >
                        <Avatar user={u} size="sm" />
                        <div>
                          <b>{u.displayName}</b>
                          <small>@{u.username}</small>
                        </div>
                      </button>
                    )
                  );
                })}
                {!conversations.length && (
                  <p className="sidebar-empty">
                    İyi bir sohbet, bir
                    <br />
                    merhaba ile başlar.
                  </p>
                )}
                <div className="community-card">
                  <div>
                    <Sparkles size={21} />
                  </div>
                  <h3>Birlikte bir alan açın.</h3>
                  <p>
                    Arkadaşların ve ortak ilgi alanların için kendi sunucunu
                    oluştur.
                  </p>
                  <button onClick={() => setModal("create")}>
                    İlk sunucunu oluştur <ArrowRight size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
          <footer className="user-dock">
            <button
              className="profile-button"
              onClick={() => setModal("settings")}
            >
              <Avatar user={me} size="sm" />
              <span>
                <b>{me.displayName}</b>
                <small>@{me.username}</small>
              </span>
            </button>
            <button
              className="icon-button"
              title="Kullanıcı ayarları"
              aria-label="Kullanıcı ayarları"
              onClick={() => setModal("settings")}
            >
              <SettingsIcon size={19} />
            </button>
          </footer>
          <div
            className="resize-handle"
            role="separator"
            aria-label="Kanal paneli genişliği"
            onPointerDown={(e) => resize("channels", e)}
          />
        </aside>
        <main className="main-panel">
          <header className="main-heading">
            <div className="heading-title">
              {roomId ? (
                channel ? (
                  <Hash size={23} />
                ) : (
                  <MessageCircle size={22} />
                )
              ) : (
                <Users size={23} />
              )}
              <h1>{title}</h1>
              {channel?.topic && (
                <>
                  <i className="heading-divider" />
                  <span className="topic">{channel.topic}</span>
                </>
              )}
            </div>
            <div className="heading-actions">
              <span className="private-label">
                <ShieldCheck size={14} />{" "}
                {server ? "Topluluğa özel" : "Kişisel alan"}
              </span>
              {server && (
                <button
                  className={`icon-button ${memberPanel ? "accent" : ""}`}
                  aria-label="Üye listesini aç veya kapat"
                  onClick={() => setMemberPanel(!memberPanel)}
                >
                  <Users size={20} />
                </button>
              )}
            </div>
          </header>
          {error && (
            <div className="workspace-error">
              <ErrorBox error={error} />
              <button aria-label="Hatayı kapat" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {roomId ? (
            <Chat
              key={roomId}
              roomId={roomId}
              title={title}
              topic={
                channel?.topic ||
                (peer ? `${peer.displayName} ile özel sohbetin.` : "")
              }
              me={me}
            />
          ) : (
            <div className="friends-view">
              <div className="friend-tabs">
                <button
                  className={tab === "all" ? "active" : ""}
                  onClick={() => setTab("all")}
                >
                  Tüm arkadaşlar <span>{accepted.length}</span>
                </button>
                <button
                  className={tab === "pending" ? "active" : ""}
                  onClick={() => setTab("pending")}
                >
                  Bekleyen <span>{pending.length}</span>
                </button>
                <button
                  className="add-friend"
                  onClick={() => setModal("friend")}
                >
                  <Plus size={16} /> Arkadaş ekle
                </button>
              </div>
              <div className="welcome-card">
                <div>
                  <span className="eyebrow">BULUŞMA NOKTANA HOŞ GELDİN</span>
                  <h2>
                    Merhaba, {me.displayName}
                    <span> ✦</span>
                  </h2>
                  <p>İnsanlar bir araya geldiğinde, güzel şeyler başlar.</p>
                  <button onClick={() => setModal("create")}>
                    Bir topluluk oluştur <ArrowRight size={16} />
                  </button>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <span>K</span>
                  <div />
                  <i />
                </div>
              </div>
              <div className="friends-section-title">
                <h3>
                  {tab === "pending" ? "ARKADAŞLIK İSTEKLERİ" : "ARKADAŞLARIN"}
                </h3>
                <span>
                  {tab === "pending" ? pending.length : accepted.length} kişi
                </span>
              </div>
              {loading ? (
                <div className="empty-state">Yükleniyor…</div>
              ) : (tab === "pending" ? pending : accepted).length ? (
                <div className="friend-list">
                  {(tab === "pending" ? pending : accepted).map((f) => {
                    const u =
                      f.requesterId === me.id ? f.recipient : f.requester;
                    return (
                      <div className="friend-row" key={f.id}>
                        <Avatar user={u} />
                        <div>
                          <strong>{u.displayName}</strong>
                          <small>
                            @{u.username}{" "}
                            {f.status === "pending"
                              ? `· ${f.recipientId === me.id ? "Gelen istek" : "Gönderilen istek"}`
                              : ""}
                          </small>
                        </div>
                        {f.status === "accepted" ? (
                          <button
                            className="round-action"
                            aria-label={`${u.displayName} ile sohbet et`}
                            onClick={() => dm(u.id)}
                          >
                            <MessageCircle size={19} />
                          </button>
                        ) : f.recipientId === me.id ? (
                          <button
                            className="round-action accept"
                            aria-label="İsteği kabul et"
                            onClick={() =>
                              action(() =>
                                api(`/friends/${f.id}/accept`, "POST"),
                              )
                            }
                          >
                            <Check size={19} />
                          </button>
                        ) : null}
                        <button
                          className="round-action"
                          aria-label={
                            f.status === "pending"
                              ? "İsteği kaldır"
                              : "Arkadaşı sil"
                          }
                          onClick={() => {
                            if (confirm("Bu arkadaşlık kaydı kaldırılsın mı?"))
                              void action(() =>
                                api(`/friends/${f.id}`, "DELETE"),
                              );
                          }}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-illustration">
                    <MessageCircle size={37} />
                    <span>
                      <Plus size={16} />
                    </span>
                  </div>
                  <h3>
                    {tab === "pending"
                      ? "Her şey güncel."
                      : "Sohbetine birini davet et."}
                  </h3>
                  <p>
                    {tab === "pending"
                      ? "Şu anda bekleyen arkadaşlık isteğin yok."
                      : "Arkadaşlarını ekle, bir merhaba de ve aranızdaki mesafeyi kaldır."}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setModal("friend")}
                  >
                    Arkadaş bul <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <div className="roadmap-note">
                <Headphones size={19} />
                <div>
                  <b>Yeni bağlantılar yolda.</b>
                  <span>
                    Sesli odalar, görüntülü görüşme ve ekran paylaşımı sonraki
                    aşamada.
                  </span>
                </div>
                <span className="soon">YAKINDA</span>
              </div>
            </div>
          )}
          <footer className="main-footer">
            <span>
              <i /> KYTEW · Kendi alanın, kendi topluluğun.
            </span>
            <span>
              ÖZGÜRCE BAĞLAN <ChevronRight size={12} />
            </span>
          </footer>
        </main>
        {server && memberPanel && (
          <aside className="member-panel">
            <div
              className="resize-handle left"
              role="separator"
              aria-label="Üye paneli genişliği"
              onPointerDown={(e) => resize("members", e)}
            />
            <header>
              <Users size={17} />
              <b>Topluluk</b>
              <span>{members.length}</span>
            </header>
            <div className="section-label">ÜYELER — {members.length}</div>
            {members.map((m) => (
              <div className="member" key={m.user.id}>
                <Avatar user={m.user} size="sm" />
                <div>
                  <b>{m.user.displayName}</b>
                  <small>{m.role === "owner" ? "Sunucu sahibi" : "Üye"}</small>
                </div>
                {m.role === "owner" && <Crown size={14} className="gold" />}
              </div>
            ))}
            <div className="member-note">
              <ShieldCheck size={21} />
              <p>Bu alana yalnızca sunucu üyeleri erişebilir.</p>
            </div>
          </aside>
        )}
      </div>
      {modal === "settings" ? (
        <Settings
          me={me}
          update={updateMe}
          logout={logout}
          close={() => setModal(null)}
        />
      ) : (
        modal && (
          <ActionForm
            kind={modal}
            serverId={serverId || undefined}
            close={() => setModal(null)}
            done={done}
          />
        )
      )}
    </div>
  );
}
