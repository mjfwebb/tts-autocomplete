import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'TTS Autocomplete',
    description: 'Autocomplete for the !tts command in Twitch chat',
    permissions: ['storage'],
    // The background script fetches the voice and sound names from here.
    host_permissions: ['https://nice.gg/*'],
    // Firefox-only settings. Chrome warns about this key, so only Firefox builds get it.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'tts-autocomplete@mjfwebb',
          // data_collection_permissions needs Firefox 140.
          strict_min_version: '140.0',
          // The extension sends no user data anywhere.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
