import { useRef, useEffect, useCallback } from "react";

interface WaveformProps {
  peaks: number[];
  progress: number; // 0-1
  onSeek: (fraction: number) => void;
}

export default function Waveform({ peaks, progress, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const barWidth = width / peaks.length;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth;
      const barHeight = peaks[i] * centerY * 0.9;
      const iPlayed = i / peaks.length < progress;

      ctx.fillStyle = iPlayed ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.25)";

      // Top half
      ctx.fillRect(x, centerY - barHeight, Math.max(barWidth - 0.5, 0.5), barHeight);
      // Bottom half (mirror)
      ctx.fillRect(x, centerY, Math.max(barWidth - 0.5, 0.5), barHeight * 0.6);
    }

    // Playhead line
    const playX = progress * width;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();
  }, [peaks, progress]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, fraction)));
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-pointer"
      onClick={handleClick}
    />
  );
}
