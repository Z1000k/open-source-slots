import { defineConfig } from 'vite';

export default defineConfig({
  // GAME_BASE lets the site repo build the game for a subpath, e.g. /games/stellar-sevens/
  base: process.env.GAME_BASE ?? '/',
  server: { port: 5205, open: false },
  build: { target: 'es2022' },
});
