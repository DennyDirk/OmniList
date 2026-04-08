import { config } from "dotenv";
import { buildApp } from "./app";

config({
  path: "../../.env"
});
import { getEnv } from "./config/env";

const { port } = getEnv();

const app = await buildApp();

try {
  await app.listen({
    port,
    host: "0.0.0.0"
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
