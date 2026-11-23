import { api } from '../api';
import { app } from '../appStore';
import { Dialog } from './Dialog';

const REPO = 'https://github.com/andersou/rsModMaster';

export function AboutDialog() {
  return (
    <Dialog open={app.dialog() === 'about'} onClose={() => app.setDialog(null)} labelledBy="about-title">
      <h2 class="dialog-title" id="about-title">
        About rsModMaster
      </h2>
      <p>rsModMaster {__APP_VERSION__}</p>
      <p class="muted">
        Modbus RTU/TCP master in Rust and Tauri, successor of fModMaster and inspired by qModMaster. Responsible: Anderson Souza.
      </p>
      <p>
        <a href={REPO} onClick={(e) => (e.preventDefault(), api.openUrl(REPO))}>
          github.com/andersou/rsModMaster
        </a>
      </p>
      <p class="muted">Credits: qModMaster, libmodbus and fModMaster.</p>
      <div class="dialog-actions">
        <button class="btn primary" type="button" autofocus onClick={() => app.setDialog(null)}>
          OK
        </button>
      </div>
    </Dialog>
  );
}
