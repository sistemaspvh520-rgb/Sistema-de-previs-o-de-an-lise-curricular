/** Códigos e mensagens amigáveis — sem dependência do SDK (seguro para o cliente). */
export type OpenAIErrorCode =
  | "INVALID_API_KEY"
  | "FORBIDDEN"
  | "MODEL_NOT_FOUND"
  | "RATE_LIMITED"
  | "INSUFFICIENT_QUOTA"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "CONNECTION_ERROR"
  | "INVALID_STRUCTURED_OUTPUT"
  | "FILE_REJECTED"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export const OPENAI_ERROR_MESSAGES: Record<OpenAIErrorCode, string> = {
  INVALID_API_KEY:
    "A API Key é inválida ou foi revogada. Verifique a chave do projeto na OpenAI.",
  FORBIDDEN:
    "A API Key não tem permissão para este recurso. Verifique o projeto, a Service Account e as permissões.",
  MODEL_NOT_FOUND:
    "O modelo configurado não está disponível para este projeto. Escolha outro modelo.",
  RATE_LIMITED:
    "Limite de requisições da OpenAI atingido. Tente novamente em instantes.",
  INSUFFICIENT_QUOTA:
    "O projeto OpenAI está sem cota/faturamento disponível. Verifique o faturamento do projeto.",
  SERVER_ERROR:
    "A OpenAI está instável no momento. Tente novamente mais tarde.",
  TIMEOUT: "A OpenAI demorou demais para responder. Tente novamente.",
  CONNECTION_ERROR:
    "Não foi possível conectar à OpenAI. Verifique a rede do servidor.",
  INVALID_STRUCTURED_OUTPUT:
    "A resposta da OpenAI não veio no formato esperado. Tente novamente.",
  FILE_REJECTED:
    "O arquivo foi rejeitado pela OpenAI (tamanho, formato ou conteúdo).",
  NOT_CONFIGURED:
    "A integração com a OpenAI não está conectada. Configure em Configurações → OpenAI.",
  UNKNOWN: "Erro inesperado ao comunicar com a OpenAI.",
};
