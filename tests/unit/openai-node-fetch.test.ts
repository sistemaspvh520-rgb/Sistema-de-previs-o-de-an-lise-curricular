import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import OpenAI from "openai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeFetch } from "@/services/openai/node-fetch";

let server: http.Server;
let base = "";
let hits = 0;

const reply = { id: "resp_1", object: "response", status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      hits++;
      const path = req.url ?? "";
      if (path.startsWith("/echo")) {
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ bytes: Buffer.concat(chunks).length, auth: req.headers.authorization ?? null }));
      }
      if (path.startsWith("/gzip")) {
        res.setHeader("content-type", "application/json");
        res.setHeader("content-encoding", "gzip");
        return res.end(zlib.gzipSync(JSON.stringify({ ok: true })));
      }
      if (path.startsWith("/slow")) return void setTimeout(() => res.end("{}"), 1_500);
      if (path.startsWith("/empty")) {
        res.statusCode = 204;
        return res.end();
      }
      if (path.startsWith("/flaky") && hits % 2 === 1) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ error: { message: "boom" } }));
      }
      if (path.startsWith("/bad")) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ error: { message: "Unsupported parameter: 'x'", type: "invalid_request_error", param: "x" } }));
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

describe("nodeFetch", () => {
  it("envia corpo grande e cabeçalhos e devolve JSON", async () => {
    const res = await nodeFetch(`${base}/echo`, { method: "POST", headers: { authorization: "Bearer x", "content-type": "application/json" }, body: JSON.stringify({ f: "A".repeat(5_000_000) }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { bytes: number; auth: string };
    expect(json.bytes).toBeGreaterThan(5_000_000);
    expect(json.auth).toBe("Bearer x");
  });

  it("descomprime gzip e aceita 204 sem corpo", async () => {
    expect(await (await nodeFetch(`${base}/gzip`)).json()).toEqual({ ok: true });
    const empty = await nodeFetch(`${base}/empty`);
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe("");
  });

  it("rejeita com AbortError quando o sinal é cancelado", async () => {
    const controller = new AbortController();
    const pending = nodeFetch(`${base}/slow`, { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("falha de conexão vira 'fetch failed' com a causa", async () => {
    await expect(nodeFetch("http://127.0.0.1:1/x")).rejects.toMatchObject({ message: "fetch failed", cause: expect.any(Error) });
  });

  it("funciona com o SDK da OpenAI: sucesso, nova tentativa em 500 e erro 400 com detalhe", async () => {
    const client = new OpenAI({ apiKey: "sk-test", baseURL: `${base}/ok`, maxRetries: 1, fetch: nodeFetch });
    const ok = await client.responses.create({ model: "m", input: "oi" });
    expect(ok.id).toBe("resp_1");

    const flaky = new OpenAI({ apiKey: "sk-test", baseURL: `${base}/flaky`, maxRetries: 1, fetch: nodeFetch });
    hits = 0;
    expect((await flaky.responses.create({ model: "m", input: "oi" })).id).toBe("resp_1");

    const bad = new OpenAI({ apiKey: "sk-test", baseURL: `${base}/bad`, maxRetries: 0, fetch: nodeFetch });
    await expect(bad.responses.create({ model: "m", input: "oi" })).rejects.toMatchObject({ status: 400 });
  });

  it("o SDK respeita o timeout", async () => {
    const slow = new OpenAI({ apiKey: "sk-test", baseURL: `${base}/slow`, maxRetries: 0, timeout: 300, fetch: nodeFetch });
    await expect(slow.responses.create({ model: "m", input: "oi" })).rejects.toThrow(/timed out/i);
  });
});
