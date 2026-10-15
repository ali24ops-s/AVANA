/**
 * SOCKS5 Proxy Fetch Transport Helper.
 *
 * Provides a fetch-compatible transport function that routes outbound HTTP/HTTPS
 * requests through a SocksProxyAgent instance via Node's native http/https request.
 *
 * Key guarantees:
 * - Compatible with WHATWG fetch signature (typeof fetch).
 * - Propagates AbortSignal and timeouts reliably without leaking sockets.
 * - Independent of Undici dispatchers and does not mutate globalThis.fetch.
 * - Safely buffers response bodies for structured JSON parsing.
 * - Zero dependency on TelegramClient or other non-gateway modules.
 */

import http from "node:http";
import https from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";

export interface SocksProxyFetchOptions {
  customTransport?: {
    request: typeof https.request;
  };
}

export function createSocksProxyFetch(
  agent: SocksProxyAgent,
  options?: SocksProxyFetchOptions,
): typeof globalThis.fetch {
  return async function socksFetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);

    const transport =
      options?.customTransport?.request ??
      (url.protocol === "https:" ? https.request : http.request);

    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    const headers: Record<string, string> = {};
    if (input instanceof Request) {
      input.headers.forEach((v, k) => {
        headers[k] = v;
      });
    }
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) {
          headers[k] = v;
        }
      } else {
        Object.assign(headers, init.headers);
      }
    }

    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);

    if (signal?.aborted) {
      const abortError = new Error("This operation was aborted");
      abortError.name = "AbortError";
      return Promise.reject(abortError);
    }

    const body = init?.body;

    return new Promise<Response>((resolve, reject) => {
      let isSettled = false;

      const onAbort = () => {
        if (isSettled) return;
        isSettled = true;
        req.destroy();
        const abortError = new Error("This operation was aborted");
        abortError.name = "AbortError";
        reject(abortError);
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const cleanup = () => {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      };

      const req = transport(
        url,
        {
          method,
          headers,
          agent,
          signal,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          res.on("end", () => {
            if (isSettled) return;
            isSettled = true;
            cleanup();
            const bodyBuffer = Buffer.concat(chunks);
            const responseHeaders = new Headers();
            for (const [key, val] of Object.entries(res.headers)) {
              if (val !== undefined) {
                if (Array.isArray(val)) {
                  for (const v of val) responseHeaders.append(key, v);
                } else {
                  responseHeaders.set(key, val);
                }
              }
            }
            const response = new Response(bodyBuffer, {
              status: res.statusCode ?? 200,
              statusText: res.statusMessage ?? "",
              headers: responseHeaders,
            });
            resolve(response);
          });
          res.on("error", (err) => {
            if (isSettled) return;
            isSettled = true;
            cleanup();
            reject(err);
          });
        },
      );

      req.on("error", (err) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        reject(err);
      });

      if (body !== undefined && body !== null) {
        if (typeof body === "string" || Buffer.isBuffer(body)) {
          req.write(body);
        } else {
          req.write(String(body));
        }
      }

      req.end();
    });
  };
}
