import { readFileSync } from "node:fs";
import { resolve4 } from "node:dns/promises";
import { request } from "node:https";
import { rootCertificates } from "node:tls";

// Source: https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt
// SHA-256: D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31
const maxRoots = [
  ...rootCertificates,
  readFileSync(
    new URL("../deploy/max/russian_trusted_root_ca_pem.crt", import.meta.url),
    "utf8",
  ),
];

export async function postMaxJson<T>(
  url: string,
  token: string,
  payload: unknown,
  method: "POST" | "PATCH" | "GET" = "POST",
): Promise<T> {
  const target = new URL(url);
  if (target.protocol !== "https:") throw new Error("MAX API requires HTTPS");
  const data = method === "GET" ? "" : JSON.stringify(payload);
  const useMaxRoots = target.hostname === "platform-api2.max.ru";
  // Some MAX API addresses intermittently refuse connections. Try the other
  // published addresses only until TLS connects; a sent POST must not be replayed.
  const addresses = useMaxRoots
    ? [...new Set(await resolve4(target.hostname).catch(() => []))]
    : [];
  for (const [index, address] of (addresses.length
    ? addresses
    : [undefined]
  ).entries()) {
    let connected = false;
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = request(
          target,
          {
            method,
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(data),
            },
            ...(useMaxRoots ? { ca: maxRoots } : {}),
            ...(address
              ? {
                  agent: false,
                  autoSelectFamily: false,
                  lookup: (
                    _host: string,
                    _options: unknown,
                    callback: (
                      error: null,
                      address: string,
                      family: number,
                    ) => void,
                  ) => callback(null, address, 4),
                }
              : {}),
            signal: AbortSignal.timeout(15000),
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("error", reject);
            response.on("end", () => {
              const status = response.statusCode || 0;
              if (status < 200 || status >= 300) {
                reject(new Error(`MAX HTTP ${status}`));
                return;
              }
              try {
                resolve(
                  JSON.parse(Buffer.concat(chunks).toString("utf8")) as T,
                );
              } catch {
                reject(new Error("MAX returned invalid JSON"));
              }
            });
          },
        );
        if (address) {
          const connectTimer = setTimeout(
            () => req.destroy(new Error("MAX API connect timeout")),
            4000,
          );
          req.once("socket", (socket) =>
            socket.once("secureConnect", () => {
              connected = true;
              clearTimeout(connectTimer);
            }),
          );
          req.once("close", () => clearTimeout(connectTimer));
        }
        req.on("error", reject);
        req.end(data);
      });
    } catch (error) {
      if (connected || index === addresses.length - 1 || !address) throw error;
    }
  }
  throw new Error("MAX API has no available addresses");
}
