import baseConfig from '@extension/tailwindcss-config';
import { withUI } from '@extension/ui';
import plugin from 'tailwindcss/plugin';

export default withUI({
  ...baseConfig,
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  plugins: [
    // #app-container is an inline-size container, so layout decisions follow the
    // panel's own content width instead of the window width. 38rem matches the
    // widest one-row measurement (Turkish tabs plus the longest scan label).
    plugin(({ addVariant }) => {
      addVariant('wide', '@container (min-width: 38rem)');
    }),
  ],
});
