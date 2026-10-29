import { Wrench } from "lucide-react";
import {
  EnvVarChecklist,
  RedirectUriNote,
  SchedulingStatusCard,
} from "@/components/scheduling-status-card";

export function GoogleSetupPanel({
  missing,
  redirectUri,
}: {
  missing: string[];
  redirectUri: string | null;
}) {
  return (
    <SchedulingStatusCard
      icon={Wrench}
      tone="warning"
      title="Finish environment setup"
      description="Copy .env.example to .env.local and set the variables below before signing in with Google."
    >
      <EnvVarChecklist names={missing} />
      <RedirectUriNote uri={redirectUri} />
      <p className="mt-4 text-left text-xs text-muted-foreground">
        See the README setup section for Google Cloud OAuth and Resend email steps.
      </p>
    </SchedulingStatusCard>
  );
}
