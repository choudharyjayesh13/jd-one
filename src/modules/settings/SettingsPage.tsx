"use client";
/** /settings — owner/manager only. Sections are small components below. */
import Link from "next/link";
import { Building2, Users, Goal } from "lucide-react";
import { useUser } from "@/core/auth/AuthProvider";
import { isAdmin } from "@/core/auth/access";
import { listHref } from "@/core/routes";
import { ErrorBox, PageHeader } from "@/core/ui/misc";
import { Card, CardBody, CardHeader } from "@/core/ui/Card";
import { BackendStatus } from "./BackendStatus";
import { TargetsEditor } from "./TargetsEditor";
import { DataTools } from "./DataTools";
import { ImportCrm } from "./ImportCrm";
import { ImportRuns } from "./ImportRuns";
import { ActAs } from "./ActAs";

export function SettingsPage() {
  const user = useUser();
  if (!isAdmin(user.role)) return <ErrorBox message="Settings are for the owner and managers." />;
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Business setup, targets, data and imports" />
      <BackendStatus />
      <Card>
        <CardHeader title="Business units & staff" subtitle="Who and where" />
        <CardBody className="flex flex-wrap gap-2">
          <Link href={listHref("business-units")} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-navy hover:bg-slate-50">
            <Building2 className="h-4 w-4" /> Business units
          </Link>
          <Link href={listHref("staff")} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-navy hover:bg-slate-50">
            <Users className="h-4 w-4" /> Staff
          </Link>
          <Link href={listHref("targets")} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-navy hover:bg-slate-50">
            <Goal className="h-4 w-4" /> All targets
          </Link>
        </CardBody>
        <ActAs />
      </Card>
      <TargetsEditor />
      <Card>
        <CardHeader title="Imports" subtitle="Bring leads in from spreadsheets" />
        <CardBody className="space-y-6">
          <ImportRuns />
          <ImportCrm />
        </CardBody>
      </Card>
      <DataTools />
    </div>
  );
}
