import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  redirect(can(user.role, "analysis:create") ? "/analyses/new" : "/analyses");
}
