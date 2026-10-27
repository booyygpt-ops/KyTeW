// Add keys here before translating a new flow; missing English keys fail type checking.
const tr = {
  welcome: "Tekrar hoş geldin.",
  newBeginning: "Yeni bir başlangıç.",
  login: "Giriş yap",
  register: "Hesap oluştur",
  wait: "Biraz bekle…",
};
export type TranslationKey = keyof typeof tr;
const en: Record<TranslationKey, string> = {
  welcome: "Welcome back.",
  newBeginning: "A new beginning.",
  login: "Sign in",
  register: "Create account",
  wait: "Just a moment…",
};
export type Locale = "tr" | "en";
export function t(key: TranslationKey, locale: Locale = "tr"): string {
  return { tr, en }[locale][key];
}
// v0.1 defaults to Turkish. Full English UI is intentionally not offered yet.
