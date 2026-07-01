# Pressure-Volume Work Lab

Static HTML/CSS/JavaScript draft for a Week 7 pressure-volume work activity.

Open `index.html` directly or serve this folder with any static file server.

## Model

- Dry air ideal gas with `Rd = 287 J kg-1 K-1`.
- Constant gas-1 mass from the initial state: `pV = mRdT`.
- Initial gas 1: `p = 1000 hPa`, `T = 288.15 K`, `V = 1 m³`.
- Gas 2 reservoir: `T = 288.15 K`, adjustable pressure from `500` to `2000 hPa`.
- First-law integration between clicks: `m cv dT/dt = Qdot - p dV/dt`.
- `cv = 718 J kg-1 K-1`.
- Heat and cool controls apply instantaneous `+/- 10 kJ` pulses at the current volume.
- Conductive piston mode applies Newtonian relaxation toward gas-2 temperature with a `3 s` e-folding time.
- Damped piston: `dV/dt` is proportional to `p1 - p2`, with numerical rate limits and hard stops at `V = 0.25 m³` and `V = 2.0 m³`.

The path plotted on the `p-α` diagram is the simulated gas-1 trajectory. Dashed references show the initial-state isothermal and reversible dry adiabatic curves.
