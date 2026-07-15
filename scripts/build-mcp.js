/**
 * Bundle the MCP server into a single dependency-free CJS file that the
 * MeetingScribe executable can run in Node mode (ELECTRON_RUN_AS_NODE=1).
 */
const { buildSync } = require('esbuild')

buildSync({
  entryPoints: ['src/mcp/server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'out/mcp/server.cjs',
  logLevel: 'info'
})
