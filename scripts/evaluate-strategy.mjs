import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { evaluateCases } from '../strategy-eval.js';

const defaultPath = fileURLToPath(new URL('../fixtures/strategy-cases.json', import.meta.url));
const path = resolve(process.argv[2] || defaultPath);
const fixtures = JSON.parse(await readFile(path, 'utf8'));
const result = await evaluateCases(fixtures);
console.log(`固定样本：${result.passed}/${result.total} 通过`);
for (const failure of result.failures) console.error(JSON.stringify(failure));
if (result.failures.length) process.exitCode = 1;
