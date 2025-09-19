import button from './button-click.js';
import vmRegionCallback from './vm-region.js';

export default function register(app) {
  button(app);

  app.action('region', vmRegionCallback);
}
