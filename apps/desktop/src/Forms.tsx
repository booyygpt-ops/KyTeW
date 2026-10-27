import { useState, type FormEvent } from "react";
import { Check, Copy, LogOut, Palette, Shield, UserRound } from "lucide-react";
import { api } from "./api";
import { ErrorBox, Modal } from "./ui";
import type { User } from "./types";

export function ActionForm({
  kind,
  serverId,
  close,
  done,
}: {
  kind: "create" | "join" | "channel" | "friend" | "invite";
  serverId?: string;
  close: () => void;
  done: (id?: string) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState(""),
    [copied, setCopied] = useState(false);
  const titles = {
    create: "Kendi topluluğunu oluştur",
    join: "Bir topluluğa katıl",
    channel: "Yeni kanal",
    friend: "Arkadaş ekle",
    invite: "Sohbete birini davet et",
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      let id: string | undefined;
      if (kind === "create") {
        const r = await api<{ id: string }>("/servers", "POST", {
          name: data.get("name"),
          description: data.get("description"),
        });
        id = r.id;
      }
      if (kind === "join") {
        const r = await api<{ serverId: string }>(
          `/invites/${encodeURIComponent(String(data.get("code")).trim())}/join`,
          "POST",
        );
        id = r.serverId;
      }
      if (kind === "channel")
        await api(`/servers/${serverId}/channels`, "POST", {
          name: data.get("name"),
          topic: data.get("topic"),
          kind: data.get("kind"),
        });
      if (kind === "friend")
        await api("/friends", "POST", { username: data.get("username") });
      if (kind === "invite") {
        const r = await api<{ code: string }>(
          `/servers/${serverId}/invites`,
          "POST",
        );
        setInvite(r.code);
        return;
      }
      await done(id);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={titles[kind]} close={close}>
      <p className="modal-intro">
        {kind === "create"
          ? "Arkadaşların, fikirlerin ve paylaştığınız her şey için yeni bir alan."
          : kind === "join"
            ? "Bir sunucu sahibinden aldığın davet kodunu gir."
            : kind === "friend"
              ? "Arkadaşının benzersiz kullanıcı adını gir. İstek kabul edildiğinde özel sohbet başlatabilirsin."
              : kind === "invite"
                ? "Davetler 24 saat geçerli ve en fazla 10 katılımcı içindir."
                : "Sunucunda yeni sohbetlere yer aç."}
      </p>
      <form onSubmit={submit}>
        {kind === "channel" && (
          <label>
            Kanal türü
            <select name="kind">
              <option value="text">Metin kanalı</option>
              <option value="voice">Ses kanalı</option>
            </select>
          </label>
        )}
        {(kind === "create" || kind === "channel") && (
          <>
            <label>
              {kind === "create" ? "Sunucu adı" : "Kanal adı"}
              <input
                name="name"
                placeholder={
                  kind === "create"
                    ? "Örneğin: Gece Kuşları"
                    : "Örneğin: oyun-sohbeti"
                }
                minLength={kind === "create" ? 2 : 1}
                maxLength={kind === "create" ? 60 : 40}
                required
              />
            </label>
            <label>
              {kind === "create" ? "Açıklama" : "Konu"}{" "}
              <span>(isteğe bağlı)</span>
              <textarea
                name={kind === "create" ? "description" : "topic"}
                maxLength={240}
                rows={3}
                placeholder="Bu alanda neler konuşulur?"
              />
            </label>
          </>
        )}
        {kind === "join" && (
          <label>
            Davet kodu
            <input
              name="code"
              required
              maxLength={64}
              placeholder="Davet kodunu buraya yapıştır"
            />
          </label>
        )}
        {kind === "friend" && (
          <label>
            Kullanıcı adı
            <input
              name="username"
              required
              minLength={3}
              maxLength={24}
              placeholder="kullanici_adi"
            />
          </label>
        )}
        {invite && (
          <div className="invite-code">
            <code>{invite}</code>
            <button
              type="button"
              className="icon-button"
              aria-label="Davet kodunu kopyala"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invite);
                  setCopied(true);
                } catch {
                  setError("Kopyalanamadı. Kodu seçerek kopyalayabilirsin.");
                }
              }}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
        )}
        <ErrorBox error={error} />
        <button className="primary wide" disabled={busy || !!invite}>
          {busy
            ? "İşleniyor…"
            : kind === "create"
              ? "Sunucuyu oluştur"
              : kind === "join"
                ? "Sunucuya katıl"
                : kind === "friend"
                  ? "Arkadaşlık isteği gönder"
                  : kind === "invite"
                    ? "Davet kodu oluştur"
                    : "Kanal oluştur"}
        </button>
      </form>
    </Modal>
  );
}

