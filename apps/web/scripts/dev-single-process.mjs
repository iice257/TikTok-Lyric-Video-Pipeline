import { startServer } from "next/dist/server/lib/start-server.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME || process.env.HOST || "0.0.0.0";

startServer({
  dir: process.cwd(),
  port: Number.isNaN(port) ? 3000 : port,
  isDev: true,
  hostname,
  allowRetry: true,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
