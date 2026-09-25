"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { linkLegacyStudentAction } from "./actions";
export function LinkLegacyStudent({ reviewId }: { reviewId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await linkLegacyStudentAction(reviewId);
          if (!result.ok) toast.error(result.error);
          else
            router.push(
              `/academic-analysis/students/${result.data.enrollmentId}`,
            );
        })
      }
    >
      {pending ? "Vinculando…" : "Abrir cadastro / criar acesso"}
    </Button>
  );
}
