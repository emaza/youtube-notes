import { VideoType } from '../services/storage.service';

const VIDEO_ID_RE = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;

/** The 11-character video ID of any YouTube video or Shorts link, or null. */
export function extractVideoId(url: string): string | null {
  const match = url.match(VIDEO_ID_RE);
  return (match && match[2] && match[2].length === 11) ? match[2] : null;
}

/** Canonical link for a video, keeping the Shorts format. */
export function buildVideoUrl(videoId: string, type: VideoType): string {
  return type === 'short' ? `https://www.youtube.com/shorts/${videoId}` : watchUrl(videoId);
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