export function Settings({
  me,
  update,
  logout,
  close,
}: {
  me: User;
  update: (u: User) => void;
  logout: () => Promise<void>;
  close: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      update(await api<User>("/auth/me", "PATCH", Object.fromEntries(f)));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Kullanıcı ayarları" close={close}>
      <div className="settings-label">
        <UserRound size={16} /> PROFİLİM
      </div>
      <form onSubmit={submit}>
        <label>
          Kullanıcı adı
          <input readOnly value={`@${me.username}`} />
        </label>
        <label>
          Görünen ad
          <input
            name="displayName"
            defaultValue={me.displayName}
            required
            maxLength={48}
          />
        </label>
        <label>
          Hakkımda
          <textarea name="bio" defaultValue={me.bio} maxLength={190} rows={3} />
        </label>
        <label>
          Durum tercihi
          <select name="status" defaultValue={me.status}>
            <option value="online">Çevrimiçi</option>
            <option value="idle">Boşta</option>
            <option value="dnd">Rahatsız etmeyin</option>
            <option value="invisible">Görünmez</option>
          </select>
        </label>
        <ErrorBox error={error} />
        <button className="primary wide" disabled={busy}>
          {saved
            ? "Değişiklikler kaydedildi"
            : busy
              ? "Kaydediliyor…"
              : "Değişiklikleri kaydet"}
        </button>
      </form>
      <PasswordForm />
      <div className="settings-label">
        <Palette size={16} /> GÖRÜNÜM
      </div>
      <div className="theme-options">
        <button
          className="secondary"
          onClick={() => {
            document.documentElement.dataset.theme = "dark";
            localStorage.setItem("kytew-theme", "dark");
          }}
        >
          Koyu tema
        </button>
        <button
          className="secondary"
          onClick={() => {
            document.documentElement.dataset.theme = "light";
            localStorage.setItem("kytew-theme", "light");
          }}
        >
          Açık tema
        </button>
      </div>
      <p className="feature-note">
        <Shield size={14} /> KYTEW {__KYTEW_VERSION__} · Türkçe
        <br />
        Görüntü, parola sıfırlama, e-posta doğrulama ve gelişmiş gizlilik
        ayarları bu sürümde yoktur.
      </p>
      <button
        className="danger wide"
        onClick={async () => {
          try {
            await logout();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <LogOut size={16} /> Güvenli çıkış
      </button>
    </Modal>
  );
}

function PasswordForm() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    try {
      await api(
        "/auth/password",
        "POST",
        Object.fromEntries(new FormData(form)),
      );
      form.reset();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="settings-label">
        <Shield size={16} /> ŞİFRE DEĞİŞTİR
      </div>
      <form onSubmit={submit}>
        <label>
          Mevcut şifre
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        </label>
        <label>
          Yeni şifre
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <ErrorBox error={error} />
        <button className="secondary wide" disabled={busy}>
          {saved
            ? "Şifre değiştirildi; diğer oturumlar kapatıldı"
            : busy
              ? "İşleniyor…"
              : "Şifreyi değiştir"}
        </button>
      </form>
    </>
  );
}
