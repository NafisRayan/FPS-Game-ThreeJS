# OVERGROWTH — 3D First-Person Shooter

A browser-based first-person shooter built with **React**, **Three.js**, **React Three Fiber**, and **Rapier** physics. Featuring a procedurally generated arena, wave-based enemy encounters, hit-scaling mechanics, and a fully functional combat system.

## Overview

OVERGROWTH is a fast-paced 3D FPS where you pilot a character through a procedurally generated arena, fighting waves of enemies. The game combines realistic PBR environments with rapid-paced gameplay, featuring:

- **Procedural Arena** — A large outdoor environment with terrain, sky, and lighting rig
- **Wave-Based Combat** — Enemies spawn in increasing difficulty waves
- **Hit Detection** — Hit-scaling based on proximity and timing
- **Combat System** — Reload, healing, ammo management, and damage tracking
- **Multiple Controls** — Keyboard, touchscreen, and mouse inputs
- **Visual Feedback** — Particle effects, flash bursts, and dynamic lighting

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + Vite |
| 3D Engine | Three.js + @react-three/fiber |
| Physics | Rapier (realistic rigid-body physics) |
| State Management | Zustand |
| Audio | Custom audio system with SFX |
| Build Tooling | Vite (with vite-plugin-singlefile) |

## Installation

```bash
# Clone or navigate to the project root
cd build-3d-fps-game

# Install dependencies
npm install

# Start the development server
npm run dev
```

The game runs locally in the browser. Access it at `http://localhost:5173`.

## Gameplay

### Core Mechanics

- **Movement** — Walk, jump, and sprint using WASD or arrow keys
- **Combat** — Aim and fire at enemies with a hit-consequence system
- **Waves** — Enemies spawn in waves; each wave increases difficulty
- **Health & Damage** — Take damage upon contact; heal with reserves
- **Reloading** — Manage ammunition and reserve capacity

### Enemy Behavior

- **Wave Generation** — Waves contain varying numbers of enemies (5–10 per wave)
- **AI** — Simple pursuit AI that chases the player
- **HP Scaling** — Later waves feature armored enemies (2 HP)
- **Death Effects** — Visual death bursts and particle explosions

## Project Structure

```
build-3d-fps-game/
├── src/
│   ├── main.tsx           # Entry point (Vite)
│   ├── App.tsx            # Root component
│   ├── index.css          # Global styles & Tailwind
│   ├── main.ts             # React app initialization
│   ├── game/
│   │   ├── store.ts       # Zustand game state
│   │   ├── Player.tsx     # Player character & controls
│   │   ├── Enemies.tsx    # Wave management & enemy rendering
│   │   ├── Input.tsx      # Input handling (keyboard/mouse/touch)
│   │   ├── Ref.ts         # Low-level game refs (physics, audio)
│   │   └── Viewmodel.ts   # Weapon & aim system
│   ├── utils/
│   │   └── cn.ts          # Utility functions
│   └── assets/
│       └── hdri/          # HDRI sky textures (polyhaven)
└── package.json
```

## Controls

### Keyboard/Mouse
| Action | Key / Button |
|--------|--------------|
| Move forward | `W` |
| Move backward | `S` |
| Strafe left | `A` |
| Strafe right | `D` |
| Jump | `Space` |
| Fire | `Mouse Click` / `R` |
| Reload | `R` |
| Toggle settings | `M` |
| Pause/Unpause | `P` |

### Touch / Mobile
- Tap to start/stop
- Swipe to look around
- Press `R` to reload
- Adjust sensitivity via settings

## Development

### Building

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Testing

- The game uses procedural generation and deterministic physics
- No unit tests are included; focus is on runtime behavior
- All assets are loaded from CDN (HDRI skies, textures)

## Assets

- **HDRI Sky** — Photorealistic environment maps from Poly Haven
- **Textures** — PBR materials for terrain, walls, and foliage
- **Audio** — Custom sound effects (SFX) implemented via Web Audio API

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

## License

MIT License — feel free to use and modify for personal or commercial projects.

## Acknowledgments

- **Poly Haven** — HDRI sky textures
- **Three.js** — 3D engine
- **React Three Fiber** — React integration for 3D
- **Rapier** — Physics engine
- **Tailwind CSS** — Styling framework

## Quick Start

1. Navigate to the project directory
2. Run `npm install` to install dependencies
3. Launch with `npm run dev`
4. Play! Explore the arena, fight waves, and survive.

Enjoy the chaos of OVERGROWTH! 🎮
