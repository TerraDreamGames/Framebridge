import { createRelay } from "./server";
const port = Number(process.env.PORT ?? 4318);
const host = process.env.HOST ?? "127.0.0.1";
const server = createRelay();
server.listen(port, host, () =>
  console.log(
    `Framebridge relay listening on ${host}:${port}. Use HTTPS for deployed plugin connections.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close());
