
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: { title: string; uri: string }[];
}

interface ChatContext {
  videoId: string;
  videoTitle: string;
  history: ChatMessage[];
  language: string;
}

/**
 * Talks to Gemini through our own backend (`/api/chat`), so the API key never
 * reaches the browser. The backend is stateless: we send the history each time.
 */
@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private http = inject(HttpClient);
  private context: ChatContext | null = null;

  // Sets the video context (metadata, previous history and language) for the next messages
  startChat(
    videoUrl: string,
    videoId: string,
    videoTitle: string,
    previousHistory: ChatMessage[] = [],
    languageCode: string = 'es'
  ) {
    this.context = {
      videoId,
      videoTitle,
      history: previousHistory.map(({ role, text }) => ({ role, text })),
      language: languageCode
    };
  }

  async sendMessage(message: string): Promise<ChatMessage> {
    const context = this.context;
    if (!context) {
      throw new Error('Chat session not initialized. Please provide a video URL first.');
    }

    try {
      const response = await firstValueFrom(this.http.post<{ text: string; sources: ChatMessage['sources'] }>(
        '/api/chat',
        {
          videoId: context.videoId,
          videoTitle: context.videoTitle,
          language: context.language,
          history: context.history,
          message
        }
      ));

      const text = response.text || 'Lo siento, no pude generar una respuesta. Intenta ser más específico o pedirme que busque el título del video en Google.';
      context.history.push({ role: 'user', text: message }, { role: 'model', text });

      return {
        role: 'model',
        text,
        sources: response.sources ?? []
      };

    } catch (error) {
      console.error('Error sending message to Gemini:', error);
      const serverMessage = error instanceof HttpErrorResponse ? error.error?.error : null;
      throw new Error(serverMessage || 'Error al conectar con la IA. Por favor intenta de nuevo.');
    }
  }
}
