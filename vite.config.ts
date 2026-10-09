import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const INSTRUCTIONS = fileURLToPath(new URL('./src/instructions.html', import.meta.url));

/**
 * Bakes src/instructions.html into index.html, so anything that fetches the page without
 * running JavaScript (chatbots, crawlers, curl) receives the instructions as plain HTML.
 * In a browser a one-line script in the head hides them before the first paint, so people only see the app.
 */
function bakeInstructions(): Plugin {
  return {
    name: 'bake-instructions',
    transformIndexHtml: (html) => html.replace('<!--INSTRUCTIONS-->', () => readFileSync(INSTRUCTIONS, 'utf8')),
  };
}

/** Three separate pages, one per part: the question formatter, the HoD desk and the revision games. */
export default defineConfig({
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        formatter: fileURLToPath(new URL('./index.html', import.meta.url)),
        hod: fileURLToPath(new URL('./hod/index.html', import.meta.url)),
        play: fileURLToPath(new URL('./play/index.html', import.meta.url)),
      },
    },
  },
  plugins: [react(), bakeInstructions()],
  test: { include: ['tests/**/*.test.ts'] },
});
