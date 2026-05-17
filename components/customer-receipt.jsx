'use client';

import { MenuImage } from '@/components/menu-image';
import { cn, displayUsd, khr, usd } from '@/lib/utils';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const RECEIPT_STATUSES = ['PAID', 'RECEIVED', 'PREPARING', 'READY', 'COMPLETED'];
const BLOCKED_STATUSES = ['CANCELLED', 'REJECTED', 'EXPIRED'];

export default function CustomerReceipt({ orderId, accessToken = '' }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const rootRef = useRef(null);
  const receiptRef = useRef(null);

  async function exportPdf() {
    const node = receiptRef.current;
    if (!node || exporting) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);
      await waitForImages(node);
      const canvas = await html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const widthPt = 226;
      const heightPt = Math.round((canvas.height / canvas.width) * widthPt);
      const doc = new jsPDF({ unit: 'pt', format: [widthPt, heightPt] });
      doc.addImage(imgData, 'JPEG', 0, 0, widthPt, heightPt);
      doc.save(`receipt-${order?.orderNumber || order?.id || orderId}.pdf`);
    } catch (exportError) {
      setError(exportError?.message || 'PDF export failed.');
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrder() {
      setLoading(true);
      setError('');

      try {
        const encodedAccessToken = encodeURIComponent(accessToken || '');
        const response = await fetch(`/api/customer/orders/${encodeURIComponent(orderId)}?accessToken=${encodedAccessToken}`, {
          cache: 'no-store',
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          let message = text;
          try {
            const parsed = JSON.parse(text);
            message = parsed.error || parsed.message || text;
          } catch {
            // Keep the plain text response when the API is not returning JSON.
          }
          throw new Error(message || `Request failed with ${response.status}`);
        }

        const data = await response.json();
        setOrder(data);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError.message || 'Receipt could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadOrder();

    return () => controller.abort();
  }, [accessToken, orderId]);

  useReceiptReveal(rootRef, !loading && (Boolean(order) || Boolean(error)));

  const state = useMemo(() => receiptState(order), [order]);
  const backHref = order?.tableNumber ? `/t/${encodeURIComponent(order.tableNumber)}` : '/';
  const receiptPdfHref = `/api/receipts/orders/${encodeURIComponent(orderId)}.pdf?accessToken=${encodeURIComponent(accessToken || '')}`;

  if (loading) {
    return (
      <main className="min-h-dvh bg-muted/40 px-4 py-8 text-foreground">
        <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground shadow-sm">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            Loading receipt...
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-dvh bg-muted/40 px-4 py-8 text-foreground" ref={rootRef}>
        <div className="mx-auto w-full max-w-md">
          <StatusPanel
            tone="error"
            title="Receipt unavailable"
            description={error}
            backHref={backHref}
          />
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-dvh bg-muted/40 px-4 py-6 text-foreground sm:py-10"
      ref={rootRef}
    >
      <div className="mx-auto w-full max-w-md space-y-4">
        <div
          className="receipt-reveal flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          data-receipt-reveal
        >
          <a
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium transition hover:bg-muted"
            href={backHref}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to order
          </a>
          {state.canExport ? (
            <a
              href={receiptPdfHref}
              download
              aria-disabled={exporting}
              onClick={(event) => {
                event.preventDefault();
                if (!exporting) {
                  exportPdf();
                }
              }}
              className={cn(
                'inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90',
                exporting ? 'pointer-events-none cursor-not-allowed opacity-70' : ''
              )}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {exporting ? 'Exporting...' : 'Export PDF'}
            </a>
          ) : null}
        </div>

        <div className="receipt-reveal flex flex-wrap gap-2" data-receipt-reveal>
          <StatusPill label={formatStatus(order?.status)} tone={state.tone} />
          {order?.paymentStatus ? (
            <StatusPill label={`Payment ${formatStatus(order.paymentStatus)}`} tone={paymentTone(order.paymentStatus)} />
          ) : null}
        </div>

        {!state.canExport ? (
          <StatusPanel
            tone={state.tone}
            title={state.title}
            description={state.description}
            backHref={backHref}
            showBack={false}
          />
        ) : (
          <article
            ref={receiptRef}
            className="receipt-paper receipt-reveal relative mx-auto w-full bg-white px-6 py-7 font-mono text-[13px] leading-snug text-zinc-900 shadow-xl"
            data-receipt-reveal
          >
            <header className="text-center">
              <p className="text-[11px] uppercase tracking-[0.4em] text-zinc-500">HappyBoat</p>
              <h1 className="mt-1 text-xl font-extrabold tracking-[0.18em]">CUSTOMER RECEIPT</h1>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                Order #{order.orderNumber || '-'}
              </p>
            </header>

            <ReceiptDivider />

            <section className="space-y-1 text-[12px]">
              <ReceiptMetaRow label="Table" value={order.tableNumber || '-'} />
              <ReceiptMetaRow label="Status" value={formatStatus(order.status)} />
              <ReceiptMetaRow label="Payment" value={formatStatus(order.paymentStatus)} />
              <ReceiptMetaRow label="Created" value={formatDateTime(order.createdAt)} />
              <ReceiptMetaRow label="Paid" value={formatDateTime(order.paidAt)} />
            </section>

            <ReceiptDivider />

            <section>
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-700">
                Items
              </p>
              <div className="mt-3 space-y-4">
                {(order.items || []).map((item, index) => (
                  <ReceiptItem
                    key={item.id || `${item.itemName}-${index}`}
                    item={item}
                    index={index}
                  />
                ))}
              </div>
            </section>

            <ReceiptDivider />

            <section className="space-y-1 text-[12px]">
              <TotalLine label="Subtotal" value={displayUsd(order.subtotalUsd)} />
              <TotalLine
                label="Discount"
                value={`-${displayUsd(order.discountUsd)}`}
              />
              <div className="mt-2 border-t border-dashed border-zinc-400 pt-2">
                <TotalLine label="TOTAL USD" value={displayUsd(order.totalUsd)} strong />
                <TotalLine label="TOTAL KHR" value={khr(order.totalKhr)} strong />
              </div>
            </section>

            <ReceiptDivider />

            <footer className="text-center text-[11px] text-zinc-600">
              <p className="font-bold uppercase tracking-[0.3em] text-zinc-800">
                Thank you!
              </p>
              <p className="mt-1">{formatDateTime(order.paidAt || order.createdAt)}</p>
              <p className="mt-1 break-all">Ref: {order.orderNumber || order.id}</p>
              <div className="receipt-barcode mt-3" aria-hidden="true" />
            </footer>

            <div className="receipt-edge receipt-edge-top" aria-hidden="true" />
            <div className="receipt-edge receipt-edge-bottom" aria-hidden="true" />
          </article>
        )}
      </div>
    </main>
  );
}

function ReceiptItem({ item, index }) {
  const showSize = sizeLabel(item);
  return (
    <article
      className="receipt-reveal receipt-item flex gap-3"
      data-receipt-reveal
      style={{ transitionDelay: `${Math.min(index * 35, 180)}ms` }}
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-300 bg-zinc-100">
        <MenuImage
          src={item.imageUrl}
          alt={item.itemName || ''}
          sizes="56px"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-bold leading-snug">
            <span className="mr-1 inline-block min-w-[1.5rem] text-zinc-600">
              x{item.quantity || 0}
            </span>
            {item.itemName}
          </p>
          <span className="shrink-0 font-bold">{displayUsd(item.subtotalUsd)}</span>
        </div>
        <p className="text-[11px] text-zinc-500">
          {displayUsd(item.unitPriceUsd)} each
        </p>

        {showSize ? (
          <p className="mt-1 text-[11px] text-zinc-600">
            Size: <span className="font-semibold">{showSize}</span>
            {Number(item.sizeLevelPriceUsd || 0) > 0 ? (
              <span> (+{usd(item.sizeLevelPriceUsd)})</span>
            ) : null}
          </p>
        ) : null}

        {item.addons?.length ? (
          <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-600">
            {item.addons.map((addon, addonIndex) => (
              <li
                key={addon.id || `${addon.addonName}-${addonIndex}`}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate">
                  + {addon.quantity || 0} x {addon.addonName}
                </span>
                <span className="shrink-0 font-semibold text-zinc-800">
                  {displayUsd(addon.subtotalUsd)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {item.specialInstructions ? (
          <p className="mt-1 italic text-[11px] text-zinc-600">
            “{item.specialInstructions}”
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ReceiptDivider() {
  return (
    <div
      className="my-4 border-t border-dashed border-zinc-400"
      aria-hidden="true"
    />
  );
}

function ReceiptMetaRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-right font-semibold">{value || '-'}</span>
    </div>
  );
}

function useReceiptReveal(rootRef, ready) {
  useEffect(() => {
    if (!ready || !rootRef.current) return undefined;

    const nodes = Array.from(rootRef.current.querySelectorAll('[data-receipt-reveal]'));
    if (!nodes.length) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.12,
      }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [ready, rootRef]);
}

function receiptState(order) {
  if (!order) {
    return {
      canExport: false,
      tone: 'error',
      title: 'Receipt unavailable',
      description: 'Order details could not be loaded.',
    };
  }

  if (RECEIPT_STATUSES.includes(order.status)) {
    return {
      canExport: true,
      tone: 'success',
      title: 'Payment confirmed',
      description: 'Your receipt is ready.',
    };
  }

  if (order.status === 'PENDING_PAYMENT') {
    return {
      canExport: false,
      tone: 'pending',
      title: 'Payment not confirmed yet',
      description: 'The receipt will be available after the payment is confirmed.',
    };
  }

  if (BLOCKED_STATUSES.includes(order.status)) {
    return {
      canExport: false,
      tone: 'error',
      title: `Order ${formatStatus(order.status).toLowerCase()}`,
      description: 'This order cannot be exported as a receipt.',
    };
  }

  return {
    canExport: false,
    tone: 'pending',
    title: 'Receipt not ready',
    description: 'The receipt will be available after the order is paid.',
  };
}

function StatusPanel({ tone, title, description, backHref, showBack = true }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'pending' ? Clock : AlertCircle;

  return (
    <section
      className={cn(
        'receipt-reveal rounded-lg border bg-card p-5 text-card-foreground shadow-sm sm:p-6',
        tone === 'success'
          ? 'border-primary/25'
          : tone === 'pending'
            ? 'border-secondary/40'
            : 'border-destructive/25'
      )}
      data-receipt-reveal
    >
      <div className="flex gap-4">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
            tone === 'success'
              ? 'bg-primary/10 text-primary'
              : tone === 'pending'
                ? 'bg-secondary/20 text-secondary-foreground'
                : 'bg-destructive/10 text-destructive'
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          {showBack ? (
            <a
              className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-muted"
              href={backHref}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to order
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TotalLine({ label, value, strong = false }) {
  return (
    <div className={cn('flex items-center justify-between gap-4', strong ? 'text-base font-extrabold' : '')}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function StatusPill({ label, tone }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-bold uppercase',
        tone === 'success'
          ? 'bg-primary/10 text-primary'
          : tone === 'pending'
            ? 'bg-secondary/20 text-secondary-foreground'
            : 'bg-destructive/10 text-destructive'
      )}
    >
      {label}
    </span>
  );
}

function formatStatus(status) {
  return String(status || 'unknown')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function paymentTone(status) {
  if (status === 'PAID') return 'success';
  if (status === 'FAILED' || status === 'EXPIRED') return 'error';
  return 'pending';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function sizeLabel(item) {
  const label = String(item?.sizeLevelName || '').trim();
  if (!label || label.toUpperCase() === 'NORMAL') return '';
  return label;
}

function waitForImages(node) {
  const imgs = Array.from(node.querySelectorAll('img'));
  return Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    })
  );
}
