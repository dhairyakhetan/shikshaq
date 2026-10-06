import html from '../instructions.html?raw';

// The same file is baked into index.html for readers without JavaScript (see vite.config.ts).
export function Instructions() {
  return <section className="doc" aria-labelledby="chatbots" dangerouslySetInnerHTML={{ __html: html }} />;
}
