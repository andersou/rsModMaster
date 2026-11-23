import { render } from 'solid-js/web';
import { App } from './App';
import { isMac } from './platform';
import './styles.css';

// espaço dos botões de janela do macOS na barra de título própria (`.mac .titlebar` no CSS)
document.documentElement.classList.toggle('mac', isMac);

render(() => <App />, document.getElementById('root')!);
