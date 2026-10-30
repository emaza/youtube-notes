
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.component.html'
})
export class HeaderComponent {
  url = input.required<string>();
  
  urlChange = output<string>();
  openSettings = output<void>();
  clearUrl = output<void>();

  onUrlInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.urlChange.emit(input.value);
  }
}
