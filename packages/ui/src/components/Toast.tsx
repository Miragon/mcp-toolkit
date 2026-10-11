import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react"
import { useToolkitMessages } from "../locale/locale-provider.js"
import { cn } from "../lib/utils.js"
import {
  createToast,
  toastReducer,
  type ToastItem,
  type ToastOptions,
  type ToastTone,
} from "../lib/toast-model.js"

export type { ToastOptions, ToastTone } from "../lib/toast-model.js"

/** What {@link useToast} returns. */
export interface ToastApi {
  /** Show a toast; returns its id (for an early {@link ToastApi.dismiss}). */
  show: (options: ToastOptions) => number
  /** Remove a toast before its timer runs out. */
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Outside a provider `useToast()` degrades to a no-op instead of throwing. */
const NOOP_TOASTS: ToastApi = { show: () => -1, dismiss: () => {} }

/**
 * Raise toasts from anywhere below a {@link ToastProvider}: `show({ tone,
 * title })` after a write succeeded or failed, never a silent `console` line.
 * Outside a provider it returns a no-op API, so a widget rendered in a bare
 * fixture never crashes on feedback.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_TOASTS
}

/** Status edge per tone — the status colour as border, never as text. */
const TONE_EDGE: Record<ToastTone, string> = {
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-danger",
  info: "border-l-info",
}

/** Icon per tone, in the tone's ink so it stays legible on the card (≥ 3:1). */
const TONE_ICON: Record<ToastTone, { Icon: LucideIcon; className: string }> = {
  success: { Icon: CircleCheck, className: "text-(color:--success-ink)" },
  warning: { Icon: TriangleAlert, className: "text-(color:--warning-ink)" },
  danger: { Icon: CircleAlert, className: "text-(color:--danger-ink)" },
  info: { Icon: Info, className: "text-(color:--info-ink)" },
}

/**
 * The stack of toasts — a presentational view over a list (the provider owns
 * the state). The container is ONE persistent live region (`role="status"`,
 * `aria-live="polite"`), so a newly added toast is announced without stealing
 * focus. Bottom centre, above dialogs (z 60), per CI §5/§8.
 */
export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly ToastItem[]
  onDismiss: (id: number) => void
}) {
  const messages = useToolkitMessages()
  return (
    <div
      data-slot="toast-viewport"
      role="status"
      aria-live="polite"
      aria-label={messages.common.notifications}
      className="pointer-events-none fixed inset-x-0 bottom-4 z-60 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          dismissLabel={messages.common.dismiss}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}

function ToastCard({
  toast,
  dismissLabel,
  onDismiss,
}: {
  toast: ToastItem
  dismissLabel: string
  onDismiss: (id: number) => void
}) {
  // Hover or keyboard focus holds the toast: the timer restarts on leave.
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (held) return
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration)
    return () => clearTimeout(timer)
  }, [held, onDismiss, toast.id, toast.duration])
  const { Icon, className: iconClass } = TONE_ICON[toast.tone]
  return (
    <div
      data-slot="toast"
      data-tone={toast.tone}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={cn(
        "bg-popover text-popover-foreground pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-l-4 px-4 py-3 text-sm shadow-(--shadow-2)",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-(--motion-base) motion-safe:ease-(--ease)",
        TONE_EDGE[toast.tone],
      )}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{toast.title}</p>
        {toast.description && (
          <p className="text-muted-foreground mt-0.5 break-words">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={() => onDismiss(toast.id)}
        className="text-muted-foreground hover:text-foreground -mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}

function ToastRoot({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, [])
  const nextId = useRef(0)
  const dismiss = useCallback((id: number) => dispatch({ type: "dismiss", id }), [])
  const show = useCallback((options: ToastOptions) => {
    nextId.current += 1
    const id = nextId.current
    dispatch({ type: "add", toast: createToast(id, options) })
    return id
  }, [])
  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss])
  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

/**
 * Provide toasts to a subtree and render their stack. Idempotent: nested
 * inside another `ToastProvider` it adds nothing, so the app shell and an
 * embedded builder share one stack and one live region. `McpAppView` mounts
 * one for you.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const parent = useContext(ToastContext)
  return parent ? children : <ToastRoot>{children}</ToastRoot>
}
