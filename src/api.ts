export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  if (window.prontoDesktop)
    return window.prontoDesktop.api(path, method, body, headers) as Promise<T>;
  const response = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    signal: path.startsWith("/courier/")
      ? AbortSignal.timeout(12000)
      : undefined,
  });
  const data = await response
    .json()
    .catch(() => ({ error: "O servidor retornou uma resposta inesperada." }));
  if (!response.ok)
    throw new ApiError(
      data.error || "Não foi possível concluir.",
      response.status,
    );
  return data;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export const time = (date: string) =>
  new Date(date).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
export function parseMoney(value: string) {
  const cleaned = value.replace(/[^\d,.]/g, "").replace(",", ".");
  return Math.round(Number(cleaned || 0) * 100);
}
export function navigate(path: string) {
  window.location.hash = path;
}
export function createId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
