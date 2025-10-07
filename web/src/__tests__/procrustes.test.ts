import { procrustesRMSE, regionalProcrustesSimilarity } from '@/lib/geometry';

const rot = (p: {x:number;y:number}, ang:number, s=1, t={x:0,y:0}) => ({
  x: s*(p.x*Math.cos(ang)-p.y*Math.sin(ang)) + t.x,
  y: s*(p.x*Math.sin(ang)+p.y*Math.cos(ang)) + t.y,
});

describe('procrustes', () => {
  it('rmse ~ 0 under sim transform', () => {
    const a = [ {x:-1,y:0},{x:1,y:0},{x:0,y:1},{x:0,y:-1} ];
    const b = a.map(p => rot(p, Math.PI/6, 1.4, {x:2,y:-3}));
    const { rmse } = procrustesRMSE(a,b);
    expect(rmse).toBeLessThan(1e-6);
  });

  it('regional similarity decreases with noise', () => {
    const a = [ {x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1} ];
    const b = a.map(p => rot(p, 0.1, 1.0, {x:0.2,y:-0.1}));
    const idx = [0,1,2,3];
    const sim1 = regionalProcrustesSimilarity(a,b,idx);
    // Non-similarity distortion (anisotropic scaling) should reduce similarity
    const noisy = b.map(p => ({x: p.x * 1.2, y: p.y * 0.8}));
    const sim2 = regionalProcrustesSimilarity(a,noisy,idx);
    expect(sim1).toBeGreaterThan(sim2);
  });
});
