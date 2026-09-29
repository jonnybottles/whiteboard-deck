import './styles.css';
import { deck } from './content/deck.ts';
import { validateDeck } from './engine/validate.ts';
import { Presentation } from './ui/player.ts';

try {
  validateDeck(deck);
  new Presentation(deck);
} catch (error) {
  console.error(error);
  const alert = document.getElementById('error');
  if (alert) {
    alert.hidden = false;
    alert.textContent = `Unable to start the whiteboard: ${error instanceof Error ? error.message : String(error)}`;
  }
  document.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>('button, select, input').forEach((control) => { control.disabled = true; });
}
