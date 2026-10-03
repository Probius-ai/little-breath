import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppServer } from "./app.js";

const port = Number(process.env.PORT ?? "8787");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be an integer between 1 and 65535.");
  process.exit(1);
}
const host = process.env.HOST ?? "127.0.0.1";
const server = createAppServer({
  apiKey: process.env.OPENWEATHER_API_KEY,
  staticDirectory: resolve(dirname(fileURLToPath(import.meta.url)), "../dist"),
});
server.listen(port, host, () =>
  console.info(`Little Breath is listening on http://${host}:${port}`),
);
server.on("error", () => {
  console.error(
    "The server could not start. Check HOST, PORT, and whether the port is already in use.",
  );
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
