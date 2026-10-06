import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const INSTRUCTIONS = fileURLToPath(new URL('./src/instructions.html', import.meta.url));

/**
 * Bakes src/instructions.html into index.html, so anything that fetches the page
 * without running JavaScript (chatbots, crawlers, curl) receives the instructions as plain HTML.
 * React replaces this content on load; the same file is rendered by the Home page.
 */
function bakeInstructions(): Plugin {
  const note = '<p><em>The paste box and the game menu appear here when JavaScript is enabled. This page is complete without them.</em></p>';
  return {
    name: 'bake-instructions',
    transformIndexHtml: (html) =>
      html.replace('<!--INSTRUCTIONS-->', () => readFileSync(INSTRUCTIONS, 'utf8').replace('<!--APP-->', note)),
  };
}

export default defineConfig({
  plugins: [react(), bakeInstructions()],
  test: { include: ['tests/**/*.test.ts'] },
});
