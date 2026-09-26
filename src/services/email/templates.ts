/**
 * Templates de e-mail transacional — HTML com CSS inline (compatível com Gmail/Outlook) + versão texto.
 * Identidade: navy #003b71 · ciano #0693e3 (os mesmos tokens de src/styles/tokens.css).
 */
import { appUrl } from "@/lib/app-url";

const NAVY = "#003b71";
const CYAN = "#0693e3";
const TEXT = "#17212B";
const MUTED = "#5B6B7B";
const BG = "#EEF3F9";
const SOFT = "#F3F8FD";

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "JOÃO VITOR" → "João": nomes cadastrados em maiúsculas não "gritam" na saudação. */
function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1).toLocaleLowerCase("pt-BR");
}

function layout(opts: {
  preheader: string;
  title: string;
  intro: string;
  button?: { label: string; url: string };
  details?: Array<[string, string]>;
  note?: string;
  institution: string;
}): string {
  const details = opts.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${SOFT}" style="margin:22px 0 4px;background:${SOFT};border:1px solid #D6E6F5;border-radius:12px;border-collapse:separate;">
        ${opts.details.map(([k, v], i) => `<tr><td style="padding:12px 16px;color:${MUTED};font-size:13px;${i ? "border-top:1px solid #E1ECF6;" : ""}">${escape(k)}</td><td align="right" style="padding:12px 16px;color:${NAVY};font-size:14px;font-weight:700;${i ? "border-top:1px solid #E1ECF6;" : ""}">${escape(v)}</td></tr>`).join("")}
      </table>`
    : "";
  const button = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 18px;"><tr><td bgcolor="${NAVY}" style="background:${NAVY};border-radius:10px;box-shadow:0 8px 18px -10px rgba(0,59,113,.6);">
        <a href="${escape(opts.button.url)}" style="display:inline-block;padding:15px 30px;color:#ffffff;font-weight:700;font-size:15px;line-height:1;text-decoration:none;font-family:Arial,Helvetica,sans-serif;border-radius:10px;">${escape(opts.button.label)} &rarr;</a>
      </td></tr></table>
      <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${MUTED};">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${escape(opts.button.url)}" style="color:${CYAN};word-break:break-all;">${escape(opts.button.url)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escape(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${TEXT};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escape(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="background:${BG};padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #DCE5EE;box-shadow:0 18px 40px -30px rgba(0,59,113,.55);">
  <tr><td bgcolor="${NAVY}" style="background:${NAVY};padding:26px 32px 22px;">
    <img src="${appUrl("/brand/logo-email.png")}" alt="Cruzeiro do Sul Virtual · Educação a distância" width="220" height="52" style="display:block;width:220px;max-width:100%;height:auto;border:0;outline:none;" />
    <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid rgba(255,255,255,.16);color:#9FD8FF;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Sistema de Análise Curricular Inteligente</p>
  </td></tr>
  <tr><td bgcolor="${CYAN}" style="background:${CYAN};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="padding:32px 32px 10px;">
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${NAVY};">${escape(opts.title)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.65;color:${TEXT};">${opts.intro}</p>
    ${details}
    ${button}
    ${opts.note ? `<p style="margin:18px 0 0;padding:12px 14px;border-left:3px solid ${CYAN};background:#F7FAFD;font-size:13px;line-height:1.6;color:${MUTED};">${opts.note}</p>` : ""}
  </td></tr>
  <tr><td style="padding:22px 32px 26px;font-size:12px;line-height:1.6;color:${MUTED};">
    Mensagem automática do <strong style="color:${TEXT};">Sistema de Análise Curricular Inteligente</strong> · ${escape(opts.institution)}.<br>Se você não esperava esta mensagem, ignore-a — nenhuma ação será feita na sua conta.
  </td></tr>
  <tr><td bgcolor="${NAVY}" style="background:${NAVY};padding:20px 32px;">
    <a href="https://cruzeirodosulvirtual.com.br" style="text-decoration:none;"><img src="${appUrl("/brand/escolha-estrela-assinatura.png")}" alt="Escolha ter estrela · cruzeirodosulvirtual.com.br" width="170" height="49" style="display:block;width:170px;height:auto;border:0;outline:none;" /></a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export const SYSTEM_NAME = "Sistema de Análise Curricular Inteligente";

export function inviteEmail(p: {
  name: string;
  login: string;
  url: string;
  invitedBy: string;
  validDays: number;
  institution: string;
}): EmailContent {
  const first = firstName(p.name);
  return {
    subject:
      "Sua conta no Sistema de Análise Curricular Inteligente foi criada",
    html: layout({
      preheader: "Defina sua senha para começar a usar o sistema.",
      title: `Olá, ${first}! Sua conta está pronta.`,
      intro: `${escape(p.invitedBy)} criou o seu acesso ao <strong>Sistema de Análise Curricular Inteligente</strong> da ${escape(p.institution)}. Para começar, defina a sua senha pessoal clicando no botão abaixo.`,
      details: [
        ["Login", p.login],
        ["Validade do link", `${p.validDays} dias`],
      ],
      button: { label: "Definir minha senha", url: p.url },
      note: "Por segurança, o link só pode ser usado uma vez. Depois de definir a senha, entre pelo endereço do sistema com o seu login.",
      institution: p.institution,
    }),
    text: `Olá, ${first}!\n\n${p.invitedBy} criou o seu acesso ao Sistema de Análise Curricular Inteligente (${p.institution}).\n\nLogin: ${p.login}\nDefina sua senha (link válido por ${p.validDays} dias):\n${p.url}\n\nO link só pode ser usado uma vez. Se você não esperava esta mensagem, ignore-a.`,
  };
}

export function resetEmail(p: {
  name: string;
  login: string;
  url: string;
  validMinutes: number;
  institution: string;
}): EmailContent {
  const first = firstName(p.name);
  return {
    subject: "Redefinição de senha — Sistema de Análise Curricular Inteligente",
    html: layout({
      preheader: "Use o link para criar uma nova senha.",
      title: `${first}, vamos redefinir sua senha`,
      intro:
        "Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.",
      details: [
        ["Login", p.login],
        ["Validade do link", `${p.validMinutes} minutos`],
      ],
      button: { label: "Criar nova senha", url: p.url },
      note: "Se você não pediu a redefinição, pode ignorar este e-mail — sua senha atual continua válida.",
      institution: p.institution,
    }),
    text: `${first}, vamos redefinir sua senha.\n\nLogin: ${p.login}\nCrie uma nova senha (link válido por ${p.validMinutes} minutos):\n${p.url}\n\nSe você não pediu a redefinição, ignore este e-mail.`,
  };
}

export function temporaryPasswordEmail(p: {
  name: string;
  login: string;
  password: string;
  loginUrl: string;
  institution: string;
}): EmailContent {
  const first = firstName(p.name);
  return {
    subject: "Senha temporária — Sistema de Análise Curricular Inteligente",
    html: layout({
      preheader: "Sua senha temporária de acesso.",
      title: `${first}, aqui está sua senha temporária`,
      intro:
        "Use os dados abaixo para entrar. No primeiro acesso o sistema pedirá que você crie a sua senha definitiva.",
      details: [
        ["Login", p.login],
        ["Senha temporária", p.password],
      ],
      button: { label: "Entrar no sistema", url: p.loginUrl },
      note: "Não compartilhe esta senha. Ela deixa de valer assim que você definir a sua.",
      institution: p.institution,
    }),
    text: `${first}, aqui está sua senha temporária.\n\nLogin: ${p.login}\nSenha temporária: ${p.password}\nEntrar: ${p.loginUrl}\n\nNo primeiro acesso você criará sua senha definitiva.`,
  };
}

export function academicUpdateEmail(p: { url: string; institution: string }): EmailContent {
  return {
    subject: "Sua análise acadêmica foi atualizada",
    html: layout({
      preheader: "A equipe acadêmica atualizou sua análise.",
      title: "Sua análise acadêmica foi atualizada",
      intro: "A equipe acadêmica atualizou sua análise. Acesse seu Portal Acadêmico para conferir a situação mais recente.",
      button: { label: "Acessar meu Portal Acadêmico", url: p.url },
      institution: p.institution,
    }),
    text: `A equipe acadêmica atualizou sua análise. Acesse seu Portal Acadêmico: ${p.url}`,
  };
}

/** Cobrança do retorno de matrícula: enviada na primeira janela útil após 24h e repetida em dias úteis. */
export function followUpEmail(p: {
  name: string;
  items: Array<{
    id: string;
    student: string;
    course: string;
    polo: string;
    url: string;
    completedAt: Date | null;
    reanalysis: boolean;
    businessDaysOpen: number;
  }>;
  listUrl: string;
  institution: string;
}): EmailContent {
  const single = p.items.length === 1;
  const urgent = p.items.some((item) => item.businessDaysOpen > 2);
  const title = urgent
    ? `URGENTE: ${p.items.length} resultado(s) sem atualização`
    : single
      ? "Verifique o resultado do atendimento"
      : `${p.items.length} resultados aguardando atualização`;
  const intro = single
    ? `Olá, ${escape(p.name)}. Já se passaram 24 horas desde ${p.items[0].reanalysis ? "a reanálise" : "a análise"} de <strong>${escape(p.items[0].student)}</strong>. Verifique o resultado e atualize a situação no sistema.`
    : `Olá, ${escape(p.name)}. Verifique os resultados abaixo e registre a situação de cada atendimento no sistema.`;
  const details: Array<[string, string]> = p.items.map((i) => [
    i.student,
    `${i.course} · Polo ${i.polo}${i.reanalysis ? " · Reanálise" : ""}${i.businessDaysOpen > 2 ? ` · URGENTE: ${i.businessDaysOpen} dias úteis` : ""}`,
  ]);
  return {
    subject: single
      ? `Retorno de matrícula: ${p.items[0].student}`
      : `${p.items.length} retornos de matrícula pendentes`,
    html: layout({
      preheader: "Verifique o resultado do atendimento e atualize a situação.",
      title,
      intro,
      details,
      button: {
        label: single ? "Responder agora" : "Ver retornos pendentes",
        url: single ? p.items[0].url : p.listUrl,
      },
      note: urgent
        ? "Há casos há mais de dois dias úteis sem matrícula ou atualização. O gestor também foi sinalizado."
        : "Você receberá novo lembrete pela manhã e à tarde, em dias úteis, enquanto a situação não for registrada.",
      institution: p.institution,
    }),
    text: [
      `${title}`,
      "",
      ...p.items.map(
        (i) =>
          `- ${i.student} — ${i.course}${i.reanalysis ? " · Reanálise" : ""}${i.businessDaysOpen > 2 ? ` · URGENTE: ${i.businessDaysOpen} dias úteis` : ""}: ${i.url}`,
      ),
      "",
      `Atualizar situação: ${single ? p.items[0].url : p.listUrl}`,
    ].join("\n"),
  };
}
