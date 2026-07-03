# Pressure-Volume Work Lab

Static HTML/CSS/JavaScript draft for a Week 7 pressure-volume work activity.

Open `index.html` directly or serve this folder with any static file server.

## Model

- Dry air ideal gas with `Rd = 287 J kg-1 K-1`.
- Constant gas-1 mass from the initial state: `pV = mRdT`.
- Initial gas 1: `p = 1000 hPa`, `T = 288.15 K`, `V = 0.5 m³`, giving about `0.605 kg`.
- Gas 2 reservoir: `T = 288.15 K`, adjustable pressure from `500` to `2000 hPa`.
- Ambient pressure changes at `350 hPa s-1` while the pressure controls are held.
- First-law integration over time conserves gas-1 mass and keeps the energy accounting tied to the plotted process.
- `cv = 718 J kg-1 K-1`.
- Heat and cool controls apply `+/- 70 kW` while held.
- In insulated mode, manual heating stops at `580 K` and manual cooling stops at `140 K`; compression and expansion are not temperature-clamped.
- The gas color scale preserves the original range from `140 K` to `580 K`, then darkens further if piston motion drives the gas colder or hotter.
- If `Insulated` is unchecked, gas 1 instantly equilibrates to the ambient gas temperature. Any heat exchange needed to enforce that state is included in `Q`.
- Barrier model: gas 1 is continuously updated to the pressure-equilibrium volume `V = m Rd T / p_ambient`, within the cylinder stops; the displayed piston position then animates toward that thermodynamic state.
- Ambient-pressure adjustments with an insulated piston use the reversible adiabatic pressure-temperature relation.
- There is no locked-piston mode, so students cannot store an off-equilibrium gas state and then release it into an ambiguous work path.
- Boundary work is computed from the pressure-equilibrated process, so the visual piston motion does not add a separate piston energy sink/source to the gas-1 thermodynamics.
- `Clear path` also resets `Q`, `W by gas`, and the displayed `Delta U` reference at the current state.

The path plotted on the `p-α` diagram uses gas pressure. Dashed references show the initial-state isothermal and reversible dry adiabatic curves.
