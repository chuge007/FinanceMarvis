/** 板块名 → 固定颜色：同一板块在任何页面颜色一致，且不受刷新影响。 */
const PALETTE = [
  '#4078ff', '#0ca678', '#f59e4b', '#9b6efb', '#e8590c', '#20c4d8',
  '#ff922b', '#f04452', '#38d9a9', '#748ffc', '#da77f2', '#12b886',
  '#fab005', '#e64980',
];

export function sectorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
