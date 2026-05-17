'use client';

import { LanguageToggle, useLanguage } from '@/components/language-provider';
import { MenuImage } from '@/components/menu-image';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { GOEY_TOAST_CLASS_NAMES, goeyToastOptions } from '@/lib/goey-toast-options';
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock';
import { cn, displayUsd, khr, tags, usd } from '@/lib/utils';
import { gooeyToast } from 'goey-toast';
import {
  AlertCircle,
  BadgePercent,
  BellRing,
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  FileText,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
  X,
  Zap,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PRICE_FILTERS = [
  { value: 'all', labelKey: 'allPrices' },
  { value: 'under_3', labelKey: 'underThreeUsd' },
  { value: '3_5', labelKey: 'threeToFiveUsd' },
  { value: '5_10', labelKey: 'fiveToTenUsd' },
  { value: '10_plus', labelKey: 'tenUsdPlus' },
];

const CUSTOMER_STORAGE_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_CART_TOTAL_USD = 0.01;
const CUSTOMER_ALERT_AFTER_MS = 10 * 60 * 1000;
const KHQR_LOGO_WHITE_SRC = '/khqr/khqr-logo.svg';
const RECEIPT_ORDER_STATUSES = ['PAID', 'RECEIVED', 'PREPARING', 'READY', 'COMPLETED'];

export default function CustomerOrderingApp({ tableNumber }) {
  const { t } = useLanguage();
  const normalizedTableNumber = useMemo(
    () => normalizeRouteTableNumber(tableNumber),
    [tableNumber]
  );
  const [table, setTable] = useState(null);
  const [menu, setMenu] = useState({ categories: [], items: [], addons: [], options: [], sizeLevels: [] });
  const [categoryId, setCategoryId] = useState('');
  const [priceFilter, setPriceFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoState, setPromoState] = useState({
    status: 'idle',
    message: '',
    detail: null,
    showDetail: false,
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState({});
  const [deletedOrderIds, setDeletedOrderIds] = useState([]);
  const [alertedOrderIds, setAlertedOrderIds] = useState([]);
  const [loadedStorageScope, setLoadedStorageScope] = useState('');
  const [openPaymentOrderId, setOpenPaymentOrderId] = useState(null);
  const [checkingPaymentIds, setCheckingPaymentIds] = useState([]);
  const [paymentVerificationMessage, setPaymentVerificationMessage] = useState('');

  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alertingOrderId, setAlertingOrderId] = useState(null);

  const pollingInFlight = useRef({});
  const paidToastShown = useRef({});
  const paymentErrorToastShown = useRef({});
  const cartRef = useRef(null);
  const mainRef = useRef(null);
  const customerAudioRef = useRef(null);
  const lastOrderStatusRef = useRef({});
  const welcomeToastShown = useRef(false);
  useBodyScrollLock(cartOpen || Boolean(activeItem) || Boolean(openPaymentOrderId));

  const storageKeys = useMemo(
    () => ({
      cart: customerStorageKey(normalizedTableNumber, 'cart'),
      orders: customerStorageKey(normalizedTableNumber, 'orders'),
      payments: customerStorageKey(normalizedTableNumber, 'payments'),
      deletedOrders: customerStorageKey(normalizedTableNumber, 'deleted-orders'),
      alertedOrders: customerStorageKey(normalizedTableNumber, 'alerted-orders'),
    }),
    [normalizedTableNumber]
  );

  const unlockCustomerAlert = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      customerAudioRef.current = customerAudioRef.current || new AudioContext();
      if (customerAudioRef.current.state === 'suspended') {
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
          osc.type = 'sine';
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
      if (ctx.state === 'suspended') {
        ctx
          .resume()
          .then(play)
          .catch(() => {});
        return;
      }
      play();
    } catch {
      // Notifications should not block ordering.
    }
  }, []);

  const showToast = useCallback((text, variant = 'success') => {
    const options = goeyToastOptions();
    if (variant === 'error') {
      gooeyToast.error(text, options);
      return;
    }
    gooeyToast.success(text, options);
  }, []);

  const showAddedToCartToast = useCallback(
    (item) => {
      const toastId = 'customer-cart-added';
      gooeyToast.success(
        t('addedToCartTitle'),
        goeyToastOptions({
          id: toastId,
          description: `${item.name} · ${t('quantity')}: ${item.quantity}`,
          icon: <ShoppingBag className="h-4 w-4" />,
          classNames: {
            actionButton: `${GOEY_TOAST_CLASS_NAMES.actionButton} happyboat-goey-toast-view-cart-action`,
          },
          action: {
            label: t('viewCart'),
            onClick: () => {
              setCartOpen(true);
              gooeyToast.dismiss(toastId);
            },
          },
        })
      );
    },
    [t]
  );

  const notifyPaymentReceived = useCallback(
    (orderId) => {
      const text = t('paymentReceived');
      setMessage(text);
      if (paidToastShown.current[orderId]) return;
      paidToastShown.current[orderId] = true;
      playCustomerAlert();
      gooeyToast.success(
        t('paymentReceivedAlert'),
        goeyToastOptions({
          id: `payment-received-${orderId}`,
          description: text,
          icon: <CheckCircle2 className="h-4 w-4" />,
          action: {
            label: t('viewOrder') || 'View Order',
            onClick: () => {
              setExpandedOrderId(orderId);
              gooeyToast.dismiss(`payment-received-${orderId}`);
            },
          },
        })
      );
    },
    [playCustomerAlert, t]
  );

  const notifyOrderStatusChanged = useCallback(
    (order) => {
      const statusText = customerStatusLabel(order.status, t);
      setMessage(`${t('orderStatusUpdated')}: ${statusText}`);
      playCustomerAlert();
      gooeyToast.info(
        t('orderStatusUpdated'),
        goeyToastOptions({
          id: `customer-order-status-${order.id || order.orderNumber || 'latest'}`,
          description: `${order.orderNumber || t('order')} · ${statusText}`,
          icon: <Clock className="h-4 w-4" />,
        })
      );
    },
    [playCustomerAlert, t]
  );

  useEffect(() => {
    setLoadedStorageScope('');
    setCart(readCustomerStorage(storageKeys.cart, []));
    setOrders(readCustomerStorage(storageKeys.orders, []));
    setPayments(readCustomerStorage(storageKeys.payments, {}));
    setDeletedOrderIds(readCustomerStorage(storageKeys.deletedOrders, []));
    setAlertedOrderIds(readCustomerStorage(storageKeys.alertedOrders, []));
    paidToastShown.current = {};
    paymentErrorToastShown.current = {};
    lastOrderStatusRef.current = {};
    setOpenPaymentOrderId(null);
    setCheckingPaymentIds([]);
    setPaymentVerificationMessage('');
    setLoadedStorageScope(storageKeys.cart);
  }, [
    storageKeys.alertedOrders,
    storageKeys.cart,
    storageKeys.deletedOrders,
    storageKeys.orders,
    storageKeys.payments,
  ]);

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
  }, [
    alertedOrderIds,
    cart,
    deletedOrderIds,
    loadedStorageScope,
    orders,
    payments,
    storageKeys.alertedOrders,
    storageKeys.cart,
    storageKeys.deletedOrders,
    storageKeys.orders,
    storageKeys.payments,
  ]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      welcomeToastShown.current = false;
      try {
        const [tableData, menuData] = await Promise.all([
          api(`/api/customer/tables/${encodeURIComponent(normalizedTableNumber)}`),
          api('/api/customer/menu'),
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
  }, [normalizedTableNumber]);

  useEffect(() => {
    if (loading || !table || welcomeToastShown.current) return;
    const tableLabel = customerTableLabel(table, normalizedTableNumber, t);
    if (!tableLabel) return;
    welcomeToastShown.current = true;
    gooeyToast.info(
      t('welcomeTitle'),
      goeyToastOptions({
        id: `customer-welcome-${normalizedTableNumber}`,
        description: `${t('youAreAtTable')} ${tableLabel}`,
        icon: <Utensils className="h-4 w-4" />,
      })
    );
  }, [loading, table, normalizedTableNumber, t]);

  useEffect(() => {
    const pending = Object.entries(payments).filter(([, p]) => p && p.status === 'PENDING');
    if (pending.length === 0) return;
    const timer = setInterval(async () => {
      for (const [orderId, payment] of pending) {
        if (pollingInFlight.current[payment.id]) continue;
        pollingInFlight.current[payment.id] = true;
        try {
          const verified = await api(`/api/payments/${payment.id}/verify`, { method: 'POST' });
          setPayments((prev) => ({ ...prev, [orderId]: verified }));
          if (verified.status === 'PAID') {
            lastOrderStatusRef.current[orderId] = 'RECEIVED';
            setOrders((prev) =>
              prev.map((order) =>
                order.id === orderId
                  ? {
                      ...order,
                      status: 'RECEIVED',
                      paidAt: verified.paidAt || new Date().toISOString(),
                    }
                  : order
              )
            );
            notifyPaymentReceived(orderId);
          }
        } catch (error) {
          if (openPaymentOrderId === orderId) {
            const text = error.message || t('paymentCheckFailed');
            setPaymentVerificationMessage(text);
            if (!paymentErrorToastShown.current[payment.id]) {
              paymentErrorToastShown.current[payment.id] = true;
              showToast(text, 'error');
            }
          }
        } finally {
          pollingInFlight.current[payment.id] = false;
        }
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [openPaymentOrderId, payments, notifyPaymentReceived, showToast, t]);

  useEffect(() => {
    const hasPending = Object.values(payments).some((p) => p && p.status === 'PENDING');
    const hasPaidKitchenOrder = orders.some((order) =>
      canRequestStaffAlert(order, Date.now(), { ignoreAge: true })
    );
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

  const groupedAddons = useMemo(() => groupBy(menu.addons, 'menuItemId'), [menu.addons]);
  const groupedOptions = useMemo(() => groupBy(menu.options, 'menuItemId'), [menu.options]);
  const groupedSizeLevels = useMemo(
    () => groupBy(menu.sizeLevels || [], 'menuItemId'),
    [menu.sizeLevels]
  );

  const totals = useMemo(() => {
    const subtotalUsd = cart.reduce((sum, item) => sum + Number(item.lineUsd || 0), 0);
    const rawDiscountUsd =
      promoState.status === 'valid' ? promoDiscountForSubtotal(promoState.detail, subtotalUsd) : 0;
    const maxDiscountUsd =
      cart.length > 0 ? Math.max(0, subtotalUsd - MIN_CART_TOTAL_USD) : subtotalUsd;
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

  useScrollReveal(mainRef, [filteredItems.length, visibleOrders.length]);

  useEffect(() => {
    if (visibleOrders.length === 0) return;

    let cancelled = false;
    async function refreshVisibleOrderStatuses() {
      const trackedOrders = visibleOrders
        .filter((order) => order?.id && orderAccessToken(order))
        .map((order) => ({ id: order.id, accessToken: orderAccessToken(order) }));
      if (trackedOrders.length === 0) return;

      try {
        const updates = await api('/api/customer/orders/statuses', {
          method: 'POST',
          body: JSON.stringify({ orders: trackedOrders }),
        });
        if (cancelled) return;
        updates.forEach((updated) => {
          if (updated?.notFound && updated?.id) {
            deleteLocalOrder(updated.id);
            return;
          }
          applyCustomerOrderUpdate(updated, { notify: true });
        });
      } catch (error) {
        setMessage(error.message || t('orderStatusUpdated'));
      }
    }

    refreshVisibleOrderStatuses();
    const timer = setInterval(refreshVisibleOrderStatuses, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleOrders, t]);

  function secsRemaining(payment) {
    if (!payment?.expiredAt) return 0;
    return Math.max(0, Math.floor((new Date(payment.expiredAt).getTime() - now) / 1000));
  }

  function setPaymentChecking(paymentId, checking) {
    if (!paymentId) return;
    setCheckingPaymentIds((current) =>
      checking
        ? current.includes(paymentId)
          ? current
          : [...current, paymentId]
        : current.filter((id) => id !== paymentId)
    );
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
      return upsertById(current, {
        ...updated,
        customerAccessToken: updated.customerAccessToken || existing?.customerAccessToken,
      });
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
    setPromoState({ status: 'idle', message: '', detail: null, showDetail: false });
  }

  async function applyPromoCode() {
    const code = promoCode.trim();
    if (!code) {
      setPromoState({
        status: 'invalid',
        message: t('enterPromoCode'),
        detail: null,
        showDetail: false,
      });
      return;
    }
    if (!cart.length) {
      setPromoState({
        status: 'invalid',
        message: t('promoBeforeItems'),
        detail: null,
        showDetail: false,
      });
      return;
    }

    setPromoState((current) => ({
      ...current,
      status: 'checking',
      message: t('checkingPromoCode'),
    }));
    try {
      const detail = await api(
        `/api/customer/promos/${encodeURIComponent(code)}/validate?subtotalUsd=${totals.subtotalUsd.toFixed(2)}`
      );
      if (detail.valid) {
        setPromoState({ status: 'valid', message: t('promoApplied'), detail, showDetail: false });
        showToast(t('promoApplied'));
      } else {
        setPromoState({
          status: 'invalid',
          message: t('invalidPromo'),
          detail: null,
          showDetail: false,
        });
        showToast(t('invalidPromo'), 'error');
      }
    } catch (error) {
      setPromoState({
        status: 'invalid',
        message: error.message || t('invalidPromo'),
        detail: null,
        showDetail: false,
      });
      showToast(error.message || t('invalidPromo'), 'error');
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
        return [
          { ...item, quantity, lineUsd: item.unitUsd * quantity + item.addonTotalUsd * quantity },
        ];
      })
    );
  }

  async function submitOrder() {
    if (!cart.length || submitting || totals.totalUsd <= 0) return;
    setMessage('');
    unlockCustomerAlert();
    setSubmitting(true);
    try {
      const payload = {
        tableNumber: normalizedTableNumber,
        promoCode: promoCode || null,
        idempotencyKey: crypto.randomUUID(),
        items: cart.map((item) => ({
          menuItemId: item.id,
          quantity: item.quantity,
          selectedSizeLevelId: item.selectedSizeLevelId || null,
          sizeLevel: item.sizeLevel,
          optionIds: item.optionIds || [],
          addons: item.addons.map((addon) => ({ addonId: addon.id, quantity: addon.quantity })),
          specialInstructions: item.specialInstructions,
        })),
      };
      const created = await api('/api/customer/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      lastOrderStatusRef.current[created.id] = created.status;
      setOrders((prev) => upsertById(prev, created));
      setDeletedOrderIds((prev) => prev.filter((id) => id !== created.id));
      setCart([]);
      setPromoCode('');
      setPromoState({ status: 'idle', message: '', detail: null, showDetail: false });
      setCartOpen(false);
      try {
        const createdPayment = await api(`/api/payments/orders/${created.id}/khqr`, {
          method: 'POST',
        });
        setPayments((prev) => ({ ...prev, [created.id]: createdPayment }));
        setOpenPaymentOrderId(created.id);
        setMessage(t('orderPlacedChooseBank'));
      } catch {
        setMessage(t('orderPlacedTapPay'));
      }
    } catch (error) {
      const customerMessage = isPromoCodeError(error, promoCode)
        ? t('invalidPromo')
        : error.message;
      setMessage(customerMessage);
      showToast(customerMessage, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function openPaymentFor(orderId) {
    setMessage('');
    setPaymentVerificationMessage('');
    unlockCustomerAlert();
    const payment = payments[orderId];
    const needsNewQr =
      !payment ||
      payment.status === 'EXPIRED' ||
      (payment.status === 'PENDING' && secsRemaining(payment) === 0);
    if (needsNewQr) {
      try {
        const created = await api(`/api/payments/orders/${orderId}/khqr`, { method: 'POST' });
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
    setPaymentVerificationMessage('');
    delete paymentErrorToastShown.current[payment.id];
    setPaymentChecking(payment.id, true);
    try {
      const verified = await api(`/api/payments/${payment.id}/verify`, { method: 'POST' });
      setPayments((prev) => ({ ...prev, [orderId]: verified }));
      if (verified.status === 'PAID') {
        lastOrderStatusRef.current[orderId] = 'RECEIVED';
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  status: 'RECEIVED',
                  paidAt: verified.paidAt || new Date().toISOString(),
                }
              : order
          )
        );
        notifyPaymentReceived(orderId);
      } else if (verified.transactions?.[0]?.responseMessage) {
        setPaymentVerificationMessage(verified.transactions[0].responseMessage);
      }
    } catch (error) {
      const text = error.message || t('paymentCheckFailed');
      setPaymentVerificationMessage(text);
      setMessage(text);
      showToast(text, 'error');
    } finally {
      setPaymentChecking(payment.id, false);
    }
  }

  async function cancelPaymentFor(orderId) {
    if (!orderId) return;
    if (!window.confirm(t('confirmCancelPayment'))) return;
    const order = orders.find((entry) => entry.id === orderId);
    setMessage('');
    setPaymentVerificationMessage('');
    try {
      const cancelled = await api(customerOrderApiPath(order || { id: orderId }, '/cancel'), { method: 'PATCH' });
      lastOrderStatusRef.current[orderId] = cancelled.status;
      setOrders((prev) => upsertById(prev, cancelled));
      setPayments((prev) => {
        const current = prev[orderId];
        return current ? { ...prev, [orderId]: { ...current, status: 'FAILED' } } : prev;
      });
      setOpenPaymentOrderId((current) => (current === orderId ? null : current));
      showToast(t('paymentCancelled'));
    } catch (error) {
      showToast(error.message || t('paymentCancelFailed'), 'error');
    }
  }

  function deleteLocalOrder(orderId) {
    setDeletedOrderIds((prev) => (prev.includes(orderId) ? prev : [...prev, orderId]));
    setAlertedOrderIds((prev) => prev.filter((id) => id !== orderId));
    delete lastOrderStatusRef.current[orderId];
    setPayments((prev) => {
      if (!prev[orderId]) return prev;
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setOpenPaymentOrderId((current) => (current === orderId ? null : current));
    showToast(t('orderDeleted'));
  }

  async function alertStaffFor(orderId) {
    const order = orderId ? orders.find((entry) => entry.id === orderId) : latestCustomerOrder(visibleOrders);
    const alertKey = orderId || 'table';
    if (alertingOrderId || (orderId && alertedOrderIds.includes(orderId))) return;
    setMessage('');
    setAlertingOrderId(alertKey);
    try {
      const payload = order?.id && orderAccessToken(order)
        ? { orderId: order.id, accessToken: orderAccessToken(order) }
        : {};
      const staffRequest = await api(`/api/customer/tables/${encodeURIComponent(normalizedTableNumber)}/call-staff`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (orderId) {
        setAlertedOrderIds((prev) => (prev.includes(orderId) ? prev : [...prev, orderId]));
      }
      const text = staffRequest?.duplicate ? t('callStaffAlreadySent') : t('callStaffSent');
      setMessage(text);
      showToast(text);
    } catch (error) {
      showToast(error.message || t('callStaffFailed'), 'error');
    } finally {
      setAlertingOrderId(null);
    }
  }

  if (loading) {
    return <CustomerOrderingSkeleton label={t('loadingMenu')} />;
  }

  const openModalOrder = openPaymentOrderId
    ? visibleOrders.find((o) => o.id === openPaymentOrderId)
    : null;
  const openModalPayment = openPaymentOrderId ? payments[openPaymentOrderId] : null;
  const isPaymentMessage =
    message === t('paymentReceived') || message.startsWith('Payment received');
  const tableLabel = customerTableLabel(table, normalizedTableNumber, t);

  return (
    <main ref={mainRef} className="min-h-screen overflow-x-hidden bg-background pb-24 lg:pb-0">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="fixed left-0 right-0 top-0 z-20 border-b border-border/60 bg-background/95 shadow-sm backdrop-blur-md">
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
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl px-3 text-xs font-semibold"
              disabled={alertingOrderId === 'table'}
              onClick={() => alertStaffFor(null)}
            >
              <BellRing className="h-4 w-4" />
              <span className="hidden sm:inline">
                {alertingOrderId === 'table' ? t('callingStaff') : t('callStaff')}
              </span>
            </Button>
            <div className="hidden h-8 items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-3 text-sm font-semibold sm:flex">
              <Utensils className="h-3.5 w-3.5 text-primary" />
              {table?.tableNumber || tableLabel}
            </div>
          </div>
        </div>
      </header>
      <div className="h-[69px]" aria-hidden="true" />

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
        {/* ── Menu section ───────────────────────────────────── */}
        <section className="min-w-0">
          {/* Status banner */}
          {message ? (
            <div
              data-scroll-reveal
              className={cn(
                'scroll-reveal mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
                isPaymentMessage
                  ? 'border-primary/30 bg-primary/8 text-primary'
                  : 'border-border bg-muted/50'
              )}
            >
              {isPaymentMessage ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span>{message}</span>
            </div>
          ) : null}

          {/* ── Filters ──────────────────────────────────────── */}
          <div data-scroll-reveal className="scroll-reveal mb-5 space-y-3">
            {/* Search + Category row */}
            <div className="grid gap-2.5 sm:grid-cols-[1fr_200px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchDishes')}
                  className="h-10 rounded-xl pl-9 text-sm"
                />
                {query ? (
                  <button
                    onClick={() => setQuery('')}
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
                aria-label={t('category')}
              >
                <option value="">{t('allCategories')}</option>
                {menu.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
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
                    'inline-flex shrink-0 cursor-pointer items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-150',
                    priceFilter === opt.value
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Result count */}
          {filteredItems.length > 0 ? (
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              {t('dishesCount').replace('{count}', filteredItems.length)}
            </p>
          ) : null}

          {/* ── Menu grid ────────────────────────────────────── */}
          <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            {filteredItems.map((item) => (
              <MenuCard key={item.id} item={item} onSelect={() => setActiveItem(item)} />
            ))}
            {filteredItems.length === 0 ? (
              <div className="col-span-full flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 py-14 text-center">
                <Search className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">{t('noDishes')}</p>
                <button
                  onClick={() => {
                    setQuery('');
                    setCategoryId('');
                    setPriceFilter('all');
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t('clearFilters')}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── Cart sidebar ───────────────────────────────────── */}
        <aside
          ref={cartRef}
          data-scroll-reveal
          className="scroll-reveal hidden scroll-mt-24 space-y-4 lg:block lg:sticky lg:top-24 lg:self-start"
        >
          <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
            {/* Cart header */}
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">{t('yourOrder')}</h2>
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
                    <p className="text-xs text-muted-foreground">{t('addDishes')}</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <CartLineItem
                      key={item.cartId}
                      item={item}
                      onDecrease={() => changeQuantity(item.cartId, -1)}
                      onIncrease={() => changeQuantity(item.cartId, 1)}
                      onRemove={() => setCart((c) => c.filter((e) => e.cartId !== item.cartId))}
                    />
                  ))
                )}
              </div>

              {/* Promo code */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={promoCode}
                    onChange={(e) => handlePromoCodeChange(e.target.value)}
                    placeholder={t('promoCode')}
                    className="h-9 rounded-xl text-sm uppercase tracking-wider"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0 rounded-xl px-3 text-xs"
                    disabled={promoState.status === 'checking'}
                    onClick={applyPromoCode}
                  >
                    <BadgePercent className="h-3.5 w-3.5" />
                    {promoState.status === 'checking' ? t('checking') : t('apply')}
                  </Button>
                </div>
                {promoState.message ? (
                  <div
                    className={cn(
                      'rounded-xl border px-3 py-2 text-xs',
                      promoState.status === 'valid'
                        ? 'border-primary/30 bg-primary/8 text-primary'
                        : 'border-destructive/20 bg-destructive/8 text-destructive'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{promoState.message}</span>
                      {promoState.status === 'valid' ? (
                        <button
                          type="button"
                          className="font-semibold underline-offset-2 hover:underline"
                          onClick={togglePromoDetail}
                        >
                          {promoState.showDetail ? t('hideDetail') : t('showDetail')}
                        </button>
                      ) : null}
                    </div>
                    {promoState.status === 'valid' && promoState.showDetail ? (
                      <div className="mt-2 space-y-1 border-t border-primary/20 pt-2 text-primary/90">
                        <div className="font-semibold">{promoState.detail?.code}</div>
                        {promoState.detail?.description ? (
                          <div>{promoState.detail.description}</div>
                        ) : null}
                        <div>{formatPromoValue(promoState.detail)}</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Total */}
              <div className="rounded-2xl bg-muted/40 px-4 py-4">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">{t('subtotal')}</span>
                  <span className="text-sm font-semibold">{usd(totals.subtotalUsd)}</span>
                </div>
                {totals.discountUsd > 0 ? (
                  <div className="mb-1 flex items-baseline justify-between text-primary">
                    <span className="text-xs">
                      {t('discount')}
                      {promoState.detail?.code ? ` (${promoState.detail.code})` : ''}
                    </span>
                    <span className="text-sm font-semibold">-{usd(totals.discountUsd)}</span>
                  </div>
                ) : null}
                <div className="my-2 border-t border-border/60" />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{t('total')}</span>
                  <span className="text-xl font-bold">{usd(totals.totalUsd)}</span>
                </div>
                <div className="mt-0.5 text-right text-xs text-muted-foreground">
                  {khr(totals.totalKhr)}
                </div>
              </div>

              {/* Place order button */}
              <Button
                className="h-14 w-full rounded-2xl text-base font-bold shadow-sm"
                disabled={!cart.length || totals.totalUsd <= 0 || submitting}
                onClick={submitOrder}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    {t('placingOrder')}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" />
                    {t('placeOrder')}
                    {cart.length > 0 ? (
                      <span className="ml-auto">{usd(totals.totalUsd)}</span>
                    ) : null}
                  </span>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* ── Past orders ───────────────────────────────── */}
          {visibleOrders.length ? (
            <div data-scroll-reveal className="scroll-reveal flex items-center justify-between px-1">
              <h2 className="text-sm font-bold">{t('orderStatus')}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {visibleOrders.length}
              </span>
            </div>
          ) : null}
          {visibleOrders.map((order) => {
            const payment = payments[order.id];
            const secs = secsRemaining(payment);
            const isCancelled = order.status === 'CANCELLED' || payment?.status === 'FAILED';
            const isPaid =
              !isCancelled &&
              (payment?.status === 'PAID' ||
                RECEIPT_ORDER_STATUSES.includes(order.status));
            const isReceived = order.status === 'RECEIVED';
            const isExpired =
              order.status === 'EXPIRED' ||
              payment?.status === 'EXPIRED' ||
              (payment?.status === 'PENDING' && secs === 0);
            const staffAlertSent = alertedOrderIds.includes(order.id);

            return (
              <Card
                key={order.id}
                data-scroll-reveal
                className="scroll-reveal overflow-hidden rounded-2xl border-border/60 shadow-sm"
              >
                <div
                  className={cn(
                    'flex items-center justify-between border-b border-border/60 px-4 py-2.5',
                    isReceived ? 'bg-accent/8' : isPaid ? 'bg-primary/6' : 'bg-muted/30'
                  )}
                >
                  <div>
                    <p className="text-sm font-bold">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {order.status?.toLowerCase()}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
                      isReceived
                        ? 'bg-accent/15 text-accent'
                        : isPaid
                          ? 'bg-primary/15 text-primary'
                          : isCancelled
                            ? 'bg-destructive/10 text-destructive'
                            : isExpired
                              ? 'bg-destructive/10 text-destructive'
                              : payment
                                ? 'bg-secondary/20 text-secondary-foreground'
                                : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {isReceived
                      ? t('receivedByStaff')
                      : isPaid
                        ? t('paid')
                        : isCancelled
                          ? t('cancelled')
                          : isExpired
                            ? t('expired')
                            : payment
                              ? t('pending')
                              : t('unpaid')}
                  </span>
                </div>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold">{displayUsd(order.totalUsd)}</span>
                    <span className="text-xs text-muted-foreground">{khr(order.totalKhr)}</span>
                  </div>
                  <CustomerOrderProgress status={order.status} />

                  {/* View Details button */}
                  <button
                    type="button"
                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                    className="w-full text-left text-xs font-medium text-primary hover:underline"
                  >
                    {expandedOrderId === order.id ? t('hideDetails') : t('viewDetails')}
                  </button>

                  {/* Expanded order details */}
                  {expandedOrderId === order.id ? <OrderDetailMiniItems order={order} /> : null}

                  {isCancelled ? (
                    <>
                      <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                        {t('orderCancelled')}
                      </div>
                      <Button
                        className="h-11 w-full rounded-xl text-sm"
                        variant="outline"
                        onClick={() => deleteLocalOrder(order.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('deleteOrder')}
                      </Button>
                    </>
                  ) : isPaid ? (
                    <>
                      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2.5 text-xs font-medium text-primary">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        {t('paymentConfirmed')}
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2 text-xs font-medium text-primary">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        {t('paidMinutes')} {paidWaitingMinutes(order, payment, now)}m
                      </div>
                      <Button
                        className="h-11 w-full rounded-xl text-sm"
                        variant="secondary"
                        disabled={staffAlertSent || alertingOrderId === order.id}
                        onClick={() => alertStaffFor(order.id)}
                      >
                        <BellRing className="h-3.5 w-3.5" />
                        {staffAlertSent
                          ? t('callStaffSentShort')
                          : alertingOrderId === order.id
                            ? t('checking')
                            : t('callStaff')}
                      </Button>
                      <a
                        href={receiptHref(order)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        {t('openReceipt')}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    </>
                  ) : (
                    <>
                      {payment && !isExpired ? (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {t('expiresIn')} {formatDuration(secs)}
                        </div>
                      ) : null}
                      {isExpired ? (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                          {t('qrExpiredShort')}
                        </div>
                      ) : null}
                      <div className="grid gap-2">
                        <Button
                          className="h-11 w-full rounded-xl text-sm"
                          variant="secondary"
                          onClick={() => openPaymentFor(order.id)}
                        >
                          <Zap className="h-3.5 w-3.5" />
                          {payment ? t('viewPayment') : t('payWithBakong')}
                        </Button>
                        <Button
                          className="h-11 w-full rounded-xl text-sm"
                          variant="outline"
                          onClick={() => cancelPaymentFor(order.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                          {t('cancelPayment')}
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
              'relative flex w-full items-center justify-between rounded-2xl px-5 py-3.5 shadow-lg transition-all',
              cart.length > 0
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-foreground'
            )}
          >
            <span
              className={cn(
                'absolute -top-3 left-1/2 flex h-6 w-12 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm',
                cart.length > 0
                  ? 'border-primary/30 bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground'
              )}
            >
              <ChevronUp className="h-4 w-4" />
            </span>
            <span className="flex items-center gap-2.5 text-sm font-semibold">
              <ShoppingBag className="h-4 w-4" />
              {cart.length > 0
                ? t('cartItemCount').replace('{count}', cart.length)
                : t('viewCart')}
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
          addons={activeItem.addons || groupedAddons[activeItem.id] || []}
          sizeLevels={activeItem.sizeLevels || groupedSizeLevels[activeItem.id] || []}
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
          checking={checkingPaymentIds.includes(openModalPayment.id)}
          verificationMessage={paymentVerificationMessage}
          onClose={() => setOpenPaymentOrderId(null)}
          onRefresh={() => refreshPaymentFor(openPaymentOrderId)}
          onReissue={() => openPaymentFor(openPaymentOrderId)}
        />
      ) : null}
    </main>
  );
}

function CustomerOrderingSkeleton({ label }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background pb-24 lg:pb-0">
      <header className="fixed left-0 right-0 top-0 z-20 border-b border-border/60 bg-background/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-11 w-20 animate-pulse rounded-xl bg-muted" />
            <div className="h-11 w-11 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      </header>
      <div className="h-[69px]" aria-hidden="true" />

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0">
          <div className="mb-5 space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-[1fr_200px]">
              <div className="h-10 animate-pulse rounded-xl bg-muted" />
              <div className="h-10 animate-pulse rounded-xl bg-muted" />
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-8 w-20 animate-pulse rounded-full bg-muted" />
              ))}
            </div>
          </div>
          <p className="mb-3 text-xs font-medium text-muted-foreground">{label}</p>
          <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div
                key={index}
                className="flex min-h-[250px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card sm:rounded-2xl"
              >
                <div className="aspect-square animate-pulse bg-muted sm:aspect-[16/10]" />
                <div className="flex flex-1 flex-col gap-2 p-3.5">
                  <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="mt-auto flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="h-11 w-11 animate-pulse rounded-xl bg-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="hidden space-y-4 lg:block lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3">
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              <div className="h-5 w-5 animate-pulse rounded-full bg-muted" />
            </div>
            <CardContent className="space-y-4 p-4">
              {[0, 1].map((index) => (
                <div key={index} className="flex gap-3 rounded-2xl border border-border/60 p-4">
                  <div className="h-14 w-14 animate-pulse rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                    <div className="h-11 w-32 animate-pulse rounded-xl bg-muted" />
                  </div>
                </div>
              ))}
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
              <div className="h-14 animate-pulse rounded-2xl bg-muted" />
            </CardContent>
          </Card>
        </aside>
      </div>
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
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectItem();
        }
      }}
      aria-label={`Customize ${item.name}`}
      data-scroll-reveal
      className={cn(
        'scroll-reveal group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md sm:rounded-2xl',
        item.available ? 'cursor-pointer active:scale-[0.99]' : 'cursor-not-allowed grayscale-[35%]'
      )}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted sm:aspect-[16/10]">
        <MenuImage
          src={item.imageUrl}
          alt={item.name}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 260px"
        />
        {!item.available ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground sm:px-3 sm:text-xs">
              {t('unavailable')}
            </span>
          </div>
        ) : null}
        {/* Dietary tags overlay */}
        {tags(item.dietaryTags).length > 0 ? (
          <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1 sm:left-2 sm:top-2">
            {tags(item.dietaryTags)
              .slice(0, 2)
              .map((tag) => (
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
        <h2 className="line-clamp-2 text-xs font-bold leading-snug sm:line-clamp-1 sm:text-sm">
          {item.name}
        </h2>
        <p className="mt-1 line-clamp-2 flex-1 text-[11px] leading-snug text-muted-foreground sm:text-xs sm:leading-relaxed">
          {item.description}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2 sm:mt-3">
          <div>
            <div className="text-xs font-bold sm:text-sm">{displayUsd(item.priceUsd)}</div>
            <div className="text-[9px] text-muted-foreground sm:text-[10px]">
              {khr(item.priceKhr)}
            </div>
          </div>
          <button
            onClick={(event) => {
              event.stopPropagation();
              selectItem();
            }}
            disabled={!item.available}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all',
              item.available
                ? 'bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:scale-95'
                : 'cursor-not-allowed bg-muted text-muted-foreground'
            )}
            aria-label={`${t('addToCart')} ${item.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CartLineItem({ item, onDecrease, onIncrease, onRemove, controlSize = 'sm' }) {
  const { t } = useLanguage();
  const buttonSize = controlSize === 'md' ? 'h-11 w-11' : 'h-10 w-10 sm:h-11 sm:w-11';
  const quantityWidth = controlSize === 'md' ? 'w-7' : 'w-6';

  return (
    <div className="relative flex gap-3 rounded-2xl border border-border/60 bg-card p-4 pr-10">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
        <MenuImage src={item.imageUrl} alt={item.name} sizes="56px" />
      </div>
      <button
        onClick={onRemove}
        aria-label={t('removeItem')}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-base font-bold leading-snug">{item.name}</h3>
        {orderItemSizeLabel(item) || item.addons?.length ? (
          <div className="mt-1 space-y-0.5">
            {orderItemSizeLabel(item) ? (
              <p className="text-xs text-muted-foreground">
                {t('size')}: {orderItemSizeLabel(item)}
              </p>
            ) : null}
            {(item.addons || []).map((addon, index) => (
              <p key={addon.id || `${addon.name}-${index}`} className="text-xs text-muted-foreground">
                + {formatAddonDetail(addon)}
              </p>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onDecrease}
              className={cn(
                'flex items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-primary',
                buttonSize
              )}
              aria-label={t('decrease')}
            >
                <Minus className="h-4 w-4" />
            </button>
            <span className={cn('text-center text-sm font-semibold', quantityWidth)}>
              {item.quantity}
            </span>
            <button
              onClick={onIncrease}
              className={cn(
                'flex items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-primary',
                buttonSize
              )}
              aria-label={t('increase')}
            >
                <Plus className="h-4 w-4" />
            </button>
          </div>
          <span className="shrink-0 text-sm font-semibold">{usd(item.lineUsd)}</span>
        </div>
      </div>
    </div>
  );
}

function OrderDetailMiniItems({ order }) {
  const { t } = useLanguage();
  if (!order.items?.length) return null;

  return (
    <div className="space-y-2 border-t border-border/30 pt-3">
      {order.items.map((item, index) => (
        <div
          key={item.id || `${item.menuItemId}-${index}`}
          className="flex gap-2 rounded-xl bg-muted/30 p-2.5"
        >
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
            <MenuImage src={item.imageUrl} alt={item.name || item.itemName} sizes="48px" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight">{item.name || item.itemName}</p>
            <p className="text-xs text-muted-foreground">x{item.quantity}</p>
            {orderItemSizeLabel(item) || item.addons?.length ? (
              <div className="mt-1 space-y-0.5">
                {orderItemSizeLabel(item) ? (
                  <p className="text-xs text-muted-foreground">
                    {t('size')}: {orderItemSizeLabel(item)}
                  </p>
                ) : null}
                {(item.addons || []).map((addon, addonIndex) => (
                  <p
                    key={addon.id || addon.addonId || `${addon.name}-${addonIndex}`}
                    className="text-xs text-muted-foreground"
                  >
                    + {formatAddonDetail(addon)}
                  </p>
                ))}
              </div>
            ) : null}
            {item.specialInstructions ? (
              <p className="mt-1 text-xs italic text-muted-foreground">
                {item.specialInstructions}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold">{usd(item.lineUsd || item.subtotalUsd || 0)}</p>
          </div>
        </div>
      ))}
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
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end overflow-hidden bg-black/40 backdrop-blur-sm lg:hidden"
      onClick={onClose}
    >
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
            <h2 className="text-base font-bold">{t('yourOrder')}</h2>
            {cart.length > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {cart.length}
              </span>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-border p-1.5 text-muted-foreground hover:text-foreground"
            aria-label={t('closeCart')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-4">
          <div className="space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 py-8 text-center">
                <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">{t('addDishes')}</p>
              </div>
            ) : (
              cart.map((item) => (
                <CartLineItem
                  key={item.cartId}
                  item={item}
                  controlSize="md"
                  onDecrease={() => changeQuantity(item.cartId, -1)}
                  onIncrease={() => changeQuantity(item.cartId, 1)}
                  onRemove={() =>
                    setCart((current) => current.filter((entry) => entry.cartId !== item.cartId))
                  }
                />
              ))
            )}
          </div>

          <div className="space-y-2">
            <div className="grid gap-2">
              <Input
                value={promoCode}
                onChange={(event) => onPromoCodeChange(event.target.value)}
                placeholder={t('promoCode')}
                className="h-10 w-full rounded-xl text-sm uppercase tracking-wider"
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl px-3 text-xs"
                disabled={promoState.status === 'checking'}
                onClick={onApplyPromo}
              >
                <BadgePercent className="h-3.5 w-3.5" />
                {promoState.status === 'checking' ? t('checking') : t('apply')}
              </Button>
            </div>
            {promoState.message ? (
              <div
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs',
                  promoState.status === 'valid'
                    ? 'border-primary/30 bg-primary/8 text-primary'
                    : 'border-destructive/20 bg-destructive/8 text-destructive'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{promoState.message}</span>
                  {promoState.status === 'valid' ? (
                    <button
                      type="button"
                      className="font-semibold underline-offset-2 hover:underline"
                      onClick={onTogglePromoDetail}
                    >
                      {promoState.showDetail ? t('hideDetail') : t('showDetail')}
                    </button>
                  ) : null}
                </div>
                {promoState.status === 'valid' && promoState.showDetail ? (
                  <div className="mt-2 space-y-1 border-t border-primary/20 pt-2 text-primary/90">
                    <div className="font-semibold">{promoState.detail?.code}</div>
                    {promoState.detail?.description ? (
                      <div>{promoState.detail.description}</div>
                    ) : null}
                    <div>{formatPromoValue(promoState.detail)}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {orders.length ? (
            <div className="space-y-3 border-t border-border/60 pt-4">
              <h3 className="text-sm font-bold">{t('orderStatus')}</h3>
              {orders.map((order) => {
                const payment = payments[order.id];
                const secs = secsRemaining(payment);
                const isCancelled = order.status === 'CANCELLED' || payment?.status === 'FAILED';
                const isPaid =
                  !isCancelled &&
                  (payment?.status === 'PAID' ||
                    RECEIPT_ORDER_STATUSES.includes(order.status));
                const isReceived = order.status === 'RECEIVED';
                const isExpired =
                  order.status === 'EXPIRED' ||
                  payment?.status === 'EXPIRED' ||
                  (payment?.status === 'PENDING' && secs === 0);
                const staffAlertSent = alertedOrderIds.includes(order.id);
                return (
                  <div
                    key={order.id}
                    className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
                  >
                    <div
                      className={cn(
                        'flex items-center justify-between border-b border-border/60 px-4 py-2.5',
                        isReceived ? 'bg-accent/8' : isPaid ? 'bg-primary/6' : 'bg-muted/30'
                      )}
                    >
                      <div>
                        <p className="text-sm font-bold">{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {order.status?.toLowerCase()}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
                          isReceived
                            ? 'bg-accent/15 text-accent'
                            : isPaid
                              ? 'bg-primary/15 text-primary'
                              : isCancelled
                                ? 'bg-destructive/10 text-destructive'
                                : isExpired
                                  ? 'bg-destructive/10 text-destructive'
                                  : payment
                                    ? 'bg-secondary/20 text-secondary-foreground'
                                    : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {isReceived
                          ? t('receivedByStaff')
                          : isPaid
                            ? t('paid')
                            : isCancelled
                              ? t('cancelled')
                              : isExpired
                                ? t('expired')
                                : payment
                                  ? t('pending')
                                  : t('unpaid')}
                      </span>
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold">{displayUsd(order.totalUsd)}</span>
                        <span className="text-xs text-muted-foreground">{khr(order.totalKhr)}</span>
                      </div>
                      <CustomerOrderProgress status={order.status} />
                      
                      {/* View Details button */}
                      <button
                        type="button"
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                        className="w-full text-left text-xs font-medium text-primary hover:underline"
                      >
                        {expandedOrderId === order.id ? t('hideDetails') : t('viewDetails')}
                      </button>

                      {/* Expanded order details */}
                      {expandedOrderId === order.id ? <OrderDetailMiniItems order={order} /> : null}

                      {isCancelled ? (
                        <>
                          <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                            {t('orderCancelled')}
                          </div>
                          <Button
                            className="h-11 w-full rounded-xl text-sm"
                            variant="outline"
                            onClick={() => onDeleteOrder(order.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('deleteOrder')}
                          </Button>
                        </>
                      ) : isPaid ? (
                        <div className="grid gap-2">
                          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2 text-xs font-medium text-primary">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {t('paidMinutes')} {paidWaitingMinutes(order, payment, now)}m
                          </div>
                          <Button
                            className="h-11 w-full rounded-xl text-sm"
                            variant="secondary"
                            disabled={staffAlertSent || alertingOrderId === order.id}
                            onClick={() => onAlertStaff(order.id)}
                          >
                            <BellRing className="h-3.5 w-3.5" />
                            {staffAlertSent
                              ? t('callStaffSentShort')
                              : alertingOrderId === order.id
                                ? t('checking')
                                : t('callStaff')}
                          </Button>
                          <a
                            href={receiptHref(order)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
                          >
                            {t('openReceipt')}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          {isExpired ? (
                            <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                              {t('qrExpiredShort')}
                            </div>
                          ) : null}
                          <Button
                            className="h-11 w-full rounded-xl text-sm"
                            variant="secondary"
                            onClick={() => {
                              onClose();
                              onOpenPayment(order.id);
                            }}
                          >
                            <Zap className="h-3.5 w-3.5" />
                            {payment ? t('viewPayment') : t('payWithBakong')}
                          </Button>
                          <Button
                            className="h-11 w-full rounded-xl text-sm"
                            variant="outline"
                            onClick={() => onCancelPayment(order.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                            {t('cancelPayment')}
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

        <div className="border-t border-border/60 bg-card/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mb-3 rounded-2xl bg-muted/40 px-4 py-3">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{t('subtotal')}</span>
              <span className="text-sm font-semibold">{usd(totals.subtotalUsd)}</span>
            </div>
            {totals.discountUsd > 0 ? (
              <div className="mb-1 flex items-baseline justify-between text-primary">
                <span className="text-xs">
                  {t('discount')}
                  {promoState.detail?.code ? ` (${promoState.detail.code})` : ''}
                </span>
                <span className="text-sm font-semibold">-{usd(totals.discountUsd)}</span>
              </div>
            ) : null}
            <div className="my-2 border-t border-border/60" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">{t('total')}</span>
              <span className="text-xl font-bold">{usd(totals.totalUsd)}</span>
            </div>
            <div className="mt-0.5 text-right text-xs text-muted-foreground">
              {khr(totals.totalKhr)}
            </div>
          </div>

          <Button
            className="h-14 w-full rounded-2xl text-base font-bold shadow-sm"
            disabled={!cart.length || totals.totalUsd <= 0 || submitting}
            onClick={onSubmitOrder}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                {t('placingOrder')}
              </span>
            ) : (
              <span className="flex w-full items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                {t('placeOrder')}
                {cart.length > 0 ? <span className="ml-auto">{usd(totals.totalUsd)}</span> : null}
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CustomerOrderProgress({ status }) {
  const { t } = useLanguage();
  const steps = [
    { status: 'PENDING_PAYMENT', label: t('awaitingPayment') },
    { status: 'RECEIVED', label: t('receivedByStaff') },
    { status: 'PREPARING', label: t('acceptedPreparing') },
    { status: 'READY', label: t('readyForPickup') },
    { status: 'COMPLETED', label: t('orderComplete') },
  ];
  const activeIndex = customerStatusStepIndex(status);

  if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(status)) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs font-medium text-destructive">
        {customerStatusLabel(status, t)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {steps.map((step, index) => {
        const done = activeIndex >= index;
        const current = activeIndex === index;
        return (
          <div
            key={step.status}
            className={cn(
              'min-w-0 rounded-lg border px-1.5 py-1.5 text-center text-[10px] font-semibold leading-tight',
              done
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-muted/30 text-muted-foreground',
              current ? 'ring-1 ring-primary/30' : ''
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
function PaymentModal({
  order,
  payment,
  secondsRemaining,
  checking = false,
  verificationMessage = '',
  onClose,
  onRefresh,
  onReissue,
}) {
  const { t } = useLanguage();
  const isPaid = payment.status === 'PAID';
  const isExpired = payment.status === 'EXPIRED' || secondsRemaining === 0;

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="bottom-sheet-animate w-full max-h-[92vh] overflow-auto rounded-t-2xl bg-card text-card-foreground shadow-xl sm:mx-auto sm:max-w-md sm:rounded-2xl">
        {/* Modal header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 p-5">
          <div>
            <h2 className="text-lg font-bold">
              {isPaid
                ? t('paymentReceived')
                : isExpired
                  ? t('paymentExpired')
                  : t('scanToPay')}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {order?.orderNumber} · {payment.paymentNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-border p-1.5 text-muted-foreground hover:text-foreground"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-center">
          {!isPaid && !isExpired ? (
            <Button
              type="button"
              variant="secondary"
              className="h-12 w-full rounded-xl text-sm font-semibold"
              onClick={() => downloadPaymentQrImage(order, payment, t)}
            >
              <Download className="h-4 w-4" />
              {t('saveImage')}
            </Button>
          ) : null}

          {!isPaid && !isExpired ? (
            <>
              <div
                className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-border/60 bg-white text-slate-950 shadow-sm"
                data-payment-qr={payment.id}
              >
                <div className="flex h-14 items-center justify-center bg-[#e1232e] px-5">
                  <img src={KHQR_LOGO_WHITE_SRC} alt="KHQR" className="h-8 w-auto" />
                </div>
                <div className="space-y-1 px-5 pt-4 text-left">
                  <p className="text-sm font-semibold leading-none">HappyBoat</p>
                  <p className="text-xs text-slate-500">{payment.paymentNumber}</p>
                </div>
                <div className="flex justify-center px-5 pb-5 pt-4">
                  <QRCodeSVG value={payment.khqrString} size={264} includeMargin={false} level="M" />
                </div>
              </div>
            </>
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

          <div
            className={cn(
              'rounded-xl px-4 py-3 text-sm font-medium',
              isPaid
                ? 'bg-primary/10 text-primary'
                : isExpired
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground'
            )}
          >
            {checking ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {t('checkingPayment')}
              </span>
            ) : isPaid ? (
              t('paymentConfirmed')
            ) : isExpired ? (
              t('qrExpired')
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Clock className="h-4 w-4" />
                {t('expiresIn')} {formatDuration(secondsRemaining)}
              </span>
            )}
          </div>

          {!isPaid && !isExpired ? (
            <div className="rounded-xl border border-border/60 bg-muted/35 px-4 py-3 text-left text-xs leading-relaxed text-muted-foreground">
              <div className="flex items-start gap-2">
                <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{t('paymentAutoCheckHint')}</span>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{t('scanQrHelp')}</span>
              </div>
            </div>
          ) : null}

          {verificationMessage && !isPaid ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              {verificationMessage}
            </div>
          ) : null}

          {isPaid ? (
            <a
              href={receiptHref(order)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              {t('downloadReceipt')} <ChevronRight className="h-4 w-4" />
            </a>
          ) : !isExpired ? (
            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl text-sm"
                disabled={checking}
                onClick={onRefresh}
              >
                {checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                {checking ? t('checking') : t('refreshPaymentNow')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                {t('expiredQrHelp')}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl text-sm"
                  disabled={checking}
                  onClick={onRefresh}
                >
                  {checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  {checking ? t('checking') : t('refreshPaymentNow')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 rounded-xl text-sm"
                  onClick={onReissue}
                >
                  <RefreshCw className="h-4 w-4" />
                  {t('generateNewQr')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── CustomizeItem ────────────────────────────────────────── */
function CustomizeItem({ item, addons, sizeLevels = [], options, onClose, onAdd }) {
  const { t } = useLanguage();
  const availableSizeLevels = useMemo(
    () =>
      (sizeLevels.length
        ? sizeLevels
        : options
            .filter((option) => option.optionGroup === 'Size')
            .map((option) => ({
              ...option,
              name: option.optionName,
            }))).map((size) => ({
        ...size,
        name: size.name || size.optionName || '',
      })),
    [options, sizeLevels]
  );
  const hasSizeLevels = availableSizeLevels.length > 0;
  const hasAddons = addons.length > 0;
  const defaultSizeLevel = useMemo(
    () =>
      availableSizeLevels.find((size) => isDefault(size)) ||
      availableSizeLevels.find((size) => sizeLevelLabel(size).toUpperCase() === 'NORMAL') ||
      null,
    [availableSizeLevels]
  );
  const defaultAddons = useMemo(
    () =>
      addons
        .filter((addon) => isDefault(addon))
        .map((addon) => selectedAddonPayload(addon)),
    [addons]
  );

  const [quantity, setQuantity] = useState(1);
  const [selectedSizeLevel, setSelectedSizeLevel] = useState(defaultSizeLevel);
  const [selectedAddons, setSelectedAddons] = useState(defaultAddons);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  const sizeRequired =
    Boolean(item.isSizeRequired) || availableSizeLevels.some((size) => Boolean(size.required));
  const unitUsd = Number(item.priceUsd || 0) + Number(selectedSizeLevel?.priceUsd || 0);
  const addonTotalUsd = selectedAddons.reduce(
    (sum, addon) => sum + Number(addon.priceUsd || 0) * Number(addon.quantity || 1),
    0
  );
  const lineUsd = unitUsd * quantity + addonTotalUsd * quantity;
  const selectedOptionIds = selectedSizeLevel?.optionGroup === 'Size' ? [selectedSizeLevel.id] : [];
  const sizeName = selectedSizeLevel ? sizeLevelLabel(selectedSizeLevel) : '';
  const addDisabled = sizeRequired && hasSizeLevels && !selectedSizeLevel;
  const productDescription = item.description?.trim();

  function addItemToCart() {
    if (addDisabled) return;
    onAdd({
      ...item,
      quantity,
      selectedSizeLevelId: selectedSizeLevel?.optionGroup === 'Size' ? null : selectedSizeLevel?.id || null,
      sizeLevelName: sizeName || 'Normal',
      sizeLevelPriceUsd: Number(selectedSizeLevel?.priceUsd || 0),
      sizeLevel: sizeName ? sizeName.toUpperCase() : 'NORMAL',
      optionIds: selectedOptionIds,
      addons: selectedAddons,
      unitUsd,
      addonTotalUsd,
      lineUsd,
      specialInstructions,
    });
  }

  function toggleAddon(addon) {
    setSelectedAddons((current) =>
      current.some((entry) => entry.id === addon.id)
        ? current.filter((entry) => entry.id !== addon.id)
        : [...current, selectedAddonPayload(addon)]
    );
  }

  function changeAddonQuantity(addonId, delta) {
    setSelectedAddons((current) =>
      current.map((addon) => {
        if (addon.id !== addonId) return addon;
        const nextQuantity = Math.max(
          1,
          Math.min(addonSelectionMax(addon), Number(addon.quantity || 1) + delta)
        );
        return { ...addon, quantity: nextQuantity };
      })
    );
  }

  const quantityAndPrice = (
    <div className="flex items-center justify-between pt-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
          aria-label={t('decrease')}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center text-base font-bold">{quantity}</span>
        <button
          onClick={() => setQuantity(quantity + 1)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
          aria-label={t('increase')}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold">{usd(lineUsd)}</div>
        <div className="text-xs text-muted-foreground">
          {usd(unitUsd)} {t('each')}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-30 flex items-end bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="bottom-sheet-animate max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-card text-card-foreground shadow-xl sm:mx-auto sm:max-w-lg sm:rounded-2xl">
          {/* Item header */}
          <div className="relative">
            <div className="relative aspect-[3/1] overflow-hidden bg-muted">
              <MenuImage
                src={item.imageUrl}
                alt={item.name}
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 512px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
            </div>
            <button
              type="button"
              onClick={() => setShowFullImage(true)}
              className="absolute left-3 top-3 flex h-9 items-center gap-1.5 rounded-full bg-background/85 px-3 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm hover:bg-background"
              aria-label={t('viewFullImage')}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              {t('viewFullImage')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm hover:bg-background"
              aria-label={t('close')}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="absolute bottom-3 left-4 right-14">
              <h2 className="text-lg font-bold leading-tight">{item.name}</h2>
              {productDescription ? (
                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                  {productDescription}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-5 p-4">
          {productDescription ? (
            <div className="rounded-2xl border border-border/60 bg-muted/25 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <h3 className="truncate text-sm font-bold">{t('fullDescription')}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFullDescription((current) => !current)}
                  className="shrink-0 text-xs font-semibold text-primary hover:underline"
                >
                  {showFullDescription ? t('hideFullDescription') : t('showFullDescription')}
                </button>
              </div>
              <p
                className={cn(
                  'text-sm leading-relaxed text-muted-foreground',
                  showFullDescription ? '' : 'line-clamp-2'
                )}
              >
                {productDescription}
              </p>
            </div>
          ) : null}

          {hasSizeLevels ? (
            <div>
              <h3 className="mb-3 text-base font-bold">{t('chooseSizeLevel')}</h3>
              <div className="grid gap-2">
                {availableSizeLevels.map((size) => (
                  <label
                    key={size.id}
                    className={cn(
                      'flex cursor-pointer items-center justify-between rounded-xl border-2 p-3 transition-colors',
                      selectedSizeLevel?.id === size.id
                        ? 'border-[#0f8a7f] bg-[#0f8a7f]/10'
                        : 'border-border hover:border-border/80 hover:bg-muted/40'
                    )}
                  >
                    <span className="text-sm font-semibold">{sizeLevelLabel(size)}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {formatModifierPrice(size.priceUsd, t)}
                      </span>
                      <input
                        type="radio"
                        name="size"
                        checked={selectedSizeLevel?.id === size.id}
                        onChange={() => setSelectedSizeLevel(size)}
                        className="sr-only"
                      />
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {hasAddons ? (
            <div>
              <h3 className="mb-3 text-base font-bold">{t('addExtras')}</h3>
              <div className="grid gap-2">
                {addons.map((addon) => {
                  const checked = selectedAddons.some((e) => e.id === addon.id);
                  const addonItem = selectedAddons.find((e) => e.id === addon.id);
                  return (
                    <label
                      key={addon.id}
                      className={cn(
                        'flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors',
                        checked
                          ? 'border-[#0f8a7f] bg-[#0f8a7f]/10'
                          : 'border-border hover:bg-muted/40'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold">{addon.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {formatModifierPrice(addon.priceUsd, t)}
                        </span>
                      </div>
                      {checked && addon.hasQuantity ? (
                        <div className="ml-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              changeAddonQuantity(addon.id, -1);
                            }}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
                            aria-label={t('decrease')}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-7 text-center text-sm font-semibold">
                            {addonItem?.quantity || 1}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              changeAddonQuantity(addon.id, 1);
                            }}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
                            aria-label={t('increase')}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          'ml-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
                          checked ? 'border-primary bg-primary' : 'border-border'
                        )}
                      >
                        {checked ? (
                          <div className="h-2 w-2 rounded-sm bg-primary-foreground" />
                        ) : null}
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAddon(addon)}
                        className="sr-only"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('specialInstructions')}
            </h3>
            <Textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder={t('specialInstructions')}
              className="rounded-xl text-sm"
              rows={2}
            />
          </div>
          {quantityAndPrice}
          </div>

          {/* Footer actions */}
          <div className="flex gap-2.5 border-t border-border/60 p-4">
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl"
              onClick={onClose}
            >
              {t('cancel')}
            </Button>
            <Button
              className="h-11 flex-1 rounded-xl font-semibold shadow-sm"
              onClick={addItemToCart}
              disabled={addDisabled}
            >
              {t('addToCart')} · {usd(lineUsd)}
            </Button>
          </div>
        </div>
      </div>
      {showFullImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setShowFullImage(false)}
        >
          <button
            type="button"
            onClick={() => setShowFullImage(false)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-sm hover:bg-white/20"
            aria-label={t('close')}
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative h-[82vh] w-full max-w-5xl overflow-hidden rounded-xl bg-black"
            onClick={(event) => event.stopPropagation()}
          >
            <MenuImage
              src={item.imageUrl}
              alt={item.name}
              className="object-contain"
              sizes="100vw"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}



/* ── Helpers ──────────────────────────────────────────────── */
function customerStorageKey(tableNumber, bucket) {
  return `happyboat.customer.${tableNumber}.${bucket}`;
}

function normalizeRouteTableNumber(value) {
  let normalized = String(value || '').trim();
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded.trim();
    } catch {
      break;
    }
  }
  return normalized;
}

function orderAccessToken(order) {
  return order?.customerAccessToken || order?.accessToken || '';
}

function latestCustomerOrder(orders = []) {
  return [...orders]
    .filter((order) => order?.id)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))[0];
}

function customerOrderApiPath(order, suffix = '') {
  const orderId = encodeURIComponent(order?.id || '');
  const accessToken = encodeURIComponent(orderAccessToken(order));
  return `/api/customer/orders/${orderId}${suffix}?accessToken=${accessToken}`;
}

function receiptHref(order) {
  const orderId = encodeURIComponent(order?.id || '');
  const accessToken = encodeURIComponent(orderAccessToken(order));
  return `/receipt/${orderId}?accessToken=${accessToken}`;
}

function readCustomerStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback;
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
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        expiresAt: Date.now() + CUSTOMER_STORAGE_TTL_MS,
        value,
      })
    );
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

function isDefault(entry) {
  return entry?.isDefault === true || entry?.isDefault === 'true';
}

function addonMaxQuantity(addon) {
  return Math.max(1, Number(addon?.maxQuantity || addon?.maxQty || 10));
}

function addonSelectionMax(addon) {
  return Math.min(5, addonMaxQuantity(addon));
}

function defaultAddonQuantity(addon) {
  return addon?.hasQuantity ? Math.min(1, addonSelectionMax(addon)) : 1;
}

function selectedAddonPayload(addon) {
  return {
    id: addon.id,
    name: addon.name,
    priceUsd: Number(addon.priceUsd || 0),
    quantity: defaultAddonQuantity(addon),
    hasQuantity: Boolean(addon.hasQuantity),
  };
}

function orderItemSizeLabel(item) {
  const sizeLevel = String(item?.sizeLevel || '').trim();
  const sizeLabel = String(item?.sizeLevelName || sizeLevel).trim();
  if (!sizeLabel) return '';
  if (sizeLevel.toUpperCase() === 'NORMAL' || sizeLabel.toUpperCase() === 'NORMAL') return '';
  return sizeLabel;
}

function sizeLevelLabel(size) {
  return size?.name || size?.optionName || '';
}

function formatModifierPrice(value, t) {
  return Number(value || 0) > 0 ? `+${usd(value)}` : t('free');
}

function formatAddonDetail(addon) {
  const quantity = Number(addon?.quantity || 1);
  const name = addon.name || addon.addonName || '';
  return quantity > 1 ? `${name} x${quantity}` : name;
}

function priceMatches(item, filter) {
  const price = Number(item.priceUsd || 0);
  switch (filter) {
    case 'under_3':
      return price < 3;
    case '3_5':
      return price >= 3 && price <= 5;
    case '5_10':
      return price > 5 && price <= 10;
    case '10_plus':
      return price > 10;
    default:
      return true;
  }
}

function customerTableLabel(table, tableNumber, t) {
  const label = String(table?.label || '').trim();
  if (label && label !== 'undefined' && label !== 'null') return label;
  const fromTable = table?.tableNumber;
  const fallback = normalizeRouteTableNumber(tableNumber);
  const value = String(fromTable || fallback).trim();
  if (!value || value === 'undefined' || value === 'null') return '';
  return value.toLowerCase().startsWith('table ') ? value : `${t('table')} ${value}`;
}

function useScrollReveal(rootRef, deps = []) {
  useEffect(() => {
    if (!rootRef?.current) return undefined;
    const nodes = rootRef.current.querySelectorAll('[data-scroll-reveal]');
    if (!nodes.length) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function customerStatusStepIndex(status) {
  switch (status) {
    case 'PENDING_PAYMENT':
      return 0;
    case 'PAID':
    case 'RECEIVED':
      return 1;
    case 'PREPARING':
      return 2;
    case 'READY':
      return 3;
    case 'COMPLETED':
      return 4;
    default:
      return -1;
  }
}

function customerStatusLabel(status, t) {
  switch (status) {
    case 'PENDING_PAYMENT':
      return t('awaitingPayment');
    case 'PAID':
    case 'RECEIVED':
      return t('receivedByStaff');
    case 'PREPARING':
      return t('acceptedPreparing');
    case 'READY':
      return t('readyForPickup');
    case 'COMPLETED':
      return t('orderComplete');
    case 'CANCELLED':
      return t('cancelled');
    case 'REJECTED':
      return t('rejected');
    case 'EXPIRED':
      return t('expired');
    default:
      return status || '-';
  }
}

function isPromoCodeError(error, promoCode) {
  if (!promoCode?.trim()) return false;
  const text = String(error?.message || '').toLowerCase();
  return text.includes('promo') || text.includes('bad request') || text.includes('400');
}

function canRequestStaffAlert(order, now = Date.now(), options = {}) {
  if (!['PAID', 'RECEIVED', 'PREPARING'].includes(order?.status)) return false;
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
  const rawDiscount = promo.discountType === 'PERCENT' ? subtotal * (value / 100) : value;
  const cappedDiscount =
    promo.discountType === 'PERCENT' && promo.maxDiscountUsd != null
      ? Math.min(rawDiscount, Number(promo.maxDiscountUsd || 0))
      : rawDiscount;
  const maxDiscount = subtotal > 0 ? Math.max(0, subtotal - MIN_CART_TOTAL_USD) : subtotal;
  return Math.min(maxDiscount, Math.max(0, Number(cappedDiscount.toFixed(2))));
}

function formatPromoValue(promo) {
  if (!promo) return '';
  if (promo.discountType === 'PERCENT') {
    const maxDiscount = promo.maxDiscountUsd == null ? '' : `, max ${usd(promo.maxDiscountUsd)}`;
    return `${Number(promo.discountValue || 0).toFixed(2)}% off${maxDiscount}`;
  }
  return `${usd(promo.discountValue)} off`;
}

function downloadPaymentQrImage(order, payment, t) {
  const svg = document.querySelector(`[data-payment-qr="${payment.id}"] svg`);
  if (!svg) return;

  const svgText = new XMLSerializer().serializeToString(svg);
  const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
  Promise.all([
    loadCanvasImage(svgUrl),
    loadCanvasImage(KHQR_LOGO_WHITE_SRC).catch(() => null),
  ])
    .then(([qrImage, khqrLogo]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 500;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        return;
      }

      const tableText = order?.tableNumber ? `${t('table')} ${order.tableNumber}` : '';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      drawKhqrQrHeader(ctx, canvas.width, khqrLogo);

      ctx.font = '500 13px sans-serif';
      ctx.fillStyle = '#4b5563';
      ctx.fillText(
        [tableText, order?.orderNumber || t('order'), payment.paymentNumber]
          .filter(Boolean)
          .join(' · '),
        canvas.width / 2,
        122
      );

      ctx.drawImage(qrImage, 76, 148, 248, 248);

      ctx.font = '700 18px sans-serif';
      ctx.fillStyle = '#111827';
      ctx.fillText(displayUsd(payment.amountUsd), canvas.width / 2, 430);
      ctx.font = '500 13px sans-serif';
      ctx.fillStyle = '#4b5563';
      ctx.fillText(khr(payment.amountKhr), canvas.width / 2, 454);

      canvas.toBlob(async (blob) => {
        URL.revokeObjectURL(svgUrl);
        if (!blob) return;
        await saveImageToPhonePhotos(
          blob,
          `${order?.orderNumber || payment.paymentNumber}-khqr.png`
        );
        gooeyToast.success(t('qrImageSaved'), goeyToastOptions());
      }, 'image/png');
    })
    .catch(() => URL.revokeObjectURL(svgUrl));
}

function drawKhqrQrHeader(ctx, width, khqrLogo) {
  ctx.save();
  ctx.fillStyle = '#e31b23';
  ctx.fillRect(0, 0, width, 74);

  if (khqrLogo) {
    const logoWidth = 166;
    const logoHeight = 40;
    const scale = Math.min(190 / logoWidth, 38 / logoHeight);
    const targetWidth = logoWidth * scale;
    const targetHeight = logoHeight * scale;
    ctx.drawImage(
      khqrLogo,
      (width - targetWidth) / 2,
      (74 - targetHeight) / 2,
      targetWidth,
      targetHeight
    );
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 25px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KHQR', width / 2, 46);
  }

  ctx.fillStyle = '#111827';
  ctx.font = '700 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HappyBoat', width / 2, 100);
  ctx.restore();
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
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Bakong KHQR',
        text: 'Save this KHQR image to Photos.',
      });
      return;
    } catch {
      // Fall back to a regular download if sharing is cancelled or unavailable.
    }
  }

  const pngUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = pngUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(pngUrl);
}

function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
