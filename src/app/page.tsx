import { AuthGate } from "@/core/ui/AuthGate";
import { Dashboard } from "@/modules/dashboard/Dashboard";

export default function HomePage() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
