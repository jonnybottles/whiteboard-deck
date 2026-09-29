import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { deck } from './src/content/deck.ts';
import { validateDeck } from './src/engine/validate.ts';

validateDeck(deck);

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2022',
    modulePreload: false,
    sourcemap: false,
    reportCompressedSize: false,
  },
});
