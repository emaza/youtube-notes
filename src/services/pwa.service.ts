
import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private deferredPrompt: any = null;
  
  // Signal to let the UI know installation is possible
  installable = signal(false);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        this.deferredPrompt = e;
        // Update UI notify the user they can add to home screen
        this.installable.set(true);
      });

      window.addEventListener('appinstalled', () => {
        // Clear the deferredPrompt so it can be garbage collected
        this.deferredPrompt = null;
        this.installable.set(false);
        console.log('PWA was installed');
      });
    }
  }

  async installPwa() {
    if (!this.deferredPrompt) {
      return;
    }
    // Show the prompt
    this.deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await this.deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    // We've used the prompt, and can't use it again, discard it
    this.deferredPrompt = null;
    this.installable.set(false);
  }
}
