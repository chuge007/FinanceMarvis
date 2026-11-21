import { memo, useRef, useEffect } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  lineWidth?: number;
  fillBelow?: boolean;
}

export const Sparkline = memo(function Sparkline({
  data,
  width = 80,
  height = 24,
  color = '#4078ff',
  lineWidth = 1.5,
  fillBelow = true,
}: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = (width - 2) / (data.length - 1);

    ctx.clearRect(0, 0, width, height);

    if (fillBelow) {
      ctx.beginPath();
      ctx.moveTo(1, height);
      data.forEach((v, i) => {
        const x = 1 + i * stepX;
        const y = height - 2 - ((v - min) / range) * (height - 6);
        ctx.lineTo(x, y);
      });
      ctx.lineTo(1 + (data.length - 1) * stepX, height);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, color.replace(')', ',0.15)').replace('rgb', 'rgba'));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    data.forEach((v, i) => {
      const x = 1 + i * stepX;
      const y = height - 2 - ((v - min) / range) * (height - 6);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data, width, height, color, lineWidth, fillBelow]);

  return <canvas ref={canvasRef} style={{ width, height }} className="inline-block" />;
});
