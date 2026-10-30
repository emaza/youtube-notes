
import { Injectable } from '@angular/core';

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

  async sendMessage(message: string, onText: (textSoFar: string) => void): Promise<ChatMessage> {
    const context = this.context;
    if (!context) {
      throw new Error('Chat session not initialized. Please provide a video URL first.');
    }

    const genericError = 'Could not connect to the AI. Please try again.';
    let response: Response;
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: context.videoId,
          videoTitle: context.videoTitle,
          language: context.language,
          history: context.history,
          message
        })
      });
    } catch (error) {
      console.error('Error sending message to Gemini:', error);
      throw new Error(genericError);
    }

    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || genericError);
    }

    let text = '';
    let sources: ChatMessage['sources'] = [];
    let done = false;

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    while (true) {
      const { value, done: streamDone } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (value) buffer += value;
      const lines = buffer.split('\n');
      buffer = streamDone ? '' : lines.pop()!;

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'text') {
          text += event.text;
          onText(text);
        } else if (event.type === 'done') {
          sources = event.sources ?? [];
          done = true;
        } else if (event.type === 'error') {
          throw new Error(event.error || genericError);
        }
      }
      if (streamDone) break;
    }

    if (!done) {
      throw new Error('The AI response was interrupted. Please try again.');
    }

    text ||= 'Sorry, I couldn\'t generate a response. Try being more specific or ask me to search Google for the video title.';
    context.history.push({ role: 'user', text: message }, { role: 'model', text });

    return { role: 'model', text, sources };
  }
}
