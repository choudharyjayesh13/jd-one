import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { entityNames, findEntity } from "@/core/schema/registry";
import { EntityListPage } from "@/core/ui/pages";

export const dynamicParams = false;

export function generateStaticParams() {
  return entityNames.map((entity) => ({ entity }));
}

export async function generateMetadata({ params }: { params: Promise<{ entity: string }> }): Promise<Metadata> {
  const { entity } = await params;
  return { title: findEntity(entity)?.label ?? "JD One" };
}

export default async function ListPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!findEntity(entity)) notFound();
  return <EntityListPage entity={entity} />;
}
