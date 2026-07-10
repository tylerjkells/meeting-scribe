/**
 * Runs electron-builder with one automatic retry. Corporate antivirus
 * sometimes holds a handle on freshly written exes exactly when the builder
 * renames its temp folder (EPERM); a short wait and a retry always succeeds.
 */
const { spawnSync } = require('child_process')
const fs = require('fs')

const OUT = 'dist-installer'

function cleanTemp() {
  for (const d of [`${OUT}/win-unpacked`, `${OUT}/win-unpacked.tmp`]) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {
      /* locked; the wait below usually frees it */
    }
  }
}

function run() {
  const r = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['electron-builder', '--win', `-c.directories.output=${OUT}`],
    { stdio: 'inherit', shell: true }
  )
  return r.status === 0
}

if (run()) process.exit(0)
console.log('\npackaging failed once (likely AV scan race); retrying in 10s…\n')
cleanTemp()
setTimeout(() => {
  cleanTemp()
  process.exit(run() ? 0 : 1)
}, 10000)
