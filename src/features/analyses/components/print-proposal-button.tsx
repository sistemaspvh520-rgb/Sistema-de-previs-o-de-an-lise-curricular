"use client";

import { Button } from "@/components/ui/button";

export function PrintProposalButton() {
  return <Button className="no-print" onClick={() => window.print()}>Salvar como PDF / Imprimir</Button>;
}
