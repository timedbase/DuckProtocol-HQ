// Pure display helpers with no on-chain equivalent (number/age formatting).
// Color tokens live in styles.css as CSS custom properties; JS-side
// references to them (for cases that compute a color and hand it to an
// inline style) are plain 'var(--x)' strings, defined alongside each
// component that needs them rather than duplicated here.
export const money = n => n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + Math.round(n);
export const ageLabel = m => m < 1 ? "just now" : m < 60 ? m + "m" : m < 1440 ? Math.floor(m / 60) + "h" : Math.floor(m / 1440) + "d";
