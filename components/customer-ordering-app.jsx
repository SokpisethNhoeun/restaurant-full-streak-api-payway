"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, CheckCircle2, ChevronRight, Clock, Minus, Plus, Search, ShoppingBag, Trash2, Utensils, X, Zap } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { cn, khr, tags, usd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";

const PRICE_FILTERS = [
  { value: "all", label: "All" },
  { value: "under_3", label: "Under $3" },
  { value: "3_5", label: "$3–$5" },
  { value: "5_10", label: "$5–$10" },
  { value: "10_plus", label: "$10+" },
];

export default function CustomerOrderingApp({ tableNumber }) {
  const [table, setTable] = useState(null);
  const [menu, setMenu] = useState({ categories: [], items: [], addons: [], options: [] });
  const [categoryId, setCategoryId] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [promoCode, setPromoCode] = useState("");

  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState({});
  const [openPaymentOrderId, setOpenPaymentOrderId] = useState(null);

  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const pollingInFlight = useRef({});
  const paidToastShown = useRef({});
  const toastTimer = useRef(null);
  const cartRef = useRef(null);

  const showToast = useCallback((text, variant = "success") => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, variant });
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  const notifyPaymentReceived = useCallback((orderId) => {
    const text = "Payment received. Your order has been sent to staff.";
    setMessage(text);
    if (paidToastShown.current[orderId]) return;
    paidToastShown.current[orderId] = true;
    showToast(text);
  }, [showToast]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    async function load() {
      setLoading(true);
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
    const pending = Object.entries(payments).filter(([, p]) => p && p.status !== "PAID" && p.status !== "EXPIRED");
    if (pending.length === 0) return;
    const timer = setInterval(async () => {
      for (const [orderId, payment] of pending) {
        if (pollingInFlight.current[payment.id]) continue;
        pollingInFlight.current[payment.id] = true;
        try {
          const verified = await api(`/api/payments/${payment.id}/verify`, { method: "POST" });
          setPayments((prev) => ({ ...prev, [orderId]: verified }));
          if (verified.status === "PAID") notifyPaymentReceived(orderId);
        } catch {}
        finally { pollingInFlight.current[payment.id] = false; }
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [payments, notifyPaymentReceived]);

  useEffect(() => {
    const hasPending = Object.values(payments).some((p) => p && p.status !== "PAID" && p.status !== "EXPIRED");
    if (!hasPending) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [payments]);

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
    const totalUsd = cart.reduce((sum, item) => sum + item.lineUsd, 0);
    const totalKhr = Math.round(totalUsd * Number(menu.exchangeRateKhrPerUsd || 4100));
    return { totalUsd, totalKhr };
  }, [cart, menu.exchangeRateKhrPerUsd]);

  function secsRemaining(payment) {
    if (!payment?.expiredAt) return 0;
    return Math.max(0, Math.floor((new Date(payment.expiredAt).getTime() - now) / 1000));
  }

  function addConfiguredItem(configured) {
    setCart((current) => [...current, { ...configured, cartId: crypto.randomUUID() }]);
    setActiveItem(null);
    showToast(`${configured.name} added to cart.`);
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
    if (!cart.length || submitting) return;
    setMessage("");
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
      setOrders((prev) => [...prev, created]);
      setCart([]);
      setPromoCode("");
      try {
        const createdPayment = await api(`/api/payments/orders/${created.id}/khqr`, { method: "POST" });
        setPayments((prev) => ({ ...prev, [created.id]: createdPayment }));
        setOpenPaymentOrderId(created.id);
        setMessage("Order placed! Scan the KHQR code below to pay.");
      } catch {
        setMessage("Order placed. Tap 'Pay with Bakong KHQR' to generate a QR code.");
      }
    } catch (error) {
      const customerMessage = isPromoCodeError(error, promoCode) ? "Promo code is wrong." : error.message;
      setMessage(customerMessage);
      showToast(customerMessage, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function openPaymentFor(orderId) {
    setMessage("");
    const payment = payments[orderId];
    const isExpired = payment?.status === "EXPIRED" || (payment?.status === "PENDING" && secsRemaining(payment) === 0);
    if (!payment || isExpired) {
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
      if (verified.status === "PAID") notifyPaymentReceived(orderId);
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Utensils className="h-6 w-6 animate-pulse text-primary" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Loading menu…</p>
      </div>
    );
  }

  const openModalOrder = openPaymentOrderId ? orders.find((o) => o.id === openPaymentOrderId) : null;
  const openModalPayment = openPaymentOrderId ? payments[openPaymentOrderId] : null;

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
              <p className="text-xs text-muted-foreground">{table?.label || `Table ${tableNumber}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-3 text-sm font-semibold">
              <Utensils className="h-3.5 w-3.5 text-primary" />
              {tableNumber}
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
              message.startsWith("Payment received")
                ? "border-primary/30 bg-primary/8 text-primary"
                : "border-border bg-muted/50"
            )}>
              {message.startsWith("Payment received")
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
                  placeholder="Search dishes…"
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
                <option value="">All categories</option>
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
          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                <p className="text-sm font-medium text-muted-foreground">No dishes match your filters</p>
                <button
                  onClick={() => { setQuery(""); setCategoryId(""); setPriceFilter("all"); }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── Cart sidebar ───────────────────────────────────── */}
        <aside ref={cartRef} className="scroll-mt-24 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
            {/* Cart header */}
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">Your Order</h2>
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
                    <p className="text-xs text-muted-foreground">Add dishes to get started</p>
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
              <div className="relative">
                <Input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Promo code"
                  className="h-9 rounded-xl pr-16 text-sm uppercase tracking-wider"
                />
                {promoCode ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary">
                    APPLY
                  </span>
                ) : null}
              </div>

              {/* Total */}
              <div className="rounded-xl bg-muted/50 px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-base font-bold">{usd(totals.totalUsd)}</span>
                </div>
                <div className="mt-0.5 text-right text-xs text-muted-foreground">{khr(totals.totalKhr)}</div>
              </div>

              {/* Place order button */}
              <Button
                className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm"
                disabled={!cart.length || submitting}
                onClick={submitOrder}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    Placing order…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" />
                    Place Order
                    {cart.length > 0 ? <ChevronRight className="ml-auto h-4 w-4 opacity-60" /> : null}
                  </span>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* ── Past orders ───────────────────────────────── */}
          {orders.map((order) => {
            const payment = payments[order.id];
            const secs = secsRemaining(payment);
            const isPaid = payment?.status === "PAID";
            const isExpired = payment?.status === "EXPIRED" || (payment?.status === "PENDING" && secs === 0);

            return (
              <Card key={order.id} className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
                <div className={cn(
                  "flex items-center justify-between border-b border-border/60 px-4 py-2.5",
                  isPaid ? "bg-primary/6" : "bg-muted/30"
                )}>
                  <div>
                    <p className="text-sm font-bold">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground capitalize">{order.status?.toLowerCase()}</p>
                  </div>
                  <span className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                    isPaid
                      ? "bg-primary/15 text-primary"
                      : isExpired
                      ? "bg-destructive/10 text-destructive"
                      : payment
                      ? "bg-secondary/20 text-secondary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {isPaid ? "Paid" : isExpired ? "Expired" : payment ? "Pending" : "Unpaid"}
                  </span>
                </div>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold">{usd(order.totalUsd)}</span>
                    <span className="text-xs text-muted-foreground">{khr(order.totalKhr)}</span>
                  </div>

                  {isPaid ? (
                    <>
                      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2.5 text-xs font-medium text-primary">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        Payment confirmed — order sent to kitchen
                      </div>
                      <a
                        href={`${API_BASE}/api/receipts/orders/${order.id}.pdf`}
                        target="_blank"
                        className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        Open receipt
                        <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    </>
                  ) : (
                    <>
                      {payment && !isExpired ? (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          Expires in {formatDuration(secs)}
                        </div>
                      ) : null}
                      {isExpired ? (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                          QR expired — generate a new one below
                        </div>
                      ) : null}
                      <Button
                        className="h-9 w-full rounded-xl text-sm"
                        variant="secondary"
                        onClick={() => openPaymentFor(order.id)}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        {payment && !isExpired ? "View payment QR" : "Pay with Bakong KHQR"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </aside>
      </div>

      {/* ── Mobile sticky cart bar ─────────────────────────── */}
      {!activeItem && !openPaymentOrderId ? (
        <div className="fixed bottom-4 left-4 right-4 z-30 lg:hidden">
          <button
            type="button"
            onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={cn(
              "flex w-full items-center justify-between rounded-2xl px-5 py-3.5 shadow-lg transition-all",
              cart.length > 0
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-foreground"
            )}
          >
            <span className="flex items-center gap-2.5 text-sm font-semibold">
              <ShoppingBag className="h-4 w-4" />
              {cart.length > 0 ? `${cart.length} ${cart.length === 1 ? "item" : "items"}` : "View cart"}
            </span>
            {cart.length > 0 ? (
              <span className="text-sm font-bold">{usd(totals.totalUsd)}</span>
            ) : null}
          </button>
        </div>
      ) : null}

      {/* ── Toast ──────────────────────────────────────────── */}
      {toast ? <Toast message={toast.text} variant={toast.variant} onClose={() => setToast(null)} /> : null}

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
        />
      ) : null}
    </main>
  );
}

/* ── MenuCard ─────────────────────────────────────────────── */
function MenuCard({ item, onSelect }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md">
      {/* Image */}
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        <img
          src={displayImageUrl(item.imageUrl)}
          alt={item.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={replaceBrokenImage}
        />
        {!item.available ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              Unavailable
            </span>
          </div>
        ) : null}
        {/* Dietary tags overlay */}
        {tags(item.dietaryTags).length > 0 ? (
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            {tags(item.dietaryTags).slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-3.5">
        <h2 className="line-clamp-1 text-sm font-bold leading-snug">{item.name}</h2>
        <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
          {item.description}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-bold">{usd(item.priceUsd)}</div>
            <div className="text-[10px] text-muted-foreground">{khr(item.priceKhr)}</div>
          </div>
          <button
            onClick={onSelect}
            disabled={!item.available}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all",
              item.available
                ? "bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:scale-95"
                : "cursor-not-allowed bg-muted text-muted-foreground"
            )}
            aria-label={`Add ${item.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Toast ────────────────────────────────────────────────── */
function Toast({ message, variant = "success", onClose }) {
  const isError = variant === "error";
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div className={cn(
      "fixed left-4 right-4 top-20 z-50 mx-auto flex max-w-sm items-start gap-3 rounded-2xl border bg-card px-4 py-3 text-sm text-card-foreground shadow-lg",
      isError ? "border-destructive/30" : "border-primary/20"
    )}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", isError ? "text-destructive" : "text-primary")} />
      <span className="flex-1 leading-snug">{message}</span>
      <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ── PaymentModal ─────────────────────────────────────────── */
function PaymentModal({ order, payment, secondsRemaining, onClose, onRefresh }) {
  const isPaid = payment.status === "PAID";
  const isExpired = payment.status === "EXPIRED" || secondsRemaining === 0;

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-h-[92vh] overflow-auto rounded-t-2xl bg-card text-card-foreground shadow-xl sm:mx-auto sm:max-w-md sm:rounded-2xl">
        {/* Modal header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 p-5">
          <div>
            <h2 className="text-lg font-bold">{isPaid ? "Payment received ✓" : "Scan to pay"}</h2>
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
          {!isPaid ? (
            <div className="mx-auto inline-flex rounded-2xl border border-border bg-white p-4 shadow-sm">
              <QRCodeSVG value={payment.khqrString} size={220} includeMargin level="M" />
            </div>
          ) : (
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
          )}

          <div>
            <p className="text-xl font-bold">{usd(payment.amountUsd)}</p>
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
              ? "Payment confirmed — order sent to kitchen 🎉"
              : isExpired
              ? "QR has expired. Close and request a new one."
              : (
                <span className="flex items-center justify-center gap-2">
                  <Clock className="h-4 w-4" />
                  Expires in {formatDuration(secondsRemaining)}
                </span>
              )}
          </div>

          {isPaid ? (
            <a
              href={`${API_BASE}/api/receipts/orders/${order.id}.pdf`}
              target="_blank"
              className="flex items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              Download receipt <ChevronRight className="h-4 w-4" />
            </a>
          ) : !isExpired ? (
            <Button type="button" variant="outline" className="h-10 w-full rounded-xl text-sm" onClick={onRefresh}>
              Check payment status
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── CustomizeItem ────────────────────────────────────────── */
function CustomizeItem({ item, addons, options, onClose, onAdd }) {
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
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-card text-card-foreground shadow-xl sm:mx-auto sm:max-w-lg sm:rounded-2xl">
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
              Special instructions
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
            Cancel
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
            Add to cart · {usd(lineUsd)}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────── */
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

function isPromoCodeError(error, promoCode) {
  if (!promoCode?.trim()) return false;
  const text = String(error?.message || "").toLowerCase();
  return text.includes("promo") || text.includes("bad request") || text.includes("400");
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