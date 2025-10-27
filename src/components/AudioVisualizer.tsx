import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  type: 'bars' | 'wave' | 'circular' | 'spectrum';
  isPlaying: boolean;
}

export const AudioVisualizer = ({ analyser, type, isPlaying }: AudioVisualizerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isPlaying) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgba(10, 10, 15, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (type === 'bars') {
        drawBars(ctx, dataArray, canvas.width, canvas.height);
      } else if (type === 'wave') {
        drawWave(ctx, dataArray, canvas.width, canvas.height);
      } else if (type === 'circular') {
        drawCircular(ctx, dataArray, canvas.width, canvas.height);
      } else if (type === 'spectrum') {
        drawSpectrum(ctx, dataArray, canvas.width, canvas.height);
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, type, isPlaying]);

  const drawBars = (ctx: CanvasRenderingContext2D, data: Uint8Array, width: number, height: number) => {
    const barWidth = width / data.length * 2.5;
    let x = 0;

    for (let i = 0; i < data.length; i++) {
      const barHeight = (data[i] / 255) * height * 0.8;
      
      const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
      gradient.addColorStop(0, `hsl(${271 + i * 0.5}, 91%, 65%)`);
      gradient.addColorStop(1, `hsl(${260}, 91%, 55%)`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
      
      x += barWidth;
    }
  };

  const drawWave = (ctx: CanvasRenderingContext2D, data: Uint8Array, width: number, height: number) => {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'hsl(271, 91%, 65%)';
    ctx.beginPath();

    const sliceWidth = width / data.length;
    let x = 0;

    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 255;
      const y = v * height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();
  };

  const drawCircular = (ctx: CanvasRenderingContext2D, data: Uint8Array, width: number, height: number) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3;

    for (let i = 0; i < data.length; i++) {
      const angle = (i / data.length) * Math.PI * 2;
      const barHeight = (data[i] / 255) * radius;

      const x1 = centerX + Math.cos(angle) * radius;
      const y1 = centerY + Math.sin(angle) * radius;
      const x2 = centerX + Math.cos(angle) * (radius + barHeight);
      const y2 = centerY + Math.sin(angle) * (radius + barHeight);

      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, `hsl(${271 + i * 0.5}, 91%, 65%)`);
      gradient.addColorStop(1, `hsl(${260}, 91%, 75%)`);

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  };

  const drawSpectrum = (ctx: CanvasRenderingContext2D, data: Uint8Array, width: number, height: number) => {
    const barWidth = width / data.length;

    for (let i = 0; i < data.length; i++) {
      const barHeight = (data[i] / 255) * height;
      
      const hue = 271 + (i / data.length) * 30;
      ctx.fillStyle = `hsl(${hue}, 91%, ${65 - (barHeight / height) * 20}%)`;
      ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={200}
      className="w-full h-full rounded-lg"
    />
  );
};
