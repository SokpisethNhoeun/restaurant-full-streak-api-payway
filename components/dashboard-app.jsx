"use client";

import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AnalyticsLineChart from "./analytics-line-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api, API_BASE, WS_URL } from "@/lib/api";
import { goeyToastOptions } from "@/lib/goey-toast-options";
import { displayUsd, khr, tags, usd } from "@/lib/utils";
import { Client } from "@stomp/stompjs";
import { gooeyToast } from "goey-toast";
import {
  ArrowUpDown, BadgePercent, BarChart3, BellRing, CalendarDays, Check, Clock, CreditCard,
  Download, Filter, LogIn, Pencil, Printer, RefreshCw, Search,
  Table2, Upload, Utensils, Volume2, VolumeX, Wifi, WifiOff, X
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import SockJS from "sockjs-client";

const NEXT_STATUS = {
  PAID: "RECEIVED",
  RECEIVED: "PREPARING",
  PREPARING: "READY",
  READY: "COMPLETED"
};

const SORT_OPTIONS = [
  { value: "time_desc", labelKey: "sortNewest" },
  { value: "time_asc",  labelKey: "sortOldest" },
  { value: "payment",   labelKey: "sortPayment" },
  { value: "status",    labelKey: "sortStatus" },
  { value: "category",  labelKey: "sortCategory" },
  { value: "item_name", labelKey: "sortItemName" },
  { value: "table",     labelKey: "sortTable" },
  { value: "order_no",  labelKey: "sortOrderNo" }
];

const PAYMENT_FILTERS = [
  { value: "",       labelKey: "allPayments" },
  { value: "PAID",   labelKey: "paid" },
  { value: "PENDING", labelKey: "pending" },
  { value: "UNPAID", labelKey: "unpaidNoQr" },
  { value: "EXPIRED", labelKey: "expired" }
];

const ORDER_STATUS_FILTERS = [
  { value: "", labelKey: "allStatuses" },
  { value: "PENDING_PAYMENT", labelKey: "awaitingPayment" },
  { value: "PAID", labelKey: "paid" },
  { value: "RECEIVED", labelKey: "receivedByStaff" },
  { value: "PREPARING", labelKey: "preparing" },
  { value: "READY", labelKey: "readyForPickup" },
  { value: "COMPLETED", labelKey: "completed" },
  { value: "CANCELLED", labelKey: "cancelled" },
  { value: "REJECTED", labelKey: "rejected" },
  { value: "EXPIRED", labelKey: "expired" }
];

const DASHBOARD_SESSION_HINT = "happyboat-dashboard-session";
const DASHBOARD_TOKEN_KEY = "happyboat-dashboard-token";
const DASHBOARD_SOUND_READY_KEY = "happyboat-dashboard-sound-ready";
const DASHBOARD_LANGUAGE_KEY = "happyboat-language";
const ORDER_ATTENTION_MS = 10 * 60 * 1000;
const DONUT_COLORS = ["#0f8a7f", "#f59e0b", "#2563eb", "#dc2626", "#7c3aed", "#059669"];

function readDashboardToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DASHBOARD_TOKEN_KEY);
}

function dashboardAuthHeaders(headers = {}) {
  const token = readDashboardToken();
  if (!token || headers.Authorization) return headers;
  return { ...headers, Authorization: `Bearer ${token}` };
}

function clearDashboardSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DASHBOARD_SESSION_HINT);
  window.localStorage.removeItem(DASHBOARD_TOKEN_KEY);
}

