import vmModalCallback from './vm-modal.js';

export default function register(app) {
  app.view('vm-modal', vmModalCallback);
}
