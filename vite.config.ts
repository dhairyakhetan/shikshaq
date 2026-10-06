import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const INSTRUCTIONS = fileURLToPath(new URL('./src/instructions.html', import.meta.url));

/**
 * Bakes src/instructions.html into index.html, so anything that fetches the page without
 * running JavaScript (chatbots, crawlers, curl) receives the instructions as plain HTML.
 * React replaces this content on load and renders the same file at the bottom of the page.
 */
function bakeInstructions(): Plugin {
  return {
    name: 'bake-instructions',
    transformIndexHtml: (html) => html.replace('<!--INSTRUCTIONS-->', () => readFileSync(INSTRUCTIONS, 'utf8')),
  };
}

export default defineConfig({
  plugins: [react(), bakeInstructions()],
  test: { include: ['tests/**/*.test.ts'] },
});
