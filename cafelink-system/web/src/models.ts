export interface Identity {
  username: string;
  role: "ADMIN" | "GUEST";
  tableId?: number;
  membershipId?: string;
  visitId?: string;
  storeId?: string;
}
export interface SessionInfo {
  identity: Identity;
  csrfToken: string;
  connected: boolean;
}
export interface GuestScope {
  storeId: string;
  visitId: string;
  membershipId: string;
}
export function guestScope(session: SessionInfo): GuestScope {
  const { storeId, visitId, membershipId } = session.identity;
  if (!storeId || !visitId || !membershipId)
    throw new Error("Thiếu phạm vi phiên khách.");
  return { storeId, visitId, membershipId };
}
export interface MenuItem {
  id: number;
  name: string;
  priceVnd: number;
  category: string;
  description?: string;
  imageUrl?: string;
  available?: boolean;
  active?: boolean;
  version?: number;
  sortOrder?: number;
  purchaseVersion?: number;
}
export interface Table {
  automatic?: boolean;
  acceptingOrders?: boolean;
  activeSessions?: number;
  paymentMode?: "PREPAY" | "POSTPAY";
  id: number;
  name: string;
  visitId?: string;
  status: string;
  onlineClients: number;
  visitState?: "OPEN" | "CHECKOUT_REQUESTED" | "CLOSED";
  version: number;
}
export interface Order {
  queuedAt?: string;
  paymentState?: "POSTPAY" | "UNPAID" | "PENDING" | "PAID" | "CANCELLED" | "REFUNDED";
  id: number;
  tableId: number;
  visitId: string;
  status: string;
  note: string;
  totalVnd: number;
  createdAt: string;
  items: { name: string; quantity: number; subtotalVnd: number; note?: string }[];
}
export interface Ticket {
  version?: number;
  createdAt?: string;
  id: number;
  tableId: number;
  visitId: string;
  type: string;
  status: string;
  note: string;
  reply: string;
}
export interface Snapshot {
  storeAcceptingOrders?: boolean;
  resolutions?: OrderResolution[];
  revision: number;
  menu: MenuItem[];
  tables: Table[];
  orders: Order[];
  tickets: Ticket[];
  checkouts: Checkout[];
}
export interface OrderResolution {
  orderId: number;
  state: "CANCELLED" | "REFUNDED";
  amountVnd: number;
  reason: string;
  actor: string;
  createdAt: string;
}
export interface ContinuationContext {
  previousScope?: GuestScope;
  previousOrders: Order[];
  resolutions: OrderResolution[];
}
export interface Checkout {
  updatedAt?: string;
  checkoutId: string;
  visitId: string;
  tableId: number;
  state: "REQUESTED" | "ACKNOWLEDGED" | "CANCELLED" | "PAID";
  version: number;
  cycle: number;
}
export interface Bill {
  visitId: string;
  tableId: number;
  totalVnd: number;
  orders: Order[];
  billVersion: number;
  checkoutVersion: number;
}
export const money = (amount: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    amount,
  );
export const statusName: Record<string, string> = {
  SUBMITTED: "Chờ tiếp nhận",
  PREPARING: "Đang pha chế",
  READY: "Chờ mang ra",
  SERVED: "Đã phục vụ",
};
