/**
 * The face on Home → Educate yourself (the skin scan card) and the scan's
 * intro: a real, unretouched, front-facing phone selfie (supplied by Atlas,
 * cleared for this use), run through the same Perfect Corp scan patients get.
 *
 * `after` is Perfect Corp's skin simulation of `before`, and every chip score
 * is real: `before` from analyzing the selfie, `after` from analyzing the
 * simulation (overall 74.5 → 85, 2026-11-10).
 */
export const EDUCATE_SAMPLE = {
  before: "/skin-scan/sample-before.jpg",
  /** Perfect Corp skin simulation of `before`. null = not generated yet (the card then shows the scan only). */
  after: "/skin-scan/sample-after.jpg" as string | null,
  width: 480,
  height: 640,
  /** Vertical slice of the photo the card shows (fractions of its height): hairline to just under the chin. */
  frame: [0.12, 0.87] as [number, number],
  /** Chips over the face, in % of the card's photo: Perfect Corp ui_scores before → on the AI preview. */
  chips: [
    { label: "Fine lines", before: 72, after: 90, x: 58, y: 13 },
    { label: "Under-eye puffiness", before: 67, after: 82, x: 3, y: 47 },
    { label: "Sun spots", before: 78, after: 94, x: 62, y: 63 },
  ],
  /** MediaPipe face landmarks on `before` (normalized): 36-point outline, then brows, eyes, nose, lips, cheeks. */
  pts: [[0.499,0.222],[0.593,0.224],[0.673,0.234],[0.744,0.255],[0.788,0.286],[0.811,0.326],[0.821,0.37],[0.823,0.423],[0.819,0.474],[0.811,0.528],[0.799,0.584],[0.781,0.644],[0.756,0.693],[0.725,0.729],[0.683,0.76],[0.646,0.78],[0.606,0.797],[0.559,0.809],[0.499,0.812],[0.44,0.809],[0.394,0.796],[0.356,0.779],[0.321,0.759],[0.283,0.728],[0.254,0.692],[0.231,0.643],[0.212,0.582],[0.197,0.526],[0.188,0.474],[0.181,0.423],[0.182,0.37],[0.191,0.326],[0.214,0.285],[0.257,0.254],[0.326,0.233],[0.405,0.224],[0.216,0.353],[0.241,0.331],[0.285,0.32],[0.346,0.323],[0.419,0.333],[0.573,0.336],[0.646,0.329],[0.708,0.326],[0.754,0.337],[0.781,0.357],[0.275,0.413],[0.306,0.401],[0.358,0.399],[0.414,0.419],[0.364,0.426],[0.314,0.428],[0.587,0.42],[0.643,0.4],[0.695,0.402],[0.727,0.414],[0.687,0.428],[0.637,0.426],[0.498,0.402],[0.498,0.433],[0.497,0.46],[0.496,0.484],[0.495,0.511],[0.495,0.542],[0.495,0.566],[0.42,0.579],[0.577,0.581],[0.38,0.663],[0.409,0.653],[0.464,0.64],[0.499,0.647],[0.535,0.641],[0.594,0.654],[0.626,0.665],[0.595,0.685],[0.535,0.706],[0.498,0.708],[0.462,0.706],[0.408,0.684],[0.268,0.538],[0.735,0.538],[0.308,0.569],[0.694,0.569],[0.246,0.478],[0.757,0.478]] as [number, number][],
};
