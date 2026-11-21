// Shared Vite defines so production bundles never embed the App Check debug token,
// even though .env.local (loaded in every mode) may contain it.
export function appCheckDefines(useDebugToken) {
  if (useDebugToken) return {};
  return {
    'import.meta.env.VITE_APPCHECK_DEBUG_TOKEN': JSON.stringify(''),
    'import.meta.env.VITE_APPCHECK_DEBUG': JSON.stringify('false'),
  };
}

export function shouldUseAppCheckDebug(command, mode) {
  return command === 'serve' || mode === 'ext-dev';
}
