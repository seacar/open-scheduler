import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export type StatusTone = "neutral" | "warning" | "error";

const toneStyles: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-primary/12 text-primary",
  error: "bg-destructive/10 text-destructive",
};

export function SchedulingStatusCard({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: StatusTone;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-lg border border-border bg-card/30 shadow-sm",
        className
      )}
    >
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
              toneStyles[tone]
            )}
          >
            <Icon className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EnvVarChecklist({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <ul className="mt-4 space-y-2 text-left">
      {names.map((name) => (
        <li key={name} className="flex items-center gap-2.5 text-sm">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            aria-hidden
          />
          <code className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs text-foreground">
            {name}
          </code>
        </li>
      ))}
    </ul>
  );
}

export function RedirectUriNote({ uri }: { uri: string | null }) {
  if (!uri) {
    return (
      <p className="mt-4 rounded-md border border-dashed border-border bg-background/60 px-3 py-2 text-left text-xs text-muted-foreground">
        Set{" "}
        <code className="font-mono text-[11px] text-foreground">NEXT_PUBLIC_BASE_URL</code>{" "}
        first, then add the Google OAuth redirect URI from the README.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-1.5 text-left">
      <p className="text-xs font-medium text-foreground">Google OAuth redirect URI</p>
      <p className="break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {uri}
      </p>
    </div>
  );
}
