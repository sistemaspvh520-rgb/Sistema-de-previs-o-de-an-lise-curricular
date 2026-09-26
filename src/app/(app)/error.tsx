"use client";

import { PageLoadError } from "@/components/shared/page-load-error";

export default function AppError({ error }: { error: Error & { digest?: string } }) {
  return <PageLoadError error={error} />;
}
