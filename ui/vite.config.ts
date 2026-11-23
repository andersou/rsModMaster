import { readFileSync } from 'node:fs';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

// a versão vem do Cargo.toml (o CI grava a da tag lá)
const version = /\[workspace\.package\][^[]*?version\s*=\s*"([^"]+)"/.exec(readFileSync('../Cargo.toml', 'utf8'))?.[1] ?? '0.0.0';

export default defineConfig({
  plugins: [solid()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  // o modo dev do app aponta o devUrl do Tauri para cá (ver README)
  server: { port: 5173, strictPort: true },
  // WKWebView (macOS), WebView2 e WebKitGTK recentes: nada de transpilar para navegadores antigos
  build: { target: 'safari16', outDir: 'dist', emptyOutDir: true },
  // os testes conferem os textos em inglês, qualquer que seja o idioma da máquina
  test: { environment: 'node', include: ['src/**/*.test.ts'], setupFiles: ['src/test-setup.ts'] },
});
