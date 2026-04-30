"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { gooeyToast } from "goey-toast";
import { AlertCircle, BadgePercent, CheckCircle2, ChevronRight, ChevronUp, Clock, Download, Minus, Plus, Search, ShoppingBag, Trash2, Utensils, X, Zap } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { goeyToastOptions } from "@/lib/goey-toast-options";
import { cn, displayUsd, khr, tags, usd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const PRICE_FILTERS = [
  { value: "all", label: "All" },
  { value: "under_3", label: "Under $3" },
  { value: "3_5", label: "$3–$5" },
  { value: "5_10", label: "$5–$10" },
  { value: "10_plus", label: "$10+" },
];

const CUSTOMER_STORAGE_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_CART_TOTAL_USD = 0.01;
const CUSTOMER_ALERT_AFTER_MS = 10 * 60 * 1000;

export default function CustomerOrderingApp({ tableNumber }) {
  const { t } = useLanguage();
  const [table, setTable] = useState(null);
  const [menu, setMenu] = useState({ categories: [], items: [], addons: [], options: [] });
  const [categoryId, setCategoryId] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoState, setPromoState] = useState({ status: "idle", message: "", detail: null, showDetail: false });
  const [cartOpen, setCartOpen] = useState(false);

  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState({});
  const [deletedOrderIds, setDeletedOrderIds] = useState([]);
  const [alertedOrderIds, setAlertedOrderIds] = useState([]);
  const [loadedStorageScope, setLoadedStorageScope] = useState("");
  const [openPaymentOrderId, setOpenPaymentOrderId] = useState(null);

  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alertingOrderId, setAlertingOrderId] = useState(null);

  const pollingInFlight = useRef({});
  const paidToastShown = useRef({});
  const cartRef = useRef(null);
  const customerAudioRef = useRef(null);
  const lastOrderStatusRef = useRef({});
  const welcomeToastShown = useRef(false);

  const storageKeys = useMemo(() => ({
    cart: customerStorageKey(tableNumber, "cart"),
    orders: customerStorageKey(tableNumber, "orders"),
    payments: customerStorageKey(tableNumber, "payments"),
    deletedOrders: customerStorageKey(tableNumber, "deleted-orders"),
    alertedOrders: customerStorageKey(tableNumber, "alerted-orders"),
  }), [tableNumber]);

  const unlockCustomerAlert = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      customerAudioRef.current = customerAudioRef.current || new AudioContext();
      if (customerAudioRef.current.state === "suspended") {
        customerAudioRef.current.resume().catch(() => {});
      }
    } catch {
      // Audio unlock is best-effort on mobile browsers.
    }
  }, []);

  const playCustomerAlert = useCallback(() => {
    try {
      if (navigator.vibrate) {
        navigator.vibrate([220, 90, 220, 90, 320]);
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = customerAudioRef.current || new AudioContext();
      customerAudioRef.current = ctx;
      const play = () => {
        const nowTime = ctx.currentTime;
        [0, 0.2, 0.4].forEach((offset, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(index % 2 === 0 ? 880 : 1174, nowTime + offset);
          gain.gain.setValueAtTime(0.0001, nowTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.13, nowTime + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, nowTime + offset + 0.16);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(nowTime + offset);
          osc.stop(nowTime + offset + 0.18);
        });
      };
      if (ctx.state === "suspended") {
        ctx.resume().then(play).catch(() => {});
        return;
      }
      play();
    } catch {
      // Notifications should not block ordering.
    }
  }, []);

  const showToast = useCallback((text, variant = "success") => {
    const options = goeyToastOptions();
    if (variant === "error") {
      gooeyToast.error(text, options);
      return;
    }
    gooeyToast.success(text, options);
  }, []);

  const showAddedToCartToast = useCallback((item) => {
    const toastId = "customer-cart-added";
    gooeyToast.success(t("addedToCartTitle"), goeyToastOptions({
      id: toastId,
      description: `${item.name} · ${t("quantity")}: ${item.quantity}`,
      icon: <ShoppingBag className="h-4 w-4" />,
      action: {
        label: t("viewCart"),
        onClick: () => {
          setCartOpen(true);
          gooeyToast.dismiss(toastId);
        },
      },
    }));
  }, [t]);

  const notifyPaymentReceived = useCallback((orderId) => {
    const text = t("paymentReceived");
    setMessage(text);
    if (paidToastShown.current[orderId]) return;
    paidToastShown.current[orderId] = true;
    playCustomerAlert();
    showToast(text);
  }, [playCustomerAlert, showToast, t]);

  const notifyOrderStatusChanged = useCallback((order) => {
    const statusText = customerStatusLabel(order.status, t);
    setMessage(`${t("orderStatusUpdated")}: ${statusText}`);
    playCustomerAlert();
    gooeyToast.info(t("orderStatusUpdated"), goeyToastOptions({
      id: `customer-order-status-${order.id || order.orderNumber || "latest"}`,
      description: `${order.orderNumber || t("order")} · ${statusText}`,
      icon: <Clock className="h-4 w-4" />,
    }));
  }, [playCustomerAlert, t]);

  useEffect(() => {
    setLoadedStorageScope("");
    setCart(readCustomerStorage(storageKeys.cart, []));
    setOrders(readCustomerStorage(storageKeys.orders, []));
    setPayments(readCustomerStorage(storageKeys.payments, {}));
    setDeletedOrderIds(readCustomerStorage(storageKeys.deletedOrders, []));
    setAlertedOrderIds(readCustomerStorage(storageKeys.alertedOrders, []));
    paidToastShown.current = {};
    lastOrderStatusRef.current = {};
    setOpenPaymentOrderId(null);
    setLoadedStorageScope(storageKeys.cart);
  }, [storageKeys.alertedOrders, storageKeys.cart, storageKeys.deletedOrders, storageKeys.orders, storageKeys.payments]);

  useEffect(() => {
    orders.forEach((order) => {
      if (order?.id && order.status && !lastOrderStatusRef.current[order.id]) {
        lastOrderStatusRef.current[order.id] = order.status;
      }
    });
  }, [orders]);

  useEffect(() => {
    if (loadedStorageScope !== storageKeys.cart) return;
    writeCustomerStorage(storageKeys.cart, cart);
    writeCustomerStorage(storageKeys.orders, orders);
    writeCustomerStorage(storageKeys.payments, payments);
    writeCustomerStorage(storageKeys.deletedOrders, deletedOrderIds);
    writeCustomerStorage(storageKeys.alertedOrders, alertedOrderIds);
  }, [alertedOrderIds, cart, deletedOrderIds, loadedStorageScope, orders, payments, storageKeys.alertedOrders, storageKeys.cart, storageKeys.deletedOrders, storageKeys.orders, storageKeys.payments]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      welcomeToastShown.current = false;
      try {
        const [tableData, menuData] = await Promise.all([
          api(`/api/customer/tables/${tableNumber}`),
          api("/api/customer/menu"),
        ]);
        setTable(tableData);
        setMenu(menuData);
      } catch (error) {
        setMessage(error.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tableNumber]);

  useEffect(() => {
    if (loading || !table || welcomeToastShown.current) return;
    const tableLabel = customerTableLabel(table, tableNumber, t);
    if (!tableLabel) return;
    welcomeToastShown.current = true;
    gooeyToast.info(t("welcomeTitle"), goeyToastOptions({
      id: `customer-welcome-${tableNumber}`,
      description: `${t("youAreAtTable")} ${tableLabel}`,
      icon: <Utensils className="h-4 w-4" />,
    }));
  }, [loading, table, tableNumber, t]);

  useEffect(() => {
    const pending = Object.entries(payments).filter(([, p]) => p && p.status === "PENDING");
    if (pending.length === 0) return;
    const timer = setInterval(async () => {
      for (const [orderId, payment] of pending) {
        if (pollingInFlight.current[payment.id]) continue;
        pollingInFlight.current[payment.id] = true;
        try {
          const verified = await api(`/api/payments/${payment.id}/verify`, { method: "POST" });
          setPayments((prev) => ({ ...prev, [orderId]: verified }));
          if (verified.status === "PAID") {
            lastOrderStatusRef.current[orderId] = "RECEIVED";
            setOrders((prev) => prev.map((order) => order.id === orderId ? { ...order, status: "RECEIVED", paidAt: verified.paidAt || new Date().toISOString() } : order));
            notifyPaymentReceived(orderId);
          }
        } catch {}
        finally { pollingInFlight.current[payment.id] = false; }
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [payments, notifyPaymentReceived]);

  useEffect(() => {
    const hasPending = Object.values(payments).some((p) => p && p.status === "PENDING");
    const hasPaidKitchenOrder = orders.some((order) => canRequestStaffAlert(order, Date.now(), { ignoreAge: true }));
    if (!hasPending && !hasPaidKitchenOrder) return;
    const timer = setInterval(() => setNow(Date.now()), hasPending ? 1000 : 30000);
    return () => clearInterval(timer);
  }, [orders, payments]);

  const filteredItems = useMemo(() => {
    return menu.items.filter((item) => {
      const matchesCategory = !categoryId || item.categoryId === categoryId;
      const matchesPrice = priceMatches(item, priceFilter);
      const text = `${item.name} ${item.description} ${item.dietaryTags}`.toLowerCase();
      return matchesCategory && matchesPrice && text.includes(query.toLowerCase());
    });
  }, [menu.items, categoryId, priceFilter, query]);

  const groupedAddons = useMemo(() => groupBy(menu.addons, "menuItemId"), [menu.addons]);
  const groupedOptions = useMemo(() => groupBy(menu.options, "menuItemId"), [menu.options]);

  const totals = useMemo(() => {
    const subtotalUsd = cart.reduce((sum, item) => sum + Number(item.lineUsd || 0), 0);
    const rawDiscountUsd = promoState.status === "valid"
      ? promoDiscountForSubtotal(promoState.detail, subtotalUsd)
      : 0;
    const maxDiscountUsd = cart.length > 0 ? Math.max(0, subtotalUsd - MIN_CART_TOTAL_USD) : subtotalUsd;
    const discountUsd = Math.min(rawDiscountUsd, maxDiscountUsd);
    const totalUsd = Math.max(0, subtotalUsd - discountUsd);
    const billableTotalUsd = cart.length > 0 ? Math.max(MIN_CART_TOTAL_USD, totalUsd) : 0;
    const totalKhr = Math.round(billableTotalUsd * Number(menu.exchangeRateKhrPerUsd || 4100));
    return { subtotalUsd, discountUsd, totalUsd: billableTotalUsd, totalKhr };
  }, [cart, menu.exchangeRateKhrPerUsd, promoState.detail, promoState.status]);

  const visibleOrders = useMemo(() => {
    const deleted = new Set(deletedOrderIds);
    return orders.filter((order) => !deleted.has(order.id));
  }, [deletedOrderIds, orders]);

  useEffect(() => {
    if (visibleOrders.length === 0) return;

    let cancelled = false;
    async function refreshVisibleOrderStatuses() {
      for (const order of visibleOrders) {
        if (!order?.id) continue;
        try {
          const updated = await api(`/api/customer/orders/${order.id}`);
          if (cancelled) return;
          applyCustomerOrderUpdate(updated, { notify: true });
        } catch {
          // Status refresh is best-effort; the next poll will retry.
        }
      }
    }

    refreshVisibleOrderStatuses();
    const timer = setInterval(refreshVisibleOrderStatuses, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleOrders]);

  function secsRemaining(payment) {
    if (!payment?.expiredAt) return 0;
    return Math.max(0, Math.floor((new Date(payment.expiredAt).getTime() - now) / 1000));
  }

  function applyCustomerOrderUpdate(updated, options = {}) {
    if (!updated?.id) return;
    const previousStatus = lastOrderStatusRef.current[updated.id];
    if (updated.status) {
      lastOrderStatusRef.current[updated.id] = updated.status;
    }
    setOrders((current) => {
      const existing = current.find((order) => order.id === updated.id);
      if (
        existing &&
        existing.status === updated.status &&
        existing.updatedAt === updated.updatedAt &&
        existing.totalUsd === updated.totalUsd &&
        existing.totalKhr === updated.totalKhr
      ) {
        return current;
      }
      return upsertById(current, updated);
    });
    if (options.notify && previousStatus && updated.status && previousStatus !== updated.status) {
      notifyOrderStatusChanged(updated);
    }
  }

  function addConfiguredItem(configured) {
    unlockCustomerAlert();
    setCart((current) => [...current, { ...configured, cartId: crypto.randomUUID() }]);
    setActiveItem(null);
    showAddedToCartToast(configured);
  }

  function handlePromoCodeChange(value) {
    setPromoCode(value.toUpperCase());
    setPromoState({ status: "idle", message: "", detail: null, showDetail: false });
  }

  async function applyPromoCode() {
    const code = promoCode.trim();
    if (!code) {
      setPromoState({ status: "invalid", message: t("enterPromoCode"), detail: null, showDetail: false });
      return;
    }
    if (!cart.length) {
      setPromoState({ status: "invalid", message: t("promoBeforeItems"), detail: null, showDetail: false });
      return;
    }

    setPromoState((current) => ({ ...current, status: "checking", message: t("checkingPromoCode") }));
    try {
      const detail = await api(`/api/customer/promos/${encodeURIComponent(code)}/validate?subtotalUsd=${totals.subtotalUsd.toFixed(2)}`);
      if (detail.valid) {
        setPromoState({ status: "valid", message: t("promoApplied"), detail, showDetail: false });
        showToast(t("promoApplied"));
      } else {
        setPromoState({ status: "invalid", message: t("invalidPromo"), detail: null, showDetail: false });
        showToast(t("invalidPromo"), "error");
      }
    } catch (error) {
      setPromoState({ status: "invalid", message: error.message || t("invalidPromo"), detail: null, showDetail: false });
      showToast(error.message || t("invalidPromo"), "error");
    }
  }

  function togglePromoDetail() {
    setPromoState((current) => ({ ...current, showDetail: !current.showDetail }));
  }

  function changeQuantity(cartId, delta) {
    setCart((current) =>
      current.flatMap((item) => {
        if (item.cartId !== cartId) return item;
        const quantity = item.quantity + delta;
        if (quantity < 1) return [];
        return [{ ...item, quantity, lineUsd: item.unitUsd * quantity + item.addonTotalUsd * quantity }];
      })
    );
  }

  async function submitOrder() {
    if (!cart.length || submitting || totals.totalUsd <= 0) return;
    setMessage("");
    unlockCustomerAlert();
    setSubmitting(true);
    try {
      const payload = {
        tableNumber,
        promoCode: promoCode || null,
        idempotencyKey: crypto.randomUUID(),
        items: cart.map((item) => ({
          menuItemId: item.id,
          quantity: item.quantity,
          spiceLevel: item.spiceLevel,
          optionIds: item.optionIds,
          addons: item.addons.map((addon) => ({ addonId: addon.id, quantity: addon.quantity })),
          specialInstructions: item.specialInstructions,
        })),
      };
      const created = await api("/api/customer/orders", { method: "POST", body: JSON.stringify(payload) });
      lastOrderStatusRef.current[created.id] = created.status;
      setOrders((prev) => upsertById(prev, created));
      setDeletedOrderIds((prev) => prev.filter((id) => id !== created.id));
      setCart([]);
      setPromoCode("");
      setPromoState({ status: "idle", message: "", detail: null, showDetail: false });
      setCartOpen(false);
      try {
        const createdPayment = await api(`/api/payments/orders/${created.id}/khqr`, { method: "POST" });
        setPayments((prev) => ({ ...prev, [created.id]: createdPayment }));
        setOpenPaymentOrderId(created.id);
        setMessage(t("orderPlacedQr"));
      } catch {
        setMessage(t("orderPlacedTapPay"));
      }
    } catch (error) {
      const customerMessage = isPromoCodeError(error, promoCode) ? t("invalidPromo") : error.message;
      setMessage(customerMessage);
      showToast(customerMessage, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function openPaymentFor(orderId) {
    setMessage("");
    unlockCustomerAlert();
    const payment = payments[orderId];
    if (!payment) {
      try {
        const created = await api(`/api/payments/orders/${orderId}/khqr`, { method: "POST" });
        setPayments((prev) => ({ ...prev, [orderId]: created }));
      } catch (error) {
        setMessage(error.message);
        return;
      }
    }
    setOpenPaymentOrderId(orderId);
  }

  async function refreshPaymentFor(orderId) {
    const payment = payments[orderId];
    if (!payment) return;
    try {
      const verified = await api(`/api/payments/${payment.id}/verify`, { method: "POST" });
      setPayments((prev) => ({ ...prev, [orderId]: verified }));
      if (verified.status === "PAID") {
        lastOrderStatusRef.current[orderId] = "RECEIVED";
        setOrders((prev) => prev.map((order) => order.id === orderId ? { ...order, status: "RECEIVED", paidAt: verified.paidAt || new Date().toISOString() } : order));
        notifyPaymentReceived(orderId);
      }
    } catch {}
  }

  async function cancelPaymentFor(orderId) {
    if (!orderId) return;
    setMessage("");
    try {
      const cancelled = await api(`/api/customer/orders/${orderId}/cancel`, { method: "PATCH" });
      lastOrderStatusRef.current[orderId] = cancelled.status;
      setOrders((prev) => upsertById(prev, cancelled));
      setPayments((prev) => {
        const current = prev[orderId];
        return current ? { ...prev, [orderId]: { ...current, status: "FAILED" } } : prev;
      });
      setOpenPaymentOrderId((current) => current === orderId ? null : current);
      showToast(t("paymentCancelled"));
    } catch (error) {
      showToast(error.message || t("paymentCancelFailed"), "error");
    }
  }

  function deleteLocalOrder(orderId) {
    setDeletedOrderIds((prev) => prev.includes(orderId) ? prev : [...prev, orderId]);
    setAlertedOrderIds((prev) => prev.filter((id) => id !== orderId));
    delete lastOrderStatusRef.current[orderId];
    setPayments((prev) => {
      if (!prev[orderId]) return prev;
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setOpenPaymentOrderId((current) => current === orderId ? null : current);
    showToast(t("orderDeleted"));
  }

  async function alertStaffFor(orderId) {
    if (!orderId) return;
    const order = orders.find((entry) => entry.id === orderId);
    if (!canRequestStaffAlert(order, now) || alertedOrderIds.includes(orderId)) return;
    setMessage("");
    setAlertingOrderId(orderId);
    try {
      await api(`/api/customer/orders/${orderId}/alert`, { method: "POST" });
      setAlertedOrderIds((prev) => prev.includes(orderId) ? prev : [...prev, orderId]);
      showToast(t("customerAlertSent"));
    } catch (error) {
      showToast(error.message || t("customerAlertFailed"), "error");
    } finally {
      setAlertingOrderId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Utensils className="h-6 w-6 animate-pulse text-primary" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{t("loadingMenu")}</p>
      </div>
    );
  }

  const openModalOrder = openPaymentOrderId ? visibleOrders.find((o) => o.id === openPaymentOrderId) : null;
  const openModalPayment = openPaymentOrderId ? payments[openPaymentOrderId] : null;
  const isPaymentMessage = message === t("paymentReceived") || message.startsWith("Payment received");
  const tableLabel = customerTableLabel(table, tableNumber, t);

  return (
    <main className="min-h-screen bg-background pb-24 lg:pb-0">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src="/logo.png"
                alt="HappyBoat"
                className="h-11 w-11 rounded-xl object-cover ring-2 ring-primary/20"
              />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary ring-2 ring-background">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
              </span>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight tracking-tight">HappyBoat</h1>
              <p className="text-xs text-muted-foreground">{tableLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
            <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-3 text-sm font-semibold">
              <Utensils className="h-3.5 w-3.5 text-primary" />
              {table?.tableNumber || tableLabel}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
        {/* ── Menu section ───────────────────────────────────── */}
        <section className="min-w-0">
          {/* Status banner */}
          {message ? (
            <div className={cn(
              "mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
              isPaymentMessage
                ? "border-primary/30 bg-primary/8 text-primary"
                : "border-border bg-muted/50"
            )}>
              {isPaymentMessage
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <span>{message}</span>
            </div>
          ) : null}

          {/* ── Filters ──────────────────────────────────────── */}
          <div className="mb-5 space-y-3">
            {/* Search + Category row */}
            <div className="grid gap-2.5 sm:grid-cols-[1fr_200px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchDishes")}
                  className="h-10 rounded-xl pl-9 text-sm"
                />
                {query ? (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <Select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-10 rounded-xl text-sm"
              >
                <option value="">{t("allCategories")}</option>
                {menu.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </Select>
            </div>

            {/* Price pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {PRICE_FILTERS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPriceFilter(opt.value)}
                  className={cn(
                    "inline-flex shrink-0 cursor-pointer items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-150",
                    priceFilter === opt.value
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Result count */}
          {filteredItems.length > 0 ? (
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              {filteredItems.length} {filteredItems.length === 1 ? "dish" : "dishes"}
            </p>
          ) : null}

          {/* ── Menu grid ────────────────────────────────────── */}
          <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            {filteredItems.map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                onSelect={() => setActiveItem(item)}
              />
            ))}
            {filteredItems.length === 0 ? (
              <div className="col-span-full flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 py-14 text-center">
                <Search className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">{t("noDishes")}</p>
                <button
                  onClick={() => { setQuery(""); setCategoryId(""); setPriceFilter("all"); }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t("clearFilters")}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── Cart sidebar ───────────────────────────────────── */}
        <aside ref={cartRef} className="hidden scroll-mt-24 space-y-4 lg:block lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
            {/* Cart header */}
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">{t("yourOrder")}</h2>
              </div>
              {cart.length > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {cart.length}
                </span>
              ) : null}
            </div>

            <CardContent className="space-y-4 p-4">
              {/* Cart items */}
              <div className="max-h-[38vh] space-y-2 overflow-auto pr-0.5 scrollbar-thin">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">{t("addDishes")}</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.cartId}
                      className="group flex gap-3 rounded-xl border border-border/50 bg-card p-3 transition-colors hover:border-border"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-medium leading-snug">{item.name}</h3>
                          <button
                            onClick={() => setCart((c) => c.filter((e) => e.cartId !== item.cartId))}
                            aria-label="Remove item"
                            className="shrink-0 rounded-md p-0.5 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {item.spiceLevel && item.spiceLevel !== "NORMAL" ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.spiceLevel}</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => changeQuantity(item.cartId, -1)}
                              className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-primary"
                              aria-label="Decrease"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                            <button
                              onClick={() => changeQuantity(item.cartId, 1)}
                              className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-primary"
                              aria-label="Increase"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="text-sm font-semibold">{usd(item.lineUsd)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Promo code */}
              <div className="space-y-2">
                <div className="flex gap-2">
                <Input
                  value={promoCode}
                  onChange={(e) => handlePromoCodeChange(e.target.value)}
                  placeholder={t("promoCode")}
                  className="h-9 rounded-xl text-sm uppercase tracking-wider"
                />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 rounded-xl px-3 text-xs"
                    disabled={promoState.status === "checking"}
                    onClick={applyPromoCode}
                  >
                    <BadgePercent className="h-3.5 w-3.5" />
                    {promoState.status === "checking" ? t("checking") : t("apply")}
                  </Button>
                </div>
                {promoState.message ? (
                  <div className={cn(
                    "rounded-xl border px-3 py-2 text-xs",
                    promoState.status === "valid"
                      ? "border-primary/30 bg-primary/8 text-primary"
                      : "border-destructive/20 bg-destructive/8 text-destructive"
                  )}>
                    <div className="flex items-center justify-between gap-2">
                      <span>{promoState.message}</span>
                      {promoState.status === "valid" ? (
                        <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={togglePromoDetail}>
                          {promoState.showDetail ? t("hideDetail") : t("showDetail")}
                        </button>
                      ) : null}
                    </div>
                    {promoState.status === "valid" && promoState.showDetail ? (
                      <div className="mt-2 space-y-1 border-t border-primary/20 pt-2 text-primary/90">
                        <div className="font-semibold">{promoState.detail?.code}</div>
                        {promoState.detail?.description ? <div>{promoState.detail.description}</div> : null}
                        <div>{formatPromoValue(promoState.detail)}</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Total */}
              <div className="rounded-xl bg-muted/50 px-4 py-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">{t("subtotal")}</span>
                  <span className="text-sm font-semibold">{usd(totals.subtotalUsd)}</span>
                </div>
                {totals.discountUsd > 0 ? (
                  <div className="mb-1 flex items-baseline justify-between text-primary">
                    <span className="text-xs">{t("discount")}</span>
                    <span className="text-sm font-semibold">-{usd(totals.discountUsd)}</span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{t("total")}</span>
                  <span className="text-base font-bold">{usd(totals.totalUsd)}</span>
                </div>
                <div className="mt-0.5 text-right text-xs text-muted-foreground">{khr(totals.totalKhr)}</div>
              </div>

              {/* Place order button */}
              <Button
                className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm"
                disabled={!cart.length || totals.totalUsd <= 0 || submitting}
                onClick={submitOrder}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    {t("placingOrder")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" />
                    {t("placeOrder")}
                    {cart.length > 0 ? <ChevronRight className="ml-auto h-4 w-4 opacity-60" /> : null}
                  </span>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* ── Past orders ───────────────────────────────── */}
          {visibleOrders.map((order) => {
            const payment = payments[order.id];
            const secs = secsRemaining(payment);
            const isCancelled = order.status === "CANCELLED" || payment?.status === "FAILED";
            const isPaid = !isCancelled && (payment?.status === "PAID" || ["PAID", "RECEIVED", "PREPARING", "READY", "COMPLETED"].includes(order.status));
            const isReceived = order.status === "RECEIVED";
            const isExpired = order.status === "EXPIRED" || payment?.status === "EXPIRED" || (payment?.status === "PENDING" && secs === 0);
            const canAlertStaff = canRequestStaffAlert(order, now);
            const staffAlertSent = alertedOrderIds.includes(order.id);

            return (
              <Card key={order.id} className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
	                <div className={cn(
	                  "flex items-center justify-between border-b border-border/60 px-4 py-2.5",
	                  isReceived ? "bg-accent/8" : isPaid ? "bg-primary/6" : "bg-muted/30"
	                )}>
                  <div>
                    <p className="text-sm font-bold">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground capitalize">{order.status?.toLowerCase()}</p>
                  </div>
                  <span className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
	                    isReceived
	                      ? "bg-accent/15 text-accent"
	                      : isPaid
	                      ? "bg-primary/15 text-primary"
                      : isCancelled
                      ? "bg-destructive/10 text-destructive"
                      : isExpired
                      ? "bg-destructive/10 text-destructive"
                      : payment
                      ? "bg-secondary/20 text-secondary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}>
	                    {isReceived ? t("receivedByStaff") : isPaid ? t("paid") : isCancelled ? t("cancelled") : isExpired ? t("expired") : payment ? t("pending") : t("unpaid")}
                  </span>
                </div>
                <CardContent className="space-y-3 p-4">
	                  <div className="flex items-baseline gap-2">
	                    <span className="text-base font-bold">{displayUsd(order.totalUsd)}</span>
	                    <span className="text-xs text-muted-foreground">{khr(order.totalKhr)}</span>
	                  </div>
	                  <CustomerOrderProgress status={order.status} />

	                  {isCancelled ? (
                    <>
                      <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                        {t("orderCancelled")}
                      </div>
                      <Button
                        className="h-9 w-full rounded-xl text-sm"
                        variant="outline"
                        onClick={() => deleteLocalOrder(order.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("deleteOrder")}
                      </Button>
                    </>
	                  ) : isPaid ? (
                    <>
                      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2.5 text-xs font-medium text-primary">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        {t("paymentConfirmed")}
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2 text-xs font-medium text-primary">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        {t("paidMinutes")} {paidWaitingMinutes(order, payment, now)}m
                      </div>
                      {(canAlertStaff || staffAlertSent) ? (
                        <Button
                          className="h-9 w-full rounded-xl text-sm"
                          variant="secondary"
                          disabled={staffAlertSent || alertingOrderId === order.id}
                          onClick={() => alertStaffFor(order.id)}
                        >
                          <AlertCircle className="h-3.5 w-3.5" />
                          {staffAlertSent ? t("customerAlertSentShort") : alertingOrderId === order.id ? t("checking") : t("alertStaff")}
                        </Button>
                      ) : null}
                      <a
                        href={`${API_BASE}/api/receipts/orders/${order.id}.pdf`}
                        target="_blank"
                        className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        {t("openReceipt")}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    </>
                  ) : (
                    <>
                      {payment && !isExpired ? (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {t("expiresIn")} {formatDuration(secs)}
                        </div>
                      ) : null}
                      {isExpired ? (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                          {t("qrExpiredShort")}
                        </div>
                      ) : null}
                      <div className="grid gap-2">
                        <Button
                          className="h-9 w-full rounded-xl text-sm"
                          variant="secondary"
                          onClick={() => openPaymentFor(order.id)}
                        >
                          <Zap className="h-3.5 w-3.5" />
                          {payment ? t("viewPayment") : t("payWithBakong")}
                        </Button>
                        <Button
                          className="h-9 w-full rounded-xl text-sm"
                          variant="outline"
                          onClick={() => cancelPaymentFor(order.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                          {t("cancelPayment")}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </aside>
      </div>

      {/* ── Mobile sticky cart bar ─────────────────────────── */}
      {!activeItem && !openPaymentOrderId && !cartOpen ? (
        <div className="fixed bottom-4 left-4 right-4 z-30 lg:hidden">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className={cn(
              "relative flex w-full items-center justify-between rounded-2xl px-5 py-3.5 shadow-lg transition-all",
              cart.length > 0
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-foreground"
            )}
          >
            <span className={cn(
              "absolute -top-3 left-1/2 flex h-6 w-12 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm",
              cart.length > 0
                ? "border-primary/30 bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground"
            )}>
              <ChevronUp className="h-4 w-4" />
            </span>
            <span className="flex items-center gap-2.5 text-sm font-semibold">
              <ShoppingBag className="h-4 w-4" />
              {cart.length > 0 ? `${cart.length} ${cart.length === 1 ? "item" : "items"}` : t("viewCart")}
            </span>
            {cart.length > 0 ? (
              <span className="text-sm font-bold">{usd(totals.totalUsd)}</span>
            ) : null}
          </button>
        </div>
      ) : null}

      {cartOpen ? (
        <MobileCartSheet
          cart={cart}
          setCart={setCart}
          changeQuantity={changeQuantity}
          promoCode={promoCode}
          onPromoCodeChange={handlePromoCodeChange}
          promoState={promoState}
          onApplyPromo={applyPromoCode}
          onTogglePromoDetail={togglePromoDetail}
          totals={totals}
          submitting={submitting}
          onSubmitOrder={submitOrder}
          orders={visibleOrders}
          payments={payments}
          secsRemaining={secsRemaining}
          onOpenPayment={openPaymentFor}
          onCancelPayment={cancelPaymentFor}
          onDeleteOrder={deleteLocalOrder}
          onAlertStaff={alertStaffFor}
          alertingOrderId={alertingOrderId}
          alertedOrderIds={alertedOrderIds}
          now={now}
          onClose={() => setCartOpen(false)}
        />
      ) : null}

      {/* ── Modals ─────────────────────────────────────────── */}
      {activeItem ? (
        <CustomizeItem
          item={activeItem}
          addons={groupedAddons[activeItem.id] || []}
          options={groupedOptions[activeItem.id] || []}
          onClose={() => setActiveItem(null)}
          onAdd={addConfiguredItem}
        />
      ) : null}

      {openPaymentOrderId && openModalPayment && openModalOrder ? (
        <PaymentModal
          order={openModalOrder}
          payment={openModalPayment}
          secondsRemaining={secsRemaining(openModalPayment)}
          onClose={() => setOpenPaymentOrderId(null)}
          onRefresh={() => refreshPaymentFor(openPaymentOrderId)}
          onCancel={() => cancelPaymentFor(openPaymentOrderId)}
        />
      ) : null}
    </main>
  );
}

/* ── MenuCard ─────────────────────────────────────────────── */
function MenuCard({ item, onSelect }) {
  const { t } = useLanguage();
  function selectItem() {
    if (!item.available) return;
    onSelect();
  }

  return (
    <div
      role="button"
      tabIndex={item.available ? 0 : -1}
      onClick={selectItem}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectItem();
        }
      }}
      aria-label={`Customize ${item.name}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md sm:rounded-2xl",
        item.available ? "cursor-pointer active:scale-[0.99]" : "cursor-not-allowed opacity-75"
      )}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted sm:aspect-[16/10]">
        <img
          src={displayImageUrl(item.imageUrl)}
          alt={item.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={replaceBrokenImage}
        />
        {!item.available ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground sm:px-3 sm:text-xs">
              Unavailable
            </span>
          </div>
        ) : null}
        {/* Dietary tags overlay */}
        {tags(item.dietaryTags).length > 0 ? (
          <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1 sm:left-2 sm:top-2">
            {tags(item.dietaryTags).slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur-sm sm:px-2 sm:text-[10px]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-2.5 sm:p-3.5">
        <h2 className="line-clamp-2 text-xs font-bold leading-snug sm:line-clamp-1 sm:text-sm">{item.name}</h2>
        <p className="mt-1 line-clamp-2 flex-1 text-[11px] leading-snug text-muted-foreground sm:text-xs sm:leading-relaxed">
          {item.description}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2 sm:mt-3">
          <div>
            <div className="text-xs font-bold sm:text-sm">{displayUsd(item.priceUsd)}</div>
            <div className="text-[9px] text-muted-foreground sm:text-[10px]">{khr(item.priceKhr)}</div>
          </div>
          <button
            onClick={(event) => {
              event.stopPropagation();
              selectItem();
            }}
            disabled={!item.available}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all sm:h-8 sm:w-8 sm:rounded-xl",
              item.available
                ? "bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:scale-95"
                : "cursor-not-allowed bg-muted text-muted-foreground"
            )}
            aria-label={`${t("addToCart")} ${item.name}`}
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── MobileCartSheet ─────────────────────────────────────── */
function MobileCartSheet({
  cart,
  setCart,
  changeQuantity,
  promoCode,
  onPromoCodeChange,
  promoState,
  onApplyPromo,
  onTogglePromoDetail,
  totals,
  submitting,
  onSubmitOrder,
  orders,
  payments,
  secsRemaining,
  onOpenPayment,
  onCancelPayment,
  onDeleteOrder,
  onAlertStaff,
  alertingOrderId,
  alertedOrderIds,
  now,
  onClose,
}) {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 z-40 flex items-end overflow-hidden bg-black/40 backdrop-blur-sm lg:hidden" onClick={onClose}>
      <div
        className="bottom-sheet-animate flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card text-card-foreground shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-center pt-2">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card/95 p-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold">{t("yourOrder")}</h2>
            {cart.length > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {cart.length}
              </span>
            ) : null}
          </div>
          <button onClick={onClose} className="rounded-xl border border-border p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close cart">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 py-8 text-center">
                <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">{t("addDishes")}</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.cartId} className="flex gap-3 rounded-xl border border-border/50 bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium leading-snug">{item.name}</h3>
                      <button
                        onClick={() => setCart((current) => current.filter((entry) => entry.cartId !== item.cartId))}
                        aria-label="Remove item"
                        className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {item.spiceLevel && item.spiceLevel !== "NORMAL" ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.spiceLevel}</p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => changeQuantity(item.cartId, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-primary"
                          aria-label="Decrease"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                        <button
                          onClick={() => changeQuantity(item.cartId, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-primary"
                          aria-label="Increase"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold">{usd(item.lineUsd)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={promoCode}
                onChange={(event) => onPromoCodeChange(event.target.value)}
                placeholder={t("promoCode")}
                className="h-10 rounded-xl text-sm uppercase tracking-wider"
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 rounded-xl px-3 text-xs"
                disabled={promoState.status === "checking"}
                onClick={onApplyPromo}
              >
                <BadgePercent className="h-3.5 w-3.5" />
                {promoState.status === "checking" ? t("checking") : t("apply")}
              </Button>
            </div>
            {promoState.message ? (
              <div className={cn(
                "rounded-xl border px-3 py-2 text-xs",
                promoState.status === "valid"
                  ? "border-primary/30 bg-primary/8 text-primary"
                  : "border-destructive/20 bg-destructive/8 text-destructive"
              )}>
                <div className="flex items-center justify-between gap-2">
                  <span>{promoState.message}</span>
                  {promoState.status === "valid" ? (
                    <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={onTogglePromoDetail}>
                      {promoState.showDetail ? t("hideDetail") : t("showDetail")}
                    </button>
                  ) : null}
                </div>
                {promoState.status === "valid" && promoState.showDetail ? (
                  <div className="mt-2 space-y-1 border-t border-primary/20 pt-2 text-primary/90">
                    <div className="font-semibold">{promoState.detail?.code}</div>
                    {promoState.detail?.description ? <div>{promoState.detail.description}</div> : null}
                    <div>{formatPromoValue(promoState.detail)}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl bg-muted/50 px-4 py-3">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{t("subtotal")}</span>
              <span className="text-sm font-semibold">{usd(totals.subtotalUsd)}</span>
            </div>
            {totals.discountUsd > 0 ? (
              <div className="mb-1 flex items-baseline justify-between text-primary">
                <span className="text-xs">{t("discount")}</span>
                <span className="text-sm font-semibold">-{usd(totals.discountUsd)}</span>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">{t("total")}</span>
              <span className="text-base font-bold">{usd(totals.totalUsd)}</span>
            </div>
            <div className="mt-0.5 text-right text-xs text-muted-foreground">{khr(totals.totalKhr)}</div>
          </div>

          <Button
            className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm"
            disabled={!cart.length || totals.totalUsd <= 0 || submitting}
            onClick={onSubmitOrder}
          >
            {submitting ? t("placingOrder") : (
              <>
                <ShoppingBag className="h-4 w-4" />
                {t("placeOrder")}
              </>
            )}
          </Button>

          {orders.length ? (
            <div className="space-y-3 border-t border-border/60 pt-4">
              <h3 className="text-sm font-bold">{t("recentOrders")}</h3>
              {orders.map((order) => {
                const payment = payments[order.id];
                const secs = secsRemaining(payment);
                const isCancelled = order.status === "CANCELLED" || payment?.status === "FAILED";
                const isPaid = !isCancelled && (payment?.status === "PAID" || ["PAID", "RECEIVED", "PREPARING", "READY", "COMPLETED"].includes(order.status));
                const isReceived = order.status === "RECEIVED";
                const isExpired = order.status === "EXPIRED" || payment?.status === "EXPIRED" || (payment?.status === "PENDING" && secs === 0);
                const canAlertStaff = canRequestStaffAlert(order, now);
                const staffAlertSent = alertedOrderIds.includes(order.id);
                return (
                  <div key={order.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
		                    <div className={cn(
		                      "flex items-center justify-between border-b border-border/60 px-4 py-2.5",
		                      isReceived ? "bg-accent/8" : isPaid ? "bg-primary/6" : "bg-muted/30"
	                    )}>
                      <div>
                        <p className="text-sm font-bold">{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground capitalize">{order.status?.toLowerCase()}</p>
                      </div>
                      <span className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
	                        isReceived
	                          ? "bg-accent/15 text-accent"
	                          : isPaid
	                          ? "bg-primary/15 text-primary"
                          : isCancelled
                          ? "bg-destructive/10 text-destructive"
                          : isExpired
                          ? "bg-destructive/10 text-destructive"
                          : payment
                          ? "bg-secondary/20 text-secondary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}>
	                        {isReceived ? t("receivedByStaff") : isPaid ? t("paid") : isCancelled ? t("cancelled") : isExpired ? t("expired") : payment ? t("pending") : t("unpaid")}
                      </span>
                    </div>
                    <div className="space-y-3 p-4">
	                      <div className="flex items-baseline gap-2">
	                        <span className="text-base font-bold">{displayUsd(order.totalUsd)}</span>
	                        <span className="text-xs text-muted-foreground">{khr(order.totalKhr)}</span>
	                      </div>
	                      <CustomerOrderProgress status={order.status} />
	                      {isCancelled ? (
                        <>
                          <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                            {t("orderCancelled")}
                          </div>
                          <Button
                            className="h-9 w-full rounded-xl text-sm"
                            variant="outline"
                            onClick={() => onDeleteOrder(order.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("deleteOrder")}
                          </Button>
                        </>
	                      ) : isPaid ? (
                        <div className="grid gap-2">
                          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2 text-xs font-medium text-primary">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {t("paidMinutes")} {paidWaitingMinutes(order, payment, now)}m
                          </div>
                          {(canAlertStaff || staffAlertSent) ? (
                            <Button
                              className="h-9 w-full rounded-xl text-sm"
                              variant="secondary"
                              disabled={staffAlertSent || alertingOrderId === order.id}
                              onClick={() => onAlertStaff(order.id)}
                            >
                              <AlertCircle className="h-3.5 w-3.5" />
                              {staffAlertSent ? t("customerAlertSentShort") : alertingOrderId === order.id ? t("checking") : t("alertStaff")}
                            </Button>
                          ) : null}
                          <a
                            href={`${API_BASE}/api/receipts/orders/${order.id}.pdf`}
                            target="_blank"
                            className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
                          >
                            {t("openReceipt")}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          {isExpired ? (
                            <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                              {t("qrExpiredShort")}
                            </div>
                          ) : null}
                          <Button
                            className="h-9 w-full rounded-xl text-sm"
                            variant="secondary"
                            onClick={() => {
                              onClose();
                              onOpenPayment(order.id);
                            }}
                          >
                            <Zap className="h-3.5 w-3.5" />
                            {payment ? t("viewPayment") : t("payWithBakong")}
                          </Button>
                          <Button
                            className="h-9 w-full rounded-xl text-sm"
                            variant="outline"
                            onClick={() => onCancelPayment(order.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                            {t("cancelPayment")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CustomerOrderProgress({ status }) {
  const { t } = useLanguage();
  const steps = [
    { status: "PENDING_PAYMENT", label: t("awaitingPayment") },
    { status: "RECEIVED", label: t("receivedByStaff") },
    { status: "PREPARING", label: t("acceptedPreparing") },
    { status: "READY", label: t("readyForPickup") },
    { status: "COMPLETED", label: t("orderComplete") },
  ];
  const activeIndex = customerStatusStepIndex(status);

  if (["CANCELLED", "REJECTED", "EXPIRED"].includes(status)) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs font-medium text-destructive">
        {customerStatusLabel(status, t)}
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {steps.map((step, index) => {
        const done = activeIndex >= index;
        const current = activeIndex === index;
        return (
          <div
            key={step.status}
            className={cn(
              "min-w-[68px] rounded-lg border px-2 py-1.5 text-center text-[10px] font-semibold",
              done
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-muted/30 text-muted-foreground",
              current ? "ring-1 ring-primary/30" : ""
            )}
          >
            {step.label}
          </div>
        );
      })}
    </div>
  );
}

/* ── PaymentModal ─────────────────────────────────────────── */
function PaymentModal({ order, payment, secondsRemaining, onClose, onRefresh, onCancel }) {
  const { t } = useLanguage();
  const isPaid = payment.status === "PAID";
  const isExpired = payment.status === "EXPIRED" || secondsRemaining === 0;

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="bottom-sheet-animate w-full max-h-[92vh] overflow-auto rounded-t-2xl bg-card text-card-foreground shadow-xl sm:mx-auto sm:max-w-md sm:rounded-2xl">
        {/* Modal header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 p-5">
          <div>
            <h2 className="text-lg font-bold">{isPaid ? t("paymentReceived") : isExpired ? t("paymentExpired") : t("scanToPay")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {order?.orderNumber} · {payment.paymentNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-border p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-center">
          {!isPaid && !isExpired ? (
            <div className="mx-auto inline-flex rounded-2xl border border-border bg-white p-4 shadow-sm" data-payment-qr={payment.id}>
              <QRCodeSVG value={payment.khqrString} size={220} includeMargin level="M" />
            </div>
          ) : isPaid ? (
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
          ) : (
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
          )}

          <div>
            <p className="text-xl font-bold">{displayUsd(payment.amountUsd)}</p>
            <p className="text-sm text-muted-foreground">{khr(payment.amountKhr)}</p>
          </div>

          <div className={cn(
            "rounded-xl px-4 py-3 text-sm font-medium",
            isPaid
              ? "bg-primary/10 text-primary"
              : isExpired
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          )}>
            {isPaid
              ? t("paymentConfirmed")
              : isExpired
              ? t("qrExpired")
              : (
                <span className="flex items-center justify-center gap-2">
                  <Clock className="h-4 w-4" />
                  {t("expiresIn")} {formatDuration(secondsRemaining)}
                </span>
              )}
          </div>

          {isPaid ? (
            <a
              href={`${API_BASE}/api/receipts/orders/${order.id}.pdf`}
              target="_blank"
              className="flex items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              {t("downloadReceipt")} <ChevronRight className="h-4 w-4" />
            </a>
          ) : !isExpired ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" className="h-10 rounded-xl text-sm" onClick={() => downloadPaymentQrImage(order, payment)}>
                <Download className="h-4 w-4" />
                {t("saveImage")}
              </Button>
              <Button type="button" variant="outline" className="h-10 rounded-xl text-sm" onClick={onRefresh}>
                {t("checkPaymentStatus")}
              </Button>
              <Button type="button" variant="outline" className="h-10 rounded-xl text-sm sm:col-span-2" onClick={onCancel}>
                <X className="h-4 w-4" />
                {t("cancelPayment")}
              </Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" className="h-10 rounded-xl text-sm" onClick={onRefresh}>
                {t("checkPaymentStatus")}
              </Button>
              <Button type="button" variant="outline" className="h-10 rounded-xl text-sm" onClick={onCancel}>
                <X className="h-4 w-4" />
                {t("cancelPayment")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── CustomizeItem ────────────────────────────────────────── */
function CustomizeItem({ item, addons, options, onClose, onAdd }) {
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [spiceLevel, setSpiceLevel] = useState("NORMAL");
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [specialInstructions, setSpecialInstructions] = useState("");

  const unitUsd = Number(item.priceUsd || 0) + selectedOptions.reduce((sum, o) => sum + Number(o.priceUsd || 0), 0);
  const addonTotalUsd = selectedAddons.reduce((sum, a) => sum + Number(a.priceUsd || 0) * a.quantity, 0);
  const lineUsd = unitUsd * quantity + addonTotalUsd * quantity;
  const optionGroups = groupBy(options, "optionGroup");

  function toggleAddon(addon) {
    setSelectedAddons((curr) =>
      curr.some((e) => e.id === addon.id)
        ? curr.filter((e) => e.id !== addon.id)
        : [...curr, { ...addon, quantity: 1 }]
    );
  }

  function chooseOption(option) {
    setSelectedOptions((curr) => [
      ...curr.filter((e) => e.optionGroup !== option.optionGroup),
      option,
    ]);
    if (option.optionGroup?.toLowerCase() === "spice") {
      setSpiceLevel(option.optionName.toUpperCase());
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="bottom-sheet-animate max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-card text-card-foreground shadow-xl sm:mx-auto sm:max-w-lg sm:rounded-2xl">
        {/* Item header */}
        <div className="relative">
          <div className="aspect-[3/1] overflow-hidden bg-muted">
            <img
              src={displayImageUrl(item.imageUrl)}
              alt={item.name}
              className="h-full w-full object-cover"
              onError={replaceBrokenImage}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
          </div>
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm hover:bg-background"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-4 right-14">
            <h2 className="text-lg font-bold leading-tight">{item.name}</h2>
            <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{item.description}</p>
          </div>
        </div>

        <div className="space-y-5 p-4">
          {Object.entries(optionGroups).map(([group, entries]) => (
            <div key={group}>
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</h3>
              <div className="grid gap-2">
                {entries.map((option) => (
                  <label
                    key={option.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors",
                      selectedOptions.some((e) => e.id === option.id)
                        ? "border-primary/40 bg-primary/6"
                        : "border-border hover:border-border/80 hover:bg-muted/40"
                    )}
                  >
                    <span className="text-sm font-medium">{option.optionName}</span>
                    <span className="flex items-center gap-3">
                      {option.priceUsd && Number(option.priceUsd) > 0 ? (
                        <span className="text-xs text-muted-foreground">+{usd(option.priceUsd)}</span>
                      ) : null}
                      <div className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors",
                        selectedOptions.some((e) => e.id === option.id)
                          ? "border-primary bg-primary"
                          : "border-border"
                      )}>
                        {selectedOptions.some((e) => e.id === option.id) ? (
                          <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                        ) : null}
                      </div>
                      <input
                        type="radio"
                        name={group}
                        checked={selectedOptions.some((e) => e.id === option.id)}
                        onChange={() => chooseOption(option)}
                        className="sr-only"
                      />
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {addons.length ? (
            <div>
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Add-ons</h3>
              <div className="grid gap-2">
                {addons.map((addon) => {
                  const checked = selectedAddons.some((e) => e.id === addon.id);
                  return (
                    <label
                      key={addon.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors",
                        checked ? "border-primary/40 bg-primary/6" : "border-border hover:bg-muted/40"
                      )}
                    >
                      <span className="text-sm font-medium">{addon.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">+{usd(addon.priceUsd)}</span>
                        <div className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border-2 transition-colors",
                          checked ? "border-primary bg-primary" : "border-border"
                        )}>
                          {checked ? <div className="h-2 w-2 rounded-sm bg-primary-foreground" /> : null}
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => toggleAddon(addon)} className="sr-only" />
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("specialInstructions")}
            </h3>
            <Textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="Allergies, preferences, notes…"
              className="rounded-xl text-sm"
              rows={2}
            />
          </div>

          {/* Qty + price */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
                aria-label="Decrease"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-base font-bold">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
                aria-label="Increase"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">{usd(lineUsd)}</div>
              <div className="text-xs text-muted-foreground">{usd(unitUsd)} each</div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex gap-2.5 border-t border-border/60 p-4">
          <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            className="h-11 flex-1 rounded-xl font-semibold shadow-sm"
            onClick={() =>
              onAdd({
                ...item,
                quantity,
                spiceLevel,
                optionIds: selectedOptions.map((o) => o.id),
                addons: selectedAddons,
                unitUsd,
                addonTotalUsd,
                lineUsd,
                specialInstructions,
              })
            }
          >
            {t("addToCart")} · {usd(lineUsd)}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */
function customerStorageKey(tableNumber, bucket) {
  return `happyboat.customer.${tableNumber}.${bucket}`;
}

function readCustomerStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key);
      return fallback;
    }
    return parsed.value ?? fallback;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function writeCustomerStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      expiresAt: Date.now() + CUSTOMER_STORAGE_TTL_MS,
      value,
    }));
  } catch {
    // Local storage can be blocked by the browser. The app should still work.
  }
}

function upsertById(items, item) {
  const exists = items.some((entry) => entry.id === item.id);
  return exists
    ? items.map((entry) => (entry.id === item.id ? { ...entry, ...item } : entry))
    : [item, ...items];
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key];
    groups[value] = groups[value] || [];
    groups[value].push(item);
    return groups;
  }, {});
}

function priceMatches(item, filter) {
  const price = Number(item.priceUsd || 0);
  switch (filter) {
    case "under_3": return price < 3;
    case "3_5": return price >= 3 && price <= 5;
    case "5_10": return price > 5 && price <= 10;
    case "10_plus": return price > 10;
    default: return true;
  }
}

function customerTableLabel(table, tableNumber, t) {
  const label = String(table?.label || "").trim();
  if (label && label !== "undefined" && label !== "null") return label;
  const fromTable = table?.tableNumber;
  let fallback = String(tableNumber || "").trim();
  try {
    fallback = decodeURIComponent(fallback);
  } catch {
    // Keep the raw route value if it is not URI-encoded cleanly.
  }
  const value = String(fromTable || fallback).trim();
  if (!value || value === "undefined" || value === "null") return "";
  return value.toLowerCase().startsWith("table ") ? value : `${t("table")} ${value}`;
}

function customerStatusStepIndex(status) {
  switch (status) {
    case "PENDING_PAYMENT":
      return 0;
    case "PAID":
    case "RECEIVED":
      return 1;
    case "PREPARING":
      return 2;
    case "READY":
      return 3;
    case "COMPLETED":
      return 4;
    default:
      return -1;
  }
}

function customerStatusLabel(status, t) {
  switch (status) {
    case "PENDING_PAYMENT":
      return t("awaitingPayment");
    case "PAID":
    case "RECEIVED":
      return t("receivedByStaff");
    case "PREPARING":
      return t("acceptedPreparing");
    case "READY":
      return t("readyForPickup");
    case "COMPLETED":
      return t("orderComplete");
    case "CANCELLED":
      return t("cancelled");
    case "REJECTED":
      return t("rejected");
    case "EXPIRED":
      return t("expired");
    default:
      return status || "-";
  }
}

function isPromoCodeError(error, promoCode) {
  if (!promoCode?.trim()) return false;
  const text = String(error?.message || "").toLowerCase();
  return text.includes("promo") || text.includes("bad request") || text.includes("400");
}

function canRequestStaffAlert(order, now = Date.now(), options = {}) {
  if (!["PAID", "RECEIVED", "PREPARING"].includes(order?.status)) return false;
  if (options.ignoreAge) return true;
  const baseValue = order.paidAt || order.createdAt;
  const baseTime = new Date(baseValue).getTime();
  if (!baseValue || Number.isNaN(baseTime)) return false;
  return now - baseTime >= CUSTOMER_ALERT_AFTER_MS;
}

function paidWaitingMinutes(order, payment, now = Date.now()) {
  const baseValue = payment?.paidAt || order?.paidAt || order?.createdAt;
  const baseTime = new Date(baseValue).getTime();
  if (!baseValue || Number.isNaN(baseTime)) return 0;
  return Math.max(0, Math.floor((now - baseTime) / 60000));
}

function promoDiscountForSubtotal(promo, subtotalUsd) {
  if (!promo) return 0;
  const subtotal = Number(subtotalUsd || 0);
  const value = Number(promo.discountValue || 0);
  const rawDiscount = promo.discountType === "PERCENT" ? subtotal * (value / 100) : value;
  const cappedDiscount = promo.discountType === "PERCENT" && promo.maxDiscountUsd != null
    ? Math.min(rawDiscount, Number(promo.maxDiscountUsd || 0))
    : rawDiscount;
  const maxDiscount = subtotal > 0 ? Math.max(0, subtotal - MIN_CART_TOTAL_USD) : subtotal;
  return Math.min(maxDiscount, Math.max(0, Number(cappedDiscount.toFixed(2))));
}

function formatPromoValue(promo) {
  if (!promo) return "";
  if (promo.discountType === "PERCENT") {
    const maxDiscount = promo.maxDiscountUsd == null ? "" : `, max ${usd(promo.maxDiscountUsd)}`;
    return `${Number(promo.discountValue || 0).toFixed(2)}% off${maxDiscount}`;
  }
  return `${usd(promo.discountValue)} off`;
}

function downloadPaymentQrImage(order, payment) {
  const svg = document.querySelector(`[data-payment-qr="${payment.id}"] svg`);
  if (!svg) return;

  const svgText = new XMLSerializer().serializeToString(svg);
  const svgUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
  Promise.all([
    loadCanvasImage(svgUrl),
    loadCanvasImage("/logo.png").catch(() => null)
  ]).then(([qrImage, logoImage]) => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 500;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(svgUrl);
      return;
    }

    const tableText = order?.tableNumber ? `Table ${order.tableNumber}` : "";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (logoImage) {
      ctx.drawImage(logoImage, canvas.width / 2 - 28, 24, 56, 56);
    }

    ctx.fillStyle = "#111827";
    ctx.font = "700 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("HappyBoat KHQR", canvas.width / 2, logoImage ? 105 : 44);

    ctx.font = "500 13px sans-serif";
    ctx.fillStyle = "#4b5563";
    ctx.fillText(
      [tableText, order?.orderNumber || "Order", payment.paymentNumber].filter(Boolean).join(" · "),
      canvas.width / 2,
      logoImage ? 130 : 69
    );

    ctx.drawImage(qrImage, 76, 154, 248, 248);

    ctx.font = "700 18px sans-serif";
    ctx.fillStyle = "#111827";
    ctx.fillText(displayUsd(payment.amountUsd), canvas.width / 2, 430);
    ctx.font = "500 13px sans-serif";
    ctx.fillStyle = "#4b5563";
    ctx.fillText(khr(payment.amountKhr), canvas.width / 2, 454);

    canvas.toBlob(async (blob) => {
      URL.revokeObjectURL(svgUrl);
      if (!blob) return;
      await saveImageToPhonePhotos(blob, `${order?.orderNumber || payment.paymentNumber}-khqr.png`);
    }, "image/png");
  }).catch(() => URL.revokeObjectURL(svgUrl));
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function saveImageToPhonePhotos(blob, filename) {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "HappyBoat KHQR",
        text: "Save this KHQR image to Photos."
      });
      return;
    } catch {
      // Fall back to a regular download if sharing is cancelled or unavailable.
    }
  }

  const pngUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = pngUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(pngUrl);
}

function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function displayImageUrl(url) {
  if (!url) return "/logo.png";
  return String(url).replace(/^http:\/\/minio:9000/i, "http://localhost:9000");
}

function replaceBrokenImage(event) {
  if (event.currentTarget.src.endsWith("/logo.png")) return;
  event.currentTarget.src = "/logo.png";
}
