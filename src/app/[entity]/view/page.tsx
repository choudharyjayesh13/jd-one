import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { entityNames, findEntity } from "@/core/schema/registry";
import { EntityViewPage } from "@/core/ui/pages";

export const dynamicParams = false;

export function generateStaticParams() {
  return entityNames.map((entity) => ({ entity }));
}

export async function generateMetadata({ params }: { params: Promise<{ entity: string }> }): Promise<Metadata> {
  const { entity } = await params;
  return { title: findEntity(entity)?.labelSingular ?? "JD One" };
}

export default async function ViewPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!findEntity(entity)) notFound();
  return <EntityViewPage entity={entity} />;
}
