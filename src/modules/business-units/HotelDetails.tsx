"use client";
/**
 * Hotel details (AsiaTech "Hotel Details"): the property's public facts in one
 * place — contact, timings, GST, UPI, amenities, policies — with room summary.
 * Managers edit through the standard business-unit form.
 */
import { useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { useUser } from "@/core/auth/AuthProvider";
import { canUpdate } from "@/core/auth/access";
import { getEntity } from "@/core/schema/registry";
import { listHref, viewHref } from "@/core/routes";
import { Button } from "@/core/ui/Button";
import { Card, CardBody, CardHeader, Stat } from "@/core/ui/Card";
import { Select } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { Loading, PageHeader, EmptyState } from "@/core/ui/misc";
import { roomsByType } from "@/modules/rooms/entity";

function Row({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <div className="w-36 shrink-0 text-slate-500">{label}</div>
      <div className="min-w-0 flex-1 whitespace-pre-wrap text-slate-800">{Array.isArray(value) ? value.join(", ") : String(value)}</div>
    </div>
  );
}

export function HotelDetails() {
  const user = useUser();
  const { rows: units, loading } = useList("business-units", { filter: { active: true }, sort: { field: "name", dir: "asc" } });
  const hotels = units.filter((u) => ["Hotel", "Resort"].includes(String(u.type)) || !u.type);
  const [picked, setPicked] = useState<string>("");
  const current = user.unitId ? units.find((u) => u.id === user.unitId) : hotels.find((u) => u.id === picked) ?? hotels[0];
  const { rows: rooms } = useList(current ? "rooms" : null, { filter: { business_unit_id: current?.id, active: true } });
  const mayEdit = canUpdate(user.role, getEntity("business-units"));
  if (loading) return <Loading />;
  if (!current) return <EmptyState title="No property yet" hint="Add a business unit of type Hotel or Resort first." />;
  const byType = roomsByType(rooms);

  return (
    <div>
      <PageHeader
        title="Hotel details"
        subtitle={String(current.name)}
        actions={
          <>
            {!user.unitId && hotels.length > 1 && (
              <Select value={current.id} onChange={(e) => setPicked(e.target.value)} className="w-auto">
                {hotels.map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.name)}
                  </option>
                ))}
              </Select>
            )}
            {mayEdit && (
              <Link href={viewHref("business-units", current.id, { edit: 1 })}>
                <Button size="sm" icon={Pencil}>
                  Edit
                </Button>
              </Link>
            )}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rooms" value={rooms.length} hint={Array.from(byType.entries()).map(([t, n]) => `${n} ${t}`).join(" · ") || "Add rooms"} />
        <Stat label="Check-in / out" value={`${current.checkin_time ?? "14:00"} / ${current.checkout_time ?? "11:00"}`} />
        <Stat label="GST on rooms" value={`${current.gst_rate ?? 12}%`} hint={current.gstin ? String(current.gstin) : "GSTIN not set"} />
        <Stat label="UPI for payments" value={current.upi_id ? "Set" : "Not set"} tone={current.upi_id ? "good" : "bad"} hint={current.upi_id ? String(current.upi_id) : "Needed for Request money"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Property" />
          <CardBody>
            <Row label="Name" value={current.name} />
            <Row label="Category" value={current.star_category} />
            <Row label="Type" value={current.type} />
            <Row label="Description" value={current.description} />
            <Row label="Amenities" value={current.amenities} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Contact & location" />
          <CardBody>
            <Row label="Phone" value={current.phone} />
            <Row label="Email" value={current.email} />
            <Row label="Website" value={current.website} />
            <Row label="Address" value={current.address} />
            <Row label="City" value={current.city} />
            <Row label="Google Maps" value={current.maps_url} />
            <Row label="Coordinates" value={current.latitude && current.longitude ? `${current.latitude}, ${current.longitude} (attendance radius ${current.geofence_m ?? 300} m)` : ""} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Policies" />
          <CardBody>
            <Row label="Check-in" value={current.checkin_time} />
            <Row label="Check-out" value={current.checkout_time} />
            <Row label="Policies" value={current.policies} />
            <Row label="Notes" value={current.notes} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Rooms" action={<Link href={listHref("rooms")} className="text-xs text-navy underline">Manage</Link>} />
          <CardBody>
            {rooms.length === 0 ? (
              <p className="text-sm text-slate-500">No rooms added yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {rooms.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-1.5">
                    <Link href={viewHref("rooms", r.id)} className="font-medium text-navy hover:underline">
                      {String(r.name)}
                    </Link>
                    <span className="text-xs text-slate-500">
                      {String(r.unit_type)} · {String(r.max_adults ?? 2)} adults · {String(r.status)} · HK {String(r.hk_status ?? "—")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
