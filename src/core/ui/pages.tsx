"use client";
/**
 * Client wrappers for the three generic routes. They read the entity from the
 * static route and the id / prefill from the query string (static export).
 */
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getEntity } from "@/core/schema/registry";
import { useUser } from "@/core/auth/AuthProvider";
import { canRead, canCreate } from "@/core/auth/access";
import { listHref, viewHref } from "@/core/routes";
import { AuthGate } from "./AuthGate";
import { EntityList } from "./EntityList";
import { EntityForm } from "./EntityForm";
import { EntityDetail } from "./EntityDetail";
import { ErrorBox, PageHeader, Loading } from "./misc";

function Forbidden() {
  return <ErrorBox message="You do not have access to this section. Ask the owner if you need it." />;
}

export function EntityListPage({ entity }: { entity: string }) {
  return (
    <AuthGate>
      <ListInner entity={entity} />
    </AuthGate>
  );
}

function ListInner({ entity }: { entity: string }) {
  const def = getEntity(entity);
  const user = useUser();
  if (!canRead(user.role, def)) return <Forbidden />;
  const Extra = def.listExtra;
  return (
    <>
      <PageHeader title={def.label} />
      {Extra && <Extra />}
      <EntityList entity={entity} />
    </>
  );
}

export function EntityNewPage({ entity }: { entity: string }) {
  return (
    <AuthGate>
      <Suspense fallback={<Loading />}>
        <NewInner entity={entity} />
      </Suspense>
    </AuthGate>
  );
}

function NewInner({ entity }: { entity: string }) {
  const def = getEntity(entity);
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();
  if (!canCreate(user.role, def)) return <Forbidden />;
  // Any query param that names a field pre-fills it (used by actions like "Convert to booking").
  const prefill: Record<string, unknown> = {};
  params.forEach((v, k) => {
    if (def.fields.some((f) => f.name === k)) prefill[k] = v;
  });
  return (
    <>
      <PageHeader title={`New ${def.labelSingular.toLowerCase()}`} back={listHref(entity)} />
      <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
        <EntityForm entity={entity} prefill={prefill} onSaved={(row) => router.replace(viewHref(entity, row.id))} onCancel={() => router.back()} />
      </div>
    </>
  );
}

export function EntityViewPage({ entity }: { entity: string }) {
  return (
    <AuthGate>
      <Suspense fallback={<Loading />}>
        <ViewInner entity={entity} />
      </Suspense>
    </AuthGate>
  );
}

function ViewInner({ entity }: { entity: string }) {
  const def = getEntity(entity);
  const user = useUser();
  const params = useSearchParams();
  const id = params.get("id");
  if (!canRead(user.role, def)) return <Forbidden />;
  if (!id) return <ErrorBox message="No record id in the link." />;
  const Custom = def.customDetail;
  if (Custom) return <Custom id={id} />;
  return <EntityDetail entity={entity} id={id} startEditing={params.get("edit") === "1"} />;
}
