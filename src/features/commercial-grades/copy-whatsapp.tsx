"use client";

import { Copy, MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** A mensagem fica escondida até ser necessária, sem expandir o card da grade. */
type Track = { name: string; decisionSemester: number | null; decisionEvidence: string | null; internships: Array<{ semester: number; name: string; workload: number | null }> };

type CopyWhatsappProps = { text: string; courseName?: string; hasTcc?: boolean; totalCourseHours?: number | null; tracks?: Track[] };

export function CopyWhatsapp({ text, courseName, hasTcc, totalCourseHours, tracks = [] }: CopyWhatsappProps) {
  const [selectedTrack, setSelectedTrack] = useState(tracks[0]?.name ?? "");
  const selected = tracks.find((track) => track.name === selectedTrack);
  const message = useMemo(() => selected ? trackMessage({ courseName, hasTcc, totalCourseHours, track: selected }) : text, [courseName, hasTcc, selected, text, totalCourseHours]);
  async function copy() { try { await navigator.clipboard.writeText(message); toast.success("Mensagem copiada para o WhatsApp."); } catch { toast.error("Não foi possível copiar a mensagem."); } }
  return <Dialog><DialogTrigger asChild><Button size="sm" variant="outline"><MessageCircle className="size-3.5" /> Mensagem pronta para WhatsApp</Button></DialogTrigger><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Mensagem para WhatsApp</DialogTitle><DialogDescription>{tracks.length > 1 ? "Escolha a formação para montar uma mensagem precisa para o candidato." : "Copie o texto e anexe o PDF da grade na conversa com o candidato."}</DialogDescription></DialogHeader>{tracks.length > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label="Formação desejada">{tracks.map((track) => <Button key={track.name} type="button" size="sm" variant={track.name === selectedTrack ? "default" : "outline"} onClick={() => setSelectedTrack(track.name)}>{track.name}</Button>)}</div>}<pre className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 font-sans text-sm leading-6 text-foreground">{message}</pre><DialogFooter><Button onClick={copy}><Copy className="size-4" /> Copiar mensagem</Button></DialogFooter></DialogContent></Dialog>;
}

function trackMessage(input: { courseName?: string; hasTcc?: boolean; totalCourseHours?: number | null; track: Track }) {
  const lines = [`Matriz curricular: ${input.courseName ?? "curso selecionado"} — ${input.track.name}.`];
  if (input.track.decisionSemester) lines.push("", `A definição por ${input.track.name.toLocaleLowerCase("pt-BR")} ocorre no ${input.track.decisionSemester}º semestre.`);
  else lines.push("", "A matriz apresenta uma Área Básica de Ingresso. Confirme com o candidato a formação desejada; o período de definição não está explícito no PDF.");
  if (input.track.internships.length) {
    lines.push("", "Estágios previstos:", ...input.track.internships.map((item) => `- ${item.semester}º sem.: ${item.name}${item.workload ? ` (${item.workload}h)` : ""}`));
    const total = input.track.internships.reduce((sum, item) => sum + (item.workload ?? 0), 0);
    if (total) lines.push("", `Nesta formação, a matriz prevê ${total.toLocaleString("pt-BR")} horas de estágio.`);
  }
  if (input.hasTcc) lines.push("A matriz também prevê TCC / Trabalho de Curso.");
  if (input.totalCourseHours) lines.push(`Carga horária total da matriz: ${input.totalCourseHours.toLocaleString("pt-BR")} horas.`);
  return lines.join("\n");
}
