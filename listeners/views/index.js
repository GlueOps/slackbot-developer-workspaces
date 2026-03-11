import vmCreateModalCallback from './vm-create-modal.js';
import vmEditModalCallback from './vm-edit-modal.js';

export default function register(app) {
  app.view('vm-create-modal', vmCreateModalCallback);
  app.view('vm-edit-modal', vmEditModalCallback);
}
