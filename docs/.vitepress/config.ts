import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'Canard Form SDK',
    description:
        'Send answers to Canard Form from your own website: plain HTML, JavaScript, React, Vue and server-side rendering.',
    base: '/sdk-js/',
    lang: 'en-US',
    cleanUrls: true,
    lastUpdated: true,
    themeConfig: {
        nav: [
            { text: 'Guide', link: '/guide/getting-started' },
            { text: 'Canard Form', link: 'https://canardform.com' },
        ],
        sidebar: [
            {
                text: 'Introduction',
                items: [
                    { text: 'Getting started', link: '/guide/getting-started' },
                ],
            },
            {
                text: 'Without the SDK',
                items: [
                    { text: 'HTML form', link: '/guide/html' },
                    { text: 'JavaScript (fetch)', link: '/guide/javascript' },
                ],
            },
            {
                text: 'SDK',
                items: [
                    { text: 'mountForm', link: '/guide/sdk' },
                    { text: 'React', link: '/guide/react' },
                    { text: 'Vue', link: '/guide/vue' },
                    { text: 'Server-side rendering', link: '/guide/ssr' },
                    {
                        text: 'Steps and conditions',
                        link: '/guide/steps-and-conditions',
                    },
                ],
            },
            {
                text: 'Going further',
                items: [
                    { text: 'Bot protection', link: '/guide/anti-robot' },
                    { text: 'Content Security Policy', link: '/guide/csp' },
                    { text: 'Error codes', link: '/guide/errors' },
                    { text: 'Supported browsers', link: '/guide/browsers' },
                ],
            },
        ],
        search: { provider: 'local' },
        socialLinks: [
            { icon: 'github', link: 'https://github.com/canardform/sdk-js' },
        ],
        editLink: {
            pattern:
                'https://github.com/canardform/sdk-js/edit/main/docs/:path',
            text: 'Edit this page on GitHub',
        },
        footer: {
            message: 'Released under the MIT License.',
        },
    },
});
