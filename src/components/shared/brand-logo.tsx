import { cn } from "@/lib/utils";
import Image from "next/image";

export function BrandLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center", className)}>
      {compact ? (
        <Image src="/brand/logo-cruzeiro-do-sul-symbol.svg" alt="Cruzeiro do Sul" width={46} height={38} priority />
      ) : (
        <span className="block min-w-0"><Image src="/brand/logo-cruzeiro-do-sul.svg" alt="Universidade Cruzeiro do Sul" width={220} height={52} className="h-auto w-full max-w-[220px]" priority /></span>
      )}
    </div>
  );
}
