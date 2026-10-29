import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { SchedulingSettings, WeekWindow } from "@/lib/scheduling-types";

export type StoredBooking = {
  id: string;
  startsAt: string;
  endsAt: string;
  guestName: string;
  guestEmail: string;
  guestNote: string | null;
  meetUrl: string | null;
  status: "pending" | "confirmed" | "cancelled";
  googleEventId: string | null;
  source: "web" | "agent";
  agentName: string | null;
  agentUrl: string | null;
  idempotencyKey: string | null;
  holdExpiresAt: string | null;
  createdAt: string;
};

export type StoredToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  googleSub: string | null;
  email: string | null;
};

export type StoredAgentKey = {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
};

export type SchedulerData = {
  settings: SchedulingSettings | null;
  windows: WeekWindow[];
  blockedDates: string[];
  bookings: StoredBooking[];
  token: StoredToken | null;
  agentKeys: StoredAgentKey[];
};

let chain: Promise<unknown> = Promise.resolve();
let cached: SchedulerData | null = null;

function dataFile(): string {
  const configured = process.env.SCHEDULER_DATA_FILE?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), "data", "scheduler.json");
}

function emptyData(): SchedulerData {
  return {
    settings: null,
    windows: [],
    blockedDates: [],
    bookings: [],
    token: null,
    agentKeys: [],
  };
}

function normalize(raw: unknown): SchedulerData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Scheduler data file is unreadable.");
  }
  const value = raw as Partial<SchedulerData>;
  return {
    settings: value.settings ?? null,
    windows: Array.isArray(value.windows) ? value.windows : [],
    blockedDates: Array.isArray(value.blockedDates) ? value.blockedDates : [],
    bookings: Array.isArray(value.bookings) ? value.bookings : [],
    token: value.token ?? null,
    agentKeys: Array.isArray(value.agentKeys) ? value.agentKeys : [],
  };
}

async function load(): Promise<SchedulerData> {
  if (cached) return cached;
  try {
    const text = await readFile(dataFile(), "utf8");
    cached = normalize(JSON.parse(text) as unknown);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      cached = emptyData();
    } else {
      throw new Error("Scheduler data file is unreadable.", { cause: error });
    }
  }
  return cached;
}

async function persist(data: SchedulerData): Promise<void> {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, file);
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function readStore(): Promise<SchedulerData> {
  return withLock(async () => structuredClone(await load()));
}

export async function updateStore<T>(fn: (data: SchedulerData) => T): Promise<T> {
  return withLock(async () => {
    const current = await load();
    const original = JSON.stringify(current);
    const data = JSON.parse(original) as SchedulerData;
    const result = fn(data);
    if (JSON.stringify(data) !== original) {
      await persist(data);
      cached = data;
    }
    return result === undefined ? (undefined as T) : structuredClone(result);
  });
}
