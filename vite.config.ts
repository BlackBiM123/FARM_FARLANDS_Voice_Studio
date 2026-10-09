import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { handleTTS } from "./server/tts.js";
import { handleSession } from "./server/session.js";
import { handleCloud } from "./server/cloud.js";
import { handleAudio } from "./server/audio.js";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of [
    "GEMINI_API_KEY",
    "STUDIO_ACCESS_TOKEN",
    "GENERATION_ENABLED",
    "STUDIO_ORIGIN",
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
  ])
    if (env[key]) process.env[key] = env[key];
  return {
    plugins: [
      vue(),
      tailwindcss(),
      {
        name: "local-api",
        configureServer(server) {
          for (const route of ["tts", "session", "cloud", "audio"])
            server.middlewares.use("/api/" + route, async (req, res) => {
              try {
                const chunks: Buffer[] = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (
                    size >
                    (route === "audio"
                      ? 4000000
                      : route === "cloud"
                        ? 1000000
                        : 12000)
                  ) {
                    res.statusCode = 413;
                    res.end();
                    return;
                  }
                  chunks.push(chunk);
                }
                const headers = new Headers();
                for (const [key, value] of Object.entries(req.headers)) {
                  if (typeof value === "string") headers.set(key, value);
                }
                const request = new Request(
                  "http://localhost:5173/api/" +
                    route +
                    (req.url?.includes("?")
                      ? req.url.slice(req.url.indexOf("?"))
                      : ""),
                  {
                    method: req.method,
                    headers,
                    ...(["POST", "PUT", "PATCH", "DELETE"].includes(
                      req.method ?? "",
                    )
                      ? { body: Buffer.concat(chunks) }
                      : {}),
                  },
                );
                const response = await {
                  tts: handleTTS,
                  session: handleSession,
                  cloud: handleCloud,
                  audio: handleAudio,
                }[route]!(request);
                res.statusCode = response.status;
                response.headers.forEach((v, k) => res.setHeader(k, v));
                res.end(Buffer.from(await response.arrayBuffer()));
              } catch {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: "Ошибка локального сервера" }));
              }
            });
        },
      },
    ],
  };
});
