import { Component, ChangeDetectionStrategy, input, output, signal, computed, inject } from '@angular/core';
import { SpeechService } from '../../services/speech.service';
import { SpeechPassage, passageLabel, passagePreview } from '../../utils/speech-text';

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
      min-width: 0;
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
  /** Part to read, from the user's cursor or selection; null reads the whole `text`. */
  passage = input<SpeechPassage | null>(null);
  /** The user wants to read from the beginning again. */
  clearStart = output<void>();

  speech = inject(SpeechService);

  /** Passage of the reading started here, kept while it plays even if the cursor moves. */
  private playing = signal<SpeechPassage | null>(null);
  isPlaying = computed(() => this.speech.speaking() === this.owner());
  shown = computed(() => this.isPlaying() ? this.playing() : this.passage());
  label = computed(() => {
    const shown = this.shown();
    return shown && { ...passageLabel(shown), toEnd: shown.toEnd, preview: passagePreview(shown) };
  });

  play() {
    const passage = this.passage();
    this.playing.set(passage);
    if (passage) this.speech.speakText(this.owner(), passage.text, this.language());
    else this.speech.speak(this.owner(), this.text(), this.language());
  }
}
