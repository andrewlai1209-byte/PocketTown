import {Application} from './core/application.js';

try {
  new Application().start();
} catch (error) {
  console.error('Pocket Town startup failed:', error);
  const start = document.getElementById('start');
  start.style.display = 'grid';
  const card = start.firstElementChild;
  card.replaceChildren();
  const heading = document.createElement('h1');
  heading.textContent = 'The town could not start';
  const message = document.createElement('p');
  message.textContent = error.message || 'An unexpected error occurred.';
  const help = document.createElement('p');
  help.textContent = 'Open the game through Start Game.cmd. A browser with WebGL enabled is required.';
  const retry = document.createElement('button');
  retry.textContent = 'Try again';
  retry.onclick = () => location.reload();
  card.append(heading, message, help, retry);
}
