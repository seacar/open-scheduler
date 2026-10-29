import type { Metadata } from "next";
import { AlertCircle, ShieldAlert } from "lucide-react";
import { AdminScheduling } from "@/components/admin-scheduling";
import { GoogleSetupPanel } from "@/components/google-setup-panel";
import { SchedulingStatusCard } from "@/components/scheduling-status-card";
import { readAdminSession } from "@/lib/admin-session";
import {
  googleOAuthConfigured,
  googleRedirectUri,
  googleSetupMissing,
} from "@/lib/google-calendar";
import { siteBase } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Scheduling admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const params = await searchParams;
  const google = params.google;
  const connectStatus =
    google === "connected" ||
    google === "denied" ||
    google === "error" ||
    google === "setup" ||
    google === "session"
      ? google
      : null;
  const session = await readAdminSession();
  const oauthReady = googleOAuthConfigured();
  const setupMissing = googleSetupMissing();
  const redirectUri = siteBase() ? googleRedirectUri() : null;

  if (!session) {
    return (
      <main className="min-h-dvh bg-background px-4 py-12 text-foreground">
        <div className="mx-auto max-w-xl space-y-6">
          {!oauthReady ? (
            <GoogleSetupPanel missing={setupMissing} redirectUri={redirectUri} />
          ) : null}

          {connectStatus === "setup" ? (
            <SchedulingStatusCard
              icon={AlertCircle}
              tone="warning"
              title="Google sign-in is not ready"
              description="Environment variables look complete, but sign-in could not start. Reload after saving .env.local and restarting the dev server."
            />
          ) : null}

          {oauthReady ? (
            <Card className="rounded-lg border border-border bg-card/30 shadow-sm">
              <CardHeader>
                <CardTitle>Sign in</CardTitle>
                <CardDescription>
                  Admin access uses the Google account on{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    SCHEDULER_ADMIN_EMAILS
                  </code>
                  . Signing in also connects that calendar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {connectStatus === "denied" ? (
                  <SchedulingStatusCard
                    icon={ShieldAlert}
                    tone="error"
                    title="Account not allowed"
                    description="That Google account is not on the admin allowlist. Sign in with an address listed in SCHEDULER_ADMIN_EMAILS."
                    className="shadow-none"
                  />
                ) : null}
                {connectStatus === "error" ? (
                  <SchedulingStatusCard
                    icon={AlertCircle}
                    tone="error"
                    title="Sign-in failed"
                    description="Google sign-in could not be completed. Try again, or check the OAuth client and redirect URI in Google Cloud."
                    className="shadow-none"
                  />
                ) : null}
                <Button asChild className="w-full sm:w-auto">
                  <a href="/api/google/calendar/start">Sign in with Google</a>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-12 text-foreground">
      <div className="mx-auto max-w-4xl">
        <AdminScheduling email={session.email} connectStatus={connectStatus} />
      </div>
    </main>
  );
}
