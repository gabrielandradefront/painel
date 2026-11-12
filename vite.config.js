import { defineConfig } from 'vite';
import fs from 'fs';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
  plugins: [
    {
      name: 'copy-scripts',
      generateBundle() {
        const scripts = [
          'core.js',
          'hoje.js',
          'aulas.js',
          'operacional.js',
          'orcamento.js',
          'app.js',
          'snake.js',
          'favicon.svg'
        ];
        for (const file of scripts) {
          if (fs.existsSync(file)) {
            this.emitFile({
              type: 'asset',
              fileName: file,
              source: fs.readFileSync(file, 'utf-8'),
            });
          }
        }
      },
    },
  ],
});
