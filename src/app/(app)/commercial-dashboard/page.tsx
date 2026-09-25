import { redirect } from "next/navigation";

/** Compatibilidade para favoritos e links antigos; o conteúdo comercial vive em Gestão. */
export default function LegacyCommercialDashboardPage() {
  redirect("/management");
}
