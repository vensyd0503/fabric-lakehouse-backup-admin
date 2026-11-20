//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import react from '@vitejs/plugin-react-swc';
import { rayfinLocalDev } from '@microsoft/rayfin-local-dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, type PluginOption } from 'vite';
import license from 'rollup-plugin-license';

import { resolve } from 'path';
import { brandingFromDotenv, BRANDING_DEFAULTS } from '../../scripts/setup/answers.ts';

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname;
const brandingEnvPath = resolve(projectRoot, '../../rayfin/.env');
const branding = existsSync(brandingEnvPath)
  ? brandingFromDotenv(readFileSync(brandingEnvPath, 'utf8'))
  : BRANDING_DEFAULTS;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const brandingPlugin: PluginOption = {
  name: 'deployment-branding',
  transformIndexHtml(html) {
    return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(branding.title)}</title>`);
  },
};

// Dev-only middleware: makes the local Vite server compatible with browsers that
// enforce Local Network Access (LNA) checks when a public origin (the Fabric portal)
// embeds an iframe pointing at http://localhost. Sets the LNA opt-in response header
// on every response and short-circuits the corresponding preflight OPTIONS request.
// This is required for fetch/XHR subresources from the embedded app — top-level
// iframe navigations additionally require launching Chromium with the
// `--disable-features=...LocalNetworkAccessChecks` flag (a browser flag your test tooling must set).
const localNetworkAccessPlugin: PluginOption = {
  name: 'local-network-access-headers',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (
        req.method === 'OPTIONS' &&
        req.headers['access-control-request-private-network']
      ) {
        const origin = req.headers.origin || '*';
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          req.headers['access-control-request-headers'] || '*'
        );
        res.statusCode = 204;
        res.end();
        return;
      }
      next();
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_TITLE': JSON.stringify(branding.title),
    'import.meta.env.VITE_APP_SUBTITLE': JSON.stringify(branding.subtitle),
    'import.meta.env.VITE_APP_ICON': JSON.stringify(branding.icon),
  },
  plugins: [
    brandingPlugin,
    react({
      // Rayfin entities use TC39 Stage-3 decorators, which SWC rejects by
      // default ("Expression expected" at `@entity()`). Enable them so the
      // frontend can import entity classes at runtime, e.g. for
      // getFieldConstraints() or toStandardSchema().
      useAtYourOwnRisk_mutateSwcOptions({ jsc }) {
        if (!jsc?.parser) return;
        jsc.parser.decorators = true;
        jsc.transform = { ...jsc.transform, decoratorVersion: '2022-03' };
      },
    }),
    tailwindcss(),
    rayfinLocalDev({ autoLogin: true }),
    localNetworkAccessPlugin,
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
    // Capability packages are linked during monorepo development. Force their
    // React imports onto the app's instance so production builds cannot bundle
    // a second dispatcher and fail hooks at runtime.
    dedupe: ['react', 'react-dom'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
    rollupOptions: {
      plugins: [
        license({
          thirdParty: {
            multipleVersions: true,
            output: {
              file: resolve(projectRoot, 'dist', 'THIRD_PARTY_NOTICES.txt'),
              template(dependencies) {
                if (dependencies.length === 0) {
                  return 'No third-party dependencies.';
                }
                return (
                  'This file was auto-generated at build time.\n\n' +
                  dependencies
                    .map((dep) => {
                      const lines = [
                        `${dep.name}@${dep.version}`,
                        `License: ${dep.license || 'UNKNOWN'}`,
                      ];
                      if (dep.author) {
                        lines.push(
                          `Author: ${typeof dep.author === 'string' ? dep.author : dep.author.text()}`
                        );
                      }
                      if (dep.noticeText) {
                        lines.push('', 'NOTICE:', dep.noticeText.trim());
                      }
                      if (dep.licenseText) {
                        lines.push('', dep.licenseText.trim());
                      }
                      return lines.join('\n');
                    })
                    .join('\n\n' + '='.repeat(60) + '\n\n')
                );
              },
            },
          },
        }),
      ],
    },
  },
});
