export type Store = {
  name: string;
  subtitle: string;
  phone: string;
  open: boolean;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutes: number;
  allowDelivery: boolean;
  allowPickup: boolean;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  available: boolean;
  station: string;
  art: string;
  featured: boolean;
};
export type CartItem = {
  product: Product;
  quantity: number;
  notes: string;
  key: string;
};
export type OrderStatus =
  | "new"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";
export type PrintState =
  | "pending"
  | "claimed"
  | "printing"
  | "spooled"
  | "failed"
  | "uncertain"
  | "cancelled";
export type OrderItem = {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  station: string;
};
export type Order = {
  id: string;
  number: number;
  customerName: string;
  phone?: string;
  fulfillment: "pickup" | "delivery";
  address?: string;
  payment: "cash" | "card";
  changeFor: number | null;
  notes: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  printJobs?: {
    id: string;
    targetId: string;
    state: PrintState;
    attempt: number;
    lastError: string | null;
  }[];
};
export type PrintTarget = {
  id: string;
  label: string;
  deviceName: string;
  width: 58 | 80;
  station: string;
  enabled: boolean;
};
export type PrintJob = {
  id: string;
  orderId: string;
  targetId: string;
  state: PrintState;
  attempt: number;
  lastError: string | null;
  createdAt: string;
  number: number;
  label: string;
};
export type DesktopInfo = {
  version: string;
  serverUrl: string;
  localServerUrl: string;
  menuUrl: string;
  autoPrint: boolean;
  connected: boolean;
  printerError: string | null;
  lastSync: string | null;
  hasToken: boolean;
};
export type DesktopBridge = {
  api: (
    path: string,
    method?: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) => Promise<unknown>;
  info: () => Promise<DesktopInfo>;
  printers: () => Promise<
    { name: string; displayName: string; isDefault: boolean; status: number }[]
  >;
  configure: (config: {
    serverUrl?: string;
    autoPrint?: boolean;
  }) => Promise<DesktopInfo>;
  testPrint: (target: PrintTarget) => Promise<{ ok: boolean }>;
  openMenu: () => Promise<void>;
  previewReceipt: (orderId: string) => Promise<void>;
};
declare global {
  interface Window {
    prontoDesktop?: DesktopBridge;
  }
}
