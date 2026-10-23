import { defineConfig } from 'vite';

export default defineConfig({
  // GAME_BASE lets the site repo build the game for a subpath, e.g. /games/scorching-hot/
  base: process.env.GAME_BASE ?? '/',
  server: { port: 5202, open: false },
  build: { target: 'es2022' },
});
