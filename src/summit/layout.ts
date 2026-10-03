// The summit frame, divided once.
//
// The page ends where the camera parks (t = 1), so the last screen is one fixed
// composition: the rail and its glass panel down the left, the chorten and its prayer flags
// on the crest right of centre, and the sun upper left, behind the panel's glass.
//
// Zones are fractions of the viewport. `tools/ui-audit/chorten.mjs` reads the same numbers
// when it checks where the chorten lands, so the scene and the layout cannot drift apart.

export interface Zone {
  x0: number
  x1: number
  y0: number
  y1: number
}

/**
 * The rail and an open panel, from 900px wide up (summit.css): the rail 24px in from the
 * left edge, the panel beside it, up to 560px wide and 80% of the height, centred. The x1
 * here is the panel's right edge at 1132x764, the narrowest frame the audits cover with
 * the side layout; at 1440 it ends at 52%. Below 900px the rail is a bar along the bottom
 * and the panel a sheet above it, and the chorten shows above the sheet instead.
 */
export const PANEL_ZONE: Zone = { x0: 0, x1: 0.57, y0: 0.1, y1: 0.9 }

/**
 * The rail fades in over this stretch of climb progress t, while the camera crests the
 * summit, so it is fully there by the time the view stops moving and never shares the
 * screen with the climb copy (the last text beat has gone by t = 0.8). Below the first
 * value it is hidden and out of the tab order.
 */
export const RAIL_REVEAL: [number, number] = [0.94, 0.99]
