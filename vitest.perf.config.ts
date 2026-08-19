import { defineConfig } from 'vitest/config';

/**
 * The performance budgets, run on their own.
 *
 * These tests time real work — what a keystroke costs on a document just under
 * the block-scan limit — and a stopwatch is only as good as the quiet around
 * it. Run beside thirty other test files on the same cores, the measurement is
 * of the machine's other work: the same keystroke measured 8ms alone and 22ms
 * in the crowd, and the budget it broke had nothing to do with the code.
 *
 * So they get their own run, one file at a time, and the budgets stay strict
 * enough to mean something. Run with `npm run test:perf`.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/perf.test.ts'],
    globals: true,
    fileParallelism: false,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } }
  }
});
