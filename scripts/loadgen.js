const TOTAL_LOGS = 10000;
const BATCH_SIZE = 500;
const API_URL = "http://localhost:8080/logs";

const levels = ["info", "info", "info", "debug", "warn", "error"];

const services = [
  "auth-service",
  "api-service",
  "payment-service",
  "database-service",
  "notification-service",
  "user-service",
  "order-service",
];

const messages = {
  info: [
    "User logged in successfully",
    "Request completed successfully",
    "User profile loaded",
    "Order created successfully",
    "Email notification sent",
    "Data fetched successfully",
  ],
  debug: [
    "Database query executed",
    "Cache lookup completed",
    "Processing request",
    "Token validated",
  ],
  warn: [
    "High response time detected",
    "Rate limit approaching",
    "Cache miss detected",
    "Slow database query",
  ],
  error: [
    "Database connection failed",
    "Payment failed",
    "Authentication failed",
    "Request processing failed",
    "External service unavailable",
  ],
};

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTimestamp() {
  // Generate timestamps over the last 60 minutes
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  return new Date(
    now - Math.floor(Math.random() * oneHour)
  ).toISOString();
}

function generateLog(index) {
  const level = randomItem(levels);
  const service = randomItem(services);

  return {
    timestamp: randomTimestamp(),
    level,
    service,
    message: randomItem(messages[level]),
    attributes: {
      requestId: `req-${index}-${Math.random().toString(36).slice(2, 10)}`,
      userId: `user-${randomInt(1, 500)}`,
      duration: randomInt(10, 2000),
      statusCode:
        level === "error"
          ? randomItem([400, 401, 403, 404, 500, 502, 503])
          : 200,
      environment: "development",
    },
  };
}

async function sendBatch(logs, batchNumber, totalBatches) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ logs }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Batch ${batchNumber} failed (${response.status}): ${text}`
    );
  }

  const result = await response.json();

  console.log(
    `Batch ${batchNumber}/${totalBatches}: accepted=${result.accepted}, rejected=${result.rejected.length}`
  );
}

async function main() {
  console.log(`Generating ${TOTAL_LOGS} logs...`);

  const logs = Array.from(
    { length: TOTAL_LOGS },
    (_, index) => generateLog(index + 1)
  );

  console.log(`Generated ${logs.length} logs.`);

  const totalBatches = Math.ceil(TOTAL_LOGS / BATCH_SIZE);

  for (let i = 0; i < logs.length; i += BATCH_SIZE) {
    const batch = logs.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    await sendBatch(batch, batchNumber, totalBatches);
  }

  console.log("\nDone!");
  console.log(`Successfully sent ${TOTAL_LOGS} logs.`);
}

main().catch((error) => {
  console.error("\nLoad generator failed:");
  console.error(error);
  process.exit(1);
});