import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-usa-nws-alerts',
    version: '0.0.5',
    title: 'USA NWS Alerts',
    icon: '⚠️',
    description: 'Displays alerts from the USA National Weather Service.',
    author: 'Ryan Mathewson',
    repository: 'https://github.com/RyanMathewson/TBD',
    desktopUI: 'rhpane',
    mobileUI: 'small',
    desktopWidth: 400,
    routerPath: '/usa-nws-alerts',
};

export default config;
