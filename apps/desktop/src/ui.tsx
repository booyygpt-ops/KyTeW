import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import type { User } from "./types";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small" : ""}`}>
      <img src="/logo.svg" alt="" />
      {!small && (
        <b>
          KYTEW<span> / </span>
        </b>
      )}
    </span>
  );
}
export function Avatar({
  user,
  size = "",
}: {
  user: Pick<User, "displayName" | "id">;
  size?: string;
}) {
  let hash = 0;
  for (const c of user.id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return (
    <span
      className={`avatar ${size}`}
      style={{ background: `hsl(${Math.abs(hash) % 360} 35% 35%)` }}
    >
      {user.displayName.slice(0, 2).toLocaleUpperCase("tr")}
    </span>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>("input, button")?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && dialog) {
        const nodes = [
          ...dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input, select, textarea, [tabindex="0"]',
          ),
        ];
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Kapat" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
