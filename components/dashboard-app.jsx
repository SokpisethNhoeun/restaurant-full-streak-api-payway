'use client';

import { LanguageToggle, useLanguage } from '@/components/language-provider';
import { MenuImage } from '@/components/menu-image';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { API_BASE, WS_URL, api } from '@/lib/api';
import { goeyToastOptions } from '@/lib/goey-toast-options';
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock';
import { cn, displayUsd, formatDuration, khr, tags, usd } from '@/lib/utils';
import { Client } from '@stomp/stompjs';
import { InputOtp, Switch as HeroSwitch } from '@heroui/react';
import { gooeyToast } from 'goey-toast';
import {
  ArrowUpDown,
  BadgePercent,
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  ChefHat,
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Clock,
  CreditCard,
  Download,
  Filter,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Store,
  Table2,
  Upload,
  Users,
  Utensils,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import SockJS from 'sockjs-client';

const SORT_OPTIONS = [
  { value: 'time_desc', labelKey: 'sortNewest' },
  { value: 'time_asc', labelKey: 'sortOldest' },
  { value: 'payment', labelKey: 'sortPayment' },
  { value: 'status', labelKey: 'sortStatus' },
  { value: 'category', labelKey: 'sortCategory' },
  { value: 'item_name', labelKey: 'sortItemName' },
  { value: 'table', labelKey: 'sortTable' },
  { value: 'order_no', labelKey: 'sortOrderNo' },
];

const PAYMENT_FILTERS = [
  { value: '', labelKey: 'allPayments' },
  { value: 'PAID', labelKey: 'paid' },
  { value: 'PENDING', labelKey: 'pending' },
  { value: 'UNPAID', labelKey: 'unpaidNoQr' },
  { value: 'EXPIRED', labelKey: 'expired' },
];

const ORDER_STATUS_FILTERS = [
  { value: '', labelKey: 'allStatuses' },
  { value: 'PENDING_PAYMENT', labelKey: 'awaitingPayment' },
  { value: 'PAID', labelKey: 'paid' },
  { value: 'RECEIVED', labelKey: 'receivedByStaff' },
  { value: 'PREPARING', labelKey: 'preparing' },
  { value: 'READY', labelKey: 'readyForPickup' },
  { value: 'COMPLETED', labelKey: 'completed' },
  { value: 'CANCELLED', labelKey: 'cancelled' },
  { value: 'REJECTED', labelKey: 'rejected' },
  { value: 'EXPIRED', labelKey: 'expired' },
];

const KITCHEN_TIME_FILTERS = [
  { value: '', labelKey: 'allTimes' },
  { value: 'under_5', labelKey: 'underFiveMinutes' },
  { value: '5_10', labelKey: 'fiveToTenMinutes' },
  { value: '10_20', labelKey: 'tenToTwentyMinutes' },
  { value: '20_plus', labelKey: 'twentyPlusMinutes' },
];

const DASHBOARD_SESSION_HINT = 'happyboat-dashboard-session';
const DASHBOARD_TOKEN_KEY = 'happyboat-dashboard-token';
const OTP_EXPIRY_FALLBACK_SECONDS = 5 * 60;

const AnalyticsLineChart = lazy(() => import('./analytics-line-chart'));
const DASHBOARD_SOUND_READY_KEY = 'happyboat-dashboard-sound-ready';
const DASHBOARD_SOUND_LANGUAGE_KEY = 'happyboat-dashboard-sound-language';
const ORDER_ATTENTION_MS = 10 * 60 * 1000;
const DONUT_COLORS = ['#0f8a7f', '#f59e0b', '#2563eb', '#dc2626', '#7c3aed', '#059669'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const DASHBOARD_VOICE_MESSAGES = {
  en: {
    order: 'Received new order',
    payment: 'Received payment',
    rush: 'Customer has waited ten minutes',
  },
  km: {
    order: 'បានទទួលការកម្មង់ថ្មី',
    payment: 'បានទទួលការទូទាត់',
    rush: 'អតិថិជនរង់ចាំដប់នាទីហើយ',
  },
};
const DASHBOARD_ALERT_AUDIO_BASE = '/audio/dashboard-alerts';
const DASHBOARD_ALERT_AUDIO_FILES = {
  en: {
    order: `${DASHBOARD_ALERT_AUDIO_BASE}/en-order.mp3`,
    payment: `${DASHBOARD_ALERT_AUDIO_BASE}/en-payment.mp3`,
    rush: `${DASHBOARD_ALERT_AUDIO_BASE}/en-rush.mp3`,
  },
  km: {
    order: `${DASHBOARD_ALERT_AUDIO_BASE}/km-order.mp3`,
    payment: `${DASHBOARD_ALERT_AUDIO_BASE}/km-payment.mp3`,
    rush: `${DASHBOARD_ALERT_AUDIO_BASE}/km-rush.mp3`,
  },
};

function createMerchantSettingsForm(settings = {}) {
  return {
    email: settings.email || '',
    accessToken: '',
    merchantAccountId: settings.merchantAccountId || '',
    merchantName: settings.merchantName || '',
    merchantCity: settings.merchantCity || '',
    defaultCurrency: settings.defaultCurrency || 'KHR',
    paymentExpirationMinutes: settings.paymentExpirationMinutes ?? 10,
    accessTokenPreview: settings.accessTokenPreview || '',
    accessTokenConfigured: Boolean(settings.accessTokenConfigured),
  };
}

function readDashboardToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(DASHBOARD_TOKEN_KEY);
}

function dashboardAuthHeaders(headers = {}) {
  const token = readDashboardToken();
  if (!token || headers.Authorization) return headers;
  return { ...headers, Authorization: `Bearer ${token}` };
}

function clearDashboardSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DASHBOARD_SESSION_HINT);
  window.localStorage.removeItem(DASHBOARD_TOKEN_KEY);
}

function normalizeSpeechLang(lang = '') {
  return String(lang).replace('_', '-').toLowerCase();
}

function findDashboardSpeechVoice(language, voices = []) {
  const preferredLangs = language === 'km' ? ['km-kh', 'km'] : ['en-us', 'en'];
  return (
    voices.find((voice) => preferredLangs.includes(normalizeSpeechLang(voice.lang))) ||
    voices.find((voice) =>
      preferredLangs.some((lang) => normalizeSpeechLang(voice.lang).startsWith(`${lang}-`))
    )
  );
}

function dashboardVoiceText(alertType, language) {
  const messages = DASHBOARD_VOICE_MESSAGES[language] || DASHBOARD_VOICE_MESSAGES.en;
  return messages[alertType] || messages.order;
}

