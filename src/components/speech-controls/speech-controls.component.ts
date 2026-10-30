import { Component, ChangeDetectionStrategy, input, inject } from '@angular/core';
import { SpeechService } from '../../services/speech.service';

/** Listen / pause / resume / stop buttons for reading a text aloud. */
@Component({
  selector: 'app-speech-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
  `],
  templateUrl: './speech-controls.component.html'
})
export class SpeechControlsComponent {
  /** What is read (e.g. a chat message); the buttons reflect its state in SpeechService. */
  owner = input.required<object>();
  text = input.required<string>();
  /** Settings language, used for the reading voice. */
  language = input('es');
  disabled = input(false);

  speech = inject(SpeechService);
}
