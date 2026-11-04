import { AuthGate } from "@/core/ui/AuthGate";
import { Home } from "@/modules/home/Home";

export default function HomePage() {
  return (
    <AuthGate>
      <Home />
    </AuthGate>
  );
}
