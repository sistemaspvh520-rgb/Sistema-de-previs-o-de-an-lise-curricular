import type { UsageModule } from "@/generated/prisma/enums";

/**
 * Cores do painel "Uso da equipe", validadas com o validador da skill de dataviz (fundo branco):
 * categórica de 3 módulos (ordem fixa, passa CVD e visão normal em todos os pares). Âmbar e verde-água ficam abaixo de 3:1 no branco:
 * por isso os valores aparecem sempre escritos ao lado (legenda + tabela), nunca só pela cor.
 */
export const MODULE_COLORS: Record<UsageModule, string> = {
  CURRICULAR: "#0a5a9a",
  GRADES: "#eda100",
  ACADEMIC: "#1baf7a",
  MANAGEMENT: "#a8b3c2",
  SETTINGS: "#a8b3c2",
  OTHER: "#a8b3c2",
};

/** Barras de tendência de uma só série: dias anteriores discretos, hoje em destaque. */
export const TREND_MUTED = "#c3ccd8";
export const TREND_ACCENT = "#0a5a9a";
