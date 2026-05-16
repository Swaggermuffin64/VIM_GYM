// Capture CLI env vars BEFORE dotenv can touch them
const CLI_PROD = process.env.PROD;
const CLI_GAME_SERVER_URL = process.env.GAME_SERVER_URL;

import 'dotenv/config';

// Benchmarks task generation by hitting GET /api/task/practice on the game server.
// Each call generates a full batch of 10 tasks (4 navigate + 4 delete + 2 yank_paste).
//
// Usage:
//   Local:      tsx scripts/task-gen-benchmark.ts
//   Production: PROD=1 tsx scripts/task-gen-benchmark.ts
//   Custom:     GAME_SERVER_URL=https://custom.example.com tsx scripts/task-gen-benchmark.ts

const LOCAL_URL = 'http://localhost:3001';
const PROD_URL = 'https://vim-racing-server.fly.dev';

const GAME_SERVER_URL =
  CLI_GAME_SERVER_URL || (CLI_PROD ? PROD_URL : LOCAL_URL);

const NUM_BATCHES = parseInt(process.env.NUM_BATCHES || '50', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '30000', 10);

interface BenchmarkResult {
  batchNum: number;
  ms: number;
  error?: string;
}

const results: BenchmarkResult[] = [];

async function runSingleBenchmark(batchNum: number): Promise<BenchmarkResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${GAME_SERVER_URL}/api/task/practice`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const elapsed = Date.now() - start;

    if (!res.ok) {
      const body = await res.text();
      return { batchNum, ms: elapsed, error: `HTTP ${res.status}: ${body}` };
    }

    // Verify we got tasks back
    const data = await res.json();
    if (!data.tasks || !Array.isArray(data.tasks)) {
      return { batchNum, ms: elapsed, error: 'No tasks in response' };
    }

    return { batchNum, ms: elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return { batchNum, ms: elapsed, error: message };
  }
}

function printStats(times: number[], label: string) {
  if (times.length === 0) return;
  const sorted = [...times].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  console.log(`   ${label}:`);
  console.log(
    `     Min: ${min}ms | Avg: ${avg.toFixed(0)}ms | P50: ${p50}ms | P95: ${p95}ms | Max: ${max}ms`
  );
}

async function run() {
  console.log('Task Generation Benchmark');
  console.log(`   Target: ${GAME_SERVER_URL}/api/task/practice`);
  console.log(`   Batches: ${NUM_BATCHES}`);
  console.log(`   Timeout: ${TIMEOUT_MS}ms per request`);
  console.log('');

  for (let i = 0; i < NUM_BATCHES; i++) {
    const result = await runSingleBenchmark(i + 1);
    results.push(result);

    if (result.error) {
      console.log(
        `   [${i + 1}/${NUM_BATCHES}] ${result.ms}ms ERROR: ${result.error}`
      );
    } else {
      console.log(`   [${i + 1}/${NUM_BATCHES}] ${result.ms}ms`);
    }
  }

  // Summary
  const successful = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  console.log('\n' + '='.repeat(60));
  console.log('TASK GENERATION BENCHMARK RESULTS');
  console.log('='.repeat(60));
  console.log(`   Target: ${GAME_SERVER_URL}/api/task/practice`);
  console.log(
    `   Batches: ${NUM_BATCHES} (${successful.length} ok, ${failed.length} failed)`
  );
  console.log('-'.repeat(60));

  printStats(
    successful.map((r) => r.ms),
    'Response time (includes task generation + network)'
  );

  if (failed.length > 0) {
    console.log('-'.repeat(60));
    console.log('   ERRORS:');
    for (const r of failed) {
      console.log(`     Batch ${r.batchNum}: ${r.error}`);
    }
  }

  console.log('='.repeat(60) + '\n');
  process.exit(failed.length > 0 ? 1 : 0);
}

process.on('SIGINT', () => {
  console.log('\n\nInterrupted');
  process.exit(1);
});

run().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});

//============================================================
//TASK GENERATION BENCHMARK RESULTS
//============================================================
//   Target: http://localhost:3001/api/task/practice
//   Batches: 50 (50 ok, 0 failed)
//------------------------------------------------------------
//   Response time (includes task generation + network):
//     Min: 38ms | Avg: 256ms | P50: 240ms | P95: 459ms | Max: 618ms
//============================================================

//============================================================
//TASK GENERATION BENCHMARK RESULTS
//============================================================
//   Target: https://vim-racing-server.fly.dev/api/task/practice
//   Batches: 50 (50 ok, 0 failed)
//------------------------------------------------------------
//  Response time (includes task generation + network):
//     Min: 173ms | Avg: 671ms | P50: 625ms | P95: 1252ms | Max: 1558ms
//============================================================
