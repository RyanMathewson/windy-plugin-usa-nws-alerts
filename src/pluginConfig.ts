import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-usa-nws-alerts',
    version: '1.0.0',
    title: 'USA NWS Alerts',
    icon: '⚠️',
    description: 'Displays alerts from the USA National Weather Service.',
    author: 'Ryan Mathewson',
    repository: 'https://github.com/RyanMathewson/windy-plugin-usa-nws-alerts',
    desktopUI: 'rhpane',
    mobileUI: 'small',
    desktopWidth: 400,
    routerPath: '/usa-nws-alerts',
    listenToSingleclick: true,
};

export default config;
