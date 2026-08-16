# Load test scripts

Used to produce the numbers in the top-level README §9.

```bash
npm install
node ingest-load.js http://localhost:8080 60 24 500   # baseUrl duration(s) concurrency batchSize
node query-load.js  http://localhost:8080 20           # baseUrl duration(s)
```
