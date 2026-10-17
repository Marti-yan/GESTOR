import { useEffect, useRef, type ReactNode } from "react";
import { AlertCircle, X, Loader2 } from "lucide-react";
import type { Store, OrderStatus, PrintState } from "./types";
export const statusLabels: Record<OrderStatus, string> = {
  new: "Novo pedido",
  preparing: "Em preparo",
  ready: "Pronto",
  completed: "Finalizado",
  cancelled: "Cancelado",
};
export const printLabels: Record<PrintState, string> = {
  pending: "Na fila",
  claimed: "Reservada",
  printing: "Enviando",
  spooled: "Enviada à impressora",
  failed: "Falhou",
  uncertain: "Conferir impressão",
  cancelled: "Cancelada",
};
export const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Não foi possível concluir. Tente novamente.";
export const emptyStore: Store = {
  name: "Brasa da Casa",
  subtitle: "Burgers artesanais. Feitos de verdade.",
  phone: "",
  open: true,
  deliveryFee: 500,
  minimumOrder: 0,
  estimatedMinutes: 40,
  allowDelivery: true,
  allowPickup: true,
};

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`logo ${compact ? "compact" : ""}`} href="#/">
      <span className="logo-mark">
        p<span />
      </span>
      <span>
        pronto<span className="orange">.</span>
      </span>
    </a>
  );
}
export function Spinner() {
  return <Loader2 size={18} className="spin" />;
}
export function Empty({
  icon,
  heading,
  children,
}: {
  icon: ReactNode;
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{heading}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      "button,input,select,textarea",
    );
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const all = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        );
        if (!all?.length) return;
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Banner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <AlertCircle size={18} />
      {message}
    </div>
  );
}
