import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  LayoutDashboard,
  Files,
  Bell,
  Settings as SettingsIcon,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  X,
  Search,
  Upload,
  ShieldCheck,
  FileText,
  Heart,
  Wallet,
  Clock,
  MoreHorizontal,
  ExternalLink,
  Trash2,
  SlidersHorizontal,
  Sparkles,
  CheckCircle2,
  Info,
  LoaderCircle,
  MessageCircle,
  LogOut,
  ChevronDown,
  Car,
  House,
  Users,
  GraduationCap,
  BriefcaseBusiness,
  Globe,
  HandHeart,
} from "lucide-react";
import { api } from "./api";
import { recognize } from "./recognize";
import {
  categories,
  templates,
  templateById,
  nextSteps,
  calculateDeadline,
  formatDate,
  todayIn,
  dayDiff,
  addDays,
  type Category,
  type Deadline,
  type User,
  type Settings,
  type EventInput,
  type TemplateId,
  type Delivery,
} from "../shared/domain";
type Page =
  "overview" | "calendar" | "documents" | "notifications" | "settings";
const icons = {
  documents: FileText,
  health: Heart,
  payments: Wallet,
  transport: Car,
  home: House,
  social: HandHeart,
  family: Users,
  education: GraduationCap,
  work: BriefcaseBusiness,
  migration: Globe,
  other: CalendarDays,
};
const nav = [
  { id: "overview", title: "Обзор", icon: LayoutDashboard },
  { id: "calendar", title: "Календарь", icon: CalendarDays },
  { id: "documents", title: "Мои документы", icon: Files },
  { id: "notifications", title: "Уведомления", icon: Bell },
] as const;
function CategoryIcon({
  category,
  size = 20,
}: {
  category: Category;
  size?: number;
}) {
  const Icon = icons[category];
  return (
    <span className={`category-icon ${category}`}>
      <Icon size={size} />
    </span>
  );
}
function Modal({
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, textarea, a[href]",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const back = window.WebApp?.BackButton;
    back?.show();
    back?.onClick(onClose);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      back?.offClick(onClose);
      back?.hide();
      old?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [events, setEvents] = useState<Deadline[]>([]),
    [page, setPage] = useState<Page>("overview"),
    [config, setConfig] = useState<{ demo: boolean; botUrl: string | null }>({
      demo: true,
      botUrl: null,
    }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState("");
  const [editor, setEditor] = useState<{
      template?: TemplateId;
      date?: string;
      documentName?: string;
      editing?: Deadline;
    } | null>(null),
    [upload, setUpload] = useState(false),
    [detail, setDetail] = useState<Deadline | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState<Category | "all">("all"),
    [completed, setCompleted] = useState(false),
    [confirmClear, setConfirmClear] = useState(false),
    [busy, setBusy] = useState(false);
  const zone = user?.settings.timezone || "Europe/Moscow",
    today = todayIn(zone);
  const [month, setMonth] = useState(today.slice(0, 7)),
    [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cfg = await api.config();
        const u = await api.login();
        const e = await api.events();
        if (active) {
          setConfig(cfg);
          setUser(u);
          setEvents(e);
          setMonth(todayIn(u.settings.timezone).slice(0, 7));
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.all([api.me(), api.events()])
        .then(([freshUser, freshEvents]) => {
          if (active) {
            setUser(freshUser);
            setEvents(freshEvents);
          }
        })
        .catch(() => {
          /* Keep the current view when offline; explicit actions report errors. */
        });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user?.id]);
  const notify = (s: string) => setToast(s);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = events.filter((e) => !e.completed),
    soon = active.filter(
      (e) => dayDiff(e.dueDate, today) >= 0 && dayDiff(e.dueDate, today) <= 30,
    ),
    overdue = active.filter((e) => e.dueDate < today),
    done = events.filter((e) => e.completed);
  const filtered = events
    .filter(
      (e) =>
        e.completed === completed &&
        (filter === "all" || e.category === filter) &&
        e.title.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const go = (p: Page) => {
    setPage(p);
    setSelectedDate(null);
    setQuery("");
    setFilter("all");
  };
  const openEditor = (template?: TemplateId) => setEditor({ template });
  const finish = async (e: Deadline) => {
    await action(async () => {
      const updated = await api.complete(e.id, !e.completed);
      setEvents(events.map((v) => (v.id === e.id ? updated : v)));
      setDetail(null);
      notify(
        updated.completed
          ? "Готово! Событие отмечено выполненным"
          : "Событие возвращено в календарь",
      );
    });
  };
  if (loading)
    return (
      <div className="loading-screen">
        <span className="brand-mark">
          <img src="/logo.png" alt="" />
        </span>
        <h2>Вовремя</h2>
        <LoaderCircle className="spin" />
        <p>Собираем ваш календарь…</p>
      </div>
    );
  if (error)
    return (
      <div className="loading-screen">
        <Info size={40} />
        <h2>Не удалось открыть календарь</h2>
        <p>{error}</p>
        <button className="primary" onClick={() => location.reload()}>
          Попробовать снова
        </button>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <span className="brand-mark">
            <img src="/logo.png" alt="" />
          </span>
          <span>
            вовремя<span className="brand-dot">.</span>
            <small>ВАШ ЛИЧНЫЙ ПОМОЩНИК</small>
          </span>
        </a>
        <div className="workspace-label">ЛИЧНОЕ ПРОСТРАНСТВО</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => go(n.id)}
            >
              <n.icon size={20} />
              <span>{n.title}</span>
              {n.id === "calendar" && active.length > 0 && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="max-mini">
            <span className="max-logo">
              <img src="/Max_logo.svg" alt="" />
            </span>
            <strong>Важное — в MAX</strong>
            <p>
              Напомним о сроках прямо
              <br />в вашем мессенджере
            </p>
            <button onClick={() => go("notifications")}>
              Настроить напоминания <ArrowUpRight size={16} />
            </button>
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <SettingsIcon size={20} />
            Настройки
          </button>
          <div className="sidebar-profile">
            <span className="avatar">{user?.name[0] || "Г"}</span>
            <div>
              <strong>{user?.demo ? "Личное пространство" : user?.name}</strong>
              <small>
                {user?.demo ? "Демонстрационный режим" : "Аккаунт MAX"}
              </small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main-wrapper">
        <header className="topbar">
          <div className="breadcrumb">
            Личное пространство <span>/</span>{" "}
            <strong>
              {page === "settings"
                ? "Настройки"
                : nav.find((n) => n.id === page)?.title}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <i />
              {user?.demo ? "Демо-версия" : "Подключено к MAX"}
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Открыть уведомления"
              onClick={() => go("notifications")}
            >
              <Bell size={20} />
              {overdue.length > 0 && <i />}
            </button>
            <button
              className="avatar small"
              aria-label="Настройки профиля"
              onClick={() => go("settings")}
            >
              {user?.name[0] || "Г"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {new Date(today + "T12:00:00").toLocaleDateString("ru-RU", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </div>
              <h1>
                {page === "overview"
                  ? "Всё важное — вовремя"
                  : page === "calendar"
                    ? "Ваш календарь"
                    : page === "documents"
                      ? "Мои документы"
                      : page === "notifications"
                        ? "Напомним заранее"
                        : "Настройки"}
              </h1>
              <p>
                {page === "overview"
                  ? "Документы, здоровье и платежи. Больше не нужно помнить обо всём."
                  : page === "calendar"
                    ? "Все сроки в одном месте. Планируйте спокойно."
                    : page === "documents"
                      ? "Даты из документов превращаются в понятный план."
                      : page === "notifications"
                        ? "Важные сроки придут прямо в ваш чат MAX."
                        : "Ваше время, ваши данные, ваши предпочтения."}
              </p>
            </div>
            {!["settings", "notifications"].includes(page) && (
              <button className="primary" onClick={() => openEditor()}>
                <Plus size={19} /> Добавить событие
              </button>
            )}
          </div>
          {user?.demo && (
            <div className="demo-banner">
              <span>
                <span className="demo-tag">ДЕМО</span> Исследуйте приложение.
                Уведомления в MAX пока не отправляются.
              </span>
              {events.length === 0 && (
                <button
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      setEvents(await api.seed());
                      notify(
                        "Добавлены примеры событий. Их можно удалить в настройках.",
                      );
                    })
                  }
                >
                  Показать примеры <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          {(page === "overview" || page === "calendar") && (
            <>
              {page === "overview" && (
                <>
                  <section className="hero-card">
                    <div className="hero-copy">
                      <span className="hero-label">
                        <span /> МЕНЬШЕ ЗАБОТ, БОЛЬШЕ ЖИЗНИ
                      </span>
                      <h2>
                        Помнить обо всём?
                        <br />
                        Теперь необязательно.
                      </h2>
                      <p>
                        Добавьте важные даты — мы рассчитаем сроки
                        <br className="desktop-br" /> и подскажем, что нужно
                        сделать.
                      </p>
                      <button onClick={() => setUpload(true)}>
                        Добавить документ <ArrowUpRight size={18} />
                      </button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <span className="orbit orbit-one" />
                      <span className="orbit orbit-two" />
                      <div className="floating-bell">
                        <Bell size={27} />
                        <i />
                      </div>
                      <div className="art-calendar">
                        <div className="calendar-binding">
                          <i />
                          <i />
                        </div>
                        <div className="art-calendar-title">
                          ВСЁ ПОД КОНТРОЛЕМ <MoreHorizontal size={16} />
                        </div>
                        <div className="art-dots">
                          {Array.from({ length: 21 }, (_, i) => (
                            <span
                              key={i}
                              className={
                                i === 10
                                  ? "art-check"
                                  : i === 4 || i === 15
                                    ? "art-mark"
                                    : ""
                              }
                            >
                              {i === 10 ? <Check size={20} /> : i + 1}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="floating-done">
                        <span>
                          <Check size={17} />
                        </span>
                        Вы всё успеваете<small>А мы помним о сроках</small>
                      </div>
                      <span className="art-star star-one">✦</span>
                      <span className="art-star star-two">✦</span>
                    </div>
                  </section>
                  <aside className="bot-access">
                    <Bell size={22} />
                    <div>
                      <strong>Напомним сообщением в MAX</strong>
                      <p>
                        Создавайте события в чате командой /add, смотрите сроки
                        через /next. Включите уведомления: /resume.
                      </p>
                    </div>
                    {config.botUrl && (
                      <a href={config.botUrl} target="_blank" rel="noreferrer">
                        Перейти в чат ↗
                      </a>
                    )}
                  </aside>
                  <section className="stats-grid">
                    <button
                      className="stat-card"
                      onClick={() => {
                        setCompleted(false);
                        setFilter("all");
                      }}
                    >
                      <span className="stat-icon blue">
                        <CalendarDays size={21} />
                      </span>
                      <div>
                        <span>Предстоящие события</span>
                        <strong>
                          {active.length}
                          <small>в вашем календаре</small>
                        </strong>
                      </div>
                      <ArrowUpRight size={17} />
                    </button>
                    <button
                      className="stat-card"
                      onClick={() => {
                        setCompleted(false);
                        setMonth(today.slice(0, 7));
                      }}
                    >
                      <span className="stat-icon orange">
                        <Clock size={21} />
                      </span>
                      <div>
                        <span>В ближайшие 30 дней</span>
                        <strong>
                          {soon.length}
                          <small>
                            {overdue.length
                              ? `${overdue.length} требуют внимания`
                              : "готовимся заранее"}
                          </small>
                        </strong>
                      </div>
                    </button>
                    <button
                      className="stat-card"
                      onClick={() => setCompleted(true)}
                    >
                      <span className="stat-icon green">
                        <CheckCircle2 size={21} />
                      </span>
                      <div>
                        <span>Уже выполнено</span>
                        <strong>
                          {done.length}
                          <small>одной заботой меньше</small>
                        </strong>
                      </div>
                      <ArrowUpRight size={17} />
                    </button>
                  </section>
                </>
              )}
              <div className="content-grid">
                <section className="panel calendar-panel">
                  <div className="section-heading">
                    <h2>Календарь событий</h2>
                    <div className="calendar-view-label">
                      <CalendarDays size={14} /> Месяц
                    </div>
                  </div>
                  <div className="calendar-toolbar">
                    <div className="month-control">
                      <h3>
                        {new Date(month + "-01T12:00:00")
                          .toLocaleDateString("ru-RU", {
                            month: "long",
                            year: "numeric",
                          })
                          .replace(" г.", "")}
                      </h3>
                      <div>
                        <button
                          className="icon-button"
                          aria-label="Предыдущий месяц"
                          onClick={() => {
                            const d = new Date(month + "-01T12:00:00");
                            d.setMonth(d.getMonth() - 1);
                            setMonth(d.toISOString().slice(0, 7));
                            setSelectedDate(null);
                          }}
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Следующий месяц"
                          onClick={() => {
                            const d = new Date(month + "-01T12:00:00");
                            d.setMonth(d.getMonth() + 1);
                            setMonth(d.toISOString().slice(0, 7));
                            setSelectedDate(null);
                          }}
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                    <button
                      className="text-button today-button"
                      onClick={() => {
                        setMonth(today.slice(0, 7));
                        setSelectedDate(today);
                      }}
                    >
                      Сегодня
                    </button>
                  </div>
                  <Calendar
                    month={month}
                    today={today}
                    events={filtered}
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                  />
                  <div className="calendar-legend">
                    {Object.entries(categories).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() =>
                          setFilter(filter === k ? "all" : (k as Category))
                        }
                        className={filter === k ? "selected" : ""}
                      >
                        <i className={k} />
                        {v}
                      </button>
                    ))}
                  </div>
                  {selectedDate && (
                    <div className="day-detail">
                      <strong>{formatDate(selectedDate, true)}</strong>
                      <button
                        className="text-button"
                        onClick={() => {
                          setEditor({ date: selectedDate, template: "custom" });
                        }}
                      >
                        + Событие
                      </button>
                      {filtered
                        .filter(
                          (e) =>
                            e.dueDate === selectedDate ||
                            e.milestoneDate === selectedDate,
                        )
                        .map((e) => (
                          <button
                            className="day-event"
                            key={e.id}
                            onClick={() => setDetail(e)}
                          >
                            <i className={e.category} />
                            {e.milestoneDate === selectedDate
                              ? "День рождения · "
                              : ""}
                            {e.title}
                            <ChevronRight size={15} />
                          </button>
                        ))}
                      {!filtered.some(
                        (e) =>
                          e.dueDate === selectedDate ||
                          e.milestoneDate === selectedDate,
                      ) && <p>На этот день событий нет. Можно выдохнуть.</p>}
                    </div>
                  )}
                </section>
                <aside className="upcoming-column">
                  <div className="section-heading">
                    <h2>Ближайшие события</h2>
                    <span className="count-badge">{active.length}</span>
                  </div>
                  {active.slice(0, 3).map((e) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      today={today}
                      onClick={() => setDetail(e)}
                    />
                  ))}
                  {!active.length && (
                    <div className="empty-side">
                      <CalendarDays size={32} />
                      <h3>Здесь появятся ваши планы</h3>
                      <p>
                        Начните с паспорта, обследования или любого важного
                        события.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => openEditor()}
                      >
                        Добавить первое событие <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                  <button
                    className="all-events"
                    onClick={() =>
                      document
                        .getElementById("all-events")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Все события <ArrowRight size={16} />
                  </button>
                  <div className="tip-card">
                    <span className="tip-icon">
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <strong>На шаг впереди</strong>
                      <p>
                        Напоминания за 30, 7 и 1 день помогут подготовиться без
                        спешки.
                      </p>
                      <button onClick={() => go("notifications")}>
                        Настроить <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
              <section className="panel events-panel" id="all-events">
                <div className="section-heading">
                  <h2>
                    Все события{" "}
                    <span className="count-badge">{filtered.length}</span>
                  </h2>
                  <div className="segmented">
                    <button
                      className={!completed ? "selected" : ""}
                      onClick={() => setCompleted(false)}
                    >
                      Предстоящие
                    </button>
                    <button
                      className={completed ? "selected" : ""}
                      onClick={() => setCompleted(true)}
                    >
                      Выполненные
                    </button>
                  </div>
                </div>
                <div className="event-filters">
                  <div className="filter-chips">
                    <button
                      className={filter === "all" ? "selected" : ""}
                      onClick={() => setFilter("all")}
                    >
                      Все категории
                    </button>
                    {Object.entries(categories).map(([k, v]) => (
                      <button
                        key={k}
                        className={filter === k ? "selected" : ""}
                        onClick={() => setFilter(k as Category)}
                      >
                        <i className={k} />
                        {v}
                      </button>
                    ))}
                  </div>
                  <label className="search-field">
                    <Search size={16} />
                    <input
                      placeholder="Найти событие"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="event-table">
                  <div className="table-header">
                    <span>СОБЫТИЕ</span>
                    <span>КРАЙНИЙ СРОК</span>
                    <span>НАПОМИНАНИЯ</span>
                    <span />
                  </div>
                  {filtered.map((e) => (
                    <button
                      className="event-row"
                      key={e.id}
                      onClick={() => setDetail(e)}
                    >
                      <div className="event-name">
                        <CategoryIcon category={e.category} />
                        <div>
                          <strong>{e.title}</strong>
                          <small>
                            {categories[e.category]}
                            {e.documentName ? " · Из документа" : ""}
                          </small>
                        </div>
                      </div>
                      <div className="table-date">
                        <strong>{formatDate(e.dueDate, true)}</strong>
                        <small
                          className={
                            e.dueDate < today && !e.completed
                              ? "overdue-text"
                              : ""
                          }
                        >
                          {e.completed
                            ? "Выполнено"
                            : deadlineLabel(e.dueDate, today)}
                        </small>
                      </div>
                      <span className="table-reminders">
                        <Bell size={14} />
                        {e.reminders.length
                          ? e.reminders
                              .map((n) => (n === 0 ? "в срок" : `${n} дн.`))
                              .join(", ")
                          : "Выключены"}
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                  {!filtered.length && (
                    <div className="empty-table">
                      <CalendarDays size={28} />
                      <p>
                        {query
                          ? "По вашему запросу ничего не найдено"
                          : completed
                            ? "Выполненные события появятся здесь"
                            : "Пока нет событий в этой категории"}
                      </p>
                      {!query && !completed && (
                        <button
                          className="text-button"
                          onClick={() => openEditor()}
                        >
                          Добавить событие
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
          {page === "documents" && (
            <>
              <div className="document-intro panel">
                <div className="large-icon">
                  <Upload size={30} />
                </div>
                <h2>Документ подскажет дату</h2>
                <p>
                  Загрузите фото или PDF, выберите нужную дату из распознанных
                  <br /> и подтвердите событие. Оригинал документа остаётся на
                  устройстве.
                </p>
                <button className="primary" onClick={() => setUpload(true)}>
                  <Upload size={18} />
                  Загрузить документ
                </button>
                <small>
                  JPG, PNG, WebP, PDF или TXT · до 15 МБ · PDF до 5 страниц
                </small>
              </div>
              <h2 className="subheading">События из документов</h2>
              <div className="document-grid">
                {events
                  .filter((e) => e.documentName)
                  .map((e) => (
                    <button
                      className="panel document-card"
                      key={e.id}
                      onClick={() => setDetail(e)}
                    >
                      <CategoryIcon category={e.category} />
                      <h3>{e.title}</h3>
                      <p>{e.documentName}</p>
                      <span>
                        Срок: {formatDate(e.dueDate, true)}{" "}
                        <ArrowUpRight size={16} />
                      </span>
                    </button>
                  ))}
              </div>
              {!events.some((e) => e.documentName) && (
                <p className="muted">
                  Пока нет добавленных документов. Сохраняются только
                  подтверждённые даты и название файла.
                </p>
              )}
              <div className="privacy-note">
                <ShieldCheck size={20} />
                <p>
                  Распознавание выполняется в браузере. На сервер отправляется
                  только событие после вашего подтверждения. Прямое подключение
                  к Госуслугам не настроено.
                </p>
              </div>
            </>
          )}
          {page === "notifications" && user && (
            <Notifications
              user={user}
              botUrl={config.botUrl}
              onSave={async (settings) => {
                await api.settings(settings);
                setUser({ ...user, settings });
                notify("Настройки напоминаний сохранены");
              }}
            />
          )}
          {page === "settings" && user && (
            <div className="settings-layout">
              <section className="panel settings-panel">
                <h2>Личное пространство</h2>
                <div className="profile-large">
                  <span className="avatar">{user.name[0]}</span>
                  <div>
                    <strong>
                      {user.demo ? "Гостевой профиль" : user.name}
                    </strong>
                    <p>
                      {user.demo
                        ? "Данные сохраняются в этом браузере и локальной базе"
                        : "Вход подтверждён через MAX"}
                    </p>
                  </div>
                </div>
                <div className="settings-line">
                  <div>
                    <strong>Подключение к MAX</strong>
                    <p>
                      {user.demo
                        ? "Для реальной отправки подключите бота по инструкции в README"
                        : "Бот привязан к вашему аккаунту MAX"}
                    </p>
                  </div>
                  <span className="badge">{user.demo ? "Демо" : "MAX"}</span>
                </div>
                <div className="settings-line">
                  <div>
                    <strong>Напоминания и часовой пояс</strong>
                    <p>
                      {user.settings.hour}:00 · {user.settings.timezone}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => go("notifications")}
                  >
                    Настроить
                  </button>
                </div>
              </section>
              <section className="panel settings-panel">
                <h2>Ваши данные</h2>
                <p className="muted">
                  Оригиналы документов не хранятся на сервере. Вы можете удалить
                  все события и историю уведомлений. Профиль останется,
                  напоминания выключатся.
                </p>
                <button
                  className="danger-button"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 size={17} />
                  Удалить все события
                </button>
              </section>
              <section className="panel settings-panel">
                <h2>О приложении</h2>
                <p className="muted">
                  Вовремя — независимый помощник, не официальный сервис
                  Госуслуг. Каталог включает основные сценарии; остальные сроки
                  можно добавить вручную. Индивидуальные даты из документов и
                  назначения врача имеют приоритет.
                </p>
                <div className="source-links">
                  <a
                    href="https://dev.max.ru/docs"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Документация MAX <ExternalLink size={14} />
                  </a>
                  <a
                    href="https://www.nalog.gov.ru/nu/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Налоговые уведомления <ExternalLink size={14} />
                  </a>
                </div>
              </section>
            </div>
          )}
          <footer>
            <span>
              <span className="mini-brand">✓</span> Вовремя. Для жизни без
              лишних забот.
            </span>
            <span>
              <ShieldCheck size={14} />
              Ваши даты — под вашим контролем
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav">
        {nav.map((n) => (
          <button
            key={n.id}
            className={page === n.id ? "active" : ""}
            onClick={() => go(n.id)}
          >
            <n.icon size={21} />
            <span>{n.title.replace("Мои ", "")}</span>
          </button>
        ))}
        <button
          className={page === "settings" ? "active" : ""}
          onClick={() => go("settings")}
        >
          <SettingsIcon size={21} />
          <span>Настройки</span>
        </button>
      </nav>
      {editor && (
        <EventEditor
          initial={editor}
          onClose={() => setEditor(null)}
          onSave={async (input) => {
            const event = editor.editing
              ? await api.update(editor.editing.id, input)
              : await api.create(input);
            setEvents(
              editor.editing
                ? events.map((e) => (e.id === event.id ? event : e))
                : [...events, event],
            );
            setMonth(event.dueDate.slice(0, 7));
            setEditor(null);
            notify(
              editor.editing
                ? "Событие обновлено"
                : "Событие добавлено в календарь",
            );
          }}
        />
      )}
      {upload && (
        <DocumentUpload
          onClose={() => setUpload(false)}
          onSelect={(date, template, documentName) => {
            setUpload(false);
            setEditor({ date, template, documentName });
          }}
        />
      )}
      {detail && (
        <Modal title="Детали события" onClose={() => setDetail(null)}>
          <EventDetails event={detail} today={today} />
          <div className="modal-actions">
            <button
              className="danger-icon"
              aria-label="Удалить событие"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await api.remove(detail.id);
                  setEvents(events.filter((e) => e.id !== detail.id));
                  setDetail(null);
                  notify("Событие удалено");
                })
              }
            >
              <Trash2 size={19} />
            </button>
            <button
              className="secondary"
              onClick={() => {
                setEditor({
                  template: detail.templateId,
                  date: detail.baseDate,
                  documentName: detail.documentName,
                  editing: detail,
                });
                setDetail(null);
              }}
            >
              Изменить
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => finish(detail)}
            >
              <Check size={18} />
              {detail.completed
                ? "Вернуть в календарь"
                : "Отметить выполненным"}
            </button>
          </div>
          {detail.completed && (
            <button
              className="text-button repeat-button"
              onClick={() => {
                setDetail(null);
                openEditor(detail.templateId);
              }}
            >
              Добавить следующую дату <ArrowRight size={15} />
            </button>
          )}
        </Modal>
      )}
      {confirmClear && (
        <Modal
          title="Удалить все события?"
          onClose={() => setConfirmClear(false)}
        >
          <p className="muted">
            События и история напоминаний будут удалены из базы без возможности
            восстановления.
          </p>
          <div className="modal-actions">
            <button
              className="secondary"
              onClick={() => setConfirmClear(false)}
            >
              Отмена
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await api.clear();
                  setEvents([]);
                  setUser(await api.me());
                  setConfirmClear(false);
                  notify("Все события удалены");
                })
              }
            >
              Удалить
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          {toast}
          <button aria-label="Скрыть сообщение" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function deadlineLabel(date: string, today: string) {
  const n = dayDiff(date, today);
  return n < 0
    ? `Просрочено на ${-n} дн.`
    : n === 0
      ? "Сегодня"
      : n === 1
        ? "Завтра"
        : `Через ${n} дн.`;
}
function EventCard({
  event,
  today,
  onClick,
}: {
  event: Deadline;
  today: string;
  onClick: () => void;
}) {
  const days = dayDiff(event.dueDate, today);
  return (
    <button className="upcoming-card" onClick={onClick}>
      <div className="upcoming-top">
        <CategoryIcon category={event.category} size={19} />
        <span className={`deadline-badge ${days <= 7 ? "urgent" : ""}`}>
          {deadlineLabel(event.dueDate, today)}
        </span>
      </div>
      <h3>{event.title}</h3>
      <p>{templateById[event.templateId].steps[0]}</p>
      <div className="upcoming-bottom">
        <span>
          <CalendarDays size={14} />
          {formatDate(event.dueDate, true)}
        </span>
        <ArrowUpRight size={17} />
      </div>
    </button>
  );
}
function Calendar({
  month,
  today,
  events,
  selected,
  onSelect,
}: {
  month: string;
  today: string;
  events: Deadline[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const first = month + "-01";
  const offset = (new Date(first + "T12:00:00").getDay() + 6) % 7;
  const days = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  const count = Math.ceil((offset + days) / 7) * 7;
  return (
    <div className="calendar">
      <div className="weekdays">
        {["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {Array.from({ length: count }, (_, i) => {
          const date = addDays(first, i - offset),
            dayEvents = events.filter(
              (e) => e.dueDate === date || e.milestoneDate === date,
            ),
            outside = date.slice(0, 7) !== month;
          return (
            <button
              aria-label={`${formatDate(date)}${dayEvents.length ? `, событий: ${dayEvents.length}` : ""}`}
              aria-pressed={date === selected}
              key={date}
              className={`calendar-day ${outside ? "outside" : ""} ${date === today ? "today" : ""} ${date === selected ? "selected" : ""} ${dayEvents.length ? "has-events" : ""}`}
              onClick={() => onSelect(date)}
            >
              <span className="day-number">{Number(date.slice(-2))}</span>
              <div className="day-events">
                {dayEvents.slice(0, 2).map((e) => (
                  <span className={`calendar-event ${e.category}`} key={e.id}>
                    <i />
                    {e.milestoneDate === date ? "День рождения" : e.title}
                  </span>
                ))}
                {dayEvents.length > 2 && (
                  <small>+{dayEvents.length - 2} ещё</small>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function EventDetails({ event, today }: { event: Deadline; today: string }) {
  const t = templates.find((t) => t.id === event.templateId)!;
  return (
    <>
      <div className="detail-title">
        <CategoryIcon category={event.category} size={25} />
        <div>
          <span className="eyebrow">{categories[event.category]}</span>
          <h2>{event.title}</h2>
        </div>
      </div>
      <div className="detail-date">
        <span>
          Крайний срок<strong>{formatDate(event.dueDate)}</strong>
        </span>
        <span
          className={`deadline-badge ${event.dueDate <= today ? "urgent" : ""}`}
        >
          {event.completed ? "Выполнено" : deadlineLabel(event.dueDate, today)}
        </span>
      </div>
      {event.milestoneDate && (
        <p className="muted">
          {event.age}-летие: {formatDate(event.milestoneDate)}
        </p>
      )}
      <div className="info-box">
        <Info size={18} />
        <p>{t.rule}</p>
      </div>
      <h3 className="subheading">Что нужно сделать</h3>
      <ol className="steps">
        {nextSteps({ ...event, notes: "" }).map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {event.notes && (
        <div className="note">
          <strong>Ваша заметка</strong>
          <p>{event.notes}</p>
        </div>
      )}
      <p className="detail-reminders">
        <Bell size={16} />
        Напомнить:{" "}
        {event.reminders.length
          ? event.reminders
              .map((n) => (n === 0 ? "в день срока" : `за ${n} дн.`))
              .join(", ")
          : "не напоминать"}
      </p>
      {event.templateId === "passport" && (
        <p className="muted">Дополнительно — в день 20-летия или 45-летия.</p>
      )}
      {"scope" in t && <p className="muted">{t.scope}</p>}
      <div className="source-links">
        {t.link && (
          <a href={t.link} target="_blank" rel="noreferrer">
            Перейти к услуге или ведомству
            <ExternalLink size={14} />
          </a>
        )}
        {"source" in t && (
          <a href={t.source} target="_blank" rel="noreferrer">
            Источник правила
            {"sourceReviewedOn" in t
              ? ` · проверен ${formatDate(t.sourceReviewedOn)}`
              : ""}
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </>
  );
}
function EventEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: {
    template?: TemplateId;
    date?: string;
    documentName?: string;
    editing?: Deadline;
  };
  onClose: () => void;
  onSave: (input: EventInput) => Promise<void>;
}) {
  const [selected, setSelected] = useState<TemplateId | null>(
      initial.template || null,
    ),
    [title, setTitle] = useState(
      initial.editing?.title ||
        (initial.template
          ? templates.find((t) => t.id === initial.template)!.title
          : ""),
    ),
    [date, setDate] = useState(initial.date || ""),
    [age, setAge] = useState<20 | 45>(initial.editing?.age || 20),
    [interval, setInterval] = useState(
      initial.editing?.intervalMonths
        ? String(initial.editing.intervalMonths)
        : "",
    ),
    [category, setCategory] = useState<Category>(
      initial.editing?.category || "other",
    ),
    [notes, setNotes] = useState(initial.editing?.notes || ""),
    [reminders, setReminders] = useState(
      initial.editing?.reminders || [30, 7, 1, 0],
    ),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const t = templates.find((v) => v.id === selected);
  const [sphere, setSphere] = useState<Category | "all">("all");
  const [templateSearch, setTemplateSearch] = useState("");
  const matchingTemplates = templates.filter(
    (item) =>
      (sphere === "all" || item.category === sphere) &&
      `${item.title} ${item.description} ${categories[item.category]}`
        .toLocaleLowerCase("ru")
        .includes(templateSearch.trim().toLocaleLowerCase("ru")),
  );
  function choose(id: TemplateId) {
    const template = templates.find((v) => v.id === id)!;
    setSelected(id);
    setTitle(template.title);
    setCategory(template.category);
    setDate(initial.date || "");
    setError("");
  }
  let calculated = "";
  try {
    if (t && date)
      calculated = calculateDeadline({
        templateId: t.id,
        title,
        category: t.category,
        baseDate: date,
        age,
        intervalMonths: Number(interval) || undefined,
        reminders,
        notes,
        documentName: initial.documentName || "",
      }).dueDate;
  } catch {
    /* Incomplete form has no preview. */
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!t) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        templateId: t.id,
        title,
        category: t.id === "custom" ? category : t.category,
        baseDate: date,
        ...(t.id === "passport" ? { age } : {}),
        ...(t.id === "fluorography"
          ? { intervalMonths: Number(interval) }
          : {}),
        reminders,
        notes,
        documentName: initial.documentName || "",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={
        selected
          ? initial.editing
            ? "Изменить событие"
            : "Новое событие"
          : "О чём вам напомнить?"
      }
      onClose={onClose}
      wide={!selected}
    >
      {!selected ? (
        <>
          <p className="modal-description">
            Выберите событие. Мы поможем рассчитать срок и подготовиться.
          </p>
          <div className="catalog-controls">
            <label className="field">
              Поиск услуги
              <input
                type="search"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Пособие, счётчик, паспорт…"
              />
            </label>
            <label className="field">
              Сфера
              <select
                aria-label="Сфера"
                value={sphere}
                onChange={(e) => setSphere(e.target.value as Category | "all")}
              >
                <option value="all">Все сферы</option>
                {Object.entries(categories).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted" role="status">
            Найдено услуг: {matchingTemplates.length}
          </p>
          <div className="template-grid">
            {matchingTemplates.map((t) => (
              <button
                key={t.id}
                className="template-card"
                onClick={() => choose(t.id)}
              >
                <CategoryIcon category={t.category} />
                <small>{categories[t.category]}</small>
                <h3>{t.title}</h3>
                <p>{t.description}</p>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
          {!matchingTemplates.length && (
            <p className="empty-catalog">
              Ничего не найдено. Измените поиск или выберите другую сферу.
            </p>
          )}
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <p>Только нужные даты. Номера документов не требуются.</p>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <button
            type="button"
            className="text-button back-link"
            onClick={() => setSelected(null)}
          >
            <ChevronLeft size={16} />
            Другой тип события
          </button>
          <label className="field">
            Название события
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          {initial.documentName && (
            <div className="import-notice">
              <FileText size={17} />
              <span>
                Из файла: {initial.documentName}
                <small>
                  Проверьте назначение и точность распознанной даты.
                </small>
              </span>
            </div>
          )}
          <div className="form-row">
            <label className="field">
              {t?.dateLabel}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                min="1900-01-01"
                max="2100-12-31"
              />
            </label>
            {selected === "passport" && (
              <label className="field">
                Возраст замены
                <select
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value) as 20 | 45)}
                >
                  <option value={20}>20 лет</option>
                  <option value={45}>45 лет</option>
                </select>
              </label>
            )}
            {selected === "fluorography" && (
              <label className="field">
                Интервал врача
                <select
                  required
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                >
                  <option value="">Выберите интервал</option>
                  <option value="6">6 месяцев</option>
                  <option value="12">12 месяцев</option>
                  <option value="24">24 месяца</option>
                </select>
              </label>
            )}
          </div>
          {selected === "custom" && (
            <label className="field">
              Категория
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {Object.entries(categories).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="info-box">
            <Info size={17} />
            <p>{t?.rule}</p>
          </div>
          {t && "scope" in t && <p className="muted">{t.scope}</p>}
          {calculated && (
            <div className="calculated">
              <Sparkles size={18} />
              <div>
                <span>
                  {selected === "passport" || selected === "fluorography"
                    ? "Рассчитанный срок"
                    : "Дата в календаре"}
                </span>
                <strong>{formatDate(calculated)}</strong>
              </div>
              <CheckCircle2 size={20} />
            </div>
          )}
          <fieldset className="reminder-field">
            <legend>Когда напомнить</legend>
            <div>
              {[90, 30, 14, 7, 1, 0].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={reminders.includes(n)}
                  className={reminders.includes(n) ? "selected" : ""}
                  onClick={() =>
                    setReminders(
                      reminders.includes(n)
                        ? reminders.filter((v) => v !== n)
                        : [...reminders, n],
                    )
                  }
                >
                  {reminders.includes(n) && <Check size={13} />}{" "}
                  {n === 0 ? "В день срока" : `За ${n} дн.`}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            Заметка <span className="optional">необязательно</span>
            <textarea
              placeholder="Что нужно подготовить или уточнить"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="secondary" type="button" onClick={onClose}>
              Отмена
            </button>
            <button className="primary" disabled={saving} type="submit">
              {saving ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Plus size={17} />
              )}{" "}
              {initial.editing ? "Сохранить изменения" : "Добавить в календарь"}
            </button>
          </div>
          <p className="form-footnote">
            Отправка работает, когда вы включили напоминания и запустили бота
            MAX.
          </p>
        </form>
      )}
    </Modal>
  );
}
function DocumentUpload({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (date: string, template: TemplateId, name: string) => void;
}) {
  const [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [dates, setDates] = useState<{ date: string; context: string }[]>([]),
    [selected, setSelected] = useState(""),
    [template, setTemplate] = useState<TemplateId>("custom"),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function read(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setDates([]);
    setSelected("");
    setName(file.name.slice(0, 160));
    try {
      const result = await recognize(file, (s) => {
        if (alive.current) setProgress(s);
      });
      if (alive.current) {
        setDates(result.dates);
        setTemplate(result.suggested as TemplateId);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  return (
    <Modal title="Добавить даты из документа" onClose={onClose}>
      <p className="modal-description">
        Распознаем текст на вашем устройстве. Вы сами выберете, какая дата нужна
        для события.
      </p>
      <label
        className={`upload-zone ${busy ? "busy" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void read(e.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
          disabled={busy}
          onChange={(e) => void read(e.target.files?.[0])}
        />
        {busy ? (
          <LoaderCircle className="spin" size={33} />
        ) : (
          <Upload size={33} />
        )}
        <strong>{busy ? progress : "Выберите или перетащите документ"}</strong>
        <span>JPG, PNG, WebP, PDF или TXT · до 15 МБ</span>
        <small>PDF — до 5 страниц</small>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {dates.length > 0 && (
        <>
          <div className="recognized-header">
            <CheckCircle2 size={18} />
            <strong>Найдено дат: {dates.length}</strong>
            <span>{name}</span>
          </div>
          <label className="field">
            Тип события
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as TemplateId)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Выберите:{" "}
            {templates.find((t) => t.id === template)?.dateLabel.toLowerCase()}.
            Проверьте по оригиналу документа.
          </p>
          <div className="date-options">
            {dates.map((d) => (
              <label
                key={d.date}
                className={selected === d.date ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="recognizedDate"
                  checked={selected === d.date}
                  onChange={() => setSelected(d.date)}
                />
                <span>
                  <strong>{formatDate(d.date)}</strong>
                  <small>{d.context}</small>
                </span>
              </label>
            ))}
          </div>
          <button
            className="primary full-width"
            disabled={!selected}
            onClick={() => onSelect(selected, template, name)}
          >
            Проверить и создать событие <ArrowRight size={17} />
          </button>
        </>
      )}
      <div className="privacy-note">
        <ShieldCheck size={18} />
        <p>
          Файл не отправляется на сервер. Для первого распознавания фото нужен
          интернет, чтобы загрузить языковые модели.
        </p>
      </div>
      <button
        className="text-button"
        onClick={() => onSelect("", "custom", "")}
      >
        Ввести дату вручную <ArrowRight size={15} />
      </button>
    </Modal>
  );
}
function Notifications({
  user,
  botUrl,
  onSave,
}: {
  user: User;
  botUrl: string | null;
  onSave: (s: Settings) => Promise<void>;
}) {
  const [settings, setSettings] = useState(user.settings),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<Delivery[]>([]);
  // Refresh from chat changes only while this form has no unsaved edits.
  const previousSettings = useRef(user.settings);
  useEffect(() => {
    const previous = previousSettings.current;
    setSettings((current) =>
      JSON.stringify(current) === JSON.stringify(previous)
        ? user.settings
        : current,
    );
    previousSettings.current = user.settings;
  }, [user.settings]);
  useEffect(() => {
    api
      .deliveries()
      .then(setHistory)
      .catch(() => setError("Не удалось загрузить историю уведомлений"));
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(settings);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="notification-layout">
      <form className="panel settings-panel" onSubmit={submit}>
        <div className="section-heading">
          <h2>Напоминания в MAX</h2>
          <span className="max-logo">
            <img src="/Max_logo.svg" alt="" />
          </span>
        </div>
        <div className="settings-line">
          <div>
            <strong>Получать напоминания</strong>
            <p>По расписанию каждого события</p>
          </div>
          <button
            type="button"
            className={`toggle ${settings.enabled ? "on" : ""}`}
            role="switch"
            aria-checked={settings.enabled}
            aria-label="Получать напоминания"
            onClick={() =>
              setSettings({ ...settings, enabled: !settings.enabled })
            }
          >
            <span />
          </button>
        </div>
        {(user.demo || !user.botStarted) && (
          <div className="info-box">
            <Info size={18} />
            <p>
              {user.demo
                ? "Сейчас работает деморежим. Настройки сохраняются, но сообщения не отправляются. После подключения бота запустите его и включите напоминания."
                : "Сначала откройте бота и нажмите «Начать». Затем вернитесь в приложение."}
              {botUrl && (
                <a href={botUrl} target="_blank" rel="noreferrer">
                  {" "}
                  Открыть бота ↗
                </a>
              )}
            </p>
          </div>
        )}
        <div className="form-row">
          <label className="field">
            Время напоминаний
            <select
              value={settings.hour}
              onChange={(e) =>
                setSettings({ ...settings, hour: Number(e.target.value) })
              }
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option value={i} key={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Часовой пояс
            <select
              value={settings.timezone}
              onChange={(e) =>
                setSettings({ ...settings, timezone: e.target.value })
              }
            >
              {[
                ["Europe/Kaliningrad", "Калининград · UTC+2"],
                ["Europe/Moscow", "Москва · UTC+3"],
                ["Europe/Samara", "Самара · UTC+4"],
                ["Asia/Yekaterinburg", "Екатеринбург · UTC+5"],
                ["Asia/Omsk", "Омск · UTC+6"],
                ["Asia/Novosibirsk", "Новосибирск · UTC+7"],
                ["Asia/Irkutsk", "Иркутск · UTC+8"],
                ["Asia/Yakutsk", "Якутск · UTC+9"],
                ["Asia/Vladivostok", "Владивосток · UTC+10"],
                ["Asia/Magadan", "Магадан · UTC+11"],
                ["Asia/Kamchatka", "Камчатка · UTC+12"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="settings-line">
          <div>
            <strong>Скрывать детали в сообщениях</strong>
            <p>
              Только напоминание открыть календарь.
              <br />
              Без названий документов и обследований.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Скрывать детали в сообщениях"
            aria-checked={settings.privateMessages}
            className={`toggle ${settings.privateMessages ? "on" : ""}`}
            onClick={() =>
              setSettings({
                ...settings,
                privateMessages: !settings.privateMessages,
              })
            }
          >
            <span />
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={saving}>
          {saving ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Check size={17} />
          )}
          Сохранить настройки
        </button>
      </form>
      <div>
        <div className="message-preview">
          <span className="eyebrow">ПРИМЕР УВЕДОМЛЕНИЯ</span>
          <div className="message-app">
            <span className="max-logo">
              <img src="/Max_logo.svg" alt="" />
            </span>
            <span>
              <strong>Вовремя</strong>
              <small>бот · MAX</small>
            </span>
            <MoreHorizontal size={20} />
          </div>
          <div className="message-bubble">
            <strong>
              {settings.privateMessages
                ? "Важная дата уже близко"
                : "Пора заменить паспорт"}
            </strong>
            <p>
              {settings.privateMessages
                ? "В вашем календаре приближается срок события. Команда /show с кодом события покажет дату и рекомендации прямо в чате."
                : "До срока подачи документов осталось 7 дней. Подготовьте паспорт и фотографии, проверьте список документов на Госуслугах."}
            </p>
            <small>
              {String(settings.hour).padStart(2, "0")}:00{" "}
              <CheckCheck size={13} />
            </small>
            <span>
              Открыть календарь <ArrowUpRight size={15} />
            </span>
          </div>
          <p className="preview-caption">Так будет выглядеть напоминание</p>
        </div>
      </div>
      <section className="panel settings-panel delivery-history">
        <h2>История отправки</h2>
        {history.length ? (
          history.map((d) => (
            <div className="settings-line" key={d.id}>
              <div>
                <strong>{d.title}</strong>
                <p>
                  {d.sentAt
                    ? new Date(d.sentAt).toLocaleString("ru-RU", {
                        timeZone: user.settings.timezone,
                      })
                    : "Ожидает отправки"}
                </p>
              </div>
              <span className="badge">
                {d.status === "sent"
                  ? "Отправлено"
                  : d.status === "failed"
                    ? "Повторная попытка"
                    : "В очереди"}
              </span>
            </div>
          ))
        ) : (
          <div className="empty-table">
            <Bell size={28} />
            <p>Здесь появятся отправленные напоминания</p>
          </div>
        )}
      </section>
    </div>
  );
}
