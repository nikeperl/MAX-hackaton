import type {
  Deadline,
  User,
  Settings,
  Delivery,
  EventInput,
} from "../shared/domain";
declare global {
  interface Window {
    WebApp?: {
      initData?: string;
      openLink?: (url: string) => void;
      expand?: () => void;
      BackButton?: {
        show: () => void;
        hide: () => void;
        onClick: (fn: () => void) => void;
        offClick: (fn: () => void) => void;
      };
    };
  }
}
let token = localStorage.getItem("vovremya.session") || "";
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!r.ok) {
    const e = await r
      .json()
      .catch(() => ({ error: "Не удалось выполнить действие" }));
    throw new Error(e.error || "Не удалось выполнить действие");
  }
  return r.status === 204 ? (undefined as T) : r.json();
}
export const api = {
  config: () => request<{ demo: boolean; botUrl: string | null }>("/config"),
  async login() {
    const initData =
      window.WebApp?.initData ||
      new URLSearchParams(location.hash.slice(1)).get("WebAppData") ||
      "";
    if (token && !initData) {
      try {
        return await this.me();
      } catch {
        token = "";
      }
    }
    const r = await request<{ token: string; user: User }>("/session", {
      method: "POST",
      body: JSON.stringify({ initData }),
    });
    token = r.token;
    localStorage.setItem("vovremya.session", token);
    return r.user;
  },
  me: () => request<User>("/me"),
  events: () => request<Deadline[]>("/events"),
  deliveries: () => request<Delivery[]>("/deliveries"),
  create: (data: EventInput) =>
    request<Deadline>("/events", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: EventInput) =>
    request<Deadline>(`/events/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  complete: (id: string, completed: boolean) =>
    request<Deadline>(`/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed }),
    }),
  remove: (id: string) => request<void>(`/events/${id}`, { method: "DELETE" }),
  settings: (data: Settings) =>
    request<Settings>("/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  seed: () => request<Deadline[]>("/demo/seed", { method: "POST" }),
  clear: () => request<void>("/data", { method: "DELETE" }),
};
