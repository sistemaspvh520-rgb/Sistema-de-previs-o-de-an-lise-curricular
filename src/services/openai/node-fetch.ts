import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

function abortError(): Error {
  return new DOMException("This operation was aborted", "AbortError");
}

function toHeaderRecord(headers: FetchInit["headers"] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function toBuffer(body: FetchInit["body"] | undefined): Buffer | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  throw new TypeError("nodeFetch só aceita corpo em texto ou binário.");
}

function decode(buffer: Buffer, encoding: string | undefined): Buffer {
  switch ((encoding ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.gunzipSync(buffer);
    case "deflate":
      return zlib.inflateSync(buffer);
    case "br":
      return zlib.brotliDecompressSync(buffer);
    default:
      return buffer;
  }
}

/**
 * fetch mínimo sobre node:http(s), para o SDK da OpenAI.
 *
 * Na Vercel o fetch global é interceptado (Next.js, Sentry, runtime), e a chamada da OpenAI
 * falhava com "TypeError: Body is unusable: Body has already been read". Aqui a requisição
 * sai direto do Node e a resposta é lida inteira antes de virar um `Response` novo.
 * Só atende ao que o SDK usa: corpo em texto/binário e resposta sem streaming.
 */
export const nodeFetch = (async (input: FetchInput, init: FetchInit = {}): Promise<Response> => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const signal = init.signal ?? undefined;
  if (signal?.aborted) throw abortError();

  const body = toBuffer(init.body);
  const headers = toHeaderRecord(init.headers);
  if (body && !headers["content-length"]) headers["content-length"] = String(body.length);

  const transport = url.protocol === "http:" ? http : https;
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const req = transport.request(url, { method: init.method ?? "GET", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", (err) => finish(() => reject(err)));
      res.on("aborted", () => finish(() => reject(new TypeError("fetch failed", { cause: new Error("resposta interrompida") }))));
      res.on("end", () =>
        finish(() => {
          try {
            const status = res.statusCode ?? 0;
            const responseHeaders = new Headers();
            for (const [key, value] of Object.entries(res.headers)) {
              if (key === "content-encoding" || key === "content-length") continue;
              if (Array.isArray(value)) value.forEach((v) => responseHeaders.append(key, v));
              else if (value !== undefined) responseHeaders.set(key, value);
            }
            const payload = decode(Buffer.concat(chunks), res.headers["content-encoding"]);
            const nullBody = [101, 204, 205, 304].includes(status);
            resolve(new Response(nullBody ? null : new Uint8Array(payload), { status, statusText: res.statusMessage ?? "", headers: responseHeaders }));
          } catch (err) {
            reject(err);
          }
        }),
      );
    });
    const onAbort = () => {
      req.destroy();
      finish(() => reject(abortError()));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    req.on("error", (err) => finish(() => reject(new TypeError("fetch failed", { cause: err }))));
    if (body) req.write(body);
    req.end();
  });
}) as typeof fetch;
