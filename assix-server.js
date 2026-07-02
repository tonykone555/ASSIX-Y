import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("Booting Assix Server via TSX loader...");

const child = spawn('node', ['dist/server.cjs'], {
  stdio: 'inherit',
  cwd: __dirname,
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'production'
  }
});

child.on('close', (code) => {
  process.exit(code || 0);
});
