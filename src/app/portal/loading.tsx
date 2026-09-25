export default function PortalLoading() {
  return (
    <main
      className="min-h-dvh bg-[#f5f8fc] p-5 sm:p-10"
      aria-busy="true"
      aria-label="Carregando sua análise acadêmica"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-16 rounded-2xl bg-white" />
        <div className="h-20 w-2/3 rounded-2xl bg-slate-200/60 motion-safe:animate-pulse" />
        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div className="h-72 rounded-3xl bg-[#003B71]/15 motion-safe:animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((value) => (
              <div
                key={value}
                className="rounded-2xl bg-white motion-safe:animate-pulse"
              />
            ))}
          </div>
        </div>
        <p className="text-center text-sm text-slate-500">
          Preparando sua jornada acadêmica…
        </p>
      </div>
    </main>
  );
}
