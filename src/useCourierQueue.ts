import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, createId } from "./api";
export type CourierCommand = {
  id: string;
  orderId: string;
  number: number;
  status: string;
  expectedVersion: number;
  notes: string;
  paymentReceived?: boolean;
  recipient?: string;
  error?: string;
  epoch?: string;
};
export function useCourierQueue(
  courierId: string,
  onSynced: () => Promise<void>,
  epoch?: string,
) {
  const [commands, setCommands] = useState<CourierCommand[]>([]),
    [notice, setNotice] = useState("");
  const queue = useRef<CourierCommand[]>([]),
    locked = useRef(false),
    account = useRef(courierId),
    callback = useRef(onSynced);
  account.current = courierId;
  callback.current = onSynced;
  const persist = useCallback(
    (next: CourierCommand[]) => {
      if (!courierId) return;
      localStorage.setItem(
        "pronto-delivery-queue-" + courierId,
        JSON.stringify(next),
      );
      queue.current = next;
      setCommands(next);
    },
    [courierId],
  );
  useEffect(() => {
    let stored: CourierCommand[] = [];
    try {
      const value = JSON.parse(
        localStorage.getItem("pronto-delivery-queue-" + courierId) || "[]",
      );
      if (Array.isArray(value)) stored = value;
    } catch {}
    queue.current = stored;
    setCommands(stored);
    setNotice("");
  }, [courierId]);
  const sync = useCallback(async () => {
    if (!courierId || locked.current || !navigator.onLine) return;
    locked.current = true;
    try {
      for (const c of [...queue.current]) {
        if (c.error || account.current !== courierId) continue;
        try {
          await api(`/courier/orders/${c.orderId}/status`, "POST", {
            ...c,
            requestId: c.id,
          });
          if (account.current !== courierId) break;
          persist(queue.current.filter((x) => x.id !== c.id));
          setNotice(`Pedido #${c.number}: etapa confirmada pelo gestor.`);
          await callback.current();
        } catch (e) {
          if (account.current !== courierId) break;
          if (
            e instanceof ApiError &&
            [400, 403, 404, 409].includes(e.status)
          ) {
            persist(
              queue.current.map((x) =>
                x.id === c.id ? { ...x, error: e.message } : x,
              ),
            );
            setNotice(
              "Há uma ação para conferir. Nenhuma etapa conflitante foi aplicada.",
            );
            await callback.current();
          } else {
            setNotice(
              "Aguardando conexão com o gestor para confirmar as ações salvas.",
            );
            break;
          }
        }
      }
    } finally {
      locked.current = false;
    }
  }, [courierId, persist]);
  useEffect(() => {
    sync();
    const timer = setInterval(sync, 5000);
    window.addEventListener("online", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", sync);
    };
  }, [sync, commands.length]);
  return {
    commands,
    notice,
    sync,
    discard: (id: string) => persist(queue.current.filter((c) => c.id !== id)),
    enqueue: (c: Omit<CourierCommand, "id">) => {
      if (queue.current.some((q) => q.orderId === c.orderId))
        throw Error("Já existe uma ação desse pedido aguardando confirmação.");
      persist([...queue.current, { ...c, id: createId(), epoch }]);
      setNotice("Ação salva neste aparelho. Aguarde a confirmação do gestor.");
    },
  };
}
