/** Iniciais para o avatar ("Maria Souza" → "MS"). Módulo comum: usado por páginas do servidor e componentes de cliente. */
export function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
}
