import vmCreateModalCallback from './vm-create-modal.js';
import vmEditModalCallback from './vm-edit-modal.js';
import vmDeleteModalCallback from './vm-delete-modal.js';
import vmDeleteConfirmModalCallback from './vm-delete-confirm-modal.js';

export default function register(app) {
  app.view('vm-create-modal', vmCreateModalCallback);
  app.view('vm-edit-modal', vmEditModalCallback);
  app.view('vm-delete-modal', vmDeleteModalCallback);
  app.view('vm-delete-confirm-modal', vmDeleteConfirmModalCallback);
}
