export type ComboComponent = {
  preparation?: boolean;
  productId: string;
  quantity: number;
  name?: string;
  category?: string;
  station?: string;
};
export type Category = { id: string; name: string; sort: number };
export type ModifierGroup = {
  id: string;
  name: string;
  kind: "extra" | "complement";
  min: number;
  max: number;
  options: {
    id: string;
    name: string;
    price: number;
    maxQuantity: number;
    available: boolean;
  }[];
};
export type ModifierSelection = {
  groupId: string;
  optionId: string;
  quantity: number;
};
export type OrderedModifier = ModifierSelection & {
  groupName: string;
  kind: "extra" | "complement";
  name: string;
  price: number;
};
export type Store = {
  name: string;
  subtitle: string;
  phone: string;
  open: boolean;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutes: number;
  estimatedMinimumMinutes?: number;
  allowDelivery: boolean;
  allowPickup: boolean;
};
export type Product = {
  stockRequirements?: {
    productId: string;
    quantity: number;
    stockQuantity: number | null;
  }[];
  components?: ComboComponent[];
  stockQuantity?: number | null;
  stockVersion?: number;
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  available: boolean;
  station: string;
  art: string;
  featured: boolean;
  modifierGroupIds?: string[];
  modifierGroups?: ModifierGroup[];
};
export type CartItem = {
  product: Product;
  quantity: number;
  notes: string;
  key: string;
  modifiers?: ModifierSelection[];
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
  components?: ComboComponent[];
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  station: string;
  category?: string;
  basePrice?: number;
  modifiers?: OrderedModifier[];
};
export type Order = {
  id: string;
  number: number;
  customerName: string;
  phone?: string;
  fulfillment: "pickup" | "delivery" | "dinein";
  address?: string;
  deliveryAddress?: import("./Delivery").DeliveryAddress;
  payment: "cash" | "card" | "pending";
  source: "menu" | "waiter" | "manager";
  tableName: string;
  tableSessionId?: string | null;
  pickupCode: string;
  actorName: string;
  acceptedAt: string | null;
  printAtCounter?: boolean;
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
    receiptIndex?: number;
    receiptCount?: number;
    purpose?: string;
  }[];
};
export type PrintTarget = {
  id: string;
  label: string;
  deviceName: string;
  width: 58 | 80;
  station: string;
  enabled: boolean;
  options?: ReceiptOptions;
  location?: "kitchen" | "counter";
  filter?: {
    mode: "all" | "categories" | "products" | "station";
    values: string[];
  };
};
export type ReceiptOptions = {
  preset?: "expedition" | "kitchen" | "compact" | "minimal";
  transport?: "escpos" | "driver";
  fontSize?: number;
  lineSpacing?: number;
  lineGapMm?: number;
  itemGapMm?: number;
  columns?: number;
  leftPadding?: number;
  topFeed?: number;
  bottomFeed?: number;
  cut?: "partial" | "full" | "none";
  codepage?: "cp860" | "cp850" | "ascii";
  highlightQuantities?: boolean;
  highlightNotes?: boolean;
  highlightTable?: boolean;
  highlightTicket?: boolean;
  highlightChange?: boolean;
  groupBeverages?: boolean;
  groupByCategory?: boolean;
  categoryOrder?: string[];
  boldItemNames?: boolean;
  largeItemNames?: boolean;
  itemHighlights?: { productId: string; bold: boolean; large: boolean }[];
  noteStyle?: "box" | "inverted" | "bold";
  showStore?: boolean;
  showPhone?: boolean;
  showPrices?: boolean;
  footer?: string;
  categoryHighlights?: {
    category: string;
    scope?: "item" | "category";
    style: "box" | "inverted" | "bold";
  }[];
  addonGroupHighlights?: {
    groupId: string;
    style: "box" | "inverted" | "bold";
  }[];
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
  update?: UpdateState;
};
export type UpdateState = {
  stage:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "ready"
    | "upToDate"
    | "error"
    | "incompatible";
  currentVersion: string;
  version?: string;
  progress: number;
  size?: number;
  notes?: string[];
  error?: string;
};
export type DesktopBridge = {
  precific?: (request: {
    action: "show" | "hide" | "reload" | "open" | "status";
    bounds?: { x: number; y: number; width: number; height: number };
  }) => Promise<{
    url: string;
    loading: boolean;
    error: string;
    visible: boolean;
  }>;
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
  testPrint: (
    target: PrintTarget,
    targets?: PrintTarget[],
  ) => Promise<{ ok: boolean }>;
  openMenu: () => Promise<void>;
  checkUpdate: () => Promise<UpdateState>;
  downloadUpdate: () => Promise<UpdateState>;
  installUpdate: () => Promise<{ ok: boolean }>;
  previewReceipt: (orderId: string) => Promise<void>;
};
declare global {
  interface Window {
    prontoDesktop?: DesktopBridge;
  }
}