export default function DashboardApp() {
  const { t } = useLanguage();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [signingIn, setSigningIn] = useState(false);
  const [otpSession, setOtpSession] = useState(null);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [otpNow, setOtpNow] = useState(Date.now());
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [tab, setTab] = useState('orders');
  const [merchantDialogOpen, setMerchantDialogOpen] = useState(false);
  const [merchantOtpSession, setMerchantOtpSession] = useState(null);
  const [merchantOtpCode, setMerchantOtpCode] = useState('');
  const [merchantOtpNow, setMerchantOtpNow] = useState(Date.now());
  const [merchantOtpSending, setMerchantOtpSending] = useState(false);
  const [merchantOtpVerifying, setMerchantOtpVerifying] = useState(false);
  const [merchantOtpError, setMerchantOtpError] = useState('');
  const [merchantOtpVerified, setMerchantOtpVerified] = useState(false);
  const [merchantVerificationToken, setMerchantVerificationToken] = useState('');
  const [merchantSettings, setMerchantSettings] = useState(() => createMerchantSettingsForm());
  const [merchantSettingsLoading, setMerchantSettingsLoading] = useState(false);
  const [merchantSettingsSaving, setMerchantSettingsSaving] = useState(false);
  const [merchantSettingsMessage, setMerchantSettingsMessage] = useState('');
  const [orders, setOrders] = useState([]);
  const [kitchenItems, setKitchenItems] = useState([]);
  const [kitchenItemStatus, setKitchenItemStatus] = useState({});
  const [updatingKitchenItemIds, setUpdatingKitchenItemIds] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [menu, setMenu] = useState({ categories: [], items: [], addons: [], options: [] });
  const [tables, setTables] = useState([]);
  const [payments, setPayments] = useState([]);
  const [promos, setPromos] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [message, setMessage] = useState('');
  const [liveState, setLiveState] = useState('offline');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [soundReady, setSoundReady] = useState(false);
  const [soundLanguage, setSoundLanguage] = useState('en');
  const [speechSupport, setSpeechSupport] = useState({
    browser: false,
    english: false,
    khmer: false,
    recorded: true,
  });
  const [dashboardNow, setDashboardNow] = useState(Date.now());
  const audioRef = useRef(null);
  const ordersRef = useRef([]);
  const paymentsRef = useRef([]);
  const selectedOrderRef = useRef(null);
  const notifiedOrderToastRef = useRef(new Set());
  const notifiedPaymentToastRef = useRef(new Set());
  const notifiedCustomerAlertRef = useRef(new Set());
  const otpInputRefs = useRef([]);
  const otpAutoSubmitRef = useRef('');

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
    const hasSessionHint = window.localStorage.getItem(DASHBOARD_SESSION_HINT) === '1';
    if (!hasSessionHint && !readDashboardToken()) return;
    setSoundReady(window.localStorage.getItem(DASHBOARD_SOUND_READY_KEY) === '1');

    let mounted = true;
    fetch(`${API_BASE}/api/admin/auth/session`, {
      credentials: 'include',
      cache: 'no-store',
      headers: dashboardAuthHeaders({ 'ngrok-skip-browser-warning': 'true' }),
    })
      .then((response) => {
        if (!response.ok) throw new Error('No dashboard session');
        return response.json();
      })
      .then((data) => {
        if (mounted) {
          setSignedIn(true);
          if (data?.username) {
            setUsername(data.username);
          }
          if (data?.role) {
            setUserRole(data.role);
          }
        }
      })
      .catch(() => {
        clearDashboardSession();
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const storedSoundLanguage = window.localStorage.getItem(DASHBOARD_SOUND_LANGUAGE_KEY);
    if (storedSoundLanguage === 'km' || storedSoundLanguage === 'en') {
      setSoundLanguage(storedSoundLanguage);
    }
  }, []);

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setSpeechSupport((current) => ({ ...current, browser: false, english: false, khmer: false }));
      return undefined;
    }

    const syncSpeechSupport = () => {
      const voices = window.speechSynthesis.getVoices();
      setSpeechSupport((current) => ({
        ...current,
        browser: true,
        english: Boolean(findDashboardSpeechVoice('en', voices)),
        khmer: Boolean(findDashboardSpeechVoice('km', voices)),
      }));
    };

    syncSpeechSupport();
    const timer = window.setTimeout(syncSpeechSupport, 500);
    window.speechSynthesis.addEventListener?.('voiceschanged', syncSpeechSupport);
    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener?.('voiceschanged', syncSpeechSupport);
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    setLiveState('connecting');
    loadAll();

    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 5000,
      onConnect: () => {
        setLiveState('connected');
        client.subscribe('/topic/orders', (frame) => {
          const order = JSON.parse(frame.body);
          applyLiveOrder(order);
        });
        client.subscribe('/topic/payments', (frame) => {
          try {
            applyLivePayment(JSON.parse(frame.body));
          } catch {
            loadPayments({ notifyNew: true });
          }
          loadOrders();
        });
        client.subscribe('/topic/order-alerts', (frame) => {
          try {
            applyCustomerAlert(JSON.parse(frame.body));
          } catch {
            loadOrders();
          }
        });
      },
      onWebSocketClose: () => setLiveState('polling'),
      onWebSocketError: () => setLiveState('polling'),
      onStompError: () => setLiveState('polling'),
    });

    client.activate();
    const pollTimer = window.setInterval(() => {
      pollLiveData();
    }, 10000);

    return () => {
      window.clearInterval(pollTimer);
      setLiveState('offline');
      client.deactivate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return undefined;
    const timer = window.setInterval(() => setDashboardNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [signedIn]);

  useBodyScrollLock(!signedIn && Boolean(otpSession));

  useEffect(() => {
    if (!otpSession) return undefined;
    setOtpNow(Date.now());
    const timer = window.setInterval(() => setOtpNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [otpSession]);

  useEffect(() => {
    if (!merchantDialogOpen || !merchantOtpSession || merchantOtpVerified) return undefined;
    setMerchantOtpNow(Date.now());
    const timer = window.setInterval(() => setMerchantOtpNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [merchantDialogOpen, merchantOtpSession, merchantOtpVerified]);

  useEffect(() => {
    if (userRole === 'SUPER_ADMIN') return;
    if (tab === 'accounts') {
      setTab('orders');
    }
    if (merchantDialogOpen) {
      closeMerchantDialog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantDialogOpen, tab, userRole]);

  async function request(path, options = {}) {
    try {
      return await api(path, {
        ...options,
        credentials: 'include',
        headers: dashboardAuthHeaders({ ...(options.headers || {}) }),
      });
    } catch (error) {
      if (error.status === 401) {
        clearDashboardSession();
        setSignedIn(false);
        setMessage(t('signInFailed'));
      }
      throw error;
    }
  }

  async function signIn(event) {
    event.preventDefault();
    if (signingIn) return;
    setMessage('');
    setOtpError('');
    setSigningIn(true);
    unlockSound();
    try {
      const challenge = await api('/api/admin/auth/login', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(credentials),
      });
      if (challenge?.otpRequired) {
        startOtpSession(challenge, credentials.username);
        setCredentials((current) => ({ ...current, password: '' }));
        return;
      }
    } catch {
      clearDashboardSession();
      setMessage(t('signInFailed'));
    } finally {
      setSigningIn(false);
    }
  }

  function startOtpSession(challenge, username) {
    const now = Date.now();
    setOtpSession({
      sessionToken: challenge.sessionToken,
      maskedEmail: challenge.maskedEmail || maskEmail(username),
      expiresAt: now + Number(challenge.expiresInSeconds || OTP_EXPIRY_FALLBACK_SECONDS) * 1000,
      resendAt: now + Number(challenge.resendAvailableInSeconds || 30) * 1000,
    });
    setOtpDigits(['', '', '', '', '', '']);
    otpAutoSubmitRef.current = '';
    setOtpError('');
    window.setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
  }

  function finishSignIn(session) {
    if (session?.token) {
      window.localStorage.setItem(DASHBOARD_TOKEN_KEY, session.token);
    }
    if (session?.username) {
      setUsername(session.username);
    }
    if (session?.role) {
      setUserRole(session.role);
    }
    gooeyToast.success(t('loginSuccess'), goeyToastOptions());
    window.localStorage.setItem(DASHBOARD_SESSION_HINT, '1');
    setCredentials({ username: '', password: '' });
    setOtpSession(null);
    setOtpDigits(['', '', '', '', '', '']);
    otpAutoSubmitRef.current = '';
    setSignedIn(true);
  }

  async function verifyOtp(event) {
    event?.preventDefault();
    if (!otpSession || otpVerifying) return;
    setOtpError('');
    setOtpVerifying(true);
    try {
      const session = await api('/api/admin/auth/verify-otp', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          sessionToken: otpSession.sessionToken,
          otp: otpDigits.join(''),
        }),
      });
      finishSignIn(session);
    } catch (error) {
      setOtpError(error.message || t('signInFailed'));
    } finally {
      setOtpVerifying(false);
    }
  }

  async function resendOtp() {
    if (!otpSession || otpResending || Date.now() < otpSession.resendAt) return;
    setOtpError('');
    setOtpResending(true);
    try {
      const challenge = await api('/api/admin/auth/resend-otp', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ sessionToken: otpSession.sessionToken }),
      });
      startOtpSession(challenge, otpSession.maskedEmail);
    } catch (error) {
      setOtpError(error.message || t('signInFailed'));
    } finally {
      setOtpResending(false);
    }
  }

  async function logout() {
    try {
      await request('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // Logout should still clear the local dashboard session.
    } finally {
      clearDashboardSession();
      setSignedIn(false);
      setUsername('');
      setUserRole(null);
      setTab('orders');
      setOtpSession(null);
      closeMerchantDialog();
    }
  }

  function openMerchantDialog() {
    setMerchantDialogOpen(true);
    setMerchantOtpSession(null);
    setMerchantOtpCode('');
    setMerchantOtpNow(Date.now());
    setMerchantOtpError('');
    setMerchantOtpVerified(false);
    setMerchantVerificationToken('');
    setMerchantSettings(createMerchantSettingsForm());
    setMerchantSettingsMessage('');
    setMerchantSettingsLoading(false);
  }

  function closeMerchantDialog() {
    setMerchantDialogOpen(false);
    setMerchantOtpSession(null);
    setMerchantOtpCode('');
    setMerchantOtpNow(Date.now());
    setMerchantOtpError('');
    setMerchantOtpVerified(false);
    setMerchantVerificationToken('');
    setMerchantSettings(createMerchantSettingsForm());
    setMerchantSettingsMessage('');
    setMerchantSettingsLoading(false);
    setMerchantOtpSending(false);
    setMerchantOtpVerifying(false);
    setMerchantSettingsSaving(false);
  }

  function startMerchantOtpSession(challenge) {
    const now = Date.now();
    setMerchantOtpSession({
      sessionToken: challenge.sessionToken,
      expiresAt: now + Number(challenge.expiresInSeconds || OTP_EXPIRY_FALLBACK_SECONDS) * 1000,
    });
    setMerchantOtpNow(now);
    setMerchantOtpCode('');
    setMerchantOtpError('');
    setMerchantSettingsMessage('');
    setMerchantOtpVerified(false);
    setMerchantVerificationToken('');
  }

  async function sendMerchantOtp() {
    if (merchantOtpSending) return;
    if (merchantOtpSession && merchantOtpSecondsRemaining > 0 && !merchantOtpVerified) return;
    setMerchantOtpSending(true);
    setMerchantOtpError('');
    setMerchantSettingsMessage('');
    try {
      const challenge = await request('/api/admin/settings/bakong/otp', { method: 'POST' });
      startMerchantOtpSession(challenge);
      setMerchantSettingsMessage(t('otpSent'));
    } catch (error) {
      setMerchantOtpError(error.message || t('otpSendFailed'));
    } finally {
      setMerchantOtpSending(false);
    }
  }

  async function verifyMerchantOtp(code = merchantOtpCode) {
    if (!merchantOtpSession || merchantOtpVerifying || merchantOtpVerified) return;
    if (merchantOtpSecondsRemaining <= 0) {
      setMerchantOtpError(t('otpExpiredRequestNew'));
      return;
    }
    const normalizedCode = String(code || '').replace(/\D/g, '').slice(0, 6);
    if (normalizedCode.length !== 6) return;
    setMerchantOtpVerifying(true);
    setMerchantOtpError('');
    setMerchantSettingsMessage('');
    try {
      const verification = await request('/api/admin/settings/bakong/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          sessionToken: merchantOtpSession.sessionToken,
          otp: normalizedCode,
        }),
      });
      setMerchantVerificationToken(verification.verificationToken || '');
      setMerchantOtpVerified(true);
      await loadMerchantSettings();
    } catch (error) {
      setMerchantOtpError(error.message || t('invalidOtp'));
    } finally {
      setMerchantOtpVerifying(false);
    }
  }

  async function loadMerchantSettings() {
    setMerchantSettingsLoading(true);
    try {
      const settings = await request('/api/admin/settings/bakong');
      setMerchantSettings(createMerchantSettingsForm(settings));
    } catch (error) {
      setMerchantSettingsMessage(error.message || t('merchantDetailsLoadFailed'));
    } finally {
      setMerchantSettingsLoading(false);
    }
  }

  async function saveMerchantSettings(event) {
    event.preventDefault();
    if (!merchantVerificationToken || merchantSettingsSaving) return;
    setMerchantSettingsSaving(true);
    setMerchantSettingsMessage('');
    try {
      const updated = await request('/api/admin/settings/bakong', {
        method: 'PUT',
        body: JSON.stringify({
          verificationToken: merchantVerificationToken,
          email: merchantSettings.email,
          accessToken: merchantSettings.accessToken,
          merchantAccountId: merchantSettings.merchantAccountId,
          merchantName: merchantSettings.merchantName,
          merchantCity: merchantSettings.merchantCity,
          defaultCurrency: merchantSettings.defaultCurrency,
          paymentExpirationMinutes: Number(merchantSettings.paymentExpirationMinutes || 10),
        }),
      });
      setMerchantSettings(createMerchantSettingsForm(updated));
      gooeyToast.success(t('merchantDetailsUpdated'), goeyToastOptions());
      closeMerchantDialog();
    } catch (error) {
      setMerchantSettingsMessage(error.message || t('merchantDetailsUpdateFailed'));
    } finally {
      setMerchantSettingsSaving(false);
    }
  }

  function updateOtpDigit(index, rawValue) {
    const digits = rawValue.replace(/\D/g, '');
    if (digits.length > 1) {
      pasteOtpDigits(digits);
      return;
    }
    const next = [...otpDigits];
    next[index] = digits;
    setOtpDigits(next);
    if (digits && index < otpDigits.length - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }

  function pasteOtpDigits(rawValue) {
    const digits = rawValue.replace(/\D/g, '').slice(0, 6).split('');
    if (!digits.length) return;
    const next = [...otpDigits];
    for (let index = 0; index < next.length; index += 1) {
      next[index] = digits[index] || '';
    }
    setOtpDigits(next);
    otpInputRefs.current[Math.min(digits.length, 6) - 1]?.focus();
  }

  function handleOtpKeyDown(index, event) {
    if (event.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  async function loadAll() {
    const results = await Promise.allSettled([
      loadOrders(),
      loadKitchen(),
      loadMenu(),
      loadTables(),
      loadPayments(),
      loadPromos(),
      loadAnalytics(),
    ]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
      setMessage(failed.reason?.message || 'Dashboard refresh failed');
    }
    setLastUpdatedAt(new Date());
  }
  async function loadOrders(options = {}) {
    const data = await request('/api/admin/orders?limit=200');
    mergeOrders(data, options);
    setLastUpdatedAt(new Date());
    return data;
  }
  async function loadKitchen() {
    const data = await request('/api/admin/orders/kitchen');
    setKitchenItems(data);
    setKitchenItemStatus({});
    setLastUpdatedAt(new Date());
    return data;
  }
  async function loadOrder(orderId) {
    const detail = await request(`/api/admin/orders/${orderId}`);
    setSelectedOrder(applyKitchenStatusToOrder(detail, kitchenItemStatus));
    return detail;
  }
  async function loadMenu() {
    setMenu(await request('/api/admin/menu'));
  }
  async function loadTables() {
    setTables(await request('/api/admin/tables'));
  }
  async function loadPayments(options = {}) {
    const data = await request('/api/admin/payments');
    mergePayments(data, options);
    setLastUpdatedAt(new Date());
    return data;
  }
  async function loadPromos() {
    setPromos(await request('/api/admin/promos'));
  }
  async function loadAnalytics() {
    setAnalyticsError('');
    try {
      const data = await request('/api/admin/analytics/summary');
      setAnalytics(data);
      return data;
    } catch (error) {
      setAnalytics(null);
      setAnalyticsError(formatApiError(error, t('analyticsLoadFailed')));
      return null;
    }
  }

  async function pollLiveData() {
    const results = await Promise.allSettled([
      loadOrders({ notifyNew: true }),
      loadKitchen(),
      loadPayments({ notifyNew: true }),
      loadAnalytics(),
    ]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
      setMessage(failed.reason?.message || 'Live refresh failed');
    }
  }

  function mergeOrders(nextOrders, options = {}) {
    const previousById = new Map(ordersRef.current.map((order) => [order.id, order]));
    const alertOrder =
      Boolean(options.notifyNew) &&
      nextOrders.find((order) => {
        const previous = previousById.get(order.id);
        return shouldNotifyOrder(order) && (!previous || previous.status !== order.status);
      });
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    if (alertOrder) {
      const didNotify = notifyOrderToast(alertOrder);
      if (didNotify) playSound(isPaidKitchenOrder(alertOrder) ? 'payment' : 'order');
    }
  }

  function applyLiveOrder(order) {
    const previous = ordersRef.current.find((entry) => entry.id === order.id);
    const nextOrders = upsertById(ordersRef.current, order);
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    setLastUpdatedAt(new Date());
    if (selectedOrderRef.current?.id === order.id) {
      setSelectedOrder((current) => (current ? { ...current, ...order } : current));
    }
    loadKitchen().catch(() => {});
    if (shouldNotifyOrder(order) && (!previous || previous.status !== order.status)) {
      const didNotify = notifyOrderToast(order);
      if (didNotify) playSound(isPaidKitchenOrder(order) ? 'payment' : 'order');
    }
  }

  function applyCustomerAlert(orderAlert) {
    if (orderAlert?.id) {
      const nextOrders = upsertById(ordersRef.current, orderAlert);
      ordersRef.current = nextOrders;
      setOrders(nextOrders);
      if (selectedOrderRef.current?.id === orderAlert.id) {
        setSelectedOrder((current) => (current ? { ...current, ...orderAlert } : current));
      }
    }
    const didNotify = notifyCustomerAlertToast(orderAlert);
    if (didNotify) playSound('rush');
  }

  function mergePayments(nextPayments, options = {}) {
    const previousById = new Map(paymentsRef.current.map((payment) => [payment.id, payment]));
    const alertPayment =
      Boolean(options.notifyNew) &&
      nextPayments.find((payment) => {
        const previous = previousById.get(payment.id);
        return shouldNotifyPayment(payment) && (!previous || previous.status !== payment.status);
      });
    paymentsRef.current = nextPayments;
    setPayments(nextPayments);
    if (alertPayment) {
      const didNotify = notifyPaymentToast(alertPayment);
      if (didNotify) playSound('payment');
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
      if (didNotify) playSound('payment');
    }
    if (payment.status === 'PAID') {
      loadKitchen().catch(() => {});
    }
  }

  async function updateOrderStatus(orderId, status) {
    const data = await request(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    mergeOrderDetail(data, { forceSelect: true });
    loadKitchen().catch(() => {});
  }

  async function updateOrderItemKitchenStatus(orderItemId, status) {
    await updateKitchenItemsStatus([orderItemId], status);
  }

  async function updateKitchenGroupStatus(itemIds, status) {
    await updateKitchenItemsStatus(itemIds, status);
  }

  async function updateKitchenItemsStatus(itemIds, status) {
    const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
    updateLocalKitchenStatus(ids, status);
    setKitchenItemsUpdating(ids, true);
    try {
      for (const itemId of ids) {
        const detail = await request(`/api/admin/orders/items/${itemId}/kitchen-status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
        mergeOrderDetail(detail);
      }
      await loadKitchen();
    } catch (error) {
      setMessage(error.message || 'Kitchen status update failed');
      await loadKitchen().catch(() => {});
    } finally {
      setKitchenItemsUpdating(ids, false);
    }
  }

  function mergeOrderDetail(order, options = {}) {
    if (!order?.id) return;
    const nextOrders = upsertById(ordersRef.current, order);
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    if (options.forceSelect || selectedOrderRef.current?.id === order.id) {
      setSelectedOrder(order);
    }
  }

  function setKitchenItemsUpdating(itemIds, isUpdating) {
    const ids = new Set(Array.isArray(itemIds) ? itemIds : [itemIds]);
    setUpdatingKitchenItemIds((current) =>
      isUpdating
        ? [...new Set([...current, ...ids])]
        : current.filter((itemId) => !ids.has(itemId))
    );
  }

  function updateLocalKitchenStatus(itemIds, status) {
    const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
    const nextStatus = ids.reduce(
      (next, itemId) => ({
        ...next,
        [itemId]: status,
      }),
      kitchenItemStatus
    );
    setKitchenItemStatus(nextStatus);

    if (selectedOrderRef.current?.items) {
      setSelectedOrder((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                nextStatus[item.id] ? { ...item, kitchenStatus: nextStatus[item.id] } : item
              ),
            }
          : current
      );
    }
  }

  function unlockSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioRef.current = audioRef.current || new AudioContext();
      if (audioRef.current.state === 'suspended') {
        audioRef.current
          .resume()
          .then(() => markSoundReady(true))
          .catch(() => markSoundReady(false));
      } else {
        markSoundReady(true);
      }
    } catch {
      markSoundReady(false);
    }
  }

  function playSound(alertType = 'order') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = audioRef.current || new AudioContext();
      audioRef.current = ctx;
      const beep = () => {
        const now = ctx.currentTime;
        const rings =
          alertType === 'rush'
            ? [0, 0.14, 0.28, 0.62, 0.76, 0.9, 1.24, 1.38]
            : [0, 0.18, 0.36, 0.78, 0.96, 1.14];
        rings.forEach((offset, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = alertType === 'rush' ? 'square' : 'sine';
          osc.frequency.setValueAtTime(index % 2 === 0 ? 1174 : 880, now + offset);
          gain.gain.setValueAtTime(0.0001, now + offset);
          gain.gain.exponentialRampToValueAtTime(
            alertType === 'rush' ? 0.2 : 0.16,
            now + offset + 0.018
          );
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
      if (ctx.state === 'suspended') {
        ctx
          .resume()
          .then(() => {
            markSoundReady(true);
            beep();
          })
          .catch(() => markSoundReady(false));
        return;
      }
      markSoundReady(true);
      beep();
    } catch {
      markSoundReady(false);
    }
  }

  async function testSound() {
    requestDashboardNotificationPermission();
    unlockSound();
    unlockSound();
    playSound('order');
  }

  function requestDashboardNotificationPermission() {
    try {
      if (!('Notification' in window) || window.Notification.permission !== 'default') return;
      window.Notification.requestPermission().catch(() => {});
    } catch {
      // Browser notifications are optional.
    }
  }

  function showDashboardBrowserNotification(title, body, tag) {
    try {
      if (!('Notification' in window) || window.Notification.permission !== 'granted') return;
      const notification = new window.Notification(title, {
        body,
        icon: '/logo.png',
        badge: '/icon-192.png',
        tag,
        renotify: true,
        silent: false,
      });
      window.setTimeout(() => notification.close(), 9000);
    } catch {
      // Browser notifications are optional.
    }
  }

  function setSoundLanguagePreference(nextLanguage) {
    const normalizedLanguage = nextLanguage === 'km' ? 'km' : 'en';
    setSoundLanguage(normalizedLanguage);
    try {
      window.localStorage.setItem(DASHBOARD_SOUND_LANGUAGE_KEY, normalizedLanguage);
    } catch {
      // Storage is best-effort.
    }
  }

  function markSoundReady(ready) {
    setSoundReady(ready);
    try {
      if (ready) {
        window.localStorage.setItem(DASHBOARD_SOUND_READY_KEY, '1');
      } else {
        window.localStorage.removeItem(DASHBOARD_SOUND_READY_KEY);
      }
    } catch {
      // Storage is best-effort.
    }
  }

  function speakDashboardAlert(alertType = 'order') {
    const language = soundLanguage === 'km' ? 'km' : 'en';
    const text = dashboardVoiceText(alertType, language);
    const voices =
      typeof window !== 'undefined' && 'speechSynthesis' in window
        ? window.speechSynthesis.getVoices()
        : [];
    const voice = findDashboardSpeechVoice(language, voices);
    const fallback = () => trySpeakDashboardAlertInBrowser(text, language, voice);

    if (tryPlayDashboardAlertAudio(alertType, language, fallback)) return;
    fallback();
  }

  function tryPlayDashboardAlertAudio(alertType, language, fallback) {
    const url = DASHBOARD_ALERT_AUDIO_FILES[language]?.[alertType];
    if (!url) return false;

    try {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = 1;
      const playPromise = audio.play();
      if (playPromise?.catch) {
        playPromise.catch(() => fallback?.());
      }
      return true;
    } catch {
      return false;
    }
  }

  function trySpeakDashboardAlertInBrowser(text, language, preferredVoice) {
    try {
      if (!('speechSynthesis' in window)) return false;
      const voice = preferredVoice || findDashboardSpeechVoice(language, window.speechSynthesis.getVoices());

      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = language === 'km' ? 'km-KH' : 'en-US';
      utterance.rate = language === 'km' ? 0.9 : 0.95;
      utterance.volume = 1;
      if (voice) {
        utterance.voice = voice;
      }
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume?.();
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  function shouldNotifyOrder(order) {
    return order.status === 'PENDING_PAYMENT' || isPaidKitchenOrder(order);
  }

  function shouldNotifyPayment(payment) {
    return payment.status === 'PAID';
  }

  function notifyOrderToast(order) {
    const toastKey = `${order.id || order.orderNumber}:${order.status}`;
    if (notifiedOrderToastRef.current.has(toastKey)) return false;
    notifiedOrderToastRef.current.add(toastKey);
    if (notifiedOrderToastRef.current.size > 100) {
      notifiedOrderToastRef.current = new Set([...notifiedOrderToastRef.current].slice(-50));
    }
    const title = isPaidKitchenOrder(order) ? t('paidOrderReady') : t('newOrderUpdate');
    const description = `${order.orderNumber || t('order')} · ${order.tableNumber || ''}`;
    gooeyToast.info(
      title,
      goeyToastOptions({
        id: 'dashboard-order-alert',
        description,
        action: order.id
          ? {
              label: t('showDetail'),
              onClick: () => loadOrder(order.id),
            }
          : undefined,
      })
    );
    showDashboardBrowserNotification(title, description, toastKey);
    return true;
  }

  function notifyCustomerAlertToast(orderAlert) {
    const toastKey = `${orderAlert?.id || orderAlert?.orderNumber || 'order'}:rush`;
    if (notifiedCustomerAlertRef.current.has(toastKey)) return false;
    notifiedCustomerAlertRef.current.add(toastKey);
    if (notifiedCustomerAlertRef.current.size > 100) {
      notifiedCustomerAlertRef.current = new Set([...notifiedCustomerAlertRef.current].slice(-50));
    }
    const description = `${orderAlert?.orderNumber || t('order')} · ${orderAlert?.tableNumber || ''} · ${orderAlert?.waitingMinutes || 10}m+`;
    gooeyToast.info(
      t('orderNeedsAttention'),
      goeyToastOptions({
        id: 'dashboard-customer-alert',
        description,
        action: orderAlert?.id
          ? {
              label: t('showDetail'),
              onClick: () => loadOrder(orderAlert.id),
            }
          : undefined,
      })
    );
    showDashboardBrowserNotification(t('orderNeedsAttention'), description, toastKey);
    return true;
  }

  function notifyPaymentToast(payment) {
    const toastKey = `${payment.id || payment.paymentNumber}:${payment.status}`;
    if (notifiedPaymentToastRef.current.has(toastKey)) return false;
    notifiedPaymentToastRef.current.add(toastKey);
    if (notifiedPaymentToastRef.current.size > 100) {
      notifiedPaymentToastRef.current = new Set([...notifiedPaymentToastRef.current].slice(-50));
    }
    const description = `${payment.paymentNumber || t('payments')} · ${payment.tableNumber || ''}`;
    gooeyToast.success(
      t('paymentReceivedAlert'),
      goeyToastOptions({
        id: 'dashboard-payment-alert',
        description,
      })
    );
    showDashboardBrowserNotification(t('paymentReceivedAlert'), description, toastKey);
    return true;
  }

  const otpSecondsRemaining = otpSession
    ? Math.max(0, Math.ceil((otpSession.expiresAt - otpNow) / 1000))
    : 0;
  const otpResendRemaining = otpSession
    ? Math.max(0, Math.ceil((otpSession.resendAt - otpNow) / 1000))
    : 0;
  const otpComplete = otpDigits.every(Boolean);
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const merchantOtpSecondsRemaining = merchantOtpSession
    ? Math.max(0, Math.ceil((merchantOtpSession.expiresAt - merchantOtpNow) / 1000))
    : 0;
  const merchantOtpExpired =
    Boolean(merchantOtpSession) && merchantOtpSecondsRemaining <= 0 && !merchantOtpVerified;
  const dashboardSections = useMemo(
    () => [
      { id: 'orders', label: t('orders'), icon: Clock },
      { id: 'kitchen', label: t('kitchen'), icon: ChefHat },
      { id: 'menu', label: t('menu'), icon: Utensils },
      { id: 'tables', label: t('tables'), icon: Table2 },
      { id: 'payments', label: t('payments'), icon: CreditCard },
      { id: 'promos', label: t('promos'), icon: BadgePercent },
      { id: 'analytics', label: t('analytics'), icon: BarChart3 },
      ...(isSuperAdmin ? [{ id: 'accounts', label: t('accounts'), icon: Users }] : []),
    ],
    [isSuperAdmin, t]
  );

  useEffect(() => {
    if (!otpSession || !otpComplete || otpVerifying) return;
    const code = otpDigits.join('');
    if (code.length !== otpDigits.length || otpAutoSubmitRef.current === code) return;
    otpAutoSubmitRef.current = code;
    verifyOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpComplete, otpDigits, otpSession, otpVerifying]);

  useEffect(() => {
    if (!merchantDialogOpen || !merchantOtpSession || merchantOtpVerified || merchantOtpVerifying) {
      return;
    }
    if (merchantOtpCode.length === 6 && merchantOtpSecondsRemaining > 0) {
      verifyMerchantOtp(merchantOtpCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    merchantDialogOpen,
    merchantOtpCode,
    merchantOtpSession,
    merchantOtpSecondsRemaining,
    merchantOtpVerified,
    merchantOtpVerifying,
  ]);

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
                <h1 className="text-xl font-semibold">{t('dashboardTitle')}</h1>
                <p className="text-sm text-muted-foreground">{t('dashboardSubtitle')}</p>
              </div>
            </div>
            {message ? (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {message}
              </div>
            ) : null}
            <form className="space-y-3" onSubmit={signIn}>
              <Input
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                placeholder={t('username')}
                autoComplete="username"
                disabled={signingIn}
                required
              />
              <Input
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                type="password"
                placeholder={t('password')}
                autoComplete="current-password"
                disabled={signingIn}
                required
              />
              <Button className="w-full" disabled={signingIn} aria-busy={signingIn}>
                {signingIn ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {signingIn ? t('checking') : t('signIn')}
              </Button>
            </form>
          </CardContent>
        </Card>
        {otpSession ? (
          <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{t('checkYourEmail')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('otpSubtitle').replace('{email}', otpSession.maskedEmail)}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setOtpSession(null);
                    setOtpError('');
                    setOtpDigits(['', '', '', '', '', '']);
                    otpAutoSubmitRef.current = '';
                  }}
                  aria-label={t('close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form className="mt-5 space-y-4" onSubmit={verifyOtp}>
                <div className="grid grid-cols-6 gap-2">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(node) => {
                        otpInputRefs.current[index] = node;
                      }}
                      value={digit}
                      onChange={(event) => updateOtpDigit(index, event.target.value)}
                      onKeyDown={(event) => handleOtpKeyDown(index, event)}
                      onPaste={(event) => {
                        event.preventDefault();
                        pasteOtpDigits(event.clipboardData.getData('text'));
                      }}
                      inputMode="numeric"
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      maxLength={1}
                      className="h-12 rounded-md border border-input bg-background px-4 py-2.5 text-center text-xl font-semibold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      aria-label={`OTP digit ${index + 1}`}
                    />
                  ))}
                </div>

                <div className="text-center text-sm font-medium text-muted-foreground">
                  {t('codeExpiresIn').replace('{time}', formatDuration(otpSecondsRemaining))}
                </div>

                {otpError ? (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {otpError}
                  </div>
                ) : null}

                {otpVerifying ? (
                  <div className="rounded-md bg-muted px-3 py-2 text-center text-sm font-medium text-muted-foreground">
                    {t('checking')}
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={otpResendRemaining > 0 || otpResending}
                  onClick={resendOtp}
                >
                  {otpResendRemaining > 0
                    ? t('resendIn').replace('{seconds}', otpResendRemaining)
                    : otpResending
                      ? t('checking')
                      : t('resendOtp')}
                </Button>
              </form>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background">
      <SidebarProvider defaultOpen>
        <Sidebar>
          <SidebarHeader>
            <DashboardSidebarBrand />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>{t('dashboard')}</SidebarGroupLabel>
              <SidebarMenu>
                {dashboardSections.map((section) => (
                  <SidebarMenuItem key={section.id}>
                    <SidebarMenuButton
                      active={tab === section.id}
                      icon={section.icon}
                      label={section.label}
                      onClick={() => setTab(section.id)}
                    >
                      {section.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {isSuperAdmin ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      active={merchantDialogOpen}
                      icon={Store}
                      label={t('changeMerchantDetails')}
                      onClick={openMerchantDialog}
                    >
                      {t('changeMerchantDetails')}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarAccountSection
              username={username}
              role={userRole}
              soundLanguage={soundLanguage}
              soundReady={soundReady}
              speechSupport={speechSupport}
              onSoundLanguageChange={setSoundLanguagePreference}
              onTestSound={testSound}
              onRefresh={loadAll}
              onLogout={logout}
            />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="fixed right-0 top-0 z-20 border-b border-border bg-background/95 backdrop-blur transition-[left] duration-200 left-[var(--sidebar-width-icon)] group-data-[state=expanded]/sidebar-wrapper:left-[min(var(--sidebar-width),calc(100vw-1rem))]">
            <DashboardFrame className="flex items-center justify-between gap-3 py-3 pl-1 pr-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <DashboardTopbarSidebarTrigger />
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold">HappyBoat</h1>
                  <p className="truncate text-xs text-muted-foreground">{t('liveRestaurantOps')}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="hidden items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground sm:flex">
                  {liveState === 'connected' ? (
                    <Wifi className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-secondary-foreground" />
                  )}
                  <span>{liveState === 'connected' ? t('live') : t('polling')}</span>
                  {lastUpdatedAt ? (
                    <span>
                      {t('updated')} {formatClockTime(lastUpdatedAt)}
                    </span>
                  ) : null}
                </div>
                <LanguageToggle className="rounded-md px-2 sm:px-3 [&>span]:hidden sm:[&>span]:inline" />
                <ThemeToggle />
              </div>
            </DashboardFrame>
          </header>
          <div className="h-[65px]" aria-hidden="true" />

          <DashboardFrame className="py-6">
            {tab === 'orders' ? (
              <OrdersView
                orders={orders}
                selectedOrder={selectedOrder}
                onSelect={loadOrder}
                onClear={() => setSelectedOrder(null)}
                onStatus={updateOrderStatus}
                onItemStatus={updateOrderItemKitchenStatus}
                kitchenItemStatus={kitchenItemStatus}
                now={dashboardNow}
              />
            ) : null}

            {tab === 'kitchen' ? (
              <KitchenView
                items={kitchenItems}
                statusMap={kitchenItemStatus}
                onGroupStatus={updateKitchenGroupStatus}
                onItemStatus={updateOrderItemKitchenStatus}
                updatingItemIds={updatingKitchenItemIds}
                now={dashboardNow}
              />
            ) : null}

            {tab === 'menu' ? <MenuView menu={menu} request={request} reload={loadMenu} /> : null}

            {tab === 'tables' ? (
              <TablesView tables={tables} request={request} reload={loadTables} />
            ) : null}

            {tab === 'payments' ? (
              <PaymentsView payments={payments} request={request} reload={loadPayments} />
            ) : null}

            {tab === 'promos' ? (
              <PromoCodesView promos={promos} request={request} reload={loadPromos} />
            ) : null}

            {tab === 'analytics' ? (
              <AnalyticsView
                analytics={analytics}
                error={analyticsError}
                lastUpdatedAt={lastUpdatedAt}
                onRefresh={loadAnalytics}
              />
            ) : null}

            {tab === 'accounts' && isSuperAdmin ? (
              <AdminAccountsView request={request} reload={loadAnalytics} />
            ) : null}
          </DashboardFrame>
        </SidebarInset>

        <ChangeMerchantDetailsDialog
          open={merchantDialogOpen}
          onBack={closeMerchantDialog}
          otpSession={merchantOtpSession}
          otpCode={merchantOtpCode}
          onOtpCodeChange={setMerchantOtpCode}
          otpSecondsRemaining={merchantOtpSecondsRemaining}
          otpExpired={merchantOtpExpired}
          otpSending={merchantOtpSending}
          otpVerifying={merchantOtpVerifying}
          otpError={merchantOtpError}
          otpVerified={merchantOtpVerified}
          onSendOtp={sendMerchantOtp}
          settings={merchantSettings}
          onSettingsChange={setMerchantSettings}
          settingsLoading={merchantSettingsLoading}
          settingsSaving={merchantSettingsSaving}
          settingsMessage={merchantSettingsMessage}
          onSave={saveMerchantSettings}
        />
      </SidebarProvider>
    </main>
  );
}

function DashboardTopbarSidebarTrigger() {
  const { open, isDesktop } = useSidebar();

  if (!isDesktop && open) return null;

  return <SidebarTrigger className="-ml-1 h-11 w-11 shrink-0 sm:-ml-2 xl:ml-0 xl:h-10 xl:w-10" />;
}

function DashboardSidebarBrand() {
  const { open, isDesktop } = useSidebar();
  const { t } = useLanguage();

  return (
    <div className="flex min-h-11 items-center gap-3">
      <img src="/logo.png" alt="HappyBoat" className="h-10 w-10 shrink-0 rounded-md object-cover" />
      <div className={cn("min-w-0 transition-opacity", !open && "sr-only")}>
        <div className="truncate text-sm font-semibold">HappyBoat</div>
        <div className="truncate text-xs text-muted-foreground">{t('liveRestaurantOps')}</div>
      </div>
      {!isDesktop && open ? <SidebarTrigger className="ml-auto h-10 w-10 shrink-0" /> : null}
    </div>
  );
}

function DashboardFrame({ className, ...props }) {
  const { open } = useSidebar();

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-7xl px-4 transition-[max-width,padding,margin] duration-200",
        !open && "xl:mx-0 xl:max-w-none xl:pl-3 xl:pr-4",
        className
      )}
      {...props}
    />
  );
}

function SidebarAccountSection({
  username,
  role,
  soundLanguage,
  soundReady,
  speechSupport,
  onSoundLanguageChange,
  onTestSound,
  onRefresh,
  onLogout,
}) {
  const { open, isDesktop } = useSidebar();
  const { t } = useLanguage();
  const displayName = profileDisplayName(username);
  const roleLabel = adminRoleLabel(role, t);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="mx-auto h-11 w-11"
          onClick={onRefresh}
          aria-label={t('refresh')}
          title={t('refresh')}
        >
          <RefreshCw className="h-5 w-5" />
        </Button>
        <AccountPopover
          username={username}
          role={role}
          isDesktop={isDesktop}
          soundLanguage={soundLanguage}
          soundReady={soundReady}
          speechSupport={speechSupport}
          onSoundLanguageChange={onSoundLanguageChange}
          onTestSound={onTestSound}
          onLogout={onLogout}
          compact
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full justify-start" onClick={onRefresh}>
        <RefreshCw className="h-4 w-4" />
        {t('refresh')}
      </Button>
      <SidebarSoundSettings
        soundLanguage={soundLanguage}
        soundReady={soundReady}
        speechSupport={speechSupport}
        onSoundLanguageChange={onSoundLanguageChange}
        onTestSound={onTestSound}
      />
      <div className="flex min-w-0 items-center gap-3 rounded-md bg-muted/50 p-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <CircleUserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{username || '-'}</div>
          {role ? <div className="text-xs text-muted-foreground">{roleLabel}</div> : null}
        </div>
      </div>
      <Button type="button" variant="outline" className="w-full justify-start" onClick={onLogout}>
        <LogOut className="h-4 w-4" />
        {t('logout')}
      </Button>
    </div>
  );
}

function SidebarSoundSettings({
  compact = false,
  soundLanguage,
  soundReady,
  speechSupport,
  onSoundLanguageChange,
  onTestSound,
}) {
  const { t } = useLanguage();
  const voiceSource =
    soundLanguage === 'km'
      ? speechSupport.recorded
        ? t('recordedVoice')
        : speechSupport.khmer
          ? t('browserVoice')
          : t('beepOnly')
      : speechSupport.recorded
        ? t('recordedVoice')
        : t('browserVoice');

  return (
    <div className={cn("space-y-2 rounded-md border border-border/70 bg-background/60 p-2", compact && "bg-muted/30")}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground">{t('soundLanguage')}</Label>
          <Badge tone={soundReady ? 'primary' : 'secondary'} className="gap-1">
            {soundReady ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
            {voiceSource}
          </Badge>
        </div>
        <Select
          value={soundLanguage}
          onChange={(event) => onSoundLanguageChange(event.target.value)}
          aria-label={t('soundLanguage')}
        >
          <option value="km">{t('khmerSound')}</option>
          <option value="en">{t('englishSound')}</option>
        </Select>
      </div>
      <Button type="button" variant="outline" className="w-full justify-center" onClick={onTestSound}>
        {soundReady ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        {t('testOrderSound')}
      </Button>
    </div>
  );
}

function AccountPopover({
  username,
  role,
  isDesktop,
  soundLanguage,
  soundReady,
  speechSupport,
  onSoundLanguageChange,
  onTestSound,
  onLogout,
  compact = false,
}) {
  const { t } = useLanguage();
  const displayName = profileDisplayName(username);
  const roleLabel = adminRoleLabel(role, t);
  const trigger = (
    <Button
      type="button"
      variant="outline"
      className={cn(compact ? "mx-auto h-11 w-11 px-0" : "max-w-40 px-3")}
      aria-label={displayName}
    >
      <CircleUserRound className="h-5 w-5 shrink-0" />
      {!compact ? <span className="hidden max-w-24 truncate sm:inline">{displayName}</span> : null}
    </Button>
  );
  const panel = (
    <AccountPopoverPanel
      username={username}
      displayName={displayName}
      roleLabel={roleLabel}
      soundLanguage={soundLanguage}
      soundReady={soundReady}
      speechSupport={speechSupport}
      onSoundLanguageChange={onSoundLanguageChange}
      onTestSound={onTestSound}
      onLogout={onLogout}
    />
  );

  if (!isDesktop) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="right"
          className="w-[min(18rem,calc(100vw-var(--sidebar-width-icon)-1rem))] p-3"
        >
          {panel}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <HoverCard openDelay={80} closeDelay={120}>
      <HoverCardTrigger>
        {trigger}
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className={
          compact
            ? "bottom-0 left-[calc(100%+0.5rem)] right-auto top-auto w-[min(18rem,calc(100vw-var(--sidebar-width-icon)-1rem))] before:-left-2 before:top-0 before:h-full before:w-2"
            : undefined
        }
      >
        {panel}
      </HoverCardContent>
    </HoverCard>
  );
}

function AccountPopoverPanel({
  username,
  displayName,
  roleLabel,
  soundLanguage,
  soundReady,
  speechSupport,
  onSoundLanguageChange,
  onTestSound,
  onLogout,
}) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <SidebarSoundSettings
        compact
        soundLanguage={soundLanguage}
        soundReady={soundReady}
        speechSupport={speechSupport}
        onSoundLanguageChange={onSoundLanguageChange}
        onTestSound={onTestSound}
      />
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <CircleUserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{displayName}</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">Gmail</div>
          <div className="truncate text-xs text-muted-foreground">{username || '-'}</div>
          {roleLabel ? <div className="mt-1 text-xs text-muted-foreground">{roleLabel}</div> : null}
        </div>
      </div>
      <Button type="button" variant="outline" className="w-full justify-start" onClick={onLogout}>
        <LogOut className="h-4 w-4" />
        {t('logout')}
      </Button>
    </div>
  );
}

function ChangeMerchantDetailsDialog({
  open,
  onBack,
  otpSession,
  otpCode,
  onOtpCodeChange,
  otpSecondsRemaining,
  otpExpired,
  otpSending,
  otpVerifying,
  otpError,
  otpVerified,
  onSendOtp,
  settings,
  onSettingsChange,
  settingsLoading,
  settingsSaving,
  settingsMessage,
  onSave,
}) {
  const { t } = useLanguage();
  const sendDisabled = otpSending || (Boolean(otpSession) && otpSecondsRemaining > 0 && !otpVerified);
  const otpDisabled = !otpSession || otpExpired || otpVerifying || otpVerified;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onBack() : undefined)}>
      <DialogContent className="sm:max-w-xl" showClose={false}>
        {!otpVerified ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('verifyOtp')}</DialogTitle>
              <DialogDescription>
                {t('verifyIdentityMerchant')}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="grid gap-2">
                <Label>{t('verificationCode')}</Label>
                <InputOtp
                  aria-label={t('verificationCode')}
                  autoFocus={Boolean(otpSession)}
                  classNames={{
                    base: "w-full",
                    segmentWrapper: "justify-center gap-2",
                    segment:
                      "h-12 w-10 rounded-md border border-input bg-card text-lg font-semibold text-foreground shadow-none data-[active=true]:border-primary data-[active=true]:ring-2 data-[active=true]:ring-primary/20 sm:w-12",
                    helperWrapper: "text-center",
                    errorMessage: "text-destructive",
                  }}
                  isDisabled={otpDisabled}
                  length={6}
                  onValueChange={(value) => onOtpCodeChange(value.replace(/\D/g, '').slice(0, 6))}
                  value={otpCode}
                  variant="bordered"
                />
              </div>

              {otpSession && !otpExpired ? (
                <div className="rounded-md bg-muted px-3 py-2 text-center text-sm font-medium text-muted-foreground">
                  {t('codeExpiresIn').replace('{time}', formatDuration(otpSecondsRemaining))}
                </div>
              ) : null}

              {otpExpired ? (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {t('otpExpiredRequestNew')}
                </div>
              ) : null}

              {otpError ? (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {otpError}
                </div>
              ) : null}

              {settingsMessage && !otpError ? (
                <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {settingsMessage}
                </div>
              ) : null}

              {otpVerifying ? (
                <div className="rounded-md bg-muted px-3 py-2 text-center text-sm font-medium text-muted-foreground">
                  {t('checking')}
                </div>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onBack}>
                {t('back')}
              </Button>
              <Button type="button" onClick={onSendOtp} disabled={sendDisabled}>
                {otpSending ? t('sending') : t('sendOtp')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSave}>
            <DialogHeader>
              <DialogTitle>{t('changeMerchantDetails')}</DialogTitle>
              <DialogDescription>
                {t('bakongPaymentSettings')}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              {settingsMessage ? (
                <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {settingsMessage}
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="bakong-email">{t('bakongEmail')}</Label>
                <Input
                  id="bakong-email"
                  value={settings.email}
                  onChange={(event) =>
                    onSettingsChange({ ...settings, email: event.target.value })
                  }
                  placeholder="merchant@example.com"
                  type="email"
                  disabled={settingsLoading || settingsSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bakong-access-token">{t('bakongAccessToken')}</Label>
                <Input
                  id="bakong-access-token"
                  value={settings.accessToken}
                  onChange={(event) =>
                    onSettingsChange({ ...settings, accessToken: event.target.value })
                  }
                  placeholder={settings.accessTokenPreview || t('accessToken')}
                  type="password"
                  disabled={settingsLoading || settingsSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bakong-merchant-account">{t('merchantAccountId')}</Label>
                <Input
                  id="bakong-merchant-account"
                  value={settings.merchantAccountId}
                  onChange={(event) =>
                    onSettingsChange({ ...settings, merchantAccountId: event.target.value })
                  }
                  placeholder="merchant@bank"
                  disabled={settingsLoading || settingsSaving}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bakong-merchant-name">{t('merchantName')}</Label>
                <Input
                  id="bakong-merchant-name"
                  value={settings.merchantName}
                  onChange={(event) =>
                    onSettingsChange({ ...settings, merchantName: event.target.value })
                  }
                  disabled={settingsLoading || settingsSaving}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bakong-merchant-city">{t('merchantCity')}</Label>
                <Input
                  id="bakong-merchant-city"
                  value={settings.merchantCity}
                  onChange={(event) =>
                    onSettingsChange({ ...settings, merchantCity: event.target.value })
                  }
                  disabled={settingsLoading || settingsSaving}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bakong-default-currency">{t('defaultCurrency')}</Label>
                  <Select
                    id="bakong-default-currency"
                    value={settings.defaultCurrency}
                    onChange={(event) =>
                      onSettingsChange({ ...settings, defaultCurrency: event.target.value })
                    }
                    disabled={settingsLoading || settingsSaving}
                    required
                  >
                    <option value="USD">USD</option>
                    <option value="KHR">KHR</option>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bakong-expiration">{t('expirationMinutes')}</Label>
                  <Input
                    id="bakong-expiration"
                    value={settings.paymentExpirationMinutes}
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        paymentExpirationMinutes: event.target.value,
                      })
                    }
                    disabled={settingsLoading || settingsSaving}
                    max="120"
                    min="1"
                    required
                    type="number"
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onBack}>
                {t('back')}
              </Button>
              <Button type="submit" disabled={settingsLoading || settingsSaving}>
                {settingsSaving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Orders

function OrdersView({
  orders,
  selectedOrder,
  onSelect,
  onClear,
  onStatus,
  onItemStatus,
  kitchenItemStatus,
  now,
}) {
  const { t } = useLanguage();
  const [sortKey, setSortKey] = useState('time_desc');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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
      if (paymentFilter === 'UNPAID') {
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
        case 'time_asc':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'time_desc':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'payment':
          return (a.paymentStatus || 'UNPAID').localeCompare(b.paymentStatus || 'UNPAID');
        case 'status':
          return (a.status || '').localeCompare(b.status || '');
        case 'category':
          return (a.firstCategoryName || '').localeCompare(b.firstCategoryName || '');
        case 'item_name':
          return (a.firstItemName || '').localeCompare(b.firstItemName || '');
        case 'table':
          return (a.tableNumber || '').localeCompare(b.tableNumber || '');
        case 'order_no':
          return (a.orderNumber || '').localeCompare(b.orderNumber || '');
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
        <CardHeader className="flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <CardTitle className="flex min-w-0 items-center gap-2">
            {t('liveOrders')}
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
              placeholder={t('searchOrderTable')}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="pl-9 text-sm"
                aria-label={t('sortBy')}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="relative">
              <Check className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-9 text-sm"
                aria-label={t('sortStatus')}
              >
                {ORDER_STATUS_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="pl-9 text-sm"
                aria-label={t('sortPayment')}
              >
                {PAYMENT_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="relative">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="text-sm"
                aria-label={t('allDates')}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDateFilter(dateInputValue(new Date()))}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              {t('today')}
            </button>
            {dateFilter ? (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                {t('allDates')}
              </button>
            ) : null}
          </div>
        </div>

        <CardContent className="space-y-3 pt-3">
          {attentionOrders.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-secondary/40 bg-secondary/10 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <BellRing className="h-4 w-4 shrink-0 text-secondary-foreground" />
                {t('orderNeedsAttention')} · {attentionOrders.length}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3 text-xs"
                onClick={() => onSelect(attentionOrders[0].id)}
              >
                {t('showDetail')}
              </Button>
            </div>
          ) : null}
          {displayedOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noOrdersFilter')}</p>
          ) : (
            displayedOrders.map((order) => {
              const firstItemImg = order.firstItemImageUrl || order.items?.[0]?.imageUrl;
              const firstItemName = order.firstItemName || order.items?.[0]?.itemName;
              const firstCategoryName = order.firstCategoryName;
              const needsAttention = needsKitchenAttention(order, now);
              return (
                <button
                  key={order.id}
                  onClick={() => onSelect(order.id)}
                  className={`w-full rounded-md border bg-card p-3 text-left transition hover:border-primary ${needsAttention ? 'border-secondary shadow-sm shadow-secondary/10' : 'border-border'}`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {firstItemImg ? (
                      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                        <MenuImage src={firstItemImg} alt="" sizes="48px" />
                      </div>
                    ) : (
                      <div className="h-12 w-12 flex-shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
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
                              {firstCategoryName ? `${firstCategoryName} - ` : ''}
                              {firstItemName}
                            </div>
                          ) : null}
                          {order.promoCode ? (
                            <div className="mt-1 text-xs text-primary">
                              {t('promoCode')}: {order.promoCode}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 sm:flex-col sm:items-end">
                          <StatusBadge status={order.status} />
                          {needsAttention ? (
                            <AttentionBadge minutes={waitingMinutes(order, now)} />
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          {displayUsd(order.totalUsd)} / {khr(order.totalKhr)}
                        </span>
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
          <CardTitle>{t('orderDetail')}</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
          <OrderDetailContent
            selectedOrder={selectedOrder}
            onStatus={onStatus}
            onItemStatus={onItemStatus}
            kitchenItemStatus={kitchenItemStatus}
            now={now}
          />
        </CardContent>
      </Card>

      {selectedOrder ? (
        <MobileOrderSheet
          selectedOrder={selectedOrder}
          onStatus={onStatus}
          onItemStatus={onItemStatus}
          kitchenItemStatus={kitchenItemStatus}
          onClose={onClear}
          now={now}
        />
      ) : null}
    </div>
  );
}

function MobileOrderSheet({
  selectedOrder,
  onStatus,
  onItemStatus,
  kitchenItemStatus = {},
  onClose,
  now,
}) {
  const { t } = useLanguage();
  useBodyScrollLock(true, "(max-width: 1023px)");

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/40 backdrop-blur-sm lg:hidden"
      onClick={onClose}
    >
      <div
        className="bottom-sheet-animate max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-card text-card-foreground shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 p-4 backdrop-blur">
          <div>
            <h2 className="text-base font-semibold">{selectedOrder.orderNumber}</h2>
            <p className="text-xs text-muted-foreground">
              {selectedOrder.tableNumber} · {formatOrderDateTime(selectedOrder.createdAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <OrderDetailContent
            selectedOrder={selectedOrder}
            onStatus={onStatus}
            onItemStatus={onItemStatus}
            kitchenItemStatus={kitchenItemStatus}
            now={now}
          />
        </div>
      </div>
    </div>
  );
}

function OrderDetailContent({
  selectedOrder,
  onStatus,
  onItemStatus,
  kitchenItemStatus = {},
  now,
}) {
  const { t } = useLanguage();
  if (!selectedOrder) {
    return <p className="text-sm text-muted-foreground">{t('selectOrderDetail')}</p>;
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
          <span>
            {t('waitingTooLong')} · {waitingMinutes(selectedOrder, now)}m
          </span>
        </div>
      ) : null}

      <div className="space-y-2">
        {selectedOrder.items?.map((item) => (
          <div key={item.id} className="rounded-md border border-border p-3 text-sm">
            {(() => {
              const itemStatus = kitchenItemStatus[item.id] || item.kitchenStatus || 'PENDING';
              const spiceLabel = orderItemSpiceLabel(item);
              const spiceTotalUsd = orderItemSpiceTotalUsd(item);
              return (
                <div className="flex gap-3">
                  {item.imageUrl ? (
                    <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                      <MenuImage src={item.imageUrl} alt={item.itemName} sizes="56px" />
                    </div>
                  ) : (
                    <div className="h-14 w-14 flex-shrink-0 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">
                        {item.quantity} x {item.itemName}
                      </span>
                  <span className="whitespace-nowrap">{displayUsd(item.subtotalUsd)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <KitchenStatusBadge status={itemStatus} />
                  {canUpdateKitchenItem(selectedOrder) ? (
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        disabled={['ACCEPTED', 'COMPLETED'].includes(itemStatus)}
                        onClick={() => onItemStatus(item.id, 'ACCEPTED')}
                      >
                        {t('accept')}
                      </Button>
                      <Button
                        type="button"
                        className="h-8 px-2 text-xs"
                        disabled={itemStatus === 'COMPLETED'}
                        onClick={() => onItemStatus(item.id, 'COMPLETED')}
                      >
                        {t('complete')}
                      </Button>
                    </div>
                  ) : null}
                </div>
                {spiceLabel || item.specialInstructions || item.addons?.length ? (
                  <div className="mt-2 space-y-1 text-xs">
                    {spiceLabel ? (
                      <div className="flex justify-between gap-3 text-muted-foreground">
                        <span className="min-w-0">
                          {t('spice')}: {spiceLabel}
                        </span>
                        {spiceTotalUsd > 0 ? (
                          <span className="shrink-0">{displayUsd(spiceTotalUsd)}</span>
                        ) : null}
                      </div>
                    ) : null}
                    {item.addons?.map((addon) => (
                      <div key={addon.id} className="flex justify-between gap-3 text-muted-foreground">
                        <span className="min-w-0">
                          + {addon.quantity} x {addon.addonName}
                        </span>
                        <span className="shrink-0">{displayUsd(addon.subtotalUsd)}</span>
                      </div>
                    ))}
                    {item.specialInstructions ? (
                      <p className="italic text-muted-foreground">{item.specialInstructions}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
              );
            })()}
          </div>
        ))}
      </div>

      <div className="rounded-md bg-muted p-3 text-sm">
        {selectedOrder.promoCode ? (
          <div className="mb-1 flex justify-between">
            <span>{t('promoCode')}</span>
            <span className="font-medium">{selectedOrder.promoCode}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>{t('discount')}</span>
          <span>{usd(selectedOrder.discountUsd)}</span>
        </div>
        <div className="mt-1 flex justify-between font-semibold">
          <span>{t('total')}</span>
          <span>{displayUsd(selectedOrder.totalUsd)}</span>
        </div>
        <div className="mt-1 text-right text-muted-foreground">{khr(selectedOrder.totalKhr)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {!['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(selectedOrder.status) ? (
          <Button variant="destructive" onClick={() => onStatus(selectedOrder.id, 'CANCELLED')}>
            <X className="h-4 w-4" />
            {t('cancel')}
          </Button>
        ) : null}
        <a
          className="col-span-2"
          href={`${API_BASE}/api/receipts/orders/${selectedOrder.id}.pdf`}
          target="_blank"
        >
          <Button variant="outline" className="w-full">
            <Printer className="h-4 w-4" />
            {t('receipt')}
          </Button>
        </a>
      </div>
    </div>
  );
}

// Kitchen

function KitchenView({
  items,
  statusMap = {},
  onGroupStatus,
  onItemStatus,
  updatingItemIds = [],
  now,
}) {
  const { t } = useLanguage();
  const [dateFilter, setDateFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [autoAccept, setAutoAccept] = useState(false);
  const categoryOptions = useMemo(() => kitchenCategoryOptions(items), [items]);
  const filteredItems = useMemo(
    () => filterKitchenItems(items, { dateFilter, categoryFilter, timeFilter }, now),
    [items, dateFilter, categoryFilter, timeFilter, now]
  );
  const cards = useMemo(() => groupKitchenCards(filteredItems, statusMap), [filteredItems, statusMap]);
  const updatingItemIdSet = useMemo(() => new Set(updatingItemIds), [updatingItemIds]);
  const acceptModeHint = autoAccept ? t('autoAcceptKitchenHint') : t('manualKitchenHint');
  useEffect(() => {
    if (!autoAccept) return;
    const pendingIds = flattenKitchenItems(items)
      .filter((row) => (statusMap[row.id] || row.kitchenStatus || 'PENDING') === 'PENDING')
      .map((row) => row.id);
    if (pendingIds.length > 0) {
      onGroupStatus(pendingIds, 'ACCEPTED');
    }
  }, [autoAccept, items, onGroupStatus, statusMap]);
  const hasFilters = Boolean(dateFilter || categoryFilter || timeFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('kitchen')}</h2>
          <p className="text-sm text-muted-foreground">{t('kitchenPaidItems')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="primary">{cards.length}</Badge>
          <div className="flex min-w-[13rem] flex-col gap-1">
            <Label className="text-xs text-muted-foreground" htmlFor="kitchen-auto-accept-switch">
              {t('kitchenAcceptMode')}
            </Label>
            <HeroSwitch
              id="kitchen-auto-accept-switch"
              aria-label={t('kitchenAcceptMode')}
              aria-describedby="kitchen-auto-accept-hint"
              classNames={{
                base: 'h-9 w-fit rounded-md border border-border bg-card px-3',
                wrapper:
                  'mr-2 h-[18px] w-8 bg-[var(--color-border-secondary)] group-data-[selected=true]:bg-[#0f8a7f]',
                thumb: 'h-3.5 w-3.5 bg-white',
                label: 'text-sm font-medium text-foreground',
              }}
              color="success"
              isSelected={autoAccept}
              onValueChange={setAutoAccept}
              size="sm"
            >
              {autoAccept ? t('autoAcceptOn') : t('manualMode')}
            </HeroSwitch>
            <span id="kitchen-auto-accept-hint" className="text-xs text-muted-foreground">
              {acceptModeHint}
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Input
          type="date"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          aria-label={t('allDates')}
        />
        <Select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label={t('category')}
        >
          <option value="">{t('allCategories')}</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
        <Select
          value={timeFilter}
          onChange={(event) => setTimeFilter(event.target.value)}
          aria-label={t('allTimes')}
        >
          {KITCHEN_TIME_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          className="h-10 whitespace-nowrap px-3 text-xs"
          disabled={!hasFilters}
          onClick={() => {
            setDateFilter('');
            setCategoryFilter('');
            setTimeFilter('');
          }}
        >
          <Filter className="h-4 w-4" />
          {t('clearFilters')}
        </Button>
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            {hasFilters ? t('noOrdersFilter') : t('noKitchenItems')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((item) => (
            <KitchenItemCard
              key={item.key}
              item={item}
              now={now}
              onGroupStatus={onGroupStatus}
              onItemStatus={onItemStatus}
              updatingItemIds={updatingItemIdSet}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KitchenItemCard({ item, now, onGroupStatus, onItemStatus, updatingItemIds }) {
  const { t } = useLanguage();
  const isComplete = item.kitchenStatus === 'COMPLETED';
  const isGroupUpdating = item.itemIds.some((itemId) => updatingItemIds.has(itemId));
  const pendingItemIds = item.rows
    .filter((row) => row.kitchenStatus === 'PENDING')
    .map((row) => row.id);
  const acceptedItemIds = item.rows
    .filter((row) => row.kitchenStatus === 'ACCEPTED')
    .map((row) => row.id);
  const canAcceptAll = pendingItemIds.length > 0 && !isGroupUpdating;
  const canCompleteAll = pendingItemIds.length === 0 && acceptedItemIds.length > 0 && !isGroupUpdating;

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[5/3] bg-muted">
        <MenuImage
          src={item.imageUrl}
          alt={item.itemName}
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 360px"
        />
      </div>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">
              {item.categoryName || t('category')}
            </div>
            <h3 className="mt-0.5 line-clamp-2 text-base font-semibold">{item.itemName}</h3>
          </div>
          <KitchenStatusBadge status={item.kitchenStatus} />
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-sm font-semibold">
          {t('totalQuantityLabel')} {item.totalQuantity}
        </div>

        <div className="space-y-2 text-sm">
          {item.rows.map((row) => {
            const addonText = formatKitchenAddons(row.addons);
            const spiceLabel = orderItemSpiceLabel(row);
            const modifierText = [
              spiceLabel ? `${t('spice')}: ${spiceLabel}` : '',
              addonText ? `${t('addons')}: ${addonText}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            const rowUpdating = updatingItemIds.has(row.id);
            return (
              <div key={row.id} className="rounded-md border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                    <span>{row.tableNumber}</span>
                    <span className="text-muted-foreground">-</span>
                    <span>
                      {t('qty')}: {row.quantity}
                    </span>
                    <span className="text-muted-foreground">-</span>
                    <span>{t('minutesAgo').replace('{minutes}', kitchenItemMinutes(row, now))}</span>
                  </div>
                  <KitchenStatusBadge status={row.kitchenStatus} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{modifierText || `${t('addons')}: -`}</div>
                {row.specialInstructions ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t('note')}: {row.specialInstructions}
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    disabled={['ACCEPTED', 'COMPLETED'].includes(row.kitchenStatus) || rowUpdating}
                    onClick={() => onItemStatus(row.id, 'ACCEPTED')}
                  >
                    {t('accept')}
                  </Button>
                  <Button
                    type="button"
                    className="h-8 px-2 text-xs"
                    disabled={row.kitchenStatus === 'COMPLETED' || rowUpdating}
                    onClick={() => onItemStatus(row.id, 'COMPLETED')}
                  >
                    {t('complete')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            disabled={!canAcceptAll}
            onClick={() =>
              confirmKitchenGroupStatus({
                itemName: item.itemName,
                itemIds: pendingItemIds,
                status: 'ACCEPTED',
                onGroupStatus,
                t,
              })
            }
          >
            {t('acceptAll')}
          </Button>
          <Button
            type="button"
            disabled={isComplete || !canCompleteAll}
            onClick={() =>
              confirmKitchenGroupStatus({
                itemName: item.itemName,
                itemIds: acceptedItemIds,
                status: 'COMPLETED',
                onGroupStatus,
                t,
              })
            }
          >
            {t('completeAll')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Menu

const DEFAULT_ADDONS = [
  { name: 'Extra Ice', priceUsd: '0.25', hasQuantity: false, isDefault: false },
  { name: 'Extra Sauce', priceUsd: '0.50', hasQuantity: false, isDefault: true },
];

const DEFAULT_SPICE_LEVELS = [
  { name: 'Normal', priceUsd: '0.00', isDefault: true },
  { name: 'Medium', priceUsd: '0.00', isDefault: false },
  { name: 'Hot', priceUsd: '0.25', isDefault: false },
  { name: 'Extra Hot', priceUsd: '0.50', isDefault: false },
];

function createMenuForm() {
  return {
    categoryId: '',
    name: '',
    priceUsd: '',
    description: '',
    dietaryTags: '',
    imageUrl: '',
    available: true,
    sortOrder: 100,
    spice: '',
    addOns: '',
    isSpiceRequired: false,
    spiceLevels: DEFAULT_SPICE_LEVELS.map(normalizeSpiceFormEntry),
    addons: DEFAULT_ADDONS.map(normalizeAddonFormEntry),
  };
}

function createCategoryForm(category = {}) {
  return {
    name: category.name || '',
    slug: category.slug || '',
    sortOrder: category.sortOrder ?? 100,
    active: category.active !== false,
  };
}

function slugifyCategoryName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeSpiceFormEntry(entry = {}) {
  return {
    name: entry.name || entry.optionName || '',
    priceUsd: String(entry.priceUsd ?? entry.price ?? '0.00'),
    isDefault: menuFormBoolean(entry.isDefault),
  };
}

function normalizeAddonFormEntry(entry = {}) {
  return {
    name: entry.name || '',
    priceUsd: String(entry.priceUsd ?? entry.price ?? '0.00'),
    hasQuantity: menuFormBoolean(entry.hasQuantity ?? entry.hasQty),
    isDefault: menuFormBoolean(entry.isDefault),
  };
}

function menuFormBoolean(value) {
  return value === true || value === 'true';
}

function compactSpiceLevels(spiceLevels = []) {
  const rows = spiceLevels
    .map((spice) => ({
      name: String(spice.name || '').trim(),
      priceUsd: Number(spice.priceUsd || 0),
      isDefault: Boolean(spice.isDefault),
    }))
    .filter((spice) => spice.name);

  if (rows.length > 0 && !rows.some((spice) => spice.isDefault)) {
    rows[0].isDefault = true;
  }

  let defaultAssigned = false;
  return rows.map((spice) => {
    const isDefault = spice.isDefault && !defaultAssigned;
    defaultAssigned = defaultAssigned || isDefault;
    return { ...spice, isDefault };
  });
}

function compactAddons(addons = []) {
  return addons
    .map((addon) => ({
      name: String(addon.name || '').trim(),
      priceUsd: Number(addon.priceUsd || 0),
      hasQuantity: Boolean(addon.hasQuantity),
      isDefault: Boolean(addon.isDefault),
    }))
    .filter((addon) => addon.name);
}

function menuItemPayload(form) {
  return {
    ...form,
    priceUsd: Number(form.priceUsd),
    priceKhr: null,
    available: Boolean(form.available),
    sortOrder: Number(form.sortOrder || 0),
    isSpiceRequired: Boolean(form.isSpiceRequired),
    spiceLevels: compactSpiceLevels(form.spiceLevels),
    addons: compactAddons(form.addons),
  };
}

function MenuView({ menu, request, reload }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => createMenuForm());
  const [categoryForm, setCategoryForm] = useState(() => createCategoryForm());
  const [editingItem, setEditingItem] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState('');
  const [menuFormOpen, setMenuFormOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categorySlugEdited, setCategorySlugEdited] = useState(false);
  const [spiceOpen, setSpiceOpen] = useState(true);
  const [addonsOpen, setAddonsOpen] = useState(true);
  const [spiceDraft, setSpiceDraft] = useState({ name: '', priceUsd: '' });
  const [addonDraft, setAddonDraft] = useState({
    name: '',
    priceUsd: '',
    hasQuantity: false,
  });
  useBodyScrollLock(categoryManagerOpen || menuFormOpen);

  const dietaryTags = tags(form.dietaryTags);
  const items = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return menu.items.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        `${item.name || ''} ${item.description || ''}`.toLowerCase().includes(normalizedSearch);
      const matchesCategory = !categoryFilter || String(item.categoryId || '') === categoryFilter;
      const matchesStatus =
        !statusFilter ||
        (statusFilter === 'available' && item.available) ||
        (statusFilter === 'hidden' && !item.available);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, menu.items, search, statusFilter]);
  const hasMenuFilters = Boolean(search || categoryFilter || statusFilter);
  const categoryItemCounts = useMemo(() => {
    const counts = {};
    menu.items.forEach((item) => {
      if (!item.categoryId) return;
      counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
    });
    return counts;
  }, [menu.items]);

  function resetForm(nextMessage = '') {
    setEditingItem(null);
    setForm(createMenuForm());
    setMessage(nextMessage);
    setSpiceDraft({ name: '', priceUsd: '' });
    setAddonDraft({ name: '', priceUsd: '', hasQuantity: false });
    setSpiceOpen(true);
    setAddonsOpen(true);
    setMenuFormOpen(false);
  }

  function openNewMenuForm() {
    setEditingItem(null);
    setCategoryManagerOpen(false);
    setForm(createMenuForm());
    setMessage('');
    setSpiceDraft({ name: '', priceUsd: '' });
    setAddonDraft({ name: '', priceUsd: '', hasQuantity: false });
    setSpiceOpen(true);
    setAddonsOpen(true);
    setMenuFormOpen(true);
  }

  function openCategoryManager() {
    setMenuFormOpen(false);
    setEditingCategory(null);
    setCategoryForm(createCategoryForm());
    setCategorySlugEdited(false);
    setMessage('');
    setCategoryManagerOpen(true);
  }

  function closeCategoryManager() {
    setCategoryManagerOpen(false);
    setEditingCategory(null);
    setCategoryForm(createCategoryForm());
    setCategorySlugEdited(false);
  }

  function editCategory(category) {
    setEditingCategory(category);
    setCategoryForm(createCategoryForm(category));
    setCategorySlugEdited(true);
    setMessage('');
  }

  function updateCategoryName(name) {
    setCategoryForm((current) => ({
      ...current,
      name,
      slug: categorySlugEdited ? current.slug : slugifyCategoryName(name),
    }));
  }

  function resetCategoryForm(nextMessage = '') {
    setEditingCategory(null);
    setCategoryForm(createCategoryForm());
    setCategorySlugEdited(false);
    setMessage(nextMessage);
  }

  async function saveCategory(event) {
    event.preventDefault();
    setMessage('');
    const payload = {
      name: categoryForm.name.trim(),
      slug: categoryForm.slug.trim(),
      sortOrder: Number(categoryForm.sortOrder || 0),
      active: Boolean(categoryForm.active),
    };
    try {
      await request(
        editingCategory
          ? `/api/admin/menu/categories/${editingCategory.id}`
          : '/api/admin/menu/categories',
        {
          method: editingCategory ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      );
      resetCategoryForm(editingCategory ? t('categoryUpdated') : t('categoryCreated'));
      reload();
    } catch (error) {
      setMessage(formatApiError(error, t('categorySaveFailed')));
    }
  }

  async function toggleCategory(category) {
    setMessage('');
    try {
      await request(`/api/admin/menu/categories/${category.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: category.name,
          slug: category.slug,
          sortOrder: category.sortOrder || 0,
          active: !category.active,
        }),
      });
      setMessage(t('categoryUpdated'));
      reload();
    } catch (error) {
      setMessage(formatApiError(error, t('categorySaveFailed')));
    }
  }

  async function deleteCategory(category) {
    if (!window.confirm(t('confirmDeleteCategory'))) return;
    setMessage('');
    try {
      await request(`/api/admin/menu/categories/${category.id}`, { method: 'DELETE' });
      if (editingCategory?.id === category.id) {
        resetCategoryForm();
      }
      setMessage(t('categoryDeleted'));
      reload();
    } catch (error) {
      setMessage(formatApiError(error, t('categoryDeleteFailed')));
    }
  }

  function editItem(item) {
    const itemSpiceLevels =
      Array.isArray(item.spiceLevels) && item.spiceLevels.length
        ? item.spiceLevels
        : (menu.spiceLevels || menu.options || []).filter(
            (option) =>
              option.menuItemId === item.id &&
              (option.optionGroup == null || option.optionGroup === 'Spice')
          );
    const itemAddons =
      Array.isArray(item.addons) && item.addons.length
        ? item.addons
        : (menu.addons || []).filter((addon) => addon.menuItemId === item.id);

    setEditingItem(item);
    setMessage('');
    setForm({
      categoryId: item.categoryId,
      name: item.name || '',
      priceUsd: String(item.priceUsd ?? ''),
      description: item.description || '',
      dietaryTags: item.dietaryTags || '',
      imageUrl: item.imageUrl || '',
      available: item.available,
      sortOrder: item.sortOrder ?? 100,
      spice: item.spice || '',
      addOns: item.addOns || '',
      isSpiceRequired:
        Boolean(item.isSpiceRequired) || itemSpiceLevels.some((spice) => Boolean(spice.required)),
      spiceLevels: itemSpiceLevels.map(normalizeSpiceFormEntry),
      addons: itemAddons.map(normalizeAddonFormEntry),
    });
    setSpiceDraft({ name: '', priceUsd: '' });
    setAddonDraft({ name: '', priceUsd: '', hasQuantity: false });
    setSpiceOpen(true);
    setAddonsOpen(true);
    setMenuFormOpen(true);
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('');
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      setMessage(t('invalidImageType'));
      event.target.value = '';
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage(t('imageTooLarge'));
      event.target.value = '';
      return;
    }
    const data = new FormData();
    data.append('file', file);
    try {
      const uploaded = await request('/api/admin/uploads/menu-images', {
        method: 'POST',
        body: data,
      });
      const nextForm = { ...form, imageUrl: uploaded.url };
      setForm(nextForm);
      if (editingItem) {
        await request(`/api/admin/menu/items/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(menuItemPayload(nextForm)),
        });
        setMessage(t('menuItemUpdated'));
        reload();
      }
    } catch (error) {
      setMessage(formatApiError(error, t('uploadFailed')));
    } finally {
      event.target.value = '';
    }
  }

  async function saveItem(event) {
    event.preventDefault();
    setMessage('');
    const payload = menuItemPayload(form);
    await request(
      editingItem ? `/api/admin/menu/items/${editingItem.id}` : '/api/admin/menu/items',
      {
        method: editingItem ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      }
    );
    resetForm(editingItem ? t('menuItemUpdated') : t('menuItemCreated'));
    reload();
  }

  async function toggle(item) {
    await request(`/api/admin/menu/items/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        priceUsd: item.priceUsd,
        priceKhr: null,
        imageUrl: item.imageUrl,
        available: !item.available,
        dietaryTags: item.dietaryTags,
        isSpiceRequired: item.isSpiceRequired,
        sortOrder: item.sortOrder || 0,
      }),
    });
    reload();
  }

  function removeDietaryTag(index) {
    const next = dietaryTags.filter((_, tagIndex) => tagIndex !== index);
    setForm({ ...form, dietaryTags: next.join(', ') });
  }

  function addSpiceLevel() {
    const name = spiceDraft.name.trim();
    if (!name) return;
    setForm((current) => ({
      ...current,
      spiceLevels: [
        ...current.spiceLevels,
        {
          name,
          priceUsd: spiceDraft.priceUsd || '0.00',
          isDefault: current.spiceLevels.length === 0,
        },
      ],
    }));
    setSpiceDraft({ name: '', priceUsd: '' });
  }

  function updateSpiceLevel(index, patch) {
    setForm((current) => ({
      ...current,
      spiceLevels: current.spiceLevels.map((spice, spiceIndex) =>
        spiceIndex === index ? { ...spice, ...patch } : spice
      ),
    }));
  }

  function setDefaultSpice(index) {
    setForm((current) => ({
      ...current,
      spiceLevels: current.spiceLevels.map((spice, spiceIndex) => ({
        ...spice,
        isDefault: spiceIndex === index,
      })),
    }));
  }

  function deleteSpiceLevel(index) {
    setForm((current) => {
      const next = current.spiceLevels.filter((_, spiceIndex) => spiceIndex !== index);
      if (next.length > 0 && !next.some((spice) => spice.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return { ...current, spiceLevels: next };
    });
  }

  function addAddon() {
    const name = addonDraft.name.trim();
    if (!name) return;
    setForm((current) => ({
      ...current,
      addons: [
        ...current.addons,
        {
          name,
          priceUsd: addonDraft.priceUsd || '0.00',
          hasQuantity: Boolean(addonDraft.hasQuantity),
          isDefault: false,
        },
      ],
    }));
    setAddonDraft({ name: '', priceUsd: '', hasQuantity: false });
  }

  function updateAddon(index, patch) {
    setForm((current) => ({
      ...current,
      addons: current.addons.map((addon, addonIndex) =>
        addonIndex === index ? { ...addon, ...patch } : addon
      ),
    }));
  }

  function deleteAddon(index) {
    setForm((current) => ({
      ...current,
      addons: current.addons.filter((_, addonIndex) => addonIndex !== index),
    }));
  }

  return (
    <div className="space-y-5">
      {categoryManagerOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/45 px-0 backdrop-blur-sm sm:items-center sm:p-4">
          <Card className="bottom-sheet-animate max-h-[94vh] w-full overflow-hidden rounded-t-2xl border-border bg-card shadow-xl sm:mx-auto sm:max-w-2xl sm:rounded-lg">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>{t('manageCategories')}</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={closeCategoryManager}
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
              {message ? (
                <div className="mb-3 rounded-md bg-muted px-3 py-2 text-sm">{message}</div>
              ) : null}
              <form className="space-y-3 rounded-md border border-border/70 p-3" onSubmit={saveCategory}>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_100px_auto]">
                  <Input
                    value={categoryForm.name}
                    onChange={(e) => updateCategoryName(e.target.value)}
                    placeholder={t('categoryName')}
                    required
                  />
                  <Input
                    value={categoryForm.slug}
                    onChange={(e) => {
                      setCategorySlugEdited(true);
                      setCategoryForm({ ...categoryForm, slug: e.target.value });
                    }}
                    placeholder={t('categorySlug')}
                    required
                  />
                  <Input
                    value={categoryForm.sortOrder}
                    onChange={(e) => setCategoryForm({ ...categoryForm, sortOrder: e.target.value })}
                    placeholder={t('categoryOrder')}
                    type="number"
                    min="0"
                  />
                  <label className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-border px-3 text-sm">
                    {t('active')}
                    <ToggleSwitch
                      checked={categoryForm.active}
                      onChange={(checked) => setCategoryForm({ ...categoryForm, active: checked })}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">
                    <Check className="h-4 w-4" />
                    {editingCategory ? t('save') : t('create')}
                  </Button>
                  {editingCategory ? (
                    <Button type="button" variant="outline" onClick={() => resetCategoryForm()}>
                      {t('cancel')}
                    </Button>
                  ) : null}
                </div>
              </form>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{t('categories')}</h3>
                  <Badge tone="primary">{menu.categories.length}</Badge>
                </div>
                {menu.categories.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                    {t('noCategoriesYet')}
                  </p>
                ) : (
                  menu.categories.map((category) => {
                    const itemCount = categoryItemCounts[category.id] || 0;
                    return (
                      <div
                        key={category.id}
                        className="flex flex-col gap-3 rounded-md border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{category.name}</span>
                            <Badge tone={category.active ? 'primary' : 'danger'}>
                              {category.active ? t('active') : t('inactive')}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {category.slug} · {t('categoryOrder')}: {category.sortOrder ?? 0} ·{' '}
                            {t('categoryItemCount').replace('{count}', itemCount)}
                          </p>
                          {itemCount > 0 ? (
                            <p className="mt-1 text-xs text-muted-foreground">{t('categoryHasItems')}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={() => editCategory(category)}>
                            <Pencil className="h-4 w-4" />
                            {t('edit')}
                          </Button>
                          <Button type="button" variant="outline" onClick={() => toggleCategory(category)}>
                            {category.active ? t('disable') : t('enable')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={itemCount > 0}
                            title={itemCount > 0 ? t('categoryHasItems') : t('deleteCategory')}
                            onClick={() => deleteCategory(category)}
                          >
                            <X className="h-4 w-4" />
                            {t('deleteCategory')}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
      {menuFormOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/45 px-0 backdrop-blur-sm sm:items-center sm:p-4">
          <Card className="bottom-sheet-animate max-h-[94vh] w-full overflow-hidden rounded-t-2xl border-border bg-card shadow-xl sm:mx-auto sm:max-w-xl sm:rounded-lg">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>{editingItem ? t('editMenuItem') : t('newMenuItem')}</CardTitle>
          <Button type="button" variant="outline" size="icon" onClick={() => resetForm()}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
          {message ? (
            <div className="mb-3 rounded-md bg-muted px-3 py-2 text-sm">{message}</div>
          ) : null}

          <form className="space-y-3" onSubmit={saveItem}>
            <Select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              aria-label={t('category')}
              required
            >
              <option value="">{t('category')}</option>
              {menu.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('sortItemName')}
              required
            />
            <Input
              value={form.priceUsd}
              onChange={(e) => setForm({ ...form, priceUsd: e.target.value })}
              placeholder="USD"
              type="number"
              step="0.01"
              required
            />
            <Input
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              placeholder={t('sortOrderNo')}
              type="number"
              min="0"
            />
            <Select
              value={form.available ? 'true' : 'false'}
              onChange={(e) => setForm({ ...form, available: e.target.value === 'true' })}
              aria-label={t('available')}
            >
              <option value="true">{t('available')}</option>
              <option value="false">{t('hidden')}</option>
            </Select>
            <Input
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder={t('imageUrl')}
            />
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
              <Upload className="h-4 w-4" />
              {t('uploadImage')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={uploadImage}
              />
            </label>
            <Input
              value={form.dietaryTags}
              onChange={(e) => setForm({ ...form, dietaryTags: e.target.value })}
              placeholder={t('tagsLabel')}
            />
            {dietaryTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {dietaryTags.map((tag, index) => (
                  <Badge key={`${tag}-${index}`} tone="info" className="gap-1 pr-1">
                    {tag}
                    <button
                      type="button"
                      className="rounded-sm p-0.5 hover:bg-background/70"
                      onClick={() => removeDietaryTag(index)}
                      aria-label={`Remove ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('noDescription')}
            />

            <div className="rounded-md border border-border/70">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                onClick={() => setSpiceOpen((open) => !open)}
              >
                <span className="text-sm font-semibold">{t('spiceLevels')}</span>
                {spiceOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {spiceOpen ? (
                <div className="space-y-3 border-t border-border/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-muted-foreground">{t('required')}</span>
                    <ToggleSwitch
                      checked={form.isSpiceRequired}
                      onChange={(checked) => setForm({ ...form, isSpiceRequired: checked })}
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_86px_auto] gap-2">
                    <Input
                      value={spiceDraft.name}
                      onChange={(e) => setSpiceDraft({ ...spiceDraft, name: e.target.value })}
                      placeholder={t('name')}
                    />
                    <Input
                      value={spiceDraft.priceUsd}
                      onChange={(e) => setSpiceDraft({ ...spiceDraft, priceUsd: e.target.value })}
                      placeholder="USD"
                      type="number"
                      step="0.01"
                      min="0"
                    />
                    <Button type="button" className="px-3" onClick={addSpiceLevel}>
                      <Plus className="h-4 w-4" />
                      {t('add')}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {form.spiceLevels.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                        {t('noSpiceLevelsYet')}
                      </p>
                    ) : (
                      form.spiceLevels.map((spice, index) => (
                        <div key={`${spice.name}-${index}`} className="grid grid-cols-[1fr_82px_36px_32px] items-center gap-2">
                          <Input
                            value={spice.name}
                            onChange={(e) => updateSpiceLevel(index, { name: e.target.value })}
                            placeholder={t('name')}
                          />
                          <Input
                            value={spice.priceUsd}
                            onChange={(e) => updateSpiceLevel(index, { priceUsd: e.target.value })}
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={t('spiceLevels')}
                          />
                          <input
                            type="radio"
                            name="default-spice"
                            checked={spice.isDefault}
                            onChange={() => setDefaultSpice(index)}
                            aria-label={t('defaultLabel')}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteSpiceLevel(index)}
                            aria-label={t('deleteOrder')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-md border border-border/70">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                onClick={() => setAddonsOpen((open) => !open)}
              >
                <span className="text-sm font-semibold">{t('addons')}</span>
                {addonsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {addonsOpen ? (
                <div className="space-y-3 border-t border-border/70 p-3">
                  <div className="grid grid-cols-[1fr_86px_auto_auto] gap-2">
                    <Input
                      value={addonDraft.name}
                      onChange={(e) => setAddonDraft({ ...addonDraft, name: e.target.value })}
                      placeholder={t('name')}
                    />
                    <Input
                      value={addonDraft.priceUsd}
                      onChange={(e) => setAddonDraft({ ...addonDraft, priceUsd: e.target.value })}
                      placeholder="USD"
                      type="number"
                      step="0.01"
                      min="0"
                    />
                    <div className="flex items-center gap-2 rounded-md border border-border px-2 text-xs">
                      {t('qty')}
                      <ToggleSwitch
                        checked={addonDraft.hasQuantity}
                        onChange={(checked) => setAddonDraft({ ...addonDraft, hasQuantity: checked })}
                      />
                    </div>
                    <Button type="button" className="px-3" onClick={addAddon}>
                      <Plus className="h-4 w-4" />
                      {t('add')}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {form.addons.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                        {t('noAddonsYet')}
                      </p>
                    ) : (
                      form.addons.map((addon, index) => (
                        <div key={`${addon.name}-${index}`} className="grid grid-cols-[1fr_82px_auto_52px_32px] items-center gap-2">
                          <Input
                            value={addon.name}
                            onChange={(e) => updateAddon(index, { name: e.target.value })}
                            placeholder={t('name')}
                          />
                          <Input
                            value={addon.priceUsd}
                            onChange={(e) => updateAddon(index, { priceUsd: e.target.value })}
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={t('addons')}
                          />
                          {addon.hasQuantity ? <Badge>{t('qty')}</Badge> : <span className="text-xs text-muted-foreground">{t('toggle')}</span>}
                          <label className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={addon.isDefault}
                              onChange={(e) => updateAddon(index, { isDefault: e.target.checked })}
                            />
                            {t('defaultLabel')}
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAddon(index)}
                            aria-label={t('deleteOrder')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full">
                <Check className="h-4 w-4" />
                {editingItem ? t('save') : t('create')}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => resetForm()}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
          </Card>
        </div>
      ) : null}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t('menu')}</CardTitle>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
              <Button type="button" variant="outline" onClick={openCategoryManager}>
                <Pencil className="h-4 w-4" />
                {t('manageCategories')}
              </Button>
              <Button type="button" onClick={openNewMenuForm}>
                <Plus className="h-4 w-4" />
                {t('addNewMenu')}
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_minmax(12rem,15rem)_minmax(10rem,12rem)_auto]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                placeholder={t('search')}
              />
            </div>
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label={t('category')}
            >
              <option value="">{t('allCategories')}</option>
              {menu.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label={t('orderStatus')}
            >
              <option value="">{t('allStatuses')}</option>
              <option value="available">{t('available')}</option>
              <option value="hidden">{t('hidden')}</option>
            </Select>
            {hasMenuFilters ? (
              <Button
                type="button"
                variant="outline"
                className="w-full lg:w-auto"
                onClick={() => {
                  setSearch('');
                  setCategoryFilter('');
                  setStatusFilter('');
                }}
              >
                <X className="h-4 w-4" />
                {t('clearFilters')}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        {message && !menuFormOpen ? (
          <div className="mx-4 mb-3 rounded-md bg-muted px-3 py-2 text-sm">{message}</div>
        ) : null}
        <CardContent className="grid auto-rows-fr gap-3 md:grid-cols-2">
          {items.length === 0 ? (
            <div className="col-span-full rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              {t('noDishes')}
            </div>
          ) : null}
          {items.map((item) => (
            <div key={item.id} className="flex h-full flex-col rounded-md border border-border p-3">
              <div className="flex flex-1 flex-col items-center gap-3 text-center">
                <div className="relative h-24 w-24 overflow-hidden rounded-md bg-muted">
                  <MenuImage src={item.imageUrl} alt={item.name} sizes="96px" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col items-center gap-2">
                    <h3 className="line-clamp-2 min-h-10 font-semibold">{item.name}</h3>
                    <Badge tone={item.available ? 'primary' : 'danger'}>
                      {item.available ? t('available') : t('hidden')}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                  <div className="mt-2 flex min-h-7 flex-wrap justify-center gap-1">
                    {tags(item.dietaryTags).map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-auto flex flex-col items-center gap-3 pt-3 text-sm">
                <span className="whitespace-nowrap">
                  {displayUsd(item.priceUsd)} / {khr(item.priceKhr)}
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => editItem(item)}>
                    <Pencil className="h-4 w-4" />
                    {t('edit')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => toggle(item)}>
                    {item.available ? t('disable') : t('enable')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="relative h-[18px] w-8 rounded-full bg-[var(--color-border-secondary)] transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-white after:transition-transform after:duration-200 peer-checked:bg-[#0f8a7f] peer-checked:after:translate-x-3.5" />
    </label>
  );
}

// Tables

function TablesView({ tables, request, reload }) {
  const { t } = useLanguage();
  const emptyForm = { tableNumber: '', label: '', capacity: 4, active: true };
  const [form, setForm] = useState(emptyForm);
  const [editingTable, setEditingTable] = useState(null);

  function resetTableForm() {
    setEditingTable(null);
    setForm(emptyForm);
  }

  function editTable(table) {
    setEditingTable(table);
    setForm({
      tableNumber: String(table.tableNumber || '').toUpperCase(),
      label: table.label || '',
      capacity: Number(table.capacity || 1),
      active: Boolean(table.active),
    });
  }

  async function saveTable(event) {
    event.preventDefault();
    const payload = {
      ...form,
      tableNumber: form.tableNumber.trim().toUpperCase(),
      label: form.label.trim(),
      capacity: Number(form.capacity || 1),
      active: Boolean(form.active),
    };
    await request(editingTable ? `/api/admin/tables/${editingTable.id}` : '/api/admin/tables', {
      method: editingTable ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    resetTableForm();
    reload();
  }

  function printTable(table) {
    const svg = document.querySelector(`[data-qr="${table.id}"] svg`);
    const qr = svg ? new XMLSerializer().serializeToString(svg) : '';
    const qrUrl = tableQrUrl(table);
    const win = window.open('', '_blank');
    win.document.write(
      `<html><body style="font-family:sans-serif;text-align:center;padding:32px"><h1>HappyBoat</h1><h2>${escapeHtml(table.label)}</h2><div>${qr}</div><p>${escapeHtml(qrUrl)}</p></body></html>`
    );
    win.print();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <Card className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>{editingTable ? t('editTable') : t('newTable')}</CardTitle>
          {editingTable ? (
            <Button type="button" variant="outline" onClick={resetTableForm}>
              {t('new')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
          <form className="space-y-3" onSubmit={saveTable}>
            <Input
              value={form.tableNumber}
              onChange={(e) => setForm({ ...form, tableNumber: e.target.value.toUpperCase() })}
              placeholder="T05"
              required
            />
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder={t('label')}
              required
            />
            <Input
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              placeholder={t('capacity')}
              type="number"
              min="1"
            />
            <Select
              value={form.active ? 'true' : 'false'}
              onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}
              aria-label={t('active')}
            >
              <option value="true">{t('available')}</option>
              <option value="false">{t('inactive')}</option>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full">
                {editingTable ? t('save') : t('create')}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={resetTableForm}>
                {t('clearFilters')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((table) => {
          const qrUrl = tableQrUrl(table);
          return (
            <Card key={table.id}>
              <CardContent className="space-y-3 text-center">
                <div className="flex items-start justify-between text-left">
                  <div>
                    <h3 className="font-semibold">{table.label}</h3>
                    <p className="text-sm text-muted-foreground">{table.tableNumber}</p>
                  </div>
                  <Badge tone={table.active ? 'primary' : 'danger'}>
                    {table.active ? t('available') : t('inactive')}
                  </Badge>
                </div>
                <div
                  className="inline-flex rounded-lg border border-border bg-[#fff] p-3 text-[#000]"
                  data-qr={table.id}
                >
                  <QRCodeSVG value={qrUrl} size={160} includeMargin />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => editTable(table)}>
                    <Pencil className="h-4 w-4" />
                    {t('edit')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => downloadSvg(table.id, `${table.tableNumber}.svg`)}
                  >
                    <Download className="h-4 w-4" />
                    SVG
                  </Button>
                </div>
                <div>
                  <Button variant="outline" onClick={() => printTable(table)}>
                    <Printer className="h-4 w-4" />
                    {t('print')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function tableQrUrl(table) {
  const tableNumber = String(table?.tableNumber || '').trim();
  if (!tableNumber) {
    return table?.qrUrl || '';
  }

  const path = `/t/${encodeURIComponent(tableNumber)}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }

  return table?.qrUrl || path;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]
  ));
}

// Payments

function PaymentsView({ payments, request, reload }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [message, setMessage] = useState('');

  async function select(paymentId) {
    setMessage('');
    setSelected(await request(`/api/admin/payments/${paymentId}`));
  }

  async function confirmPaid(paymentId) {
    if (!paymentId || confirmingId) return;

    const ok = window.confirm(t('confirmPaymentPrompt'));
    if (!ok) return;

    setMessage('');
    setConfirmingId(paymentId);
    try {
      const updated = await request(`/api/admin/payments/${paymentId}/confirm-paid`, {
        method: 'POST',
      });
      setSelected(updated);
      await reload();
      setMessage(t('paymentMarkedPaid'));
    } catch (error) {
      setMessage(error.message || t('failedConfirmPayment'));
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_440px]">
      <Card className="min-w-0">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>{t('payments')}</CardTitle>
          <Button variant="outline" size="icon" onClick={reload} aria-label={t('refresh')}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {message ? (
            <div className="flex items-start gap-2 rounded-md border border-secondary/40 bg-secondary/10 px-3 py-2 text-sm">
              {message === t('paymentMarkedPaid') ? (
                <Check className="mt-0.5 h-4 w-4 text-primary" />
              ) : null}
              <span>{message}</span>
            </div>
          ) : null}
          {payments.map((payment) => (
            <button
              key={payment.id}
              onClick={() => select(payment.id)}
              className="w-full rounded-md border border-border p-3 text-left hover:border-primary sm:p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold">{payment.paymentNumber}</div>
                  <div className="break-words text-sm text-muted-foreground">
                    {payment.orderNumber} - {payment.tableNumber}
                  </div>
                </div>
                <div className="self-start sm:self-auto">
                  <StatusBadge status={payment.status} />
                </div>
              </div>
              <div className="mt-2 text-sm">
                {displayUsd(payment.amountUsd)} / {khr(payment.amountKhr)}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <CardHeader>
          <CardTitle>{t('transactionLog')}</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t('selectPayment')}</p>
          ) : (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold">{selected.paymentNumber}</div>
                    <div className="break-all text-muted-foreground">{selected.khqrMd5}</div>
                  </div>
                  <div className="self-start sm:self-auto">
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 rounded-md bg-muted p-3 text-xs">
                  <div>
                    <b>{t('order')}:</b> {selected.orderNumber || selected.orderId}
                  </div>
                  <div>
                    <b>{t('reference')}:</b> {selected.bakongReference || '-'}
                  </div>
                  <div>
                    <b>{t('transaction')}:</b> {selected.bakongTransactionHash || '-'}
                  </div>
                  <div>
                    <b>{t('total')}:</b> {displayUsd(selected.amountUsd)} /{' '}
                    {khr(selected.amountKhr)}
                  </div>
                </div>
              </div>

              {selected.status !== 'PAID' ? (
                <Button
                  className="w-full"
                  onClick={() => confirmPaid(selected.id)}
                  disabled={confirmingId === selected.id}
                >
                  {confirmingId === selected.id ? t('confirming') : t('confirmPaid')}
                </Button>
              ) : (
                <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                  {t('paymentAlreadyPaid')}
                </div>
              )}

              <div className="max-h-[60vh] space-y-2 overflow-auto">
                {(selected.transactions || []).map((tx) => (
                  <pre key={tx.id} className="overflow-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(tx, null, 2)}
                  </pre>
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
  const emptyForm = {
    code: '',
    description: '',
    discountType: 'PERCENT',
    discountValue: '',
    maxDiscountUsd: '',
    active: true,
    expiredDate: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [editingPromo, setEditingPromo] = useState(null);
  const [message, setMessage] = useState('');

  function resetForm(nextMessage = '') {
    setEditingPromo(null);
    setForm(emptyForm);
    setMessage(nextMessage);
  }

  function editPromo(promo) {
    setEditingPromo(promo);
    setMessage('');
    setForm({
      code: promo.code || '',
      description: promo.description || '',
      discountType: promo.discountType || 'PERCENT',
      discountValue: String(promo.discountValue ?? ''),
      maxDiscountUsd: String(promo.maxDiscountUsd ?? ''),
      active: Boolean(promo.active),
      expiredDate: promo.endsAt ? dateInputValue(new Date(promo.endsAt)) : '',
    });
  }

  async function savePromo(event) {
    event.preventDefault();
    setMessage('');
    const payload = {
      ...form,
      code: form.code.trim().toUpperCase(),
      discountValue: Number(form.discountValue || 0),
      maxDiscountUsd:
        form.discountType === 'PERCENT' && form.maxDiscountUsd !== ''
          ? Number(form.maxDiscountUsd)
          : null,
      expiredDate: form.expiredDate?.trim() || null,
      active: Boolean(form.active),
    };
    await request(editingPromo ? `/api/admin/promos/${editingPromo.id}` : '/api/admin/promos', {
      method: editingPromo ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    resetForm(editingPromo ? t('promoCodeUpdated') : t('promoCodeCreated'));
    reload();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>{editingPromo ? t('editPromoCode') : t('newPromoCode')}</CardTitle>
          {editingPromo ? (
            <Button type="button" variant="outline" onClick={resetForm}>
              {t('new')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-9rem)] overflow-auto">
          {message ? (
            <div className="mb-3 rounded-md bg-muted px-3 py-2 text-sm">{message}</div>
          ) : null}
          <form className="space-y-3" onSubmit={savePromo}>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder={t('promoCode')}
              required
            />
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('noDescription')}
            />
            <Select
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value })}
              aria-label={t('discount')}
            >
              <option value="PERCENT">{t('percentDiscount')}</option>
              <option value="FIXED_USD">{t('fixedUsdDiscount')}</option>
            </Select>
            <Input
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              placeholder={form.discountType === 'PERCENT' ? t('percentDiscount') : 'USD'}
              type="number"
              min="0"
              step="0.01"
              required
            />
            {form.discountType === 'PERCENT' ? (
              <Input
                value={form.maxDiscountUsd}
                onChange={(e) => setForm({ ...form, maxDiscountUsd: e.target.value })}
                placeholder={t('maxDiscountUsd')}
                type="number"
                min="0"
                step="0.01"
              />
            ) : null}
            <Select
              value={form.active ? 'true' : 'false'}
              onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}
              aria-label={t('active')}
            >
              <option value="true">{t('available')}</option>
              <option value="false">{t('inactive')}</option>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                <Check className="h-4 w-4" />
                {editingPromo ? t('save') : t('create')}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={resetForm}>
                {t('clearFilters')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('promoCodes')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {promos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noPromoCodes')}</p>
          ) : (
            promos.map((promo) => (
              <div key={promo.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{promo.code}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {promo.description || t('noDescription')}
                    </p>
                  </div>
                  <Badge tone={promo.active ? 'primary' : 'danger'}>
                    {promo.active ? t('available') : t('inactive')}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span>{formatPromoValue(promo)}</span>
                  <Button type="button" variant="outline" onClick={() => editPromo(promo)}>
                    <Pencil className="h-4 w-4" />
                    {t('edit')}
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
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  
  if (!analytics) {
    return (
      <Card className="min-w-0">
        <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>{error || t('loadingAnalytics')}</span>
          {error ? (
            <Button type="button" variant="outline" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              {t('refresh')}
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
  const activeOrders = sumRows(analytics.orderCountByStatus, 'count', (row) =>
    ['PENDING_PAYMENT', 'PAID', 'RECEIVED', 'PREPARING'].includes(row.status)
  );
  const paidPayments = sumRows(
    analytics.paymentBreakdown,
    'count',
    (row) => row.paymentMethod !== 'UNPAID'
  );
  const totalPayments = sumRows(analytics.paymentBreakdown, 'count');
  const paymentRate = totalPayments ? Math.round((paidPayments / totalPayments) * 100) : 0;
  const topItem = analytics.topSellingItems?.[0];
  const topTable = analytics.revenueByTable?.[0];
  const filteredPaidRevenueByDay = filterAnalyticsRowsByDate(
    analytics.paidRevenueByDay || [],
    dateRange
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('analytics')}</h2>
          <p className="text-sm text-muted-foreground">
            {lastUpdatedAt
              ? `${t('updated')} ${formatClockTime(lastUpdatedAt)}`
              : t('liveRestaurantOps')}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            {t('from')}
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              className="w-40"
              aria-label={t('from')}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            {t('to')}
            <Input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              className="w-40"
              aria-label={t('to')}
            />
          </label>
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            {t('refresh')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CalendarDays}
          title={t('dailyRevenue')}
          value={usd(dailyRevenue)}
          sub={`${dailyOrders} ${t('orders')} · ${khr(analytics.daily?.dailyRevenueKhr)}`}
          tone="primary"
        />
        <Metric
          icon={BarChart3}
          title={t('weeklyRevenue')}
          value={usd(weeklyRevenue)}
          sub={`${weeklyOrders} ${t('orders')} · ${khr(analytics.weekly?.weeklyRevenueKhr)}`}
          tone="accent"
        />
        <Metric
          icon={CreditCard}
          title={t('averageOrder')}
          value={usd(analytics.averageOrderValue?.averageOrderValueUsd)}
          sub={khr(analytics.averageOrderValue?.averageOrderValueKhr)}
          tone="secondary"
        />
        <Metric
          icon={Clock}
          title={t('activeOrders')}
          value={String(activeOrders)}
          sub={`${paymentRate}% ${t('paidPayments')}`}
          tone="muted"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <ItemDonutChart rows={analytics.topSellingItems} />
        <PaidRevenueLineChart rows={filteredPaidRevenueByDay} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>{t('sortStatus')}</CardTitle>
            <Badge tone="secondary">
              {activeOrders} {t('active')}
            </Badge>
          </CardHeader>
          <CardContent>
            <StatusFunnel rows={analytics.orderCountByStatus} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('highlights')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <HighlightRow
              icon={Utensils}
              label={t('topItems')}
              value={topItem?.itemName || '-'}
              sub={topItem ? `${topItem.quantity} sold · ${usd(topItem.revenueUsd)}` : '-'}
            />
            <HighlightRow
              icon={Table2}
              label={t('revenueByTable')}
              value={topTable?.tableNumber || '-'}
              sub={
                topTable ? `${topTable.orders} ${t('orders')} · ${usd(topTable.revenueUsd)}` : '-'
              }
            />
            <HighlightRow
              icon={CreditCard}
              label={t('payments')}
              value={`${paymentRate}% ${t('paid')}`}
              sub={`${paidPayments}/${totalPayments || 0} ${t('payments')}`}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AnalyticsBarsCard
          title={t('topItems')}
          rows={analytics.topSellingItems}
          label="itemName"
          value="quantity"
          detailValue="revenueUsd"
          detailCurrency
        />
        <AnalyticsBarsCard
          title={t('revenueByTable')}
          rows={analytics.revenueByTable}
          label="tableNumber"
          value="revenueUsd"
          currency
          detailValue="orders"
        />
        <AnalyticsBarsCard
          title={t('paymentBreakdown')}
          rows={analytics.paymentBreakdown}
          label="paymentMethod"
          value="count"
          detailValue="amountUsd"
          detailCurrency
        />
        <PeakHoursCard rows={analytics.peakHours} />
      </div>
    </div>
  );
}

// Shared components

function TabButton({ active, icon: Icon, label, ...props }) {
  return (
    <Button variant={active ? 'default' : 'outline'} {...props}>
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

function StatusBadge({ status }) {
  const { t } = useLanguage();
  const tone =
    status === 'PAID' || status === 'COMPLETED'
      ? 'primary'
      : status === 'RECEIVED'
        ? 'info'
        : status === 'CANCELLED' || status === 'REJECTED' || status === 'EXPIRED'
          ? 'danger'
          : 'secondary';
  return <Badge tone={tone}>{dashboardStatusLabel(status, t)}</Badge>;
}

function PaymentBadge({ status }) {
  const { t } = useLanguage();
  if (!status) return <Badge>{t('unpaid')}</Badge>;
  const tone =
    status === 'PAID'
      ? 'primary'
      : status === 'EXPIRED'
        ? 'danger'
        : status === 'PENDING'
          ? 'secondary'
          : 'muted';
  return <Badge tone={tone}>{dashboardStatusLabel(status, t)}</Badge>;
}

function KitchenStatusBadge({ status }) {
  const { t } = useLanguage();
  const tone =
    status === 'COMPLETED' ? 'primary' : status === 'ACCEPTED' ? 'info' : 'secondary';
  return <Badge tone={tone}>{kitchenStatusLabel(status, t)}</Badge>;
}

function AttentionBadge({ minutes }) {
  const { t } = useLanguage();
  return (
    <Badge tone="accent" className="gap-1">
      <BellRing className="h-3 w-3" />
      {t('alert')} {minutes}m
    </Badge>
  );
}

function OrderMinutesBadge({ minutes }) {
  const { t } = useLanguage();
  return (
    <Badge tone="muted" className="gap-1">
      <Clock className="h-3 w-3" />
      {t('totalMinutes')} {minutes}m
    </Badge>
  );
}

function PaidMinutesBadge({ minutes }) {
  const { t } = useLanguage();
  return (
    <Badge tone="primary" className="gap-1">
      <Clock className="h-3 w-3" />
      {t('paidMinutes')} {minutes}m
    </Badge>
  );
}

function dashboardStatusLabel(status, t) {
  const labels = {
    PENDING_PAYMENT: t('awaitingPayment'),
    PAID: t('paid'),
    RECEIVED: t('receivedByStaff'),
    PREPARING: t('preparing'),
    READY: t('readyForPickup'),
    COMPLETED: t('completed'),
    REJECTED: t('rejected'),
    CANCELLED: t('cancelled'),
    EXPIRED: t('expired'),
    PENDING: t('pending'),
    UNPAID: t('unpaid'),
  };
  return labels[status] || status || '-';
}

function kitchenStatusLabel(status, t) {
  const labels = {
    PENDING: t('pending'),
    ACCEPTED: t('acceptedPreparing'),
    COMPLETED: t('complete'),
  };
  return labels[status] || status || '-';
}

function formatPromoValue(promo) {
  if (promo.discountType === 'PERCENT') {
    const maxDiscount = promo.maxDiscountUsd == null ? '' : `, max ${usd(promo.maxDiscountUsd)}`;
    return `${Number(promo.discountValue || 0).toFixed(2)}% off${maxDiscount}`;
  }
  return `${usd(promo.discountValue)} off`;
}

function formatOrderDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year} ${formatClockTime(date)}`;
}

function formatClockTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function dateInputValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameLocalDate(value, targetDate) {
  return dateInputValue(value) === targetDate;
}

function isPaidKitchenOrder(order) {
  return ['PAID', 'RECEIVED', 'PREPARING'].includes(order?.status);
}

function isAlreadyPaidOrder(order) {
  return (
    ['PAID', 'RECEIVED', 'PREPARING', 'READY', 'COMPLETED'].includes(order?.status) ||
    order?.paymentStatus === 'PAID'
  );
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

function confirmKitchenGroupStatus({ itemName, itemIds, status, onGroupStatus, t }) {
  if (!itemIds.length) return;
  const message = t(status === 'COMPLETED' ? 'confirmCompleteAll' : 'confirmAcceptAll')
    .replace('{count}', itemIds.length)
    .replace('{item}', itemName || '');
  if (typeof window === 'undefined' || window.confirm(message)) {
    onGroupStatus(itemIds, status);
  }
}

function kitchenCategoryOptions(items = []) {
  return [
    ...new Set(
      flattenKitchenItems(items)
        .map((item) => item.categoryName)
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function filterKitchenItems(items = [], filters = {}, now = Date.now()) {
  return flattenKitchenItems(items).filter((item) => {
    if (filters.dateFilter && !isSameLocalDate(kitchenItemBaseValue(item), filters.dateFilter)) {
      return false;
    }
    if (filters.categoryFilter && item.categoryName !== filters.categoryFilter) {
      return false;
    }
    if (filters.timeFilter && !matchesKitchenTimeFilter(item, filters.timeFilter, now)) {
      return false;
    }
    return true;
  });
}

function matchesKitchenTimeFilter(item, timeFilter, now = Date.now()) {
  const minutes = kitchenItemMinutes(item, now);
  switch (timeFilter) {
    case 'under_5':
      return minutes < 5;
    case '5_10':
      return minutes >= 5 && minutes < 10;
    case '10_20':
      return minutes >= 10 && minutes < 20;
    case '20_plus':
      return minutes >= 20;
    default:
      return true;
  }
}

function flattenKitchenItems(items = []) {
  return items.flatMap((item) =>
    Array.isArray(item.items) && item.items.length
      ? item.items.map((entry) => ({
          ...entry,
          categoryName: entry.categoryName || item.categoryName,
          imageUrl: entry.imageUrl || item.imageUrl,
          itemName: entry.itemName || item.itemName,
        }))
      : [item]
  );
}

function groupKitchenCards(items = [], statusMap = {}) {
  const groups = new Map();
  for (const item of flattenKitchenItems(items)) {
    const key = [item.categoryName || '', item.itemName || '', item.imageUrl || ''].join('::');
    const status = itemStatusFromMap(item, statusMap);
    const group =
      groups.get(key) ||
      {
        key,
        categoryName: item.categoryName,
        itemName: item.itemName,
        imageUrl: item.imageUrl,
        totalQuantity: 0,
        itemIds: [],
        rows: [],
      };
    group.totalQuantity += Number(item.quantity || 0);
    group.itemIds.push(item.id);
    group.rows.push({
      ...item,
      kitchenStatus: status,
    });
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    kitchenStatus: groupedKitchenStatus(group.rows),
  }));
}

function itemStatusFromMap(item, statusMap = {}) {
  return statusMap[item?.id] || item?.kitchenStatus || 'PENDING';
}

function groupedKitchenStatus(items = []) {
  if (items.length && items.every((item) => item.kitchenStatus === 'COMPLETED')) {
    return 'COMPLETED';
  }
  if (items.some((item) => ['ACCEPTED', 'COMPLETED'].includes(item.kitchenStatus))) {
    return 'ACCEPTED';
  }
  return 'PENDING';
}

function applyKitchenStatusToOrder(order, statusMap = {}) {
  if (!order?.items) return order;
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      kitchenStatus: itemStatusFromMap(item, statusMap),
    })),
  };
}

function kitchenItemBaseValue(item) {
  return item?.paidAt || item?.createdAt;
}

function kitchenItemMinutes(item, now = Date.now()) {
  const baseValue = kitchenItemBaseValue(item);
  const baseTime = new Date(baseValue).getTime();
  if (!baseValue || Number.isNaN(baseTime)) return 0;
  return Math.max(0, Math.floor((now - baseTime) / 60000));
}

function formatKitchenAddons(addons = []) {
  return addons
    .map((addon) => `${addon.addonName} x${addon.quantity}`)
    .join(', ');
}

function orderItemSpiceLabel(item) {
  const spiceLevel = String(item?.spiceLevel || '').trim();
  const spiceLabel = String(item?.spiceLevelName || spiceLevel).trim();
  if (!spiceLabel) return '';
  if (spiceLevel.toUpperCase() === 'NORMAL' || spiceLabel.toUpperCase() === 'NORMAL') return '';
  return spiceLabel;
}

function orderItemSpiceTotalUsd(item) {
  const unitPriceUsd = Number(item?.spiceLevelPriceUsd || 0);
  const quantity = Math.max(1, Number(item?.quantity || 1));
  return unitPriceUsd * quantity;
}

function canUpdateKitchenItem(order) {
  return (
    order?.paymentStatus === 'PAID' &&
    !['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(order?.status)
  );
}

function formatApiError(error, fallback) {
  const status = error?.status ? `${error.status} ` : '';
  const message = error?.message && !error.message.startsWith('<') ? error.message : fallback;
  return `${fallback}${status ? ` (${status.trim()})` : ''}${message && message !== fallback ? `: ${message}` : ''}`;
}

function maskEmail(value) {
  if (!value) return '';
  const email = String(value);
  const atIndex = email.indexOf('@');
  if (atIndex <= 1) {
    return `${email.charAt(0)}***${atIndex >= 0 ? email.slice(atIndex) : ''}`;
  }
  return `${email.charAt(0)}***${email.slice(atIndex)}`;
}

function profileDisplayName(value) {
  if (!value) return 'Profile';
  const email = String(value);
  const atIndex = email.indexOf('@');
  const name = atIndex > 0 ? email.slice(0, atIndex) : email;
  return name || 'Profile';
}

function Metric({ icon: Icon, title, value, sub, tone = 'primary' }) {
  const toneClass =
    {
      primary: 'bg-primary/10 text-primary',
      secondary: 'bg-secondary/20 text-secondary-foreground',
      accent: 'bg-accent/10 text-accent',
      muted: 'bg-muted text-muted-foreground',
    }[tone] || 'bg-primary/10 text-primary';

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${toneClass}`}
        >
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
  const totalQuantity = sumRows(rows, 'quantity');
  const segments = rows
    .slice(0, 6)
    .map((row, index) => ({
      label: row.itemName,
      value: Number(row.quantity || 0),
      revenueUsd: Number(row.revenueUsd || 0),
      color: DONUT_COLORS[index % DONUT_COLORS.length],
    }))
    .filter((row) => row.value > 0);
  let offset = 25;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('ordersByItem')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
        <div className="relative mx-auto h-44 w-44">
          <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
            <circle
              cx="21"
              cy="21"
              r="15.915"
              fill="transparent"
              stroke="hsl(var(--muted))"
              strokeWidth="7"
            />
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
            <div className="text-xs text-muted-foreground">{t('itemsSold')}</div>
          </div>
        </div>
        <div className="space-y-2">
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">-</p>
          ) : (
            segments.map((segment) => (
              <div
                key={segment.label}
                className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className="truncate">{segment.label}</span>
                </span>
                <span className="shrink-0 font-semibold">{segment.value}</span>
              </div>
            ))
          )}
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
    payments: Number(row.payments || 0),
  }));
  const totalPaid = points.reduce((sum, point) => sum + point.paidUsd, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{t('paidRevenueByDay')}</CardTitle>
        <Badge tone="primary">{usd(totalPaid)}</Badge>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<ChartLoading label={t('loadingAnalytics')} />}>
          <AnalyticsLineChart
            data={points}
            xKey="day"
            yKey="paidUsd"
            label={t('paidRevenueByDay')}
            color="hsl(var(--primary))"
          />
        </Suspense>
      </CardContent>
    </Card>
  );
}

function ChartLoading({ label }) {
  return (
    <div className="flex h-80 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      <span>{label}</span>
    </div>
  );
}

function filterAnalyticsRowsByDate(rows = [], dateRange = {}) {
  if (!dateRange.from && !dateRange.to) return rows;
  return rows.filter((row) => {
    const day = String(row.day || '');
    if (!day) return false;
    if (dateRange.from && day < dateRange.from) return false;
    if (dateRange.to && day > dateRange.to) return false;
    return true;
  });
}

function StatusFunnel({ rows = [] }) {
  const orderedStatuses = [
    'PENDING_PAYMENT',
    'PAID',
    'RECEIVED',
    'PREPARING',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
    'REJECTED',
  ];
  const sortedRows = [...rows].sort(
    (a, b) => orderedStatuses.indexOf(a.status) - orderedStatuses.indexOf(b.status)
  );
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
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(5, (count / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsBarsCard({
  title,
  rows = [],
  label,
  value,
  currency,
  detailValue,
  detailCurrency,
}) {
  const { t } = useLanguage();
  const maxValue = Math.max(1, ...rows.map((row) => Number(row[value] || 0)));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">-</p>
        ) : (
          rows.map((row) => {
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
                    {detailCurrency
                      ? usd(detail)
                      : `${detail} ${detailValue === 'orders' ? t('orders') : ''}`}
                  </div>
                ) : null}
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (amount / maxValue) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function PeakHoursCard({ rows = [] }) {
  const { t } = useLanguage();
  const maxValue = Math.max(1, ...rows.map((row) => Number(row.orders || 0)));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('peakHours')}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        {rows.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">-</p>
        ) : (
          rows.map((row) => {
            const orders = Number(row.orders || 0);
            return (
              <div key={row.hour} className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">{formatHour(row.hour)}</span>
                  <span className="text-muted-foreground">{orders}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-secondary"
                    style={{ width: `${Math.max(6, (orders / maxValue) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function sumRows(rows = [], key, predicate = () => true) {
  return rows.filter(predicate).reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

function formatHour(hour) {
  const normalized = Number(hour || 0);
  return `${String(normalized).padStart(2, '0')}:00`;
}

function formatShortDay(value) {
  if (!value) return '-';
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

// Admin Accounts

function AdminAccountsView({ request, reload }) {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAccounts() {
    try {
      const data = await request('/api/admin/accounts');
      setAccounts(data || []);
    } catch (error) {
      setMessage(t('accountLoadFailed'));
    }
  }

  async function createAdmin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await request('/api/admin/accounts', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password.trim(),
        }),
      });
      setForm({ username: '', password: '' });
      setMessage(t('adminAccountCreated'));
      loadAccounts();
    } catch (error) {
      setMessage(error.message || t('accountCreateFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function deactivateAccount(username) {
    if (!confirm(t('confirmDeactivateAccount').replace('{username}', username))) return;
    try {
      await request(`/api/admin/accounts/${username}/deactivate`, { method: 'PATCH' });
      setMessage(t('accountDeactivated'));
      loadAccounts();
    } catch (error) {
      setMessage(error.message || t('accountDeactivateFailed'));
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <CardHeader>
          <CardTitle>{t('createAdmin')}</CardTitle>
        </CardHeader>
        <CardContent>
          {message && (
            <div className="mb-3 rounded-md bg-muted px-3 py-2 text-sm">{message}</div>
          )}
          <form className="space-y-3" onSubmit={createAdmin}>
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder={t('username')}
              disabled={loading}
              required
            />
            <Input
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t('password')}
              type="password"
              disabled={loading}
              required
            />
            <Button disabled={loading} className="w-full">
              <Check className="h-4 w-4" />
              {t('create')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('adminAccounts')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noAccounts')}</p>
            ) : (
              accounts.map((account) => (
                <div
                  key={account.username}
                  className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="break-all font-medium">{account.username}</div>
                    <div className="text-sm text-muted-foreground">
                      {adminRoleLabel(account.role, t)}
                    </div>
                  </div>
                  {account.role !== 'SUPER_ADMIN' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => deactivateAccount(account.username)}
                    >
                      {t('deactivate')}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function adminRoleLabel(role, t) {
  if (role === 'SUPER_ADMIN') return t('superAdmin');
  if (role === 'ADMIN') return t('admin');
  return role || t('admin');
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
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
