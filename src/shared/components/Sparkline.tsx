import { memo, useRef, useEffect } from 'react';

type Baseline = 'first' | 'zero' | 'min';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  lineWidth?: number;
  fillBelow?: boolean;
  /** first=相对首值变化（默认，避免 min-max 夸大波动）；zero=零基线；min=旧版极值拉伸 */
  baseline?: Baseline;
}

export const Sparkline = memo(function Sparkline({
  data,
  width = 80,
  height = 24,
  color = '#4078ff',
  lineWidth = 1.5,
  fillBelow = true,
  baseline = 'first',
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

    const first = data[0] || 1;
    const scaled = data.map((v) => (baseline === 'first' ? v / first - 1 : v));
    let lo: number;
    let hi: number;
    if (baseline === 'min') {
      const rawMin = Math.min(...scaled);
      const rawMax = Math.max(...scaled);
      const pad = (rawMax - rawMin || 1) * 0.08;
      lo = rawMin - pad;
      hi = rawMax + pad;
    } else {
      const extent = Math.max(...scaled.map((v) => Math.abs(v)), 0.0001) * 1.05;
      lo = -extent;
      hi = extent;
    }
    const range = hi - lo || 1;
    const stepX = (width - 2) / (data.length - 1);
    const yOf = (v: number) => height - 2 - ((v - lo) / range) * (height - 6);

    ctx.clearRect(0, 0, width, height);

    // 零线：相对首值/零基线时保留参照，避免把微小波动画成大起大落。
    if (baseline !== 'min') {
      const y0 = yOf(0);
      ctx.beginPath();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.moveTo(1, y0);
      ctx.lineTo(width - 1, y0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (fillBelow) {
      ctx.beginPath();
      ctx.moveTo(1, height);
      scaled.forEach((v, i) => ctx.lineTo(1 + i * stepX, yOf(v)));
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
    scaled.forEach((v, i) => {
      const x = 1 + i * stepX;
      const y = yOf(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data, width, height, color, lineWidth, fillBelow, baseline]);

  return <canvas ref={canvasRef} style={{ width, height }} className="inline-block" />;
});
