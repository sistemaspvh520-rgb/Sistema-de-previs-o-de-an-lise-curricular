/**
 * Digital Asset Links: prova para o Android que o app da Play Store (TWA) pertence a este domínio,
 * e assim ele abre o portal em tela cheia, sem a barra de endereço. Configure na Vercel:
 * ANDROID_APP_PACKAGE (ex.: br.app.cruzeirodosulvirtual.portal) e ANDROID_APP_SHA256 (impressão
 * digital SHA-256 da chave de assinatura da Play Console; várias separadas por vírgula).
 */
export function GET() {
  const packageName = process.env.ANDROID_APP_PACKAGE?.trim();
  const fingerprints = (process.env.ANDROID_APP_SHA256 ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const body = packageName && fingerprints.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints } }]
    : [];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
