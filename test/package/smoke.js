// Tests the package as npm users get it: packs the tarball, installs it in a throwaway project, then
// imports every entry point with plain Node (no Vite/Vitest) and renders React and Vue on the server.
// Catches what unit tests on src/ cannot: missing files in "files", broken "exports", ESM imports
// without .js extensions. Run after `npm run build`: npm run test:package
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Inside the repo so react, react-dom and vue resolve from the repo's node_modules (no network)
const app = join(here, '.app');
const sdk = join(app, 'node_modules', '@canardform', 'sdk');
rmSync(app, { recursive: true, force: true });
mkdirSync(sdk, { recursive: true });
writeFileSync(join(app, 'package.json'), '{ "type": "module" }');

const [{ filename }] = JSON.parse(
    execFileSync(
        'npm',
        ['pack', '--json', '--ignore-scripts', '--pack-destination', app],
        { cwd: join(here, '..', '..'), encoding: 'utf8' },
    ),
);
execFileSync('tar', [
    '-xzf',
    join(app, filename),
    '-C',
    sdk,
    '--strip-components=1',
]);

const run = (code) =>
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: app,
        encoding: 'utf8',
    });

const definition = JSON.stringify({
    id: 'f1',
    locale: 'fr',
    open: true,
    fields: [{ key: 'email', type: 'email', label: 'E-mail', required: true }],
});

try {
    run(`
        import assert from 'node:assert/strict';
        import * as sdk from '@canardform/sdk';
        import * as controller from '@canardform/sdk/controller';
        import pkg from '@canardform/sdk/package.json' with { type: 'json' };
        assert.equal(typeof sdk.submitForm, 'function');
        assert.equal(typeof sdk.mountForm, 'function');
        assert.equal(typeof controller.createFormController, 'function');
        assert.ok(pkg.version);
    `);

    const react = run(`
        import { createElement } from 'react';
        import { renderToString } from 'react-dom/server';
        import { CanardForm } from '@canardform/sdk/react';
        process.stdout.write(renderToString(createElement(CanardForm, { formId: 'f1', definition: ${definition} })));
    `);
    assert.match(react, /name="email"/, 'React SSR renders the fields');

    const vue = run(`
        import { createSSRApp, h } from 'vue';
        import { renderToString } from 'vue/server-renderer';
        import { CanardForm } from '@canardform/sdk/vue';
        process.stdout.write(await renderToString(createSSRApp({ render: () => h(CanardForm, { formId: 'f1', definition: ${definition} }) })));
    `);
    assert.match(vue, /name="email"/, 'Vue SSR renders the fields');

    console.log('Package OK: entry points, React SSR, Vue SSR');
} finally {
    rmSync(app, { recursive: true, force: true });
}
