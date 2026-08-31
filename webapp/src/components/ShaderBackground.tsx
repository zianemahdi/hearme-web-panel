import React, { useEffect, useRef } from 'react';

/**
 * Fond animé « light ripple » : arcs de lumière concentriques, dispersés en
 * couleur et tranchés par une grille diagonale. Tout l'effet tient dans le
 * fragment shader ci-dessous.
 *
 * Écrit en WebGL BRUT, volontairement : la version d'origine de cet effet passe
 * par Three.js, qui n'y sert qu'à créer un plan plein écran et un contexte —
 * une quarantaine de lignes ici. Three.js avait déjà été retiré du panneau
 * (« remove 3D background », commit 745b3c0) et le bundle dépasse le seuil
 * d'alerte de Vite : le rendu est identique, pour 0 Ko ajouté.
 */
export type ShaderBackgroundProps = {
  /** Multiplicateur de vitesse (1 = normal, 0 = figé). */
  speed?: number;
  /** Épaisseur des traits lumineux. */
  lineWidth?: number;
  /** Séparation chromatique (look spectre). Ignoré si `tint` est fourni. */
  dispersion?: number;
  /** Teinte monochrome [r,g,b] en 0–1. `null` = spectre complet. */
  tint?: [number, number, number] | null;
  /** Intensité globale. */
  brightness?: number;
  className?: string;
};

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float uLineWidth;
uniform float uDispersion;
uniform vec3 uTint;
uniform float uUseTint;
uniform float uBrightness;

void main(void) {
  vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
  float t = time * 0.05;
  vec3 color = vec3(0.0);
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 5; i++) {
      color[j] += uLineWidth * float(i * i) /
        abs(fract(t - uDispersion * float(j) + float(i) * 0.01) * 5.0
            - length(uv) + mod(uv.x + uv.y, 0.2));
    }
  }
  float mono = (color.r + color.g + color.b) / 3.0;
  vec3 finalColor = mix(color, mono * uTint, uUseTint);
  gl_FragColor = vec4(finalColor * uBrightness, 1.0);
}`;

export const ShaderBackground: React.FC<ShaderBackgroundProps> = ({
  speed = 1,
  lineWidth = 0.002,
  dispersion = 0.01,
  tint = null,
  brightness = 1,
  className = 'fixed inset-0 w-full h-full',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Les réglages passent par une ref : le shader tourne en continu sans
  // relancer l'effet (donc sans recréer le contexte) à chaque changement.
  const cfg = useRef({ speed, lineWidth, dispersion, tint, brightness });
  cfg.current = { speed, lineWidth, dispersion, tint, brightness };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    // Pas de WebGL (vieux navigateur, accélération désactivée) : on laisse le
    // fond du parent, la page reste parfaitement utilisable.
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('Shader:', gl.getShaderInfoLog(s));
      }
      return s;
    };

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Un seul triangle qui déborde de l'écran : moins de sommets qu'un quad.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u('resolution'), uTime = u('time'), uLW = u('uLineWidth');
    const uDisp = u('uDispersion'), uTintL = u('uTint');
    const uUse = u('uUseTint'), uBright = u('uBrightness');

    // On mesure la FENÊTRE, pas le canevas : au montage, clientWidth vaut encore
    // 0, et un <canvas> sans taille CSS effective retombe sur son attribut width
    // — il resterait donc bloqué à 0 pour toujours.
    // La vérification est refaite à CHAQUE image plutôt qu'au seul événement
    // resize : si la page démarre dans un onglet masqué ou un conteneur encore
    // sans dimensions, innerWidth vaut 0 et aucun resize ne suit — le fond
    // resterait noir. Ici, il se répare tout seul dès que la taille existe.
    const syncSize = () => {
      // Plafonné à 2 : au-delà, le coût grimpe sans gain visible.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (w === canvas.width && h === canvas.height) return;
      if (w === 0 || h === 0) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    syncSize();

    // Respecte le réglage système « réduire les animations » : image figée.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let time = 1.0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      syncSize();
      const c = cfg.current;
      time += 0.05 * (reduced ? 0 : c.speed);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uLW, c.lineWidth);
      gl.uniform1f(uDisp, c.dispersion);
      gl.uniform3fv(uTintL, c.tint || [1, 1, 1]);
      gl.uniform1f(uUse, c.tint ? 1.0 : 0.0);
      gl.uniform1f(uBright, c.brightness);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      // Libère le contexte : sans ça, naviguer beaucoup finit par épuiser le
      // nombre de contextes WebGL autorisés par le navigateur.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      // Styles critiques en inline : le dimensionnement du fond ne doit dépendre
      // d'aucune classe utilitaire qui pourrait manquer ou être purgée.
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        background: '#000',
        pointerEvents: 'none',
      }}
    />
  );
};
