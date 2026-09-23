"use client";

import { Copy, MessageCircle, PencilLine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** A mensagem fica escondida até ser necessária, sem expandir o card da grade. */
type Track = {
  name: string;
  decisionSemester: number | null;
  decisionEvidence: string | null;
  internships: Array<{
    semester: number;
    name: string;
    workload: number | null;
  }>;
};

type CopyWhatsappProps = {
  text: string;
  courseName?: string;
  hasTcc?: boolean;
  totalCourseHours?: number | null;
  tracks?: Track[];
};

export function CopyWhatsapp({
  text,
  courseName,
  hasTcc,
  totalCourseHours,
  tracks = [],
}: CopyWhatsappProps) {
  const [selectedTrack, setSelectedTrack] = useState(tracks[0]?.name ?? "");
  const selected = tracks.find((track) => track.name === selectedTrack);
  const suggestedMessage = useMemo(
    () =>
      selected
        ? trackMessage({
            courseName,
            hasTcc,
            totalCourseHours,
            track: selected,
          })
        : text,
    [courseName, hasTcc, selected, text, totalCourseHours],
  );
  const [message, setMessage] = useState(suggestedMessage);
  useEffect(() => setMessage(suggestedMessage), [suggestedMessage]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensagem copiada para o WhatsApp.");
    } catch {
      toast.error("Não foi possível copiar a mensagem.");
    }
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageCircle className="size-3.5" /> Mensagem pronta para WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mensagem para WhatsApp</DialogTitle>
          <DialogDescription>
            Revise e edite a mensagem antes de copiar. Os estágios da formação
            selecionada já estão incluídos.
          </DialogDescription>
        </DialogHeader>
        {tracks.length > 1 && (
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Formação desejada"
          >
            {tracks.map((track) => (
              <Button
                key={track.name}
                type="button"
                size="sm"
                variant={track.name === selectedTrack ? "default" : "outline"}
                onClick={() => setSelectedTrack(track.name)}
              >
                {track.name}
              </Button>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <label
            htmlFor="whatsapp-message"
            className="flex items-center gap-2 text-sm font-medium"
          >
            <PencilLine className="size-4 text-brand-cyan-700" /> Mensagem que
            será enviada
          </label>
          <Textarea
            id="whatsapp-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="min-h-72 max-h-[50dvh] resize-y bg-muted/30 font-sans leading-6"
          />
          <p className="text-xs text-muted-foreground">
            A edição é apenas para esta conversa e não altera a matriz
            curricular.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={copy} disabled={!message.trim()}>
            <Copy className="size-4" /> Copiar mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function trackMessage(input: {
  courseName?: string;
  hasTcc?: boolean;
  totalCourseHours?: number | null;
  track: Track;
}) {
  const lines = [
    "Olá! Seguem as informações da matriz curricular:",
    "",
    `${input.courseName ?? "Curso selecionado"} — ${input.track.name}.`,
  ];
  if (input.track.internships.length) {
    lines.push(
      "",
      "Estágios previstos:",
      ...input.track.internships.map(
        (item) =>
          `• ${item.semester}º semestre — ${item.name}${item.workload ? ` (${item.workload}h)` : ""}`,
      ),
    );
    const total = input.track.internships.reduce(
      (sum, item) => sum + (item.workload ?? 0),
      0,
    );
    if (total)
      lines.push(
        "",
        `Carga horária total de estágio: ${total.toLocaleString("pt-BR")} horas.`,
      );
  }
  if (input.hasTcc)
    lines.push("A matriz também prevê TCC / Trabalho de Curso.");
  if (input.totalCourseHours)
    lines.push(
      `Carga horária total da matriz: ${input.totalCourseHours.toLocaleString("pt-BR")} horas.`,
    );
  return lines.join("\n");
}
