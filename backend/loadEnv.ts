// Must be the entrypoint's first import: loads .env, then fails fast on
// missing configuration before any other module reads process.env.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { findEnvProblems } from './envCheck.js';

const problems = findEnvProblems(
  process.env,
  existsSync(path.resolve(process.cwd(), '.env'))
);
if (problems.length > 0) {
  console.error(
    `❌ Environment check failed:\n  - ${problems.join('\n  - ')}\n` +
      'See .env.example for every variable.'
  );
  process.exit(1);
}
