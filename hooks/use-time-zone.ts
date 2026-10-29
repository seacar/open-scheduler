"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

export function useTimeZone(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null
  );
}