export default function DashboardApp() {
  const { t, language } = useLanguage();
  const [credentials, setCredentials] = useState({ username: "admin", password: "admin123" });
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [menu, setMenu] = useState({ categories: [], items: [], addons: [], options: [] });
  const [tables, setTables] = useState([]);
  const [payments, setPayments] = useState([]);
  const [promos, setPromos] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [message, setMessage] = useState("");
  const [liveState, setLiveState] = useState("offline");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [soundReady, setSoundReady] = useState(false);
  const [dashboardNow, setDashboardNow] = useState(Date.now());
  const audioRef = useRef(null);
  const ordersRef = useRef([]);
  const paymentsRef = useRef([]);
  const selectedOrderRef = useRef(null);
  const notifiedOrderToastRef = useRef(new Set());
  const notifiedPaymentToastRef = useRef(new Set());
  const notifiedCustomerAlertRef = useRef(new Set());

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    selectedOrderRef.current = selectedOrder;
  }, [selectedOrder]);

  useEffect(() => {
    paymentsRef.current = payments;
  }, [payments]);

  useEffect(() => {
    const hasSessionHint = window.localStorage.getItem(DASHBOARD_SESSION_HINT) === "1";
    if (!hasSessionHint && !readDashboardToken()) return;
    setSoundReady(window.localStorage.getItem(DASHBOARD_SOUND_READY_KEY) === "1");

    let mounted = true;
    fetch(`${API_BASE}/api/admin/auth/session`, {
      credentials: "include",
      cache: "no-store",
      headers: dashboardAuthHeaders({ "ngrok-skip-browser-warning": "true" })
    })
      .then((response) => {
        if (!response.ok) throw new Error("No dashboard session");
        if (mounted) setSignedIn(true);
      })
      .catch(() => {
        clearDashboardSession();
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    setLiveState("connecting");
    loadAll();

    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 5000,
      onConnect: () => {
        setLiveState("connected");
        client.subscribe("/topic/orders", (frame) => {
          const order = JSON.parse(frame.body);
          applyLiveOrder(order);
        });
        client.subscribe("/topic/payments", (frame) => {
          try {
            applyLivePayment(JSON.parse(frame.body));
          } catch {
            loadPayments({ notifyNew: true });
          }
          loadOrders();
        });
        client.subscribe("/topic/order-alerts", (frame) => {
          try {
            applyCustomerAlert(JSON.parse(frame.body));
          } catch {
            loadOrders();
          }
        });
      },
      onWebSocketClose: () => setLiveState("polling"),
      onWebSocketError: () => setLiveState("polling"),
      onStompError: () => setLiveState("polling")
    });

    client.activate();
    const pollTimer = window.setInterval(() => {
      pollLiveData();
    }, 10000);

    return () => {
      window.clearInterval(pollTimer);
      setLiveState("offline");
      client.deactivate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return undefined;
    const timer = window.setInterval(() => setDashboardNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [signedIn]);

  async function request(path, options = {}) {
    try {
      return await api(path, {
        ...options,
        credentials: "include",
        headers: dashboardAuthHeaders({ ...(options.headers || {}) })
      });
    } catch (error) {
      if (error.status === 401) {
        clearDashboardSession();
        setSignedIn(false);
        setMessage(t("signInFailed"));
      }
      throw error;
    }
  }

  async function signIn(event) {
    event.preventDefault();
    setMessage("");
    unlockSound();
    try {
      const session = await api("/api/admin/auth/login", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify(credentials)
      });
      if (session?.token) {
        window.localStorage.setItem(DASHBOARD_TOKEN_KEY, session.token);
      }
      gooeyToast.success(t("loginSuccess"), goeyToastOptions());
      window.localStorage.setItem(DASHBOARD_SESSION_HINT, "1");
      setCredentials((current) => ({ ...current, password: "" }));
      setSignedIn(true);
    } catch {
      clearDashboardSession();
      setMessage(t("signInFailed"));
    }
  }

  async function loadAll() {
    const results = await Promise.allSettled([loadOrders(), loadMenu(), loadTables(), loadPayments(), loadPromos(), loadAnalytics()]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      setMessage(failed.reason?.message || "Dashboard refresh failed");
    }
    setLastUpdatedAt(new Date());
  }
  async function loadOrders(options = {}) {
    const data = await request("/api/admin/orders");
    mergeOrders(data, options);
    setLastUpdatedAt(new Date());
    return data;
  }
  async function loadOrder(orderId) {
    const detail = await request(`/api/admin/orders/${orderId}`);
    setSelectedOrder(detail);
    return detail;
  }
  async function loadMenu() { setMenu(await request("/api/admin/menu")); }
  async function loadTables() { setTables(await request("/api/admin/tables")); }
  async function loadPayments(options = {}) {
    const data = await request("/api/admin/payments");
    mergePayments(data, options);
    setLastUpdatedAt(new Date());
    return data;
  }
  async function loadPromos() { setPromos(await request("/api/admin/promos")); }
  async function loadAnalytics() {
    setAnalyticsError("");
    try {
      const data = await request("/api/admin/analytics/summary");
      setAnalytics(data);
      return data;
    } catch (error) {
      setAnalytics(null);
      setAnalyticsError(formatApiError(error, t("analyticsLoadFailed")));
      return null;
    }
  }

  async function pollLiveData() {
    const results = await Promise.allSettled([
      loadOrders({ notifyNew: true }),
      loadPayments({ notifyNew: true }),
      loadAnalytics()
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      setMessage(failed.reason?.message || "Live refresh failed");
    }
  }

  function mergeOrders(nextOrders, options = {}) {
    const previousById = new Map(ordersRef.current.map((order) => [order.id, order]));
    const alertOrder = Boolean(options.notifyNew) && nextOrders.find((order) => {
      const previous = previousById.get(order.id);
      return shouldNotifyOrder(order) && (!previous || previous.status !== order.status);
    });
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    if (alertOrder) {
      const didNotify = notifyOrderToast(alertOrder);
      if (didNotify) playSound(isPaidKitchenOrder(alertOrder) ? "payment" : "order");
    }
  }

  function applyLiveOrder(order) {
    const previous = ordersRef.current.find((entry) => entry.id === order.id);
    const nextOrders = upsertById(ordersRef.current, order);
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    setLastUpdatedAt(new Date());
    if (selectedOrderRef.current?.id === order.id) {
      setSelectedOrder((current) => current ? { ...current, ...order } : current);
    }
    if (shouldNotifyOrder(order) && (!previous || previous.status !== order.status)) {
      const didNotify = notifyOrderToast(order);
      if (didNotify) playSound(isPaidKitchenOrder(order) ? "payment" : "order");
    }
  }

  function applyCustomerAlert(orderAlert) {
    if (orderAlert?.id) {
      const nextOrders = upsertById(ordersRef.current, orderAlert);
      ordersRef.current = nextOrders;
      setOrders(nextOrders);
      if (selectedOrderRef.current?.id === orderAlert.id) {
        setSelectedOrder((current) => current ? { ...current, ...orderAlert } : current);
      }
    }
    const didNotify = notifyCustomerAlertToast(orderAlert);
    if (didNotify) playSound("rush");
  }

  function mergePayments(nextPayments, options = {}) {
    const previousById = new Map(paymentsRef.current.map((payment) => [payment.id, payment]));
    const alertPayment = Boolean(options.notifyNew) && nextPayments.find((payment) => {
      const previous = previousById.get(payment.id);
      return shouldNotifyPayment(payment) && (!previous || previous.status !== payment.status);
    });
    paymentsRef.current = nextPayments;
    setPayments(nextPayments);
    if (alertPayment) {
      const didNotify = notifyPaymentToast(alertPayment);
      if (didNotify) playSound("payment");
    }
  }

  function applyLivePayment(payment) {
    const previous = paymentsRef.current.find((entry) => entry.id === payment.id);
    const nextPayments = upsertById(paymentsRef.current, payment);
    paymentsRef.current = nextPayments;
    setPayments(nextPayments);
    setLastUpdatedAt(new Date());
    if (shouldNotifyPayment(payment) && (!previous || previous.status !== payment.status)) {
      const didNotify = notifyPaymentToast(payment);
      if (didNotify) playSound("payment");
    }
  }

  async function updateOrderStatus(orderId, status) {
    const data = await request(`/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    const nextOrders = upsertById(ordersRef.current, data);
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    setSelectedOrder(data);
  }

  function unlockSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioRef.current = audioRef.current || new AudioContext();
      if (audioRef.current.state === "suspended") {
        audioRef.current.resume().then(() => markSoundReady(true)).catch(() => markSoundReady(false));
      } else {
        markSoundReady(true);
      }
    } catch {
      markSoundReady(false);
    }
  }

  function playSound(alertType = "order") {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = audioRef.current || new AudioContext();
      audioRef.current = ctx;
      const beep = () => {
        const now = ctx.currentTime;
        const rings = alertType === "rush"
          ? [0, 0.14, 0.28, 0.62, 0.76, 0.9, 1.24, 1.38]
          : [0, 0.18, 0.36, 0.78, 0.96, 1.14];
        rings.forEach((offset, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = alertType === "rush" ? "square" : "sine";
          osc.frequency.setValueAtTime(index % 2 === 0 ? 1174 : 880, now + offset);
          gain.gain.setValueAtTime(0.0001, now + offset);
          gain.gain.exponentialRampToValueAtTime(alertType === "rush" ? 0.2 : 0.16, now + offset + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.16);
        });
        if (navigator.vibrate) {
          navigator.vibrate([180, 70, 180, 220, 180]);
        }
        speakDashboardAlert(alertType);
      };
      if (ctx.state === "suspended") {
        ctx.resume().then(() => {
          markSoundReady(true);
          beep();
        }).catch(() => markSoundReady(false));
        return;
      }
      markSoundReady(true);
      beep();
    } catch {
      markSoundReady(false);
    }
  }

  function testSound() {
    unlockSound();
    playSound("order");
  }

  function markSoundReady(ready) {
    setSoundReady(ready);
    try {
      if (ready) {
        window.localStorage.setItem(DASHBOARD_SOUND_READY_KEY, "1");
      } else {
        window.localStorage.removeItem(DASHBOARD_SOUND_READY_KEY);
      }
    } catch {
      // Storage is best-effort.
    }
  }

  function speakDashboardAlert(alertType = "order") {
    try {
      if (!("speechSynthesis" in window)) return;
      let lang = window.localStorage.getItem(DASHBOARD_LANGUAGE_KEY) || "en";
      let text = "";
      if (alertType === "rush") {
        text = lang === "km" ? t("customerWaitingVoice") : t("customerWaitingVoice");
      } else if (alertType === "payment") {
        text = lang === "km" ? "បានទទួលការបង់ប្រាក់" : "Received payment";
      } else {
        text = lang === "km" ? "បានទទួលការកម្មង់" : "Received new order";
      }
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = lang === "km" ? "km-KH" : "en-US";
      utterance.rate = lang === "km" ? 0.9 : 0.95;
      utterance.volume = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech output is best-effort.
    }
  }

  function shouldNotifyOrder(order) {
    return order.status === "PENDING_PAYMENT" || isPaidKitchenOrder(order);
  }

  function shouldNotifyPayment(payment) {
    return payment.status === "PAID";
  }

  function notifyOrderToast(order) {
    const toastKey = `${order.id || order.orderNumber}:${order.status}`;
    if (notifiedOrderToastRef.current.has(toastKey)) return false;
    notifiedOrderToastRef.current.add(toastKey);
    if (notifiedOrderToastRef.current.size > 100) {
      notifiedOrderToastRef.current = new Set([...notifiedOrderToastRef.current].slice(-50));
    }
    const title = isPaidKitchenOrder(order) ? t("paidOrderReady") : t("newOrderUpdate");
    gooeyToast.info(title, goeyToastOptions({
      id: "dashboard-order-alert",
      description: `${order.orderNumber || t("order")} · ${order.tableNumber || ""}`,
      action: order.id ? {
        label: t("showDetail"),
        onClick: () => loadOrder(order.id)
      } : undefined
    }));
    return true;
  }

  function notifyCustomerAlertToast(orderAlert) {
    const toastKey = `${orderAlert?.id || orderAlert?.orderNumber || "order"}:rush`;
    if (notifiedCustomerAlertRef.current.has(toastKey)) return false;
    notifiedCustomerAlertRef.current.add(toastKey);
    if (notifiedCustomerAlertRef.current.size > 100) {
      notifiedCustomerAlertRef.current = new Set([...notifiedCustomerAlertRef.current].slice(-50));
    }
    gooeyToast.info(t("orderNeedsAttention"), goeyToastOptions({
      id: "dashboard-customer-alert",
      description: `${orderAlert?.orderNumber || t("order")} · ${orderAlert?.tableNumber || ""} · ${orderAlert?.waitingMinutes || 10}m+`,
      action: orderAlert?.id ? {
        label: t("showDetail"),
        onClick: () => loadOrder(orderAlert.id)
      } : undefined
    }));
    return true;
  }

  function notifyPaymentToast(payment) {
    const toastKey = `${payment.id || payment.paymentNumber}:${payment.status}`;
    if (notifiedPaymentToastRef.current.has(toastKey)) return false;
    notifiedPaymentToastRef.current.add(toastKey);
    if (notifiedPaymentToastRef.current.size > 100) {
      notifiedPaymentToastRef.current = new Set([...notifiedPaymentToastRef.current].slice(-50));
    }
    gooeyToast.success(t("paymentReceivedAlert"), goeyToastOptions({
      id: "dashboard-payment-alert",
      description: `${payment.paymentNumber || t("payments")} · ${payment.tableNumber || ""}`
    }));
    return true;
  }

  if (!signedIn) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <div className="fixed right-4 top-4 flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="HappyBoat" className="h-12 w-12 rounded-md object-cover" />
              <div>
                <h1 className="text-xl font-semibold">{t("dashboardTitle")}</h1>
                <p className="text-sm text-muted-foreground">{t("dashboardSubtitle")}</p>
              </div>
            </div>
            {message ? <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</div> : null}
            <form className="space-y-3" onSubmit={signIn}>
              <Input value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} placeholder={t("username")} />
              <Input value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} type="password" placeholder={t("password")} />
              <Button className="w-full">
                <LogIn className="h-4 w-4" />
                {t("signIn")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="HappyBoat" className="h-10 w-10 rounded-md object-cover" />
            <div>
              <h1 className="text-lg font-semibold">HappyBoat</h1>
              <p className="text-xs text-muted-foreground">{t("liveRestaurantOps")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground sm:flex">
              {liveState === "connected" ? <Wifi className="h-3.5 w-3.5 text-primary" /> : <WifiOff className="h-3.5 w-3.5 text-secondary-foreground" />}
              <span>{liveState === "connected" ? t("live") : t("polling")}</span>
              {lastUpdatedAt ? <span>{t("updated")} {formatClockTime(lastUpdatedAt)}</span> : null}
            </div>
            <LanguageToggle />
            <Button variant="outline" className="px-3" onClick={testSound} aria-label={t("testOrderSound")}>
              {soundReady ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              <span className="hidden sm:inline">{t("alert")}</span>
            </Button>
            <ThemeToggle />
            <Button variant="outline" size="icon" onClick={loadAll} aria-label={t("refresh")}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-wrap gap-2">
          <TabButton active={tab === "orders"}    onClick={() => setTab("orders")}    icon={Clock}     label={t("orders")} />
          <TabButton active={tab === "menu"}      onClick={() => setTab("menu")}      icon={Utensils}  label={t("menu")} />
          <TabButton active={tab === "tables"}    onClick={() => setTab("tables")}    icon={Table2}    label={t("tables")} />
          <TabButton active={tab === "payments"}  onClick={() => setTab("payments")}  icon={CreditCard} label={t("payments")} />
          <TabButton active={tab === "promos"}    onClick={() => setTab("promos")}    icon={BadgePercent} label={t("promos")} />
          <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")} icon={BarChart3} label={t("analytics")} />
        </div>

        {tab === "orders" ? (
          <OrdersView
            orders={orders}
            selectedOrder={selectedOrder}
            onSelect={loadOrder}
            onClear={() => setSelectedOrder(null)}
            onStatus={updateOrderStatus}
            now={dashboardNow}
          />
        ) : null}

        {tab === "menu" ? (
          <MenuView menu={menu} request={request} reload={loadMenu} />
        ) : null}

        {tab === "tables" ? (
          <TablesView tables={tables} request={request} reload={loadTables} />
        ) : null}

        {tab === "payments" ? (
          <PaymentsView payments={payments} request={request} reload={loadPayments} />
        ) : null}

        {tab === "promos" ? (
          <PromoCodesView promos={promos} request={request} reload={loadPromos} />
        ) : null}

        {tab === "analytics" ? (
          <AnalyticsView analytics={analytics} error={analyticsError} lastUpdatedAt={lastUpdatedAt} onRefresh={loadAnalytics} />
        ) : null}
      </div>
    </main>
  );
}

// Orders

function OrdersView({ orders, selectedOrder, onSelect, onClear, onStatus, now }) {
  const { t } = useLanguage();
  const [sortKey, setSortKey]         = useState("time_desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const displayedOrders = useMemo(() => {
    let result = [...orders];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          o.orderNumber?.toLowerCase().includes(q) ||
          o.tableNumber?.toLowerCase().includes(q) ||
          o.firstItemName?.toLowerCase().includes(q) ||
          o.firstCategoryName?.toLowerCase().includes(q)
      );
    }

    // Payment status filter
    if (paymentFilter) {
      if (paymentFilter === "UNPAID") {
        result = result.filter((o) => !o.paymentStatus);
      } else {
        result = result.filter((o) => o.paymentStatus === paymentFilter);
      }
    }

    if (statusFilter) {
      result = result.filter((o) => o.status === statusFilter);
    }

    if (dateFilter) {
      result = result.filter((o) => isSameLocalDate(o.createdAt, dateFilter));
    }

    // Sort
    result.sort((a, b) => {
      switch (sortKey) {
        case "time_asc":
          return new Date(a.createdAt) - new Date(b.createdAt);
        case "time_desc":
          return new Date(b.createdAt) - new Date(a.createdAt);
        case "payment":
          return (a.paymentStatus || "UNPAID").localeCompare(b.paymentStatus || "UNPAID");
        case "status":
          return (a.status || "").localeCompare(b.status || "");
        case "category":
          return (a.firstCategoryName || "").localeCompare(b.firstCategoryName || "");
        case "item_name":
          return (a.firstItemName || "").localeCompare(b.firstItemName || "");
        case "table":
          return (a.tableNumber || "").localeCompare(b.tableNumber || "");
        case "order_no":
          return (a.orderNumber || "").localeCompare(b.orderNumber || "");
        default:
          return 0;
      }
    });

    return result;
  }, [orders, sortKey, statusFilter, paymentFilter, dateFilter, searchQuery]);
  const attentionOrders = useMemo(
    () => displayedOrders.filter((order) => needsKitchenAttention(order, now)),
    [displayedOrders, now]
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            {t("liveOrders")}
            <Badge tone="primary">{displayedOrders.length}</Badge>
          </CardTitle>
        </CardHeader>

        <div className="border-b border-border px-4 pb-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              placeholder={t("searchOrderTable")}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="pl-9 text-sm"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </Select>
            </div>
            <div className="relative">
              <Check className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-9 text-sm"
              >
                {ORDER_STATUS_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </Select>
            </div>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="pl-9 text-sm"
              >
                {PAYMENT_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </Select>
            </div>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDateFilter(dateInputValue(new Date()))}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              {t("today")}
            </button>
            {dateFilter ? (
              <button
                type="button"
                onClick={() => setDateFilter("")}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                {t("allDates")}
              </button>
            ) : null}
          </div>
        </div>

        <CardContent className="space-y-3 pt-3">
          {attentionOrders.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-secondary/40 bg-secondary/10 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <BellRing className="h-4 w-4 shrink-0 text-secondary-foreground" />
                {t("orderNeedsAttention")} · {attentionOrders.length}
              </span>
              <Button type="button" variant="outline" className="h-9 px-3 text-xs" onClick={() => onSelect(attentionOrders[0].id)}>
                {t("showDetail")}
              </Button>
            </div>
          ) : null}
          {displayedOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noOrdersFilter")}</p>
          ) : (
            displayedOrders.map((order) => {
              const firstItemImg = displayImageUrl(order.firstItemImageUrl || order.items?.[0]?.imageUrl);
              const firstItemName = order.firstItemName || order.items?.[0]?.itemName;
              const firstCategoryName = order.firstCategoryName;
              const needsAttention = needsKitchenAttention(order, now);
              return (
                <button
                  key={order.id}
                  onClick={() => onSelect(order.id)}
                  className={`w-full rounded-md border bg-card p-3 text-left transition hover:border-primary ${needsAttention ? "border-secondary shadow-sm shadow-secondary/10" : "border-border"}`}
                >
                  <div className="flex items-start gap-3">
                    {firstItemImg ? (
                      <img
                        src={firstItemImg}
                        alt=""
                        className="h-12 w-12 flex-shrink-0 rounded-md object-cover"
                        onError={replaceBrokenImage}
                      />
                    ) : (
                      <div className="h-12 w-12 flex-shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{order.orderNumber}</div>
                          <div className="text-sm text-muted-foreground">{order.tableNumber}</div>
	                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
	                            <Clock className="h-3 w-3" />
	                            {formatOrderDateTime(order.createdAt)}
                          </div>
                          <div className="mt-1">
                            <OrderMinutesBadge minutes={totalOrderMinutes(order, now)} />
                          </div>
                          {isAlreadyPaidOrder(order) ? (
                            <div className="mt-1">
                              <PaidMinutesBadge minutes={paidWaitingMinutes(order, now)} />
                            </div>
                          ) : null}
                          {firstItemName ? (
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {firstCategoryName ? `${firstCategoryName} - ` : ""}{firstItemName}
                            </div>
                          ) : null}
                          {order.promoCode ? (
                            <div className="mt-1 text-xs text-primary">{t("promoCode")}: {order.promoCode}</div>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge status={order.status} />
                          {needsAttention ? <AttentionBadge minutes={waitingMinutes(order, now)} /> : null}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span>{displayUsd(order.totalUsd)} / {khr(order.totalKhr)}</span>
                        <PaymentBadge status={order.paymentStatus} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
        <CardHeader>
          <CardTitle>{t("orderDetail")}</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
          <OrderDetailContent selectedOrder={selectedOrder} onStatus={onStatus} now={now} />
        </CardContent>
      </Card>

      {selectedOrder ? (
        <MobileOrderSheet
          selectedOrder={selectedOrder}
          onStatus={onStatus}
          onClose={onClear}
          now={now}
        />
      ) : null}
    </div>
  );
}

function MobileOrderSheet({ selectedOrder, onStatus, onClose, now }) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 backdrop-blur-sm lg:hidden" onClick={onClose}>
      <div
        className="bottom-sheet-animate max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-card text-card-foreground shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 p-4 backdrop-blur">
          <div>
            <h2 className="text-base font-semibold">{selectedOrder.orderNumber}</h2>
            <p className="text-xs text-muted-foreground">{selectedOrder.tableNumber} · {formatOrderDateTime(selectedOrder.createdAt)}</p>
          </div>
          <button onClick={onClose} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground" aria-label={t("close")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <OrderDetailContent selectedOrder={selectedOrder} onStatus={onStatus} now={now} />
        </div>
      </div>
    </div>
  );
}

function OrderDetailContent({ selectedOrder, onStatus, now }) {
  const { t } = useLanguage();
  if (!selectedOrder) {
    return <p className="text-sm text-muted-foreground">{t("selectOrderDetail")}</p>;
  }
  const needsAttention = needsKitchenAttention(selectedOrder, now);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold">{selectedOrder.orderNumber}</h2>
          <p className="text-sm text-muted-foreground">{selectedOrder.tableNumber}</p>
	          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
	            <Clock className="h-3 w-3" />
	            {formatOrderDateTime(selectedOrder.createdAt)}
	          </p>
          <div className="mt-2">
            <OrderMinutesBadge minutes={totalOrderMinutes(selectedOrder, now)} />
          </div>
          {isAlreadyPaidOrder(selectedOrder) ? (
            <div className="mt-2">
              <PaidMinutesBadge minutes={paidWaitingMinutes(selectedOrder, now)} />
            </div>
          ) : null}
        </div>
        <StatusBadge status={selectedOrder.status} />
      </div>

      {needsAttention ? (
        <div className="flex items-start gap-2 rounded-md border border-secondary/40 bg-secondary/10 px-3 py-2 text-sm">
          <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-secondary-foreground" />
          <span>{t("waitingTooLong")} · {waitingMinutes(selectedOrder, now)}m</span>
        </div>
      ) : null}

      <div className="space-y-2">
        {selectedOrder.items?.map((item) => (
          <div key={item.id} className="rounded-md border border-border p-3 text-sm">
            <div className="flex gap-3">
              {item.imageUrl ? (
                <img
                  src={displayImageUrl(item.imageUrl)}
                  alt={item.itemName}
                  className="h-14 w-14 flex-shrink-0 rounded-md object-cover"
                  onError={replaceBrokenImage}
                />
              ) : (
                <div className="h-14 w-14 flex-shrink-0 rounded-md bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{item.quantity} x {item.itemName}</span>
                  <span className="whitespace-nowrap">{displayUsd(item.subtotalUsd)}</span>
                </div>
                {item.spiceLevel && item.spiceLevel !== "NORMAL" ? (
                  <p className="text-xs text-muted-foreground">{item.spiceLevel}</p>
                ) : null}
                {item.specialInstructions ? (
                  <p className="text-xs italic text-muted-foreground">{item.specialInstructions}</p>
                ) : null}
                {item.addons?.map((addon) => (
                  <div key={addon.id} className="mt-1 flex justify-between text-muted-foreground">
                    <span>+ {addon.quantity} x {addon.addonName}</span>
                    <span>{displayUsd(addon.subtotalUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-md bg-muted p-3 text-sm">
        {selectedOrder.promoCode ? (
          <div className="mb-1 flex justify-between"><span>{t("promoCode")}</span><span className="font-medium">{selectedOrder.promoCode}</span></div>
        ) : null}
        <div className="flex justify-between"><span>{t("discount")}</span><span>{usd(selectedOrder.discountUsd)}</span></div>
        <div className="mt-1 flex justify-between font-semibold"><span>{t("total")}</span><span>{displayUsd(selectedOrder.totalUsd)}</span></div>
        <div className="mt-1 text-right text-muted-foreground">{khr(selectedOrder.totalKhr)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {NEXT_STATUS[selectedOrder.status] ? (
          <Button onClick={() => onStatus(selectedOrder.id, NEXT_STATUS[selectedOrder.status])}>
            <Check className="h-4 w-4" />
            {dashboardStatusLabel(NEXT_STATUS[selectedOrder.status], t)}
          </Button>
        ) : null}
        {!["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(selectedOrder.status) ? (
          <Button variant="destructive" onClick={() => onStatus(selectedOrder.id, "CANCELLED")}>
                    <X className="h-4 w-4" />
                    {t("cancel")}
          </Button>
        ) : null}
        <a className="col-span-2" href={`${API_BASE}/api/receipts/orders/${selectedOrder.id}.pdf`} target="_blank">
          <Button variant="outline" className="w-full">
            <Printer className="h-4 w-4" />
            {t("receipt")}
          </Button>
        </a>
      </div>
    </div>
  );
}

// Menu

function MenuView({ menu, request, reload }) {
  const { t } = useLanguage();
  const emptyForm = { categoryId: "", name: "", priceUsd: "", description: "", dietaryTags: "", imageUrl: "", available: true, sortOrder: 100 };
  const [form, setForm] = useState(emptyForm);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const items = menu.items.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase()));

  function resetForm(nextMessage = "") {
    setEditingItem(null);
    setForm(emptyForm);
    setMessage(nextMessage);
  }

  function editItem(item) {
    setEditingItem(item);
    setMessage("");
    setForm({
      categoryId: item.categoryId,
      name: item.name || "",
      priceUsd: String(item.priceUsd ?? ""),
      description: item.description || "",
      dietaryTags: item.dietaryTags || "",
      imageUrl: item.imageUrl || "",
      available: item.available,
      sortOrder: item.sortOrder ?? 100
    });
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append("file", file);
    const uploaded = await request("/api/admin/uploads/menu-images", { method: "POST", body: data });
    setForm((current) => ({ ...current, imageUrl: uploaded.url }));
  }

  async function saveItem(event) {
    event.preventDefault();
    setMessage("");
    const payload = {
      ...form,
      priceUsd: Number(form.priceUsd),
      priceKhr: null,
      available: Boolean(form.available),
      sortOrder: Number(form.sortOrder || 0)
    };
    await request(editingItem ? `/api/admin/menu/items/${editingItem.id}` : "/api/admin/menu/items", {
      method: editingItem ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    resetForm(editingItem ? t("menuItemUpdated") : t("menuItemCreated"));
    reload();
  }

  async function toggle(item) {
    await request(`/api/admin/menu/items/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        priceUsd: item.priceUsd,
        priceKhr: null,
        imageUrl: item.imageUrl,
        available: !item.available,
        dietaryTags: item.dietaryTags,
        sortOrder: item.sortOrder || 0
      })
    });
    reload();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="lg:sticky lg:top-24 lg:self-start">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>{editingItem ? t("editMenuItem") : t("newMenuItem")}</CardTitle>
          {editingItem ? (
            <Button type="button" variant="outline" onClick={resetForm}>{t("new")}</Button>
          ) : null}
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
          {message ? <div className="mb-3 rounded-md bg-muted px-3 py-2 text-sm">{message}</div> : null}
          <form className="space-y-3" onSubmit={saveItem}>
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              <option value="">{t("category")}</option>
              {menu.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("sortItemName")} required />
            <Input value={form.priceUsd} onChange={(e) => setForm({ ...form, priceUsd: e.target.value })} placeholder="USD" type="number" step="0.01" required />
            <Input value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} placeholder={t("sortOrderNo")} type="number" min="0" />
            <Select value={form.available ? "true" : "false"} onChange={(e) => setForm({ ...form, available: e.target.value === "true" })}>
              <option value="true">{t("available")}</option>
              <option value="false">{t("hidden")}</option>
            </Select>
            <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder={t("imageUrl")} />
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
              <Upload className="h-4 w-4" />
              {t("uploadImage")}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadImage} />
            </label>
            <Input value={form.dietaryTags} onChange={(e) => setForm({ ...form, dietaryTags: e.target.value })} placeholder={t("tagsLabel")} />
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("noDescription")} />
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full"><Check className="h-4 w-4" />{editingItem ? t("save") : t("create")}</Button>
              <Button type="button" variant="outline" className="w-full" onClick={resetForm}>{t("clearFilters")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t("menu")}</CardTitle>
            <div className="relative w-72 max-w-full">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder={t("search")} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid auto-rows-fr gap-3 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="flex h-full flex-col rounded-md border border-border p-3">
              <div className="flex flex-1 flex-col items-center gap-3 text-center">
                <img src={displayImageUrl(item.imageUrl)} alt={item.name} className="h-24 w-24 rounded-md object-cover" onError={replaceBrokenImage} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col items-center gap-2">
                    <h3 className="line-clamp-2 min-h-10 font-semibold">{item.name}</h3>
                    <Badge tone={item.available ? "primary" : "danger"}>{item.available ? t("available") : t("hidden")}</Badge>
                  </div>
                  <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{item.description}</p>
                  <div className="mt-2 flex min-h-7 flex-wrap justify-center gap-1">
                    {tags(item.dietaryTags).map((tag) => <Badge key={tag}>{tag}</Badge>)}
                  </div>
                </div>
              </div>
              <div className="mt-auto flex flex-col items-center gap-3 pt-3 text-sm">
                <span className="whitespace-nowrap">{displayUsd(item.priceUsd)} / {khr(item.priceKhr)}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => editItem(item)}><Pencil className="h-4 w-4" />{t("edit")}</Button>
                  <Button type="button" variant="outline" onClick={() => toggle(item)}>{item.available ? t("disable") : t("enable")}</Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// Tables

