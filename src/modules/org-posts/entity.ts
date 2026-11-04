import { ShieldCheck } from "lucide-react";
import { defineEntity } from "@/core/schema/types";

/** Posts: Chairman and Director run Team access; the Property Supervisor assigns report duty. Access follows the post, not the person. */
export const orgPosts = defineEntity({
  name: "org-posts",
  label: "Posts",
  labelSingular: "Post",
  icon: ShieldCheck,
  table: "org_posts",
  teams: ["hr"],
  hidden: true,
  titleField: "post",
  searchFields: ["post", "holder_name", "email"],
  defaultSort: { field: "post", dir: "asc" },
  fields: [
    { name: "post", label: "Post", type: "select", options: ["chairman", "director", "property_supervisor"], required: true },
    { name: "holder_name", label: "Name", type: "text" },
    { name: "email", label: "Login email", type: "email" },
  ],
  listColumns: ["post", "holder_name", "email"],
  permissions: { read: ["owner", "manager"], create: ["owner"], update: ["owner"], delete: ["owner"] },
});
