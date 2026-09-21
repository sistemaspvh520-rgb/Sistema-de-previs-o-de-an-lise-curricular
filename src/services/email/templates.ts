/**
 * Templates de e-mail transacional — HTML com CSS inline (compatível com Gmail/Outlook) + versão texto.
 * Identidade: navy #003E69 · ciano #00B9E4 (os mesmos tokens de src/styles/tokens.css).
 */

const NAVY = "#003E69";
const CYAN = "#00B9E4";
const TEXT = "#17212B";
const MUTED = "#5B6B7B";
const BG = "#F5F7FA";

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function layout(opts: { preheader: string; title: string; intro: string; button?: { label: string; url: string }; details?: Array<[string, string]>; note?: string; institution: string }): string {
  const details = opts.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #DFE5EC;border-radius:8px;border-collapse:separate;">
        ${opts.details.map(([k, v]) => `<tr><td style="padding:10px 14px;color:${MUTED};font-size:13px;border-bottom:1px solid #EEF1F5;">${escape(k)}</td><td style="padding:10px 14px;color:${TEXT};font-size:13px;font-weight:600;border-bottom:1px solid #EEF1F5;">${escape(v)}</td></tr>`).join("")}
      </table>`
    : "";
  const button = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:${NAVY};border-radius:8px;">
        <a href="${escape(opts.button.url)}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">${escape(opts.button.label)}</a>
      </td></tr></table>
      <p style="margin:0 0 8px;font-size:12px;color:${MUTED};">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${escape(opts.button.url)}" style="color:${NAVY};word-break:break-all;">${escape(opts.button.url)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${TEXT};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${escape(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #DFE5EC;">
  <tr><td style="background:${NAVY};padding:22px 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:34px;height:34px;background:${CYAN};border-radius:8px;text-align:center;color:${NAVY};font-weight:700;font-size:16px;line-height:34px;">AC</td>
      <td style="padding-left:12px;color:#ffffff;font-size:15px;font-weight:600;line-height:1.2;">Análise Curricular Inteligente<br><span style="font-size:11px;font-weight:400;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">${escape(opts.institution)}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 28px 8px;">
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:${TEXT};">${escape(opts.title)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:${TEXT};">${opts.intro}</p>
    ${details}
    ${button}
    ${opts.note ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">${opts.note}</p>` : ""}
  </td></tr>
  <tr><td style="padding:18px 28px 24px;border-top:1px solid #EEF1F5;font-size:12px;line-height:1.6;color:${MUTED};">
    Este é um e-mail automático do sistema interno de análise curricular. Se você não esperava esta mensagem, ignore-a — nenhuma ação será feita na sua conta.
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

export function inviteEmail(p: { name: string; login: string; url: string; invitedBy: string; validDays: number; institution: string }): EmailContent {
  const first = p.name.split(" ")[0];
  return {
    subject: "Sua conta no sistema de Análise Curricular foi criada",
    html: layout({
      preheader: "Defina sua senha para começar a usar o sistema.",
      title: `Olá, ${first}! Sua conta está pronta.`,
      intro: `${escape(p.invitedBy)} criou o seu acesso ao <strong>sistema de Análise Curricular Inteligente</strong>. Para começar, defina a sua senha pessoal clicando no botão abaixo.`,
      details: [["Login", p.login], ["Validade do link", `${p.validDays} dias`]],
      button: { label: "Definir minha senha", url: p.url },
      note: "Por segurança, o link só pode ser usado uma vez. Depois de definir a senha, entre pelo endereço do sistema com o seu login.",
      institution: p.institution,
    }),
    text: `Olá, ${first}!\n\n${p.invitedBy} criou o seu acesso ao sistema de Análise Curricular Inteligente.\n\nLogin: ${p.login}\nDefina sua senha (link válido por ${p.validDays} dias):\n${p.url}\n\nO link só pode ser usado uma vez. Se você não esperava esta mensagem, ignore-a.`,
  };
}

export function resetEmail(p: { name: string; login: string; url: string; validMinutes: number; institution: string }): EmailContent {
  const first = p.name.split(" ")[0];
  return {
    subject: "Redefinição de senha — Análise Curricular",
    html: layout({
      preheader: "Use o link para criar uma nova senha.",
      title: `${first}, vamos redefinir sua senha`,
      intro: "Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.",
      details: [["Login", p.login], ["Validade do link", `${p.validMinutes} minutos`]],
      button: { label: "Criar nova senha", url: p.url },
      note: "Se você não pediu a redefinição, pode ignorar este e-mail — sua senha atual continua válida.",
      institution: p.institution,
    }),
    text: `${first}, vamos redefinir sua senha.\n\nLogin: ${p.login}\nCrie uma nova senha (link válido por ${p.validMinutes} minutos):\n${p.url}\n\nSe você não pediu a redefinição, ignore este e-mail.`,
  };
}

export function temporaryPasswordEmail(p: { name: string; login: string; password: string; loginUrl: string; institution: string }): EmailContent {
  const first = p.name.split(" ")[0];
  return {
    subject: "Senha temporária — Análise Curricular",
    html: layout({
      preheader: "Sua senha temporária de acesso.",
      title: `${first}, aqui está sua senha temporária`,
      intro: "Use os dados abaixo para entrar. No primeiro acesso o sistema pedirá que você crie a sua senha definitiva.",
      details: [["Login", p.login], ["Senha temporária", p.password]],
      button: { label: "Entrar no sistema", url: p.loginUrl },
      note: "Não compartilhe esta senha. Ela deixa de valer assim que você definir a sua.",
      institution: p.institution,
    }),
    text: `${first}, aqui está sua senha temporária.\n\nLogin: ${p.login}\nSenha temporária: ${p.password}\nEntrar: ${p.loginUrl}\n\nNo primeiro acesso você criará sua senha definitiva.`,
  };
}
