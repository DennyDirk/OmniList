"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useFlash } from "./flash-provider";

export function FlashOnMount({
  message,
  tone,
  clearQueryKeys = []
}: {
  message?: string;
  tone: "success" | "error" | "info";
  clearQueryKeys?: string[];
}) {
  const { showFlash } = useFlash();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shownRef = useRef(false);

  useEffect(() => {
    if (!message || shownRef.current) {
      return;
    }

    shownRef.current = true;
    showFlash({
      message,
      tone
    });

    if (clearQueryKeys.length > 0) {
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      let didChange = false;

      for (const key of clearQueryKeys) {
        if (nextSearchParams.has(key)) {
          nextSearchParams.delete(key);
          didChange = true;
        }
      }

      if (didChange) {
        const nextUrl = nextSearchParams.size > 0 ? `${pathname}?${nextSearchParams.toString()}` : pathname;
        window.history.replaceState(null, "", nextUrl);
      }
    }
  }, [clearQueryKeys, message, pathname, searchParams, showFlash, tone]);

  return null;
}
