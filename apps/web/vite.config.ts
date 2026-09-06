import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function ogOriginPlugin(): Plugin {
  const origin = (process.env.VITE_PUBLIC_SITE_ORIGIN || '').replace(/\/$/, '');
  return {
    name: 'onest-og-origin',
    transformIndexHtml(html) {
      if (!origin) return html;
      return html
        .replaceAll(
          'content="/images/og.png"',
          `content="${origin}/images/og.png"`,
        )
        .replace(
          '<meta property="og:type" content="website" />',
          `<meta property="og:type" content="website" />\n    <meta property="og:url" content="${origin}/" />`,
        );
    },
  };
}

export default defineConfig({
  define: {
    __ONEST_BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  plugins: [
    react(),
    ogOriginPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'images/paw-icon.svg',
        'images/paw-192.png',
        'images/paw-512.png',
        'images/og.png',
      ],
      manifest: {
        id: '/',
        name: 'Onest',
        short_name: 'Onest',
        description: 'Animal profile and paw-print tributes on eCash',
        theme_color: '#0a0a0a',
        background_color: '#050505',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        handle_links: 'preferred',
        launch_handler: {
          client_mode: 'navigate-existing',
        },
        icons: [
          {
            src: '/images/paw-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/images/paw-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/index-api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/index-api/, ''),
      },
    },
  },
});
