import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { entityNames, findEntity } from "@/core/schema/registry";
import { EntityNewPage } from "@/core/ui/pages";

export const dynamicParams = false;

export function generateStaticParams() {
  return entityNames.map((entity) => ({ entity }));
}

export async function generateMetadata({ params }: { params: Promise<{ entity: string }> }): Promise<Metadata> {
  const { entity } = await params;
  const def = findEntity(entity);
  return { title: def ? `New ${def.labelSingular.toLowerCase()}` : "JD One" };
}

export default async function NewPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!findEntity(entity)) notFound();
  return <EntityNewPage entity={entity} />;
}
