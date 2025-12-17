import { useRef } from 'react';

export function useSound(url: string, volume = 1) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = () => {
    if (!audioRef.current) {
      audioRef.current = new window.Audio(url);
      audioRef.current.volume = volume;
    } else {
      audioRef.current.currentTime = 0;
    }
    audioRef.current.play();
  };

  return play;
}

