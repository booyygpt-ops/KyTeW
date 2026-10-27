import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  AudioLines,
  Hash,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "./api";
import { t } from "./locales";
import type { User } from "./types";
import { ErrorBox, Logo } from "./ui";
export default function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      onLogin(
        await api<User>(`/auth/${register ? "register" : "login"}`, "POST", {
          email: data.get("email"),
          password: data.get("password"),
          username: data.get("username"),
          displayName: data.get("displayName"),
          remember: data.get("remember") === "on",
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Logo />
        <div className="story-main">
          <span className="eyebrow">
            <span className="live-dot" /> BİRLİKTE DAHA YAKIN
          </span>
          <h1>
            Senin insanlar.
            <br />
            Senin <em>evrenin.</em>
          </h1>
          <p>
            Bir sohbetle başlar. Bir topluluğa dönüşür.
            <br />
            KYTEW'de kendine ait bir yer aç.
          </p>
          <div className="orbit-art" aria-hidden="true">
            <div className="orbit o1" />
            <div className="orbit o2" />
            <div className="art-core">
              <img src="/logo.svg" alt="" />
            </div>
            <span className="float-chip chip-one">
              <Hash /> Ortak bir frekans.
            </span>
            <span className="float-chip chip-two">
              <AudioLines /> Daha yakın hisset.
            </span>
            <span className="art-star">
              <Sparkles />
            </span>
          </div>
        </div>
        <footer>
          <span>KYTEW © {new Date().getFullYear()}</span>
          <span>İletişimin yeni alanı.</span>
        </footer>
      </section>
      <section className="auth-form-side">
        <div className="auth-form">
          <span className="pill">KYTEW · ERKEN ERİŞİM</span>
          <h2>{t(register ? "newBeginning" : "welcome")}</h2>
          <p>
            {register
              ? "Topluluğuna giden ilk adımı at."
              : "Sohbetin kaldığı yerden devam etsin."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <>
                <label>
                  Görünen ad
                  <input
                    name="displayName"
                    autoComplete="name"
                    required
                    maxLength={48}
                    placeholder="Sana nasıl seslenelim?"
                  />
                </label>
                <label>
                  Kullanıcı adı
                  <input
                    name="username"
                    autoComplete="username"
                    required
                    pattern="[a-z0-9_]{3,24}"
                    title="3–24 küçük harf, rakam veya alt çizgi"
                    placeholder="ornegin_aylin"
                  />
                </label>
              </>
            )}
            <label>
              E-posta adresi
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="sen@ornek.com"
                required
                maxLength={254}
              />
            </label>
            <label>
              Şifre
              <input
                type="password"
                name="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={12}
                maxLength={128}
                placeholder="En az 12 karakter"
                required
              />
            </label>
            <label className="checkbox">
              <input type="checkbox" name="remember" /> Oturumumu açık tut
            </label>
            <ErrorBox error={error} />
            <button className="primary wide" disabled={busy}>
              {t(busy ? "wait" : register ? "register" : "login")}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register
              ? "Zaten bir hesabın var mı?"
              : "Henüz aramıza katılmadın mı?"}{" "}
            <button
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Giriş yap" : "Hesap oluştur"}
            </button>
          </p>
          <div className="secure-note">
            <ShieldCheck size={17} /> Şifrelerin Argon2id ile korunur.
          </div>
          <p className="feature-note">
            İlk sürüm: hesaplar, sunucular ve canlı metin sohbeti.
            <br />
            Sesli odalarda buluş; görüntü bir sonraki aşamada.
          </p>
        </div>
      </section>
    </main>
  );
}
