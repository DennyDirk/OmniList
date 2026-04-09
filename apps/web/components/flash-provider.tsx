"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

type FlashTone = "success" | "error" | "info";

interface FlashItem {
  id: string;
  message: string;
  tone: FlashTone;
  leaving: boolean;
}

interface FlashInput {
  message: string;
  tone?: FlashTone;
  durationMs?: number;
}

interface FlashContextValue {
  showFlash(input: FlashInput): void;
}

const defaultDurationMs = 3600;
const exitDurationMs = 220;

const FlashContext = createContext<FlashContextValue | undefined>(undefined);

export function FlashProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FlashItem[]>([]);
  const hideTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const removeTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimers = useCallback((id: string) => {
    const hideTimeout = hideTimeoutsRef.current.get(id);
    const removeTimeout = removeTimeoutsRef.current.get(id);

    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeoutsRef.current.delete(id);
    }

    if (removeTimeout) {
      clearTimeout(removeTimeout);
      removeTimeoutsRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimers(id);
      setItems((current) => current.map((item) => (item.id === id ? { ...item, leaving: true } : item)));

      const removeTimeout = setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
        removeTimeoutsRef.current.delete(id);
      }, exitDurationMs);

      removeTimeoutsRef.current.set(id, removeTimeout);
    },
    [clearTimers]
  );

  const showFlash = useCallback(
    ({ message, tone = "info", durationMs = defaultDurationMs }: FlashInput) => {
      const trimmedMessage = message.trim();

      if (!trimmedMessage) {
        return;
      }

      const id = crypto.randomUUID();
      setItems((current) => [...current, { id, message: trimmedMessage, tone, leaving: false }]);

      const hideTimeout = setTimeout(() => {
        dismiss(id);
        hideTimeoutsRef.current.delete(id);
      }, durationMs);

      hideTimeoutsRef.current.set(id, hideTimeout);
    },
    [dismiss]
  );

  useEffect(() => {
    return () => {
      for (const timeout of hideTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }

      for (const timeout of removeTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      showFlash
    }),
    [showFlash]
  );

  return (
    <FlashContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="flash-stack">
        {items.map((item) => (
          <div
            className={`flash-toast ${item.tone}${item.leaving ? " leaving" : ""}`}
            key={item.id}
            onClick={() => dismiss(item.id)}
            role="status"
          >
            <div className="flash-toast-title">{item.tone === "success" ? "Success" : item.tone === "error" ? "Error" : "Notice"}</div>
            <div>{item.message}</div>
          </div>
        ))}
      </div>
    </FlashContext.Provider>
  );
}

export function useFlash() {
  const context = useContext(FlashContext);

  if (!context) {
    throw new Error("useFlash must be used inside FlashProvider.");
  }

  return context;
}
