"use client";
import { useUser } from "@/core/auth/AuthProvider";
import { ChangePasswordForm } from "@/core/auth/ChangePassword";
import { storeKind } from "@/core/data";
import { Card, CardBody, CardHeader } from "@/core/ui/Card";
import { PageHeader } from "@/core/ui/misc";

export function AccountPage() {
  const user = useUser();
  return (
    <div className="space-y-6">
      <PageHeader title="My account" subtitle={`${user.name}${user.email ? " · " + user.email : ""}`} />
      <Card>
        <CardHeader title="Change password" subtitle="Use at least 6 characters. You can change it any time." />
        <CardBody>{storeKind === "supabase" ? <ChangePasswordForm /> : <p className="text-sm text-slate-500">Passwords are used only in shared mode.</p>}</CardBody>
      </Card>
    </div>
  );
}
