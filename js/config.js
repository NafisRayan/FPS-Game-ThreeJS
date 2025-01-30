// Game state variables
let score = 0;
let round = 1;
let moveSpeed = 0.15;
let mouseX = 0, mouseY = 0;
let target;
let ammo = 10;
let maxAmmo = 10;
let reloading = false;
let targets = [];
let isGameOver = false;
let health = 100;
let kills = 0;
let gameTime = 0;
let gameTimer;
let collisionObjects = [];

// Key state tracking
const keys = {};

// Three.js scene configuration
const sceneConfig = {
    background: 0x87CEEB,
    fogNear: 0,
    fogFar: 75,
    cameraFOV: 75,
    cameraNear: 0.1,
    cameraFar: 1000,
    playerHeight: 1.6,
    bounds: {
        x: 14,
        z: 14
    }
};

// Light configuration
const lightConfig = {
    ambient: {
        color: 0xffffff,
        intensity: 0.3
    },
    directional: {
        color: 0xffffff,
        intensity: 0.8,
        position: { x: -10, y: 20, z: 10 },
        shadow: {
            near: 0.1,
            far: 100,
            left: -20,
            right: 20,
            top: 20,
            bottom: -20,
            mapSize: 2048
        }
    }
};

// Ground configuration
const groundConfig = {
    size: { width: 50, height: 1, depth: 50 },
    position: { x: 0, y: -0.5, z: 0 },
    material: {
        color: 0x567d46,
        specular: 0x555555,
        shininess: 5,
        textureRepeat: 10
    }
};

// Wall configuration
const wallConfig = {
    material: {
        color: 0xaaaaaa,
        shininess: 10,
        bumpScale: 0.5
    }
};

// Export configurations
window.gameConfig = {
    scene: sceneConfig,
    light: lightConfig,
    ground: groundConfig,
    wall: wallConfig
};

// Export variables globally
window.score = score;
window.round = round;
window.moveSpeed = moveSpeed;
window.mouseX = mouseX;
window.mouseY = mouseY;
window.target = target;
window.ammo = ammo;
window.maxAmmo = maxAmmo;
window.reloading = reloading;
window.targets = targets;
window.isGameOver = isGameOver;
window.health = health;
window.kills = kills;
window.gameTime = gameTime;
window.gameTimer = gameTimer;
window.collisionObjects = collisionObjects;
window.keys = keys;
