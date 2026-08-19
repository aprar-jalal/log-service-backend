import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { readiness } from "../lib/readiness.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
 
  app.get("/health", async (_req, reply) => {
    if (!readiness.ready) {
      reply.code(503).send({ status: "starting" });
      return;
    }
    try {
      await pool.query("SELECT 1");
    } catch {
      reply.code(503).send({ status: "database unavailable" });
      return;
    }
    reply.code(200).send({ status: "ok" });
  });
}
