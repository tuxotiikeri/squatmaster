import type {Measurement} from './analysis.ts';
import {chartScale,normalizedCurve,repColor,SIGNALS,SIGNAL_GUIDES} from './report.ts';
import type {Signal} from './report.ts';
export default function Curve({result,signal}:{result:Measurement;signal:Signal}){
  const {min,max}=chartScale(result.reps,signal),x=(p:number)=>180+p/100*830,y=(v:number)=>285-(v-min)/(max-min)*250;
  const guide=SIGNAL_GUIDES[signal];
  return <div className="chart-card"><h3>{SIGNALS[signal]} <span className="metric-help"><button aria-label={`Explain ${SIGNALS[signal]}`} aria-describedby={`help-${signal}`}>?</button><span id={`help-${signal}`} role="tooltip"><strong>{guide.description}</strong><p><b>Positive (+)</b><br/>{guide.positiveHelp}</p><p><b>Negative (−)</b><br/>{guide.negativeHelp}</p><p><b>Zero (0°)</b><br/>{guide.zeroHelp}</p></span></span></h3><svg viewBox="0 0 1040 340" role="img" aria-label={`${SIGNALS[signal]} across each movement cycle`}>
    {[...new Set([min,-10,0,10,max])].map(v=><g key={v}><line x1="180" x2="1010" y1={y(v)} y2={y(v)} className={v===0?'chart-zero':'chart-guide'} strokeDasharray={v===0?undefined:'6 6'}/><text className="axis-tick" x="162" y={y(v)+7} textAnchor="end">{v}°</text></g>)}
    <line x1={x(50)} x2={x(50)} y1="35" y2="285" className="chart-guide cycle-midpoint" strokeDasharray="6 6"/>
    <text className="direction-label" x="10" y={y(max/2)-5}>{guide.positive.map((s,i)=><tspan key={s} x="10" dy={i?24:0}>{s}</tspan>)}</text>
    <text className="direction-label" x="10" y={y(min/2)-5}>{guide.negative.map((s,i)=><tspan key={s} x="10" dy={i?24:0}>{s}</tspan>)}</text>
    {[0,25,50,75,100].map(p=><text className="axis-tick" key={p} x={x(p)} y="320" textAnchor="middle">{p}%</text>)}
    {result.reps.map((r,i)=><path key={r.number} d={normalizedCurve(r,signal).map((p,j)=>`${j?'L':'M'}${x(p.percent)},${y(p.value)}`).join(' ')} stroke={repColor(result,i)} fill="none" strokeWidth="3"/>)}
  </svg><div className="chart-axis"><span>Descent · 0–50%</span><span>50%: deepest position</span><span>Ascent · 50–100%</span></div></div>;
}
