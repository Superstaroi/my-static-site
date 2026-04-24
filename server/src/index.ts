import { app } from './app';
import { env } from './config/env';
import { configureNetworkProxy } from './utils/networkProxy';

configureNetworkProxy()
  .catch(error => {
    console.warn(`[network-proxy] initialization warning: ${error instanceof Error ? error.message : String(error)}`);
  })
  .finally(() => {
    app.listen(env.port, '0.0.0.0', () => {
      console.info(`[vxstudio-server] listening on http://0.0.0.0:${env.port}`);
    });
  });
