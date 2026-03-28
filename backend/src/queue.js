/**
 * CloudPrism — BullMQ Queue Configuration
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ
});

export const importQueue = new Queue("cloudprism-import", { connection });

export async function enqueueImport(jobData) {
  const job = await importQueue.add("process-csv", jobData, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400 },  // keep 24h
    removeOnFail: { age: 604800 },     // keep 7d
  });
  return job.id;
}
