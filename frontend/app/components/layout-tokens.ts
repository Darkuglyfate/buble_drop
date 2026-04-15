export type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8;
export type Padding = 0 | 2 | 3 | 4 | 5 | 6 | 8;

export const GAP_REM: Record<Gap, string> = {
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
};

export const PADDING_REM: Record<Padding, string> = {
  0: "0",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
};
