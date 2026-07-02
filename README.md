# Pressure-Volume Work Lab

Static HTML/CSS/JavaScript draft for a Week 7 pressure-volume work activity.

Open `index.html` directly or serve this folder with any static file server.

## Model

- Dry air ideal gas with `Rd = 287 J kg-1 K-1`.
- Constant gas-1 mass from the initial state: `pV = mRdT`.
- Initial gas 1: `p = 1000 hPa`, `T = 288.15 K`, `V = 0.5 m³`, giving about `0.605 kg`.
- Gas 2 reservoir: `T = 288.15 K`, adjustable pressure from `500` to `2000 hPa`.
- Ambient pressure changes at `350 hPa s-1` while the pressure controls are held.
- First-law integration over time: `m cv dT/dt = Qdot - p dV/dt`.
- `cv = 718 J kg-1 K-1`.
- Heat and cool controls apply `+/- 70 kW` while held.
- Manual heating stops at `580 K` and manual cooling stops at `140 K`; compression, expansion, and conduction are not temperature-clamped.
- The gas color scale preserves the original range from `140 K` to `580 K`, then darkens further if piston motion drives the gas colder or hotter.
- Conductive piston mode applies Newtonian relaxation toward gas-2 temperature with a `3 s` e-folding time; checked `Insulated` mode removes that conductive exchange.
- Checked `Locked` mode holds the piston fixed so gas-1 volume remains constant.
- Damped piston: `dV/dt` is proportional to `p1 - p2`, with numerical rate limits and hard stops at `V = 0 m³` and `V = 2.0 m³`. The cylinder size is unchanged from the earlier draft.

The path plotted on the `p-α` diagram is the simulated gas-1 trajectory. Dashed references show the initial-state isothermal and reversible dry adiabatic curves.
