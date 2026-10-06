import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: o build funciona em qualquer hospedagem estática,
  // inclusive em subpastas como https://usuario.github.io/damas-3d/
  base: './',
  build: {
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'node',
  },
});