function TablesView({ tables, request, reload }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ tableNumber: "", label: "", capacity: 4, active: true });

  async function createTable(event) {
    event.preventDefault();
    await request("/api/admin/tables", { method: "POST", body: JSON.stringify(form) });
    setForm({ tableNumber: "", label: "", capacity: 4, active: true });
    reload();
  }

  function printTable(table) {
    const svg = document.querySelector(`[data-qr="${table.id}"] svg`);
    const qr = svg ? new XMLSerializer().serializeToString(svg) : "";
    const win = window.open("", "_blank");
    win.document.write(`<html><body style="font-family:sans-serif;text-align:center;padding:32px"><h1>HappyBoat</h1><h2>${table.label}</h2><div>${qr}</div><p>${table.qrUrl}</p></body></html>`);
    win.print();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <Card className="lg:sticky lg:top-24 lg:self-start">
        <CardHeader><CardTitle>{t("newTable")}</CardTitle></CardHeader>
        <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
          <form className="space-y-3" onSubmit={createTable}>
            <Input value={form.tableNumber} onChange={(e) => setForm({ ...form, tableNumber: e.target.value.toUpperCase() })} placeholder="T05" required />
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t("label")} required />
            <Input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} placeholder={t("capacity")} type="number" min="1" />
            <Button className="w-full">{t("create")}</Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((table) => (
          <Card key={table.id}>
            <CardContent className="space-y-3 text-center">
              <div className="flex items-start justify-between text-left">
                <div>
                  <h3 className="font-semibold">{table.label}</h3>
                  <p className="text-sm text-muted-foreground">{table.tableNumber}</p>
                </div>
                <Badge tone={table.active ? "primary" : "danger"}>{table.active ? t("available") : t("inactive")}</Badge>
              </div>
              <div className="inline-flex rounded-lg border border-border bg-[#fff] p-3 text-[#000]" data-qr={table.id}>
                <QRCodeSVG value={table.qrUrl} size={160} includeMargin />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => downloadSvg(table.id, `${table.tableNumber}.svg`)}>
                  <Download className="h-4 w-4" />SVG
                </Button>
                <Button variant="outline" onClick={() => printTable(table)}>
                  <Printer className="h-4 w-4" />{t("print")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Payments

function PaymentsView({ payments, request, reload }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [message, setMessage] = useState("");

  async function select(paymentId) {
    setMessage("");
    setSelected(await request(`/api/admin/payments/${paymentId}`));
  }

  async function confirmPaid(paymentId) {
    if (!paymentId || confirmingId) return;

    const ok = window.confirm(
      t("confirmPaymentPrompt")
    );
    if (!ok) return;

    setMessage("");
    setConfirmingId(paymentId);
    try {
      const updated = await request(`/api/admin/payments/${paymentId}/confirm-paid`, { method: "POST" });
      setSelected(updated);
      await reload();
      setMessage(t("paymentMarkedPaid"));
    } catch (error) {
      setMessage(error.message || t("failedConfirmPayment"));
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_440px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("payments")}</CardTitle>
          <Button variant="outline" size="icon" onClick={reload} aria-label={t("refresh")}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {message ? (
            <div className="flex items-start gap-2 rounded-md border border-secondary/40 bg-secondary/10 px-3 py-2 text-sm">
              {message === t("paymentMarkedPaid") ? <Check className="mt-0.5 h-4 w-4 text-primary" /> : null}
              <span>{message}</span>
            </div>
          ) : null}
          {payments.map((payment) => (
            <button key={payment.id} onClick={() => select(payment.id)} className="w-full rounded-md border border-border p-4 text-left hover:border-primary">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="font-semibold">{payment.paymentNumber}</div>
                  <div className="text-sm text-muted-foreground">{payment.orderNumber} - {payment.tableNumber}</div>
                </div>
                <StatusBadge status={payment.status} />
              </div>
              <div className="mt-2 text-sm">{displayUsd(payment.amountUsd)} / {khr(payment.amountKhr)}</div>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card className="lg:sticky lg:top-24 lg:self-start">
        <CardHeader><CardTitle>{t("transactionLog")}</CardTitle></CardHeader>
        <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
          {!selected ? <p className="text-sm text-muted-foreground">{t("selectPayment")}</p> : (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{selected.paymentNumber}</div>
                    <div className="break-all text-muted-foreground">{selected.khqrMd5}</div>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="mt-3 grid gap-2 rounded-md bg-muted p-3 text-xs">
                  <div><b>{t("order")}:</b> {selected.orderNumber || selected.orderId}</div>
                  <div><b>{t("reference")}:</b> {selected.bakongReference || "-"}</div>
                  <div><b>{t("transaction")}:</b> {selected.bakongTransactionHash || "-"}</div>
                  <div><b>{t("total")}:</b> {displayUsd(selected.amountUsd)} / {khr(selected.amountKhr)}</div>
                </div>
              </div>

              {selected.status !== "PAID" ? (
                <Button
                  className="w-full"
                  onClick={() => confirmPaid(selected.id)}
                  disabled={confirmingId === selected.id}
                >
                  {confirmingId === selected.id ? t("confirming") : t("confirmPaid")}
                </Button>
              ) : (
                <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                  {t("paymentAlreadyPaid")}
                </div>
              )}

              <div className="max-h-[60vh] space-y-2 overflow-auto">
                {(selected.transactions || []).map((tx) => (
                  <pre key={tx.id} className="overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(tx, null, 2)}</pre>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Promos

function PromoCodesView({ promos, request, reload }) {
  const { t } = useLanguage();
  const emptyForm = { code: "", description: "", discountType: "PERCENT", discountValue: "", maxDiscountUsd: "", active: true };
  const [form, setForm] = useState(emptyForm);
  const [editingPromo, setEditingPromo] = useState(null);
  const [message, setMessage] = useState("");

  function resetForm(nextMessage = "") {
    setEditingPromo(null);
    setForm(emptyForm);
    setMessage(nextMessage);
  }

  function editPromo(promo) {
    setEditingPromo(promo);
    setMessage("");
    setForm({
      code: promo.code || "",
      description: promo.description || "",
      discountType: promo.discountType || "PERCENT",
      discountValue: String(promo.discountValue ?? ""),
      maxDiscountUsd: String(promo.maxDiscountUsd ?? ""),
      active: Boolean(promo.active)
    });
  }

  async function savePromo(event) {
    event.preventDefault();
    setMessage("");
    const payload = {
      ...form,
      code: form.code.trim().toUpperCase(),
      discountValue: Number(form.discountValue || 0),
      maxDiscountUsd: form.discountType === "PERCENT" && form.maxDiscountUsd !== ""
        ? Number(form.maxDiscountUsd)
        : null,
      active: Boolean(form.active)
    };
    await request(editingPromo ? `/api/admin/promos/${editingPromo.id}` : "/api/admin/promos", {
      method: editingPromo ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    resetForm(editingPromo ? t("promoCodeUpdated") : t("promoCodeCreated"));
    reload();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="lg:sticky lg:top-24 lg:self-start">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>{editingPromo ? t("editPromoCode") : t("newPromoCode")}</CardTitle>
          {editingPromo ? (
            <Button type="button" variant="outline" onClick={resetForm}>{t("new")}</Button>
          ) : null}
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
          {message ? <div className="mb-3 rounded-md bg-muted px-3 py-2 text-sm">{message}</div> : null}
          <form className="space-y-3" onSubmit={savePromo}>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder={t("promoCode")}
              required
            />
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t("noDescription")}
            />
            <Select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
              <option value="PERCENT">{t("percentDiscount")}</option>
              <option value="FIXED_USD">{t("fixedUsdDiscount")}</option>
            </Select>
            <Input
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              placeholder={form.discountType === "PERCENT" ? t("percentDiscount") : "USD"}
              type="number"
              min="0"
              step="0.01"
              required
            />
            {form.discountType === "PERCENT" ? (
              <Input
                value={form.maxDiscountUsd}
                onChange={(e) => setForm({ ...form, maxDiscountUsd: e.target.value })}
                placeholder={t("maxDiscountUsd")}
                type="number"
                min="0"
                step="0.01"
              />
            ) : null}
            <Select value={form.active ? "true" : "false"} onChange={(e) => setForm({ ...form, active: e.target.value === "true" })}>
              <option value="true">{t("available")}</option>
              <option value="false">{t("inactive")}</option>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full"><Check className="h-4 w-4" />{editingPromo ? t("save") : t("create")}</Button>
              <Button type="button" variant="outline" className="w-full" onClick={resetForm}>{t("clearFilters")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("promoCodes")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {promos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPromoCodes")}</p>
          ) : (
            promos.map((promo) => (
              <div key={promo.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{promo.code}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{promo.description || t("noDescription")}</p>
                  </div>
                  <Badge tone={promo.active ? "primary" : "danger"}>{promo.active ? t("available") : t("inactive")}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span>{formatPromoValue(promo)}</span>
                  <Button type="button" variant="outline" onClick={() => editPromo(promo)}>
                    <Pencil className="h-4 w-4" />
                    {t("edit")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Analytics

function AnalyticsView({ analytics, error, lastUpdatedAt, onRefresh }) {
  const { t } = useLanguage();
  if (!analytics) {
    return (
      <Card>
        <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>{error || t("loadingAnalytics")}</span>
          {error ? (
            <Button type="button" variant="outline" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              {t("refresh")}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const dailyOrders = Number(analytics.daily?.dailyOrderCount || 0);
  const weeklyOrders = Number(analytics.weekly?.weeklyOrderCount || 0);
  const dailyRevenue = Number(analytics.daily?.dailyRevenueUsd || 0);
  const weeklyRevenue = Number(analytics.weekly?.weeklyRevenueUsd || 0);
  const activeOrders = sumRows(analytics.orderCountByStatus, "count", (row) =>
    ["PENDING_PAYMENT", "PAID", "RECEIVED", "PREPARING", "READY"].includes(row.status)
  );
  const paidPayments = sumRows(analytics.paymentBreakdown, "count", (row) => row.paymentMethod !== "UNPAID");
  const totalPayments = sumRows(analytics.paymentBreakdown, "count");
  const paymentRate = totalPayments ? Math.round((paidPayments / totalPayments) * 100) : 0;
  const topItem = analytics.topSellingItems?.[0];
  const topTable = analytics.revenueByTable?.[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("analytics")}</h2>
          <p className="text-sm text-muted-foreground">
            {lastUpdatedAt ? `${t("updated")} ${formatClockTime(lastUpdatedAt)}` : t("liveRestaurantOps")}
          </p>
        </div>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
          {t("refresh")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CalendarDays} title={t("dailyRevenue")} value={usd(dailyRevenue)} sub={`${dailyOrders} ${t("orders")} · ${khr(analytics.daily?.dailyRevenueKhr)}`} tone="primary" />
        <Metric icon={BarChart3} title={t("weeklyRevenue")} value={usd(weeklyRevenue)} sub={`${weeklyOrders} ${t("orders")} · ${khr(analytics.weekly?.weeklyRevenueKhr)}`} tone="accent" />
        <Metric icon={CreditCard} title={t("averageOrder")} value={usd(analytics.averageOrderValue?.averageOrderValueUsd)} sub={khr(analytics.averageOrderValue?.averageOrderValueKhr)} tone="secondary" />
        <Metric icon={Clock} title={t("activeOrders")} value={String(activeOrders)} sub={`${paymentRate}% ${t("paidPayments")}`} tone="muted" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <ItemDonutChart rows={analytics.topSellingItems} />
        <PaidRevenueLineChart rows={analytics.paidRevenueByDay} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>{t("sortStatus")}</CardTitle>
            <Badge tone="secondary">{activeOrders} {t("active")}</Badge>
          </CardHeader>
          <CardContent>
            <StatusFunnel rows={analytics.orderCountByStatus} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("highlights")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <HighlightRow icon={Utensils} label={t("topItems")} value={topItem?.itemName || "-"} sub={topItem ? `${topItem.quantity} sold · ${usd(topItem.revenueUsd)}` : "-"} />
            <HighlightRow icon={Table2} label={t("revenueByTable")} value={topTable?.tableNumber || "-"} sub={topTable ? `${topTable.orders} ${t("orders")} · ${usd(topTable.revenueUsd)}` : "-"} />
            <HighlightRow icon={CreditCard} label={t("payments")} value={`${paymentRate}% ${t("paid")}`} sub={`${paidPayments}/${totalPayments || 0} ${t("payments")}`} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AnalyticsBarsCard title={t("topItems")} rows={analytics.topSellingItems} label="itemName" value="quantity" detailValue="revenueUsd" detailCurrency />
        <AnalyticsBarsCard title={t("revenueByTable")} rows={analytics.revenueByTable} label="tableNumber" value="revenueUsd" currency detailValue="orders" />
        <AnalyticsBarsCard title={t("paymentBreakdown")} rows={analytics.paymentBreakdown} label="paymentMethod" value="count" detailValue="amountUsd" detailCurrency />
        <PeakHoursCard rows={analytics.peakHours} />
      </div>
    </div>
  );
}

// Shared components

function TabButton({ active, icon: Icon, label, ...props }) {
  return (
    <Button variant={active ? "default" : "outline"} {...props}>
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

function StatusBadge({ status }) {
  const { t } = useLanguage();
  const tone =
    status === "PAID" || status === "COMPLETED" ? "primary" :
    status === "RECEIVED" ? "info" :
    status === "CANCELLED" || status === "REJECTED" || status === "EXPIRED" ? "danger" :
    "secondary";
  return <Badge tone={tone}>{dashboardStatusLabel(status, t)}</Badge>;
}

function PaymentBadge({ status }) {
  const { t } = useLanguage();
  if (!status) return <Badge>{t("unpaid")}</Badge>;
  const tone =
    status === "PAID" ? "primary" :
    status === "EXPIRED" ? "danger" :
    status === "PENDING" ? "secondary" :
    "muted";
  return <Badge tone={tone}>{dashboardStatusLabel(status, t)}</Badge>;
}

function AttentionBadge({ minutes }) {
  const { t } = useLanguage();
  return (
    <Badge tone="accent" className="gap-1">
      <BellRing className="h-3 w-3" />
      {t("alert")} {minutes}m
    </Badge>
  );
}

function OrderMinutesBadge({ minutes }) {
  const { t } = useLanguage();
  return (
    <Badge tone="muted" className="gap-1">
      <Clock className="h-3 w-3" />
      {t("totalMinutes")} {minutes}m
    </Badge>
  );
}

function PaidMinutesBadge({ minutes }) {
  const { t } = useLanguage();
  return (
    <Badge tone="primary" className="gap-1">
      <Clock className="h-3 w-3" />
      {t("paidMinutes")} {minutes}m
    </Badge>
  );
}

function dashboardStatusLabel(status, t) {
  const labels = {
    PENDING_PAYMENT: t("awaitingPayment"),
    PAID: t("paid"),
    RECEIVED: t("receivedByStaff"),
    PREPARING: t("preparing"),
    READY: t("readyForPickup"),
    COMPLETED: t("completed"),
    REJECTED: t("rejected"),
    CANCELLED: t("cancelled"),
    EXPIRED: t("expired"),
    PENDING: t("pending"),
    UNPAID: t("unpaid")
  };
  return labels[status] || status || "-";
}

function formatPromoValue(promo) {
  if (promo.discountType === "PERCENT") {
    const maxDiscount = promo.maxDiscountUsd == null ? "" : `, max ${usd(promo.maxDiscountUsd)}`;
    return `${Number(promo.discountValue || 0).toFixed(2)}% off${maxDiscount}`;
  }
  return `${usd(promo.discountValue)} off`;
}

function formatOrderDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year} ${formatClockTime(date)}`;
}

function formatClockTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return [
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  ].map((part) => String(part).padStart(2, "0")).join(":");
}

function dateInputValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameLocalDate(value, targetDate) {
  return dateInputValue(value) === targetDate;
}

function isPaidKitchenOrder(order) {
  return ["PAID", "RECEIVED", "PREPARING"].includes(order?.status);
}

function isAlreadyPaidOrder(order) {
  return ["PAID", "RECEIVED", "PREPARING", "READY", "COMPLETED"].includes(order?.status) || order?.paymentStatus === "PAID";
}

function needsKitchenAttention(order, now = Date.now()) {
  return isPaidKitchenOrder(order) && waitingMs(order, now) >= ORDER_ATTENTION_MS;
}

function waitingMinutes(order, now = Date.now()) {
  return Math.max(0, Math.floor(waitingMs(order, now) / 60000));
}

function totalOrderMinutes(order, now = Date.now()) {
  const createdAt = new Date(order?.createdAt).getTime();
  if (!order?.createdAt || Number.isNaN(createdAt)) return 0;
  return Math.max(0, Math.floor((now - createdAt) / 60000));
}

function paidWaitingMinutes(order, now = Date.now()) {
  const paidAt = new Date(order?.paidAt || order?.createdAt).getTime();
  if (Number.isNaN(paidAt)) return 0;
  return Math.max(0, Math.floor((now - paidAt) / 60000));
}

function waitingMs(order, now = Date.now()) {
  const baseValue = order?.paidAt || order?.createdAt;
  const baseTime = new Date(baseValue).getTime();
  if (!baseValue || Number.isNaN(baseTime)) return 0;
  return Math.max(0, now - baseTime);
}

function formatApiError(error, fallback) {
  const status = error?.status ? `${error.status} ` : "";
  const message = error?.message && !error.message.startsWith("<") ? error.message : fallback;
  return `${fallback}${status ? ` (${status.trim()})` : ""}${message && message !== fallback ? `: ${message}` : ""}`;
}

function Metric({ icon: Icon, title, value, sub, tone = "primary" }) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/20 text-secondary-foreground",
    accent: "bg-accent/10 text-accent",
    muted: "bg-muted text-muted-foreground"
  }[tone] || "bg-primary/10 text-primary";

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-semibold leading-tight">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function HighlightRow({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-card">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

function ItemDonutChart({ rows = [] }) {
  const { t } = useLanguage();
  const totalQuantity = sumRows(rows, "quantity");
  const segments = rows.slice(0, 6).map((row, index) => ({
    label: row.itemName,
    value: Number(row.quantity || 0),
    revenueUsd: Number(row.revenueUsd || 0),
    color: DONUT_COLORS[index % DONUT_COLORS.length]
  })).filter((row) => row.value > 0);
  let offset = 25;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ordersByItem")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
        <div className="relative mx-auto h-44 w-44">
          <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
            <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="7" />
            {segments.map((segment) => {
              const percent = totalQuantity ? (segment.value / totalQuantity) * 100 : 0;
              const circle = (
                <circle
                  key={segment.label}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="transparent"
                  stroke={segment.color}
                  strokeWidth="7"
                  strokeDasharray={`${percent} ${100 - percent}`}
                  strokeDashoffset={offset}
                />
              );
              offset -= percent;
              return circle;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-bold">{totalQuantity}</div>
            <div className="text-xs text-muted-foreground">{t("itemsSold")}</div>
          </div>
        </div>
        <div className="space-y-2">
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">-</p>
          ) : segments.map((segment) => (
            <div key={segment.label} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                <span className="truncate">{segment.label}</span>
              </span>
              <span className="shrink-0 font-semibold">{segment.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PaidRevenueLineChart({ rows = [] }) {
  const { t } = useLanguage();
  const points = rows.map((row) => ({
    day: formatShortDay(row.day),
    paidUsd: Number(row.paidUsd || 0),
    payments: Number(row.payments || 0)
  }));
  const totalPaid = points.reduce((sum, point) => sum + point.paidUsd, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{t("paidRevenueByDay")}</CardTitle>
        <Badge tone="primary">{usd(totalPaid)}</Badge>
      </CardHeader>
      <CardContent>
        <AnalyticsLineChart
          data={points}
          xKey="day"
          yKey="paidUsd"
          label={t("paidRevenueByDay")}
          color="hsl(var(--primary))"
        />
      </CardContent>
    </Card>
  );
}

function StatusFunnel({ rows = [] }) {
  const orderedStatuses = ["PENDING_PAYMENT", "PAID", "RECEIVED", "PREPARING", "READY", "COMPLETED", "CANCELLED", "EXPIRED", "REJECTED"];
  const sortedRows = [...rows].sort((a, b) => orderedStatuses.indexOf(a.status) - orderedStatuses.indexOf(b.status));
  const maxValue = Math.max(1, ...sortedRows.map((row) => Number(row.count || 0)));

  if (sortedRows.length === 0) {
    return <p className="text-sm text-muted-foreground">-</p>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {sortedRows.map((row) => {
        const count = Number(row.count || 0);
        return (
          <div key={row.status} className="rounded-md border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <StatusBadge status={row.status} />
              <span className="text-lg font-semibold">{count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(5, (count / maxValue) * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsBarsCard({ title, rows = [], label, value, currency, detailValue, detailCurrency }) {
  const { t } = useLanguage();
  const maxValue = Math.max(1, ...rows.map((row) => Number(row[value] || 0)));
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">-</p>
        ) : rows.map((row) => {
          const amount = Number(row[value] || 0);
          const detail = detailValue == null ? null : row[detailValue];
          return (
            <div key={row[label]} className="space-y-1.5">
              <div className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{row[label]}</span>
                <span className="shrink-0 font-semibold">{currency ? usd(amount) : amount}</span>
              </div>
              {detailValue != null ? (
                <div className="text-xs text-muted-foreground">
                  {detailCurrency ? usd(detail) : `${detail} ${detailValue === "orders" ? t("orders") : ""}`}
                </div>
              ) : null}
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (amount / maxValue) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PeakHoursCard({ rows = [] }) {
  const { t } = useLanguage();
  const maxValue = Math.max(1, ...rows.map((row) => Number(row.orders || 0)));
  return (
    <Card>
      <CardHeader><CardTitle>{t("peakHours")}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        {rows.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">-</p>
        ) : rows.map((row) => {
          const orders = Number(row.orders || 0);
          return (
            <div key={row.hour} className="rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{formatHour(row.hour)}</span>
                <span className="text-muted-foreground">{orders}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-secondary" style={{ width: `${Math.max(6, (orders / maxValue) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function sumRows(rows = [], key, predicate = () => true) {
  return rows
    .filter(predicate)
    .reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

function formatHour(hour) {
  const normalized = Number(hour || 0);
  return `${String(normalized).padStart(2, "0")}:00`;
}

function formatShortDay(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function maxBy(rows = [], key) {
  return rows.reduce((best, row) => {
    if (!best) return row;
    return Number(row[key] || 0) > Number(best[key] || 0) ? row : best;
  }, null);
}

// Utilities

function upsertById(items, item) {
  const exists = items.some((entry) => entry.id === item.id);
  return exists
    ? items.map((entry) => (entry.id === item.id ? { ...entry, ...item } : entry))
    : [item, ...items];
}

function downloadSvg(tableId, filename) {
  const svg = document.querySelector(`[data-qr="${tableId}"] svg`);
  if (!svg) return;
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function displayImageUrl(url) {
  if (!url) return "/logo.png";
  return String(url).replace(/^http:\/\/minio:9000/i, "http://localhost:9000");
}

function replaceBrokenImage(event) {
  if (event.currentTarget.src.endsWith("/logo.png")) return;
  event.currentTarget.src = "/logo.png";
}
