"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

type CourseSuggestion = { id: string; name: string; detail: string };

export function CommercialGradeCatalogSearch({ initialQuery, courses }: { initialQuery: string; courses: CourseSuggestion[] }) {
  const router = useRouter(); const params = useSearchParams(); const [query, setQuery] = useState(initialQuery); const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => {
    const words = normalize(query).split(" ").filter(Boolean);
    if (words.length === 0) return courses.slice(0, 5);
    return courses.filter((course) => words.every((word) => normalize(`${course.name} ${course.detail}`).includes(word))).slice(0, 5);
  }, [courses, query]);
  function apply(value: string) { const next = new URLSearchParams(params.toString()); if (value.trim()) next.set("q", value.trim()); else next.delete("q"); router.push(`/commercial-grades?${next.toString()}`); setFocused(false); }
  return <div className="relative mb-4"><form onSubmit={(event) => { event.preventDefault(); apply(query); }}><label className="sr-only" htmlFor="catalog-search">Buscar uma grade</label><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="catalog-search" value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 160)} placeholder="Buscar por curso, modalidade ou área" className="h-11 pl-10 pr-24" autoComplete="off" /><button type="submit" className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md bg-brand-navy px-3 py-2 text-xs font-medium text-white">Buscar</button></form>{focused && <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">{suggestions.length ? <>{!query.trim() && <p className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground"><Sparkles className="size-3.5 text-brand-cyan-700" /> Cursos disponíveis</p>}{suggestions.map((course) => <button key={course.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(course.name); apply(course.name); }} className="block w-full px-3 py-3 text-left transition-colors hover:bg-muted"><span className="block text-sm font-medium text-foreground">{course.name}</span><span className="block text-xs text-muted-foreground">{course.detail || "Grade curricular"}</span></button>)}</> : <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum curso encontrado com esses termos.</p>}</div>}</div>;
}

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
