/**
 * The face on Home → Educate yourself (the skin scan card). A real,
 * front-facing, unretouched portrait (Pexels photo 7298625 by Kindel Media,
 * Pexels license: free for commercial use), run through the same Perfect Corp
 * scan patients get.
 *
 * `after` and `scores` come from that scan: until they're filled in, the
 * card shows the scan without the before/after wipe.
 */
export const EDUCATE_SAMPLE = {
  before: "/skin-scan/educate-before.jpg",
  /** Perfect Corp skin simulation of `before`. null = not generated yet. */
  after: null as string | null,
  width: 900,
  height: 1597,
  /** Chips over the face: real Perfect Corp scores once generated, then the "after" scores on the preview. */
  chips: [
    { label: "Fine lines", before: 0, after: 0, x: 62, y: 20 },
    { label: "Dark circles", before: 0, after: 0, x: 4, y: 44 },
    { label: "Texture", before: 0, after: 0, x: 60, y: 66 },
  ],
  /** MediaPipe face landmarks on `before` (normalized): 36-point outline, then brows, eyes, nose, lips, cheeks. */
  pts: [[0.504,0.206],[0.634,0.208],[0.742,0.219],[0.84,0.243],[0.9,0.279],[0.935,0.325],[0.95,0.373],[0.954,0.433],[0.951,0.49],[0.945,0.549],[0.931,0.612],[0.904,0.677],[0.864,0.729],[0.817,0.765],[0.757,0.797],[0.705,0.819],[0.651,0.838],[0.586,0.853],[0.502,0.857],[0.417,0.854],[0.35,0.84],[0.293,0.82],[0.24,0.799],[0.176,0.767],[0.125,0.731],[0.082,0.679],[0.054,0.613],[0.037,0.55],[0.029,0.491],[0.023,0.434],[0.028,0.375],[0.047,0.326],[0.086,0.279],[0.154,0.243],[0.258,0.219],[0.371,0.208],[0.104,0.354],[0.144,0.329],[0.208,0.314],[0.295,0.313],[0.397,0.319],[0.613,0.319],[0.712,0.313],[0.795,0.313],[0.856,0.327],[0.893,0.351],[0.202,0.414],[0.243,0.398],[0.312,0.395],[0.386,0.421],[0.316,0.425],[0.25,0.426],[0.623,0.421],[0.696,0.395],[0.764,0.397],[0.806,0.412],[0.755,0.425],[0.69,0.425],[0.503,0.397],[0.503,0.431],[0.503,0.459],[0.503,0.485],[0.503,0.513],[0.502,0.547],[0.501,0.573],[0.382,0.596],[0.619,0.597],[0.322,0.699],[0.359,0.677],[0.447,0.653],[0.501,0.659],[0.555,0.653],[0.644,0.676],[0.683,0.697],[0.641,0.719],[0.554,0.741],[0.499,0.744],[0.445,0.742],[0.361,0.721],[0.168,0.552],[0.831,0.55],[0.227,0.585],[0.773,0.584],[0.139,0.486],[0.86,0.485]] as [number, number][],
};
