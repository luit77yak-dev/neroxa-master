import { createFileRoute } from "@tanstack/react-router";
import { MasterLogin } from "@/features/master/shell/MasterLogin";

export const Route = createFileRoute("/master-recovery")({
  component: MasterRecoveryPage,
});

function MasterRecoveryPage() {
  return <MasterLogin recoveryPage />;
}
