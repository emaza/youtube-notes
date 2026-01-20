
import { Injectable } from '@angular/core';
import { GoogleGenAI, Chat, Content } from "@google/genai";

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: { title: string; uri: string }[];
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;
  private chatSession: Chat | null = null;

  constructor() {
    const apiKey = (process.env as any).API_KEY;
    if (!apiKey) {
      console.error("API_KEY environment variable not set.");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  // Initializes a new chat session specific to the video URL with metadata and language preference
  startChat(
    videoUrl: string, 
    videoId: string, 
    videoTitle: string, 
    previousHistory: ChatMessage[] = [],
    languageCode: string = 'es'
  ) {
    const titleContext = videoTitle ? `Video Title: "${videoTitle}"` : 'Video title unknown, try to deduce it.';
    
    // Map internal ChatMessage to SDK Content format for history
    const history: Content[] = previousHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    // Map code to full language name for the prompt
    const languageMap: Record<string, string> = {
      'es': 'Spanish (Español)',
      'en': 'English',
      'fr': 'French (Français)',
      'de': 'German (Deutsch)',
      'it': 'Italian (Italiano)',
      'pt': 'Portuguese (Português)'
    };
    
    const targetLanguage = languageMap[languageCode] || 'English';

    this.chatSession = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      history: history,
      config: {
        tools: [{ googleSearch: {} }], 
        systemInstruction: `You are an expert assistant tasked with analyzing YouTube videos.
        
        VIDEO CONTEXT:
        URL: ${videoUrl}
        ID: ${videoId}
        ${titleContext}
        
        CRITICAL INSTRUCTIONS:
        1. You cannot "watch" the video directly. You MUST use the 'googleSearch' tool to find information about it.
        2. Do NOT search for the URL alone. Search for "${videoTitle} summary", "${videoTitle} transcript", or the video ID "${videoId}".
        3. Synthesize the information found to answer the user.
        4. Be clear, structured, and helpful.
        5. OUTPUT LANGUAGE RULE: You MUST answer strictly in ${targetLanguage}, regardless of the language of the source material.`
      }
    });
  }

  async sendMessage(message: string): Promise<ChatMessage> {
    if (!this.chatSession) {
      throw new Error('Chat session not initialized. Please provide a video URL first.');
    }

    try {
      const response = await this.chatSession.sendMessage({ message });
      
      const text = response.text || 'Lo siento, no pude generar una respuesta. Intenta ser más específico o pedirme que busque el título del video en Google.';
      
      // Extract sources if available
      const sources: { title: string; uri: string }[] = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      
      if (chunks) {
        chunks.forEach((chunk: any) => {
          if (chunk.web?.uri) {
            sources.push({
              title: chunk.web.title || chunk.web.uri,
              uri: chunk.web.uri
            });
          }
        });
      }
      
      const uniqueSources = sources.filter((v, i, a) => a.findIndex(t => t.uri === v.uri) === i);

      return { 
        role: 'model', 
        text, 
        sources: uniqueSources 
      };

    } catch (error) {
      console.error('Error sending message to Gemini:', error);
      throw new Error('Error al conectar con la IA. Por favor intenta de nuevo.');
    }
  }
}
