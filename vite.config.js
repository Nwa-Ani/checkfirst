import { defineConfig } from 'vite';
import { appCheckDefines, shouldUseAppCheckDebug } from './vite.appcheck.js';

export default defineConfig(({ command, mode }) => ({
  define: appCheckDefines(shouldUseAppCheckDebug(command, mode)),
}));
